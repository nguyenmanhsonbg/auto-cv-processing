import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
  TERMINAL_APPLICATION_STATUSES,
} from '../recruitment-common';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import {
  CLEAN_CV_SANITIZER,
  CleanCvSanitizer,
  CleanCvSanitizeResult,
  CleanCvSanitizeStatus,
} from './sanitizer/clean-cv-sanitizer.interface';
import { CvSanitizationJobEntity } from './jobs/cv-sanitization-job.entity';
import { CleanPdfOutputValidator } from './output/clean-pdf-output-validator';
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
  scheduleParseAfterSanitizeSuccess?: boolean;
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
  private readonly logger = new Logger(CvSanitizationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
    private readonly cvParsingService: CvParsingService,
    private readonly cleanPdfOutputValidator: CleanPdfOutputValidator,
    @Inject(CLEAN_CV_SANITIZER)
    private readonly cleanCvSanitizer: CleanCvSanitizer,
  ) {}

  async sanitizeCvDocument(input: SanitizeCvDocumentInput) {
    let outputFilePath: string | null = null;
    const context = await this.prepareSanitize(input);

    if (context.cleanCvDocument) {
      this.logger.log(
        `CV sanitize skipped; clean CV already exists applicationId=${context.cleanCvDocument.applicationId} originalCvDocumentId=${context.originalCvDocument.id} cleanCvDocumentId=${context.cleanCvDocument.id}`,
      );
      if (input.scheduleParseAfterSanitizeSuccess ?? true) {
        this.scheduleParseAfterSanitizeSuccess(context.cleanCvDocument);
      }
      return context.cleanCvDocument;
    }

    try {
      outputFilePath = this.buildSafeOutputFilePath();
      const outputStoragePath = toCvSafeStorageKey(outputFilePath);
      this.logger.log(
        `CV sanitize started applicationId=${context.originalCvDocument.applicationId} cvDocumentId=${context.originalCvDocument.id} sourceMimeType=${context.originalCvDocument.mimeType}`,
      );
      const sanitizeResult = await this.cleanCvSanitizer.sanitize({
        applicationId: context.originalCvDocument.applicationId,
        cvDocumentId: context.originalCvDocument.id,
        originalFileHash: context.originalCvDocument.originalFileHash ?? '',
        sourceFilePath: context.sourceFilePath,
        sourceStoragePath: context.originalCvDocument.storagePath,
        sourceMimeType: context.originalCvDocument.mimeType,
        outputFilePath,
        outputStoragePath,
      });

      if (
        sanitizeResult.status !== CleanCvSanitizeStatus.SANITIZED ||
        !sanitizeResult.outputFilePath
      ) {
        this.logger.warn(
          `CV sanitize failed applicationId=${context.originalCvDocument.applicationId} cvDocumentId=${context.originalCvDocument.id} sanitizer=${sanitizeResult.sanitizer} reasonCode=${sanitizeResult.reasonCode ?? 'UNKNOWN'} durationMs=${sanitizeResult.durationMs}`,
        );
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
      this.logger.log(
        `CV sanitize succeeded applicationId=${cleanCvDocument.applicationId} originalCvDocumentId=${context.originalCvDocument.id} cleanCvDocumentId=${cleanCvDocument.id} sanitizer=${sanitizeResult.sanitizer} durationMs=${sanitizeResult.durationMs} cleanFileSize=${cleanArtifact.fileSize}`,
      );
      if (input.scheduleParseAfterSanitizeSuccess ?? true) {
        this.scheduleParseAfterSanitizeSuccess(cleanCvDocument);
      }
      return cleanCvDocument;
    } catch (error) {
      if (outputFilePath) {
        await deleteCvSafeFile(outputFilePath);
      }

      this.logger.error(
        `CV sanitize error applicationId=${context.originalCvDocument.applicationId} cvDocumentId=${context.originalCvDocument.id} message=${error instanceof Error ? error.message : 'Unknown error'}`,
      );

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
        application.currentCvDocumentId !== originalCvDocument.id &&
        !this.isSanitizeRetryAfterFailure(application, originalCvDocument)
      ) {
        throw new BadRequestException('Only the current original CV can be sanitized');
      }
      if (!this.canStartSanitize(application.status)) {
        throw new BadRequestException('Application status does not allow CV sanitization');
      }

      const sourceFilePath = resolveCvQuarantineStorageKey(originalCvDocument.storagePath);
      const sanitizeStartStatus = this.isDisposablePoolMode()
        ? ApplicationStatus.CV_SANITIZE_QUEUED
        : ApplicationStatus.CV_SANITIZING;
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
        sanitizerMode: this.getSanitizerMode(),
      };

      await this.recordSanitizeStarted(manager, {
        applicationId,
        fromStatus: application.status,
        toStatus: sanitizeStartStatus,
        actorType: requestedByActorId ? 'USER' : 'SYSTEM',
        actorId: requestedByActorId,
        metadata,
      });

      await this.recordAuditLog(manager, {
        applicationId,
        actorType: requestedByActorId ? 'USER' : 'SYSTEM',
        actorId: requestedByActorId,
        action: sanitizeStartStatus === ApplicationStatus.CV_SANITIZE_QUEUED
          ? 'CV_SANITIZATION_JOB_CREATED'
          : 'CV_SANITIZATION_STARTED',
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
        application.currentCvDocumentId === originalCvDocument.id ||
        (
          !application.currentCvDocumentId &&
          [
            ApplicationStatus.CV_SANITIZE_QUEUED,
            ApplicationStatus.CV_SANITIZING,
            ApplicationStatus.CV_SANITIZE_FAILED,
            ApplicationStatus.CV_SANITIZE_TIMEOUT,
          ].includes(application.status)
        ),
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
      if (sanitizeResult.sanitizationJobId) {
        await manager.getRepository(CvSanitizationJobEntity).update(
          { id: sanitizeResult.sanitizationJobId },
          { cleanCvDocumentId: savedClean.id },
        );
      }

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
        sanitizationJobId: sanitizeResult.sanitizationJobId ?? null,
        workerId: sanitizeResult.workerId ?? null,
        attempt: sanitizeResult.attempt ?? null,
        idempotencyKeyHash,
      };

      await this.recordSanitizeOutcome(manager, {
        applicationId: savedClean.applicationId,
        toStatus: ApplicationStatus.CV_SANITIZED,
        eventType: 'CV_SANITIZED',
        metadata,
      });

      await this.recordAuditLog(manager, {
        applicationId: savedClean.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_SANITIZATION_SUCCEEDED',
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
      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: originalCvDocument.applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new BadRequestException('Application not found');
      const timeout = this.isSanitizeTimeout(sanitizeResult);
      const toStatus = timeout
        ? ApplicationStatus.CV_SANITIZE_TIMEOUT
        : ApplicationStatus.CV_SANITIZE_FAILED;
      const eventType = timeout ? 'CV_SANITIZE_TIMEOUT' : 'CV_SANITIZE_FAILED';

      originalCvDocument.sanitizeStatus = CvSanitizeStatus.FAILED;
      if (application.currentCvDocumentId === originalCvDocument.id) {
        application.currentCvDocumentId = null;
        originalCvDocument.isCurrent = false;
        await manager.getRepository(ApplicationEntity).save(application);
      }
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
        sanitizationJobId: sanitizeResult.sanitizationJobId ?? null,
        workerId: sanitizeResult.workerId ?? null,
        attempt: sanitizeResult.attempt ?? null,
        manualReviewRequired: true,
        retryAllowed: true,
        idempotencyKeyHash,
      };

      await this.recordSanitizeOutcome(manager, {
        applicationId: savedOriginal.applicationId,
        toStatus,
        eventType,
        metadata,
      });

      await this.recordAuditLog(manager, {
        applicationId: savedOriginal.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: timeout ? 'CV_SANITIZATION_TIMEOUT' : 'CV_SANITIZATION_FAILED',
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
    const artifact = await this.cleanPdfOutputValidator.validate(cleanFilePath);

    return {
      cleanFileHash: artifact.sha256,
      fileSize: artifact.fileSize,
      mimeType: artifact.mimeType,
      storagePath: toCvSafeStorageKey(artifact.filePath),
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
      this.logger.log(
        `CV parse scheduled after sanitize applicationId=${cvDocument.applicationId} cleanCvDocumentId=${cvDocument.id}`,
      );
      void this.cvParsingService.parseCleanCvDocument({
        applicationId: cvDocument.applicationId,
        cvDocumentId: cvDocument.id,
      }).catch((error) => {
        this.logger.error(
          `CV parse failed after sanitize applicationId=${cvDocument.applicationId} cleanCvDocumentId=${cvDocument.id} message=${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      });
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
    const timeout = this.isSanitizeTimeout(result);
    const payload = {
      code: timeout ? 'CV_SANITIZE_TIMEOUT' : 'CV_SANITIZE_FAILED',
      message: timeout
        ? 'CV sanitization timed out. Please retry later.'
        : 'CV sanitization failed. Manual review or retry is required.',
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
    ].includes(status) || !TERMINAL_APPLICATION_STATUSES.includes(
      status as (typeof TERMINAL_APPLICATION_STATUSES)[number],
    );
  }

  private getSanitizerMode() {
    return (process.env.CV_PDF_SANITIZER_MODE ?? 'GHOSTSCRIPT_DOCKER')
      .trim()
      .toUpperCase();
  }

  private isDisposablePoolMode() {
    return this.getSanitizerMode() === 'DISPOSABLE_POOL';
  }

  private isSanitizeTimeout(result: CleanCvSanitizeResult) {
    return [
      'SANITIZER_TIMEOUT',
      'SANITIZER_POOL_WAIT_TIMEOUT',
    ].includes(result.reasonCode ?? '');
  }

  private isSanitizeRetryAfterFailure(
    application: ApplicationEntity,
    originalCvDocument: CvDocumentEntity,
  ) {
    return (
      application.status === ApplicationStatus.CV_SANITIZE_FAILED &&
      originalCvDocument.sanitizeStatus === CvSanitizeStatus.FAILED
    );
  }

  private async recordSanitizeStarted(
    manager: EntityManager,
    input: {
      applicationId: string;
      fromStatus: ApplicationStatus;
      toStatus: ApplicationStatus.CV_SANITIZE_QUEUED | ApplicationStatus.CV_SANITIZING;
      actorType: string;
      actorId?: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    if (
      input.fromStatus === ApplicationStatus.CV_SCAN_PASSED ||
      input.fromStatus === ApplicationStatus.CV_SANITIZE_FAILED ||
      input.fromStatus === ApplicationStatus.CV_SANITIZE_TIMEOUT
    ) {
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: input.applicationId,
          expectedFromStatus: input.fromStatus,
          toStatus: input.toStatus,
          eventType: input.toStatus,
          actorType: input.actorType,
          actorId: input.actorId,
          metadata: input.metadata,
        },
        manager,
      );
      return;
    }

    await this.workflowStateService.recordEvent(
      {
        applicationId: input.applicationId,
        fromStatus: input.fromStatus,
        toStatus: input.fromStatus,
        eventType: input.toStatus,
        actorType: input.actorType,
        actorId: input.actorId,
        metadata: {
          ...input.metadata,
          applicationStatusPreserved: input.fromStatus,
        },
      },
      manager,
    );
  }

  private async recordSanitizeOutcome(
    manager: EntityManager,
    input: {
      applicationId: string;
      toStatus: ApplicationStatus.CV_SANITIZED
        | ApplicationStatus.CV_SANITIZE_FAILED
        | ApplicationStatus.CV_SANITIZE_TIMEOUT;
      eventType: 'CV_SANITIZED' | 'CV_SANITIZE_FAILED' | 'CV_SANITIZE_TIMEOUT';
      metadata: Record<string, unknown>;
    },
  ) {
    const application = await manager.getRepository(ApplicationEntity).findOne({
      where: { id: input.applicationId },
    });
    if (!application) throw new BadRequestException('Application not found');

    if (
      application.status === ApplicationStatus.CV_SANITIZING ||
      application.status === ApplicationStatus.CV_SANITIZE_QUEUED
    ) {
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: input.applicationId,
          expectedFromStatus: application.status,
          toStatus: input.toStatus,
          eventType: input.eventType,
          actorType: 'SYSTEM',
          actorId: null,
          metadata: input.metadata,
        },
        manager,
      );
      return;
    }

    await this.workflowStateService.recordEvent(
      {
        applicationId: input.applicationId,
        fromStatus: application.status,
        toStatus: application.status,
        eventType: input.eventType,
        actorType: 'SYSTEM',
        actorId: null,
        metadata: {
          ...input.metadata,
          applicationStatusPreserved: application.status,
        },
      },
      manager,
    );
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
