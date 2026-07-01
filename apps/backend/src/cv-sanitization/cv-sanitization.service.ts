import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { open, stat } from 'fs/promises';
import * as path from 'path';
import { DataSource, EntityManager, FindOptionsWhere } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { resolveCvQuarantineStorageKey } from '../cv-documents/storage/cv-quarantine-storage';
import { CvParsingService } from '../cv-parsing/cv-parsing.service';
import {
  ApplicationStatus,
  CvDocumentType,
  CvParseStatus,
  CvSanitizeStatus,
  CvScanStatus,
  StorageZone,
} from '../recruitment-common';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import {
  CLEAN_CV_SANITIZER,
  CleanCvSanitizer,
  CleanCvSanitizeResult,
  CleanCvSanitizeStatus,
} from './sanitizer/clean-cv-sanitizer.interface';
import {
  assertCvSafeFilePath,
  buildCvSafePdfFileName,
  deleteCvSafeFile,
  ensureCvSafeRoot,
  toCvSafeStorageKey,
} from './storage/cv-safe-storage';

const PDF_MIME_TYPE = 'application/pdf';

export interface SanitizeCvDocumentInput {
  applicationId: string;
  cvDocumentId: string;
  force?: boolean;
  actorId?: string | null;
  idempotencyKey?: string | null;
}

interface SanitizeStartContext {
  originalCvDocument: CvDocumentEntity;
  sourceFilePath: string;
  cleanCvDocument?: CvDocumentEntity | null;
  idempotencyKeyHash: string | null;
}

interface CleanArtifact {
  cleanFileHash: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

@Injectable()
export class CvSanitizationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
    private readonly cvParsingService: CvParsingService,
    @Inject(CLEAN_CV_SANITIZER)
    private readonly cleanCvSanitizer: CleanCvSanitizer,
  ) {}

  async sanitizeCvDocument(input: SanitizeCvDocumentInput) {
    let outputFilePath: string | null = null;
    const context = await this.prepareSanitize(input);

    if (context.cleanCvDocument) {
      this.scheduleParseAfterSanitizeSuccess(context.cleanCvDocument);
      return context.cleanCvDocument;
    }

    try {
      outputFilePath = this.buildSafeOutputFilePath();
      const sanitizeResult = await this.cleanCvSanitizer.sanitize({
        applicationId: context.originalCvDocument.applicationId,
        cvDocumentId: context.originalCvDocument.id,
        originalFileHash: context.originalCvDocument.originalFileHash ?? '',
        sourceFilePath: context.sourceFilePath,
        sourceMimeType: context.originalCvDocument.mimeType,
        outputFilePath,
      });

      if (
        sanitizeResult.status !== CleanCvSanitizeStatus.SANITIZED ||
        !sanitizeResult.outputFilePath
      ) {
        await deleteCvSafeFile(outputFilePath);
        await this.markSanitizeFailed(
          context.originalCvDocument.id,
          sanitizeResult,
          context.idempotencyKeyHash,
        );
        throw this.toSanitizeException(sanitizeResult);
      }

      const cleanArtifact = await this.validateCleanPdfArtifact(sanitizeResult.outputFilePath);
      const cleanCvDocument = await this.markSanitizeSucceeded(
        context.originalCvDocument.id,
        sanitizeResult,
        cleanArtifact,
        context.idempotencyKeyHash,
      );
      this.scheduleParseAfterSanitizeSuccess(cleanCvDocument);
      return cleanCvDocument;
    } catch (error) {
      if (outputFilePath) {
        await deleteCvSafeFile(outputFilePath);
      }

      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      const failedResult = this.buildFailedResult('CLEAN_OUTPUT_INVALID');
      await this.markSanitizeFailed(
        context.originalCvDocument.id,
        failedResult,
        context.idempotencyKeyHash,
      );
      throw this.toSanitizeException(failedResult);
    }
  }

  private async prepareSanitize(input: SanitizeCvDocumentInput): Promise<SanitizeStartContext> {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const cvDocumentId = this.requireText(input.cvDocumentId, 'CV document id');
    const idempotencyKeyHash = this.hashOptionalText(input.idempotencyKey);
    const forceRequested = input.force ?? false;
    const requestedByActorId = this.optionalText(input.actorId);

    return this.dataSource.transaction(async (manager) => {
      const originalCvDocument = await this.findOriginalCvForSanitize(
        manager,
        applicationId,
        cvDocumentId,
      );
      const existingCleanCv = await this.findExistingCleanCv(manager, originalCvDocument);

      if (existingCleanCv) {
        await this.recordAuditLog(manager, {
          applicationId,
          actorType: requestedByActorId ? 'USER' : 'SYSTEM',
          actorId: requestedByActorId,
          action: 'CV_SANITIZE_IDEMPOTENT_RETRY',
          objectId: existingCleanCv.id,
          metadata: {
            applicationId,
            sourceCvDocumentId: originalCvDocument.id,
            cleanCvDocumentId: existingCleanCv.id,
            originalFileHash: originalCvDocument.originalFileHash,
            cleanFileHash: existingCleanCv.cleanFileHash,
            idempotencyKeyHash,
            forceRequested,
            requestedByActorId,
          },
        });

        return {
          originalCvDocument,
          sourceFilePath: '',
          cleanCvDocument: existingCleanCv,
          idempotencyKeyHash,
        };
      }

      if (originalCvDocument.scanStatus !== CvScanStatus.PASSED) {
        throw new BadRequestException('CV must pass malware scan before sanitization');
      }

      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new BadRequestException('Application not found');
      if (
        !originalCvDocument.isCurrent &&
        application.currentCvDocumentId !== originalCvDocument.id
      ) {
        throw new BadRequestException('Only the current original CV can be sanitized');
      }
      if (!this.canStartSanitize(application.status)) {
        throw new BadRequestException('Application status does not allow CV sanitization');
      }

      const sourceFilePath = resolveCvQuarantineStorageKey(originalCvDocument.storagePath);
      originalCvDocument.sanitizeStatus = CvSanitizeStatus.SANITIZING;
      const savedOriginal = await manager.getRepository(CvDocumentEntity).save(originalCvDocument);
      const metadata = {
        applicationId,
        sourceCvDocumentId: savedOriginal.id,
        documentType: savedOriginal.documentType,
        versionNo: savedOriginal.versionNo,
        originalFileHash: savedOriginal.originalFileHash,
        sanitizeStatus: savedOriginal.sanitizeStatus,
        sanitizerSource: 'QUARANTINE',
        sanitizerTarget: 'SAFE',
        idempotencyKeyHash,
        forceRequested,
        requestedByActorId,
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId,
          toStatus: ApplicationStatus.CV_SANITIZING,
          eventType: 'CV_SANITIZING',
          actorType: requestedByActorId ? 'USER' : 'SYSTEM',
          actorId: requestedByActorId,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId,
        actorType: requestedByActorId ? 'USER' : 'SYSTEM',
        actorId: requestedByActorId,
        action: 'CV_SANITIZING',
        objectId: savedOriginal.id,
        metadata,
      });

      return {
        originalCvDocument: savedOriginal,
        sourceFilePath,
        cleanCvDocument: null,
        idempotencyKeyHash,
      };
    });
  }

  private async markSanitizeSucceeded(
    originalCvDocumentId: string,
    sanitizeResult: CleanCvSanitizeResult,
    cleanArtifact: CleanArtifact,
    idempotencyKeyHash: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const originalCvDocument = await this.findOriginalCvById(manager, originalCvDocumentId);
      const existingCleanCv = await this.findExistingCleanCv(manager, originalCvDocument);
      if (existingCleanCv) return existingCleanCv;

      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: originalCvDocument.applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new BadRequestException('Application not found');

      const shouldMarkCleanCurrent = Boolean(
        originalCvDocument.isCurrent ||
        application.currentCvDocumentId === originalCvDocument.id,
      );

      if (shouldMarkCleanCurrent) {
        await manager.getRepository(CvDocumentEntity).update(
          {
            applicationId: originalCvDocument.applicationId,
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      originalCvDocument.sanitizeStatus = CvSanitizeStatus.SANITIZED;
      originalCvDocument.isCurrent = false;
      await manager.getRepository(CvDocumentEntity).save(originalCvDocument);

      const cleanCvDocument = manager.getRepository(CvDocumentEntity).create({
        applicationId: originalCvDocument.applicationId,
        candidateId: originalCvDocument.candidateId,
        documentType: CvDocumentType.CLEAN,
        versionNo: originalCvDocument.versionNo,
        originalFileName: originalCvDocument.originalFileName,
        mimeType: cleanArtifact.mimeType,
        fileSize: String(cleanArtifact.fileSize),
        originalFileHash: originalCvDocument.originalFileHash,
        cleanFileHash: cleanArtifact.cleanFileHash,
        storageZone: StorageZone.SAFE,
        storagePath: cleanArtifact.storagePath,
        scanStatus: CvScanStatus.PASSED,
        sanitizeStatus: CvSanitizeStatus.SANITIZED,
        parseStatus: CvParseStatus.PENDING,
        isCurrent: shouldMarkCleanCurrent,
      });
      const savedClean = await manager.getRepository(CvDocumentEntity).save(cleanCvDocument);

      if (shouldMarkCleanCurrent) {
        application.currentCvDocumentId = savedClean.id;
        await manager.getRepository(ApplicationEntity).save(application);
      }

      const metadata = {
        applicationId: savedClean.applicationId,
        sourceCvDocumentId: originalCvDocument.id,
        cleanCvDocumentId: savedClean.id,
        versionNo: savedClean.versionNo,
        originalFileHash: savedClean.originalFileHash,
        cleanFileHash: savedClean.cleanFileHash,
        storageZone: savedClean.storageZone,
        storageKeyRecorded: Boolean(savedClean.storagePath),
        sanitizer: sanitizeResult.sanitizer,
        sanitizedAt: sanitizeResult.sanitizedAt.toISOString(),
        durationMs: sanitizeResult.durationMs,
        idempotencyKeyHash,
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: savedClean.applicationId,
          expectedFromStatus: ApplicationStatus.CV_SANITIZING,
          toStatus: ApplicationStatus.CV_SANITIZED,
          eventType: 'CV_SANITIZED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId: savedClean.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_SANITIZED',
        objectId: savedClean.id,
        metadata,
      });

      return savedClean;
    });
  }

  private async markSanitizeFailed(
    originalCvDocumentId: string,
    sanitizeResult: CleanCvSanitizeResult,
    idempotencyKeyHash: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const originalCvDocument = await this.findOriginalCvById(manager, originalCvDocumentId);
      originalCvDocument.sanitizeStatus = CvSanitizeStatus.FAILED;
      const savedOriginal = await manager.getRepository(CvDocumentEntity).save(originalCvDocument);
      const metadata = {
        applicationId: savedOriginal.applicationId,
        sourceCvDocumentId: savedOriginal.id,
        versionNo: savedOriginal.versionNo,
        originalFileHash: savedOriginal.originalFileHash,
        sanitizeStatus: savedOriginal.sanitizeStatus,
        sanitizer: sanitizeResult.sanitizer,
        sanitizerResult: sanitizeResult.status,
        sanitizedAt: sanitizeResult.sanitizedAt.toISOString(),
        durationMs: sanitizeResult.durationMs,
        reasonCode: sanitizeResult.reasonCode ?? 'CV_SANITIZE_FAILED',
        manualReviewRequired: true,
        retryAllowed: true,
        idempotencyKeyHash,
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: savedOriginal.applicationId,
          expectedFromStatus: ApplicationStatus.CV_SANITIZING,
          toStatus: ApplicationStatus.CV_SANITIZE_FAILED,
          eventType: 'CV_SANITIZE_FAILED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId: savedOriginal.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_SANITIZE_FAILED',
        objectId: savedOriginal.id,
        metadata,
      });

      return savedOriginal;
    });
  }

  private async findOriginalCvForSanitize(
    manager: EntityManager,
    applicationId: string,
    cvDocumentId: string,
  ) {
    const cvDocument = await manager.getRepository(CvDocumentEntity).findOne({
      where: {
        id: cvDocumentId,
        applicationId,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!cvDocument) throw new BadRequestException('CV document not found');
    if (cvDocument.documentType !== CvDocumentType.ORIGINAL) {
      throw new BadRequestException('Only original CV documents can be sanitized');
    }

    return cvDocument;
  }

  private async findOriginalCvById(manager: EntityManager, cvDocumentId: string) {
    const cvDocument = await manager.getRepository(CvDocumentEntity).findOne({
      where: { id: cvDocumentId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!cvDocument) throw new BadRequestException('CV document not found');
    if (cvDocument.documentType !== CvDocumentType.ORIGINAL) {
      throw new BadRequestException('Only original CV documents can be sanitized');
    }

    return cvDocument;
  }

  private findExistingCleanCv(manager: EntityManager, originalCvDocument: CvDocumentEntity) {
    const where: FindOptionsWhere<CvDocumentEntity> = {
      applicationId: originalCvDocument.applicationId,
      documentType: CvDocumentType.CLEAN,
      versionNo: originalCvDocument.versionNo,
      sanitizeStatus: CvSanitizeStatus.SANITIZED,
    };
    const originalFileHash = this.optionalText(originalCvDocument.originalFileHash);
    if (originalFileHash) {
      where.originalFileHash = originalFileHash;
    }

    return manager.getRepository(CvDocumentEntity).findOne({
      where,
      order: {
        createdAt: 'DESC',
      },
    });
  }

  private async validateCleanPdfArtifact(filePath: string): Promise<CleanArtifact> {
    const cleanFilePath = assertCvSafeFilePath(filePath);
    const stats = await stat(cleanFilePath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error('Clean CV output is empty');
    }

    const magicBytes = await this.readMagicBytes(cleanFilePath, 5);
    if (!magicBytes.equals(Buffer.from('%PDF-'))) {
      throw new Error('Clean CV output is not a PDF');
    }

    return {
      cleanFileHash: await this.calculateSha256(cleanFilePath),
      fileSize: stats.size,
      mimeType: PDF_MIME_TYPE,
      storagePath: toCvSafeStorageKey(cleanFilePath),
    };
  }

  private buildSafeOutputFilePath() {
    return path.resolve(ensureCvSafeRoot(), buildCvSafePdfFileName());
  }

  private scheduleParseAfterSanitizeSuccess(cvDocument: CvDocumentEntity) {
    if (
      cvDocument.documentType !== CvDocumentType.CLEAN ||
      cvDocument.storageZone !== StorageZone.SAFE ||
      cvDocument.sanitizeStatus !== CvSanitizeStatus.SANITIZED ||
      cvDocument.parseStatus === CvParseStatus.PARSED
    ) {
      return;
    }

    setImmediate(() => {
      void this.cvParsingService.parseCleanCvDocument({
        applicationId: cvDocument.applicationId,
        cvDocumentId: cvDocument.id,
      }).catch(() => undefined);
    });
  }

  private buildFailedResult(reasonCode: string): CleanCvSanitizeResult {
    return {
      status: CleanCvSanitizeStatus.FAILED,
      sanitizer: 'clean-cv-sanitizer',
      sanitizedAt: new Date(),
      durationMs: 0,
      outputFilePath: null,
      outputMimeType: null,
      reasonCode,
    };
  }

  private toSanitizeException(result: CleanCvSanitizeResult) {
    const payload = {
      code: 'CV_SANITIZE_FAILED',
      message: 'CV sanitization failed. Manual review or retry is required.',
    };

    if (result.reasonCode === 'UNSUPPORTED_SANITIZER_INPUT') {
      return new UnprocessableEntityException(payload);
    }

    return new ServiceUnavailableException(payload);
  }

  private canStartSanitize(status: ApplicationStatus) {
    return [
      ApplicationStatus.CV_SCAN_PASSED,
      ApplicationStatus.CV_SANITIZE_FAILED,
    ].includes(status);
  }

  private async recordAuditLog(
    manager: EntityManager,
    input: {
      applicationId: string;
      actorType: string;
      actorId?: string | null;
      action: string;
      objectId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const auditRepo = manager.getRepository(AuditLogEntity);
    await auditRepo.save(auditRepo.create({
      actorType: input.actorType,
      actorId: this.optionalText(input.actorId),
      action: input.action,
      objectType: 'CV_DOCUMENT',
      objectId: input.objectId,
      applicationId: input.applicationId,
      metadata: input.metadata,
      ipAddress: null,
      userAgent: null,
    }));
  }

  private async readMagicBytes(filePath: string, byteCount: number) {
    const fileHandle = await open(filePath, 'r');

    try {
      const buffer = Buffer.alloc(byteCount);
      const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fileHandle.close();
    }
  }

  private calculateSha256(filePath: string) {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private hashOptionalText(value?: string | null) {
    const normalized = this.optionalText(value);
    return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
  }

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
