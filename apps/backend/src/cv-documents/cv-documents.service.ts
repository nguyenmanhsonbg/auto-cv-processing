import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { open, stat } from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { DuplicateCheckEntity } from '../applications/entities/duplicate-check.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvSanitizationService } from '../cv-sanitization/cv-sanitization.service';
import {
  deleteCvSafeFile,
  resolveCvSafeStorageKey,
} from '../cv-sanitization/storage/cv-safe-storage';
import { FileParserService } from '../file-parser/file-parser.service';
import {
  ApplicationStatus,
  CvDocumentType,
  DuplicateCheckStatus,
  DuplicateCheckType,
  CvParseStatus,
  CvSanitizeStatus,
  CvScanStatus,
  StorageZone,
  TERMINAL_APPLICATION_STATUSES,
} from '../recruitment-common';
import { WorkflowEventEntity } from '../workflow-state/entities/workflow-event.entity';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';
import {
  assertCvQuarantineFilePath,
  deleteCvQuarantineFile,
  resolveCvQuarantineStorageKey,
  toCvQuarantineStorageKey,
} from './storage/cv-quarantine-storage';

const MAX_CV_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const CV_FILE_RULES = {
  '.pdf': {
    mimeType: 'application/pdf',
    signature: 'pdf',
  },
  '.docx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: 'zip',
  },
  '.xlsx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: 'zip',
  },
} as const;

type CvFileExtension = keyof typeof CV_FILE_RULES;
type CvFileSignature = typeof CV_FILE_RULES[CvFileExtension]['signature'];

export interface UploadCvInput {
  applicationId: string;
  file: Express.Multer.File;
  replaceCurrent?: boolean;
  skipExistingOriginalHashCheck?: boolean;
  /** Keeps the legacy skip flag compatible while forcing the public reapply guard. */
  forceExistingOriginalHashCheck?: boolean;
  reason?: string | null;
  actorId?: string | null;
  idempotencyKey?: string | null;
  allowedApplicationStatuses?: readonly ApplicationStatus[];
  scheduleSanitizeAfterScanPass?: boolean;
}

export interface DeletePreviousCvVersionsInput {
  applicationId: string;
  keepCvDocumentIds: string[];
}

export interface RollbackPublicCvUploadInput {
  applicationId: string;
  originalCvDocumentId: string;
  cleanCvDocumentId?: string | null;
  restoreCurrentCvDocumentId?: string | null;
  restoreApplicationStatus?: ApplicationStatus | null;
}

export interface SanitizeOriginalCvInput {
  applicationId: string;
  originalCvDocumentId: string;
  actorId?: string | null;
  idempotencyKey?: string | null;
  scheduleParseAfterSanitizeSuccess?: boolean;
}

export interface CleanCvFileAccessInput {
  applicationId: string;
  cvDocumentId: string;
  actorId?: string | null;
  actorRole?: string | null;
  accessMode?: 'inline' | 'attachment';
}

export interface SanitizedSimilarityCvTextInput {
  filePath: string;
  sourceMimeType: string;
  originalFileHash: string;
}

export interface CleanCvFileAccessResult {
  cvDocument: CvDocumentEntity;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

@Injectable()
export class CvDocumentsService {
  private readonly logger = new Logger(CvDocumentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
    private readonly cvSanitizationService: CvSanitizationService,
    private readonly fileParserService: FileParserService,
  ) {}

  async extractCleanCvText(cvDocument: CvDocumentEntity): Promise<string> {
    const filePath = resolveCvSafeStorageKey(cvDocument.storagePath);
    const parsed = await this.fileParserService.parseFile(filePath);
    const rawText = typeof parsed.rawText === 'string' ? parsed.rawText : '';

    if (!rawText.trim()) {
      throw new UnprocessableEntityException('Current CV text is empty');
    }

    return rawText;
  }

  async extractSanitizedCvTextForSimilarity(
    input: SanitizedSimilarityCvTextInput,
  ): Promise<string> {
    const quarantineFilePath = this.requireQuarantineFilePath(input.filePath);
    const cleanFilePath = await this.cvSanitizationService.sanitizeFileForSimilarity({
      sourceFilePath: quarantineFilePath,
      sourceStoragePath: toCvQuarantineStorageKey(quarantineFilePath),
      sourceMimeType: input.sourceMimeType,
      originalFileHash: this.requireText(input.originalFileHash, 'Original CV hash'),
    });

    try {
      const parsed = await this.fileParserService.parseFile(cleanFilePath);
      const rawText = typeof parsed.rawText === 'string' ? parsed.rawText : '';

      if (!rawText.trim()) {
        throw new UnprocessableEntityException('Sanitized CV text is empty');
      }

      return rawText;
    } finally {
      await deleteCvSafeFile(cleanFilePath);
    }
  }

  async findOriginalCvByHash(applicationId: string, originalFileHash: string) {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    const normalizedHash = this.requireText(originalFileHash, 'Original CV hash');

    return this.dataSource.getRepository(CvDocumentEntity).findOne({
      where: {
        applicationId: normalizedApplicationId,
        documentType: CvDocumentType.ORIGINAL,
        originalFileHash: normalizedHash,
      },
      order: {
        versionNo: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findOriginalCvByIdempotencyKey(applicationId: string, idempotencyKey: string) {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    const normalizedIdempotencyKey = this.requireText(idempotencyKey, 'Idempotency key');
    const idempotencyKeyHash = this.calculateTextSha256(normalizedIdempotencyKey);
    const existingUpload = await this.findExistingUploadByIdempotencyKey(
      this.dataSource.manager,
      normalizedApplicationId,
      idempotencyKeyHash,
    );

    return existingUpload?.cvDocument ?? null;
  }

  async uploadOriginalCv(input: UploadCvInput) {
    let keepUploadedFile = false;

    try {
      const result = await this.createOriginalCv(input);
      keepUploadedFile = result.keepUploadedFile;

      if (!result.keepUploadedFile) {
        await this.safeDeleteUploadedFile(input.file);
      }

      let cvDocument = result.cvDocument;
      if (result.scanFilePath) {
        cvDocument = await this.markCvScanSkippedAsPassed(cvDocument.id);
      }

      this.assertCvScanAccepted(cvDocument);
      if (input.scheduleSanitizeAfterScanPass ?? true) {
        this.scheduleSanitizeAfterScanPass(cvDocument);
      }
      return cvDocument;
    } catch (error) {
      if (!keepUploadedFile) {
        await this.safeDeleteUploadedFile(input.file);
      }
      throw error;
    }
  }

  async listCvDocumentsByApplication(applicationId: string) {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    await this.assertApplicationExists(normalizedApplicationId);

    return this.dataSource.getRepository(CvDocumentEntity).find({
      where: { applicationId: normalizedApplicationId },
      order: {
        versionNo: 'DESC',
        documentType: 'ASC',
        createdAt: 'ASC',
      },
    });
  }

  async findCvDocumentMetadata(applicationId: string, cvDocumentId: string) {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    const normalizedCvDocumentId = this.requireText(cvDocumentId, 'CV document id');
    const cvDocument = await this.dataSource.getRepository(CvDocumentEntity).findOne({
      where: {
        id: normalizedCvDocumentId,
        applicationId: normalizedApplicationId,
      },
    });

    if (!cvDocument) {
      throw new BadRequestException('CV document not found');
    }

    return cvDocument;
  }

  async getCleanCvFileForAccess(
    input: CleanCvFileAccessInput,
  ): Promise<CleanCvFileAccessResult> {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const cvDocumentId = this.requireText(input.cvDocumentId, 'CV document id');
    const actorId = this.optionalText(input.actorId);
    const actorRole = this.optionalText(input.actorRole);
    const accessMode = input.accessMode ?? 'inline';
    const cvDocument = await this.dataSource.getRepository(CvDocumentEntity).findOne({
      where: {
        id: cvDocumentId,
        applicationId,
      },
    });

    if (!cvDocument) {
      throw new BadRequestException('CV document not found');
    }

    if (!this.isCleanCvAccessible(cvDocument)) {
      await this.recordAuditLog(this.dataSource.manager, {
        applicationId,
        actorType: actorId ? 'USER' : 'SYSTEM',
        actorId,
        action: 'CLEAN_CV_ACCESS_DENIED',
        objectId: cvDocument.id,
        metadata: {
          applicationId,
          candidateId: cvDocument.candidateId,
          cvDocumentId: cvDocument.id,
          documentType: cvDocument.documentType,
          versionNo: cvDocument.versionNo,
          storageZone: cvDocument.storageZone,
          sanitizeStatus: cvDocument.sanitizeStatus,
          accessMode,
          actorRole,
          reasonCode: 'NOT_CLEAN_SANITIZED_CV',
        },
      });
      throw new ForbiddenException('Clean CV is not available for access');
    }

    let filePath: string;
    let fileStats: Stats;

    try {
      filePath = resolveCvSafeStorageKey(cvDocument.storagePath);
      fileStats = await stat(filePath);
    } catch {
      throw new ServiceUnavailableException({
        code: 'CLEAN_CV_FILE_UNAVAILABLE',
        message: 'Clean CV file is not available.',
      });
    }

    if (!fileStats.isFile() || fileStats.size <= 0) {
      throw new ServiceUnavailableException({
        code: 'CLEAN_CV_FILE_UNAVAILABLE',
        message: 'Clean CV file is not available.',
      });
    }

    await this.recordAuditLog(this.dataSource.manager, {
      applicationId,
      actorType: actorId ? 'USER' : 'SYSTEM',
      actorId,
      action: 'CLEAN_CV_DOWNLOADED',
      objectId: cvDocument.id,
      metadata: {
        applicationId,
        candidateId: cvDocument.candidateId,
        cvDocumentId: cvDocument.id,
        documentType: cvDocument.documentType,
        versionNo: cvDocument.versionNo,
        cleanFileHash: cvDocument.cleanFileHash,
        storageZone: cvDocument.storageZone,
        accessMode,
        actorRole,
        fileSize: fileStats.size,
      },
    });

    return {
      cvDocument,
      filePath,
      fileName: this.buildCleanCvFileName(cvDocument),
      mimeType: cvDocument.mimeType,
      fileSize: fileStats.size,
    };
  }

  async sanitizeOriginalCvAfterScanPass(input: SanitizeOriginalCvInput) {
    return this.cvSanitizationService.sanitizeCvDocument({
      applicationId: this.requireText(input.applicationId, 'Application id'),
      cvDocumentId: this.requireText(input.originalCvDocumentId, 'Original CV document id'),
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      scheduleParseAfterSanitizeSuccess: input.scheduleParseAfterSanitizeSuccess,
    });
  }

  async deletePreviousCvVersions(input: DeletePreviousCvVersionsInput) {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const keepCvDocumentIds = input.keepCvDocumentIds
      .map((id) => this.optionalText(id))
      .filter((id): id is string => Boolean(id));

    if (!keepCvDocumentIds.length) {
      throw new BadRequestException('At least one current CV document id is required');
    }

    const previousDocuments = await this.dataSource.transaction(async (manager) => {
      const documents = await manager.getRepository(CvDocumentEntity).find({
        where: { applicationId },
      });
      const keepIds = new Set(keepCvDocumentIds);
      const staleDocuments = documents.filter((document) => !keepIds.has(document.id));

      if (!staleDocuments.length) return [];

      const staleDocumentIds = staleDocuments.map((document) => document.id);
      await manager.getRepository(ParsedProfileEntity).delete({
        applicationId,
        cvDocumentId: In(staleDocumentIds),
      });
      await manager.getRepository(CvDocumentEntity).delete(staleDocumentIds);

      return staleDocuments;
    });

    await Promise.all(previousDocuments.map((document) => this.deleteStoredCvDocument(document)));
  }

  async rollbackPublicCvUpload(input: RollbackPublicCvUploadInput) {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const cvDocumentIds = [input.originalCvDocumentId, input.cleanCvDocumentId]
      .map((id) => this.optionalText(id))
      .filter((id): id is string => Boolean(id));
    const uniqueCvDocumentIds = [...new Set(cvDocumentIds)];

    if (!uniqueCvDocumentIds.length) return;

    const uploadedDocuments = await this.dataSource.transaction(async (manager) => {
      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) return [];

      const documents = await manager.getRepository(CvDocumentEntity).find({
        where: {
          applicationId,
          id: In(uniqueCvDocumentIds),
        },
      });
      if (!documents.length) return [];

      await manager.getRepository(ParsedProfileEntity).delete({
        applicationId,
        cvDocumentId: In(documents.map((document) => document.id)),
      });

      application.currentCvDocumentId = input.restoreCurrentCvDocumentId ?? null;
      if (input.restoreApplicationStatus) {
        application.status = input.restoreApplicationStatus;
      }
      await manager.getRepository(ApplicationEntity).save(application);
      await manager.getRepository(CvDocumentEntity).delete(documents.map((document) => document.id));

      return documents;
    });

    await Promise.all(uploadedDocuments.map((document) => this.deleteStoredCvDocument(document)));
  }

  private async createOriginalCv(input: UploadCvInput) {
    if (!input.file) throw new BadRequestException('CV file is required');
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const replaceCurrent = input.replaceCurrent ?? true;
    const idempotencyKey = this.optionalText(input.idempotencyKey);
    const idempotencyKeyHash = idempotencyKey ? this.calculateTextSha256(idempotencyKey) : null;
    const validatedFile = await this.validateUploadedFile(input.file);

    return this.dataSource.transaction(async (manager) => {
      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new BadRequestException('Application not found');

      const idempotentUpload = idempotencyKeyHash
        ? await this.findExistingUploadByIdempotencyKey(
            manager,
            applicationId,
            idempotencyKeyHash,
          )
        : null;

      if (
        idempotentUpload
        && idempotentUpload.originalFileHash !== validatedFile.originalFileHash
      ) {
        await this.recordFileDuplicateDetected(manager, {
          application,
          matchedCvDocument: idempotentUpload.cvDocument,
          incomingOriginalFileHash: validatedFile.originalFileHash,
          actorId: input.actorId,
          idempotencyKeyHash,
          reasonCode: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FILE',
        });
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency key was already used with a different CV file.',
        });
      }

      if (idempotentUpload?.cvDocument) {
        await this.recordFileDuplicateDetected(manager, {
          application,
          matchedCvDocument: idempotentUpload.cvDocument,
          incomingOriginalFileHash: validatedFile.originalFileHash,
          actorId: input.actorId,
          idempotencyKeyHash,
          reasonCode: 'IDEMPOTENT_RETRY_SAME_FILE',
        });
        await this.workflowStateService.recordEvent(
          {
            applicationId,
            fromStatus: application.status,
            toStatus: application.status,
            eventType: 'CV_UPLOAD_IDEMPOTENT_RETRY',
            actorType: 'USER',
            actorId: this.optionalText(input.actorId),
            metadata: {
              applicationId,
              candidateId: application.candidateId,
              cvDocumentId: idempotentUpload.cvDocument.id,
              documentType: idempotentUpload.cvDocument.documentType,
              versionNo: idempotentUpload.cvDocument.versionNo,
              originalFileHash: idempotentUpload.cvDocument.originalFileHash,
              hasIdempotencyKey: true,
              idempotencyKeyHash,
              duplicateFileDiscarded: true,
            },
          },
          manager,
        );

        return {
          cvDocument: idempotentUpload.cvDocument,
          keepUploadedFile: false,
          scanFilePath: null,
        };
      }

      const existingFileHash = await this.findExistingOriginalByHash(
        manager,
        applicationId,
        validatedFile.originalFileHash,
        input.skipExistingOriginalHashCheck,
        input.forceExistingOriginalHashCheck,
      );
      if (existingFileHash) {
        await this.recordFileDuplicateDetected(manager, {
          application,
          matchedCvDocument: existingFileHash,
          incomingOriginalFileHash: validatedFile.originalFileHash,
          actorId: input.actorId,
          idempotencyKeyHash,
          reasonCode: 'SAME_FILE_HASH_ALREADY_UPLOADED',
        });
        throw new ConflictException({
          code: 'DUPLICATE_CV_FILE',
          message: 'This CV file has already been uploaded for this application.',
        });
      }

      if (
        input.allowedApplicationStatuses
        && !input.allowedApplicationStatuses.includes(application.status)
      ) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Application cannot receive candidate CV update in its current state.',
        });
      }

      if (this.isTerminalStatus(application.status)) {
        throw new BadRequestException('Terminal application cannot receive CV upload');
      }

      const previousCurrentCvDocument = application.currentCvDocumentId
        ? await manager.getRepository(CvDocumentEntity).findOne({
            where: {
              id: application.currentCvDocumentId,
              applicationId,
            },
          })
        : null;
      const versionNo = await this.nextVersionNo(manager, applicationId);

      if (replaceCurrent) {
        await manager.getRepository(CvDocumentEntity).update(
          {
            applicationId,
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const cvDocument = manager.getRepository(CvDocumentEntity).create({
        applicationId,
        candidateId: application.candidateId,
        documentType: CvDocumentType.ORIGINAL,
        versionNo,
        originalFileName: validatedFile.originalFileName,
        mimeType: validatedFile.mimeType,
        fileSize: String(input.file.size),
        originalFileHash: validatedFile.originalFileHash,
        cleanFileHash: null,
        storageZone: StorageZone.QUARANTINE,
        storagePath: validatedFile.storagePath,
        scanStatus: CvScanStatus.PENDING,
        sanitizeStatus: CvSanitizeStatus.PENDING,
        parseStatus: CvParseStatus.PENDING,
        isCurrent: replaceCurrent,
      });
      const saved = await manager.getRepository(CvDocumentEntity).save(cvDocument);

      if (replaceCurrent) {
        application.currentCvDocumentId = saved.id;
        await manager.getRepository(ApplicationEntity).save(application);
      }

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId,
          toStatus: ApplicationStatus.CV_UPLOADED,
          eventType: 'CV_UPLOADED',
          actorType: 'USER',
          actorId: this.optionalText(input.actorId),
          metadata: {
            applicationId,
            candidateId: application.candidateId,
            cvDocumentId: saved.id,
            documentType: saved.documentType,
            versionNo: saved.versionNo,
            originalFileName: saved.originalFileName,
            mimeType: saved.mimeType,
            fileSize: Number(saved.fileSize),
            originalFileHash: saved.originalFileHash,
            replaceCurrent,
            previousCurrentCvDocumentId: previousCurrentCvDocument?.id ?? null,
            previousCurrentVersionNo: previousCurrentCvDocument?.versionNo ?? null,
            previousCurrentDocumentType: previousCurrentCvDocument?.documentType ?? null,
            hasReason: Boolean(this.optionalText(input.reason)),
            hasIdempotencyKey: Boolean(idempotencyKey),
            idempotencyKeyHash,
          },
        },
        manager,
      );
      await this.recordAuditLog(manager, {
        applicationId,
        actorType: 'USER',
        actorId: this.optionalText(input.actorId),
        action: 'CV_UPLOADED',
        objectId: saved.id,
        metadata: {
          applicationId,
          candidateId: application.candidateId,
          cvDocumentId: saved.id,
          documentType: saved.documentType,
          versionNo: saved.versionNo,
          originalFileName: saved.originalFileName,
          mimeType: saved.mimeType,
          fileSize: Number(saved.fileSize),
          originalFileHash: saved.originalFileHash,
          replaceCurrent,
          previousCurrentCvDocumentId: previousCurrentCvDocument?.id ?? null,
          previousCurrentVersionNo: previousCurrentCvDocument?.versionNo ?? null,
          hasReason: Boolean(this.optionalText(input.reason)),
          hasIdempotencyKey: Boolean(idempotencyKey),
          idempotencyKeyHash,
        },
      });
      await this.recordAuditLog(manager, {
        applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_HASH_CALCULATED',
        objectId: saved.id,
        metadata: {
          applicationId,
          candidateId: application.candidateId,
          cvDocumentId: saved.id,
          documentType: saved.documentType,
          versionNo: saved.versionNo,
          originalFileHash: saved.originalFileHash,
          hashAlgorithm: 'sha256',
        },
      });
      await this.recordDuplicateCheck(manager, {
        applicationId,
        checkType: DuplicateCheckType.FILE_DUPLICATE,
        status: DuplicateCheckStatus.PASSED,
        details: {
          candidateId: application.candidateId,
          cvDocumentId: saved.id,
          documentType: saved.documentType,
          versionNo: saved.versionNo,
          originalFileHash: saved.originalFileHash,
          hasIdempotencyKey: Boolean(idempotencyKey),
          idempotencyKeyHash,
        },
      });

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId,
          expectedFromStatus: ApplicationStatus.CV_UPLOADED,
          toStatus: ApplicationStatus.CV_STORED_QUARANTINE,
          eventType: 'CV_STORED_QUARANTINE',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {
            applicationId,
            candidateId: application.candidateId,
            cvDocumentId: saved.id,
            documentType: saved.documentType,
            versionNo: saved.versionNo,
            storageZone: saved.storageZone,
            storageKeyRecorded: Boolean(saved.storagePath),
            originalFileHash: saved.originalFileHash,
            scannerAllowedSource: 'QUARANTINE',
          },
        },
        manager,
      );
      await this.recordAuditLog(manager, {
        applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_STORED_QUARANTINE',
        objectId: saved.id,
        metadata: {
          applicationId,
          candidateId: application.candidateId,
          cvDocumentId: saved.id,
          documentType: saved.documentType,
          versionNo: saved.versionNo,
          storageZone: saved.storageZone,
          storageKeyRecorded: Boolean(saved.storagePath),
          originalFileHash: saved.originalFileHash,
          scannerAllowedSource: 'QUARANTINE',
        },
      });

      return {
        cvDocument: saved,
        keepUploadedFile: true,
        scanFilePath: validatedFile.quarantineFilePath,
      };
    });
  }

  private async validateUploadedFile(file: Express.Multer.File) {
    const originalFileName = this.requireOriginalFileName(file.originalname);
    const quarantineFilePath = this.requireQuarantineFilePath(file.path);
    const extension = path.extname(originalFileName).toLowerCase() as CvFileExtension;
    const rule = CV_FILE_RULES[extension];

    if (!rule) {
      throw new BadRequestException('Unsupported CV file type');
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new BadRequestException('CV file is empty');
    }

    if (file.size > MAX_CV_FILE_SIZE_BYTES) {
      throw new BadRequestException('CV file exceeds 20MB limit');
    }

    this.assertServerGeneratedFileName(file.filename, extension);
    await this.assertFileSignature(quarantineFilePath, rule.signature);
    const originalFileHash = await this.calculateSha256(quarantineFilePath);

    return {
      originalFileName: this.normalizeOriginalFileName(originalFileName),
      originalFileHash,
      quarantineFilePath,
      mimeType: rule.mimeType,
      storagePath: toCvQuarantineStorageKey(quarantineFilePath),
    };
  }

  private async markCvScanSkippedAsPassed(cvDocumentId: string) {
    return this.dataSource.transaction(async (manager) => {
      const cvDocument = await this.findCvDocumentForScan(manager, cvDocumentId);
      cvDocument.scanStatus = CvScanStatus.PASSED;
      const saved = await manager.getRepository(CvDocumentEntity).save(cvDocument);

      const metadata = {
        applicationId: saved.applicationId,
        candidateId: saved.candidateId,
        cvDocumentId: saved.id,
        documentType: saved.documentType,
        versionNo: saved.versionNo,
        originalFileHash: saved.originalFileHash,
        scanStatus: saved.scanStatus,
        storageZone: saved.storageZone,
        scanner: 'disabled',
        scannerResult: 'SKIPPED',
        scannedAt: new Date().toISOString(),
        durationMs: 0,
        reasonCode: 'MALWARE_SCAN_DISABLED',
        threatDetected: false,
        scannerSkipped: true,
        scannerAllowedSource: 'QUARANTINE',
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: saved.applicationId,
          expectedFromStatus: ApplicationStatus.CV_STORED_QUARANTINE,
          toStatus: ApplicationStatus.CV_SCAN_PASSED,
          eventType: 'CV_SCAN_PASSED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId: saved.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_SCAN_PASSED',
        objectId: saved.id,
        metadata,
      });

      return saved;
    });
  }

  private async findCvDocumentForScan(manager: EntityManager, cvDocumentId: string) {
    const cvDocument = await manager.getRepository(CvDocumentEntity).findOne({
      where: { id: cvDocumentId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!cvDocument) {
      throw new BadRequestException('CV document not found');
    }

    return cvDocument;
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

  private assertCvScanAccepted(cvDocument: CvDocumentEntity) {
    if (cvDocument.scanStatus === CvScanStatus.PASSED) return;

    if (cvDocument.scanStatus === CvScanStatus.REJECTED_MALWARE) {
      throw new UnprocessableEntityException({
        code: 'MALWARE_DETECTED',
        message: 'CV file failed security scan.',
      });
    }

    throw new ServiceUnavailableException({
      code: 'CV_SCAN_FAILED',
      message: 'CV security scan could not be completed. Please retry later.',
    });
  }

  private scheduleSanitizeAfterScanPass(cvDocument: CvDocumentEntity) {
    if (cvDocument.scanStatus !== CvScanStatus.PASSED) return;

    this.logger.log(
      `CV sanitize scheduled after scan pass applicationId=${cvDocument.applicationId} cvDocumentId=${cvDocument.id}`,
    );
    setImmediate(() => {
      void this.cvSanitizationService.sanitizeCvDocument({
        applicationId: cvDocument.applicationId,
        cvDocumentId: cvDocument.id,
      }).catch((error) => {
        this.logger.error(
          `CV sanitize scheduled job failed applicationId=${cvDocument.applicationId} cvDocumentId=${cvDocument.id} message=${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      });
    });
  }

  private requireQuarantineFilePath(filePath: string) {
    if (!filePath) {
      throw new BadRequestException('CV quarantine file path is required');
    }

    try {
      return assertCvQuarantineFilePath(filePath);
    } catch {
      throw new BadRequestException('CV file is not stored in quarantine');
    }
  }

  private requireOriginalFileName(value: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException('Original CV filename is required');
    }

    if (
      normalized.includes('..') ||
      /[/\\]/.test(normalized) ||
      path.isAbsolute(normalized) ||
      /[\x00-\x1f\x7f]/.test(normalized)
    ) {
      throw new BadRequestException('Invalid CV filename');
    }

    return normalized;
  }

  private assertServerGeneratedFileName(filename: string, expectedExtension: CvFileExtension) {
    if (
      !filename ||
      filename.includes('..') ||
      /[/\\]/.test(filename) ||
      path.basename(filename) !== filename ||
      path.extname(filename).toLowerCase() !== expectedExtension ||
      !/^\d+-[0-9a-fA-F-]+\.(pdf|docx|xlsx)$/.test(filename)
    ) {
      throw new BadRequestException('Invalid server CV filename');
    }
  }

  private async assertFileSignature(filePath: string, signature: CvFileSignature) {
    const magicBytes = await this.readMagicBytes(filePath, signature === 'pdf' ? 1024 : 8);

    if (signature === 'pdf') {
      const header = Buffer.from('%PDF-');
      if (magicBytes.indexOf(header) >= 0) {
        return;
      }
    }

    if (signature === 'zip') {
      const zipSignature = magicBytes.subarray(0, 4).toString('hex');

      if (['504b0304', '504b0506', '504b0708'].includes(zipSignature)) {
        return;
      }
    }

    throw new BadRequestException('CV file signature does not match extension');
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

  private calculateTextSha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async safeDeleteUploadedFile(file?: Express.Multer.File) {
    await deleteCvQuarantineFile(file?.path);
  }

  private async deleteStoredCvDocument(document: Pick<CvDocumentEntity, 'id' | 'storageZone' | 'storagePath'>) {
    try {
      if (document.storageZone === StorageZone.SAFE) {
        await deleteCvSafeFile(resolveCvSafeStorageKey(document.storagePath));
      } else if (document.storageZone === StorageZone.QUARANTINE) {
        await deleteCvQuarantineFile(resolveCvQuarantineStorageKey(document.storagePath));
      }
    } catch (error) {
      this.logger.warn(
        `Previous CV file cleanup failed cvDocumentId=${document.id} message=${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async findExistingUploadByIdempotencyKey(
    manager: EntityManager,
    applicationId: string,
    idempotencyKeyHash: string,
  ) {
    const uploadEvent = await manager.getRepository(WorkflowEventEntity)
      .createQueryBuilder('event')
      .where('event.applicationId = :applicationId', { applicationId })
      .andWhere('event.eventType = :eventType', { eventType: 'CV_UPLOADED' })
      .andWhere("event.metadata ->> 'idempotencyKeyHash' = :idempotencyKeyHash", {
        idempotencyKeyHash,
      })
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .getOne();
    const cvDocumentId = uploadEvent?.metadata?.cvDocumentId;
    const originalFileHash = uploadEvent?.metadata?.originalFileHash;

    if (typeof cvDocumentId !== 'string' || typeof originalFileHash !== 'string') {
      return null;
    }

    const cvDocument = await manager.getRepository(CvDocumentEntity).findOne({
      where: {
        id: cvDocumentId,
        applicationId,
        documentType: CvDocumentType.ORIGINAL,
        originalFileHash,
      },
      order: {
        versionNo: 'DESC',
        createdAt: 'DESC',
      },
    });

    return cvDocument ? { cvDocument, originalFileHash } : null;
  }

  private findExistingOriginalByHash(
    manager: EntityManager,
    applicationId: string,
    originalFileHash: string,
    skipLookup = false,
    forceLookup = false,
  ) {
    if (skipLookup && !forceLookup) return null;

    return manager.getRepository(CvDocumentEntity).findOne({
      where: {
        applicationId,
        documentType: CvDocumentType.ORIGINAL,
        originalFileHash,
      },
      order: {
        versionNo: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  private async recordFileDuplicateDetected(
    manager: EntityManager,
    input: {
      application: ApplicationEntity;
      matchedCvDocument: CvDocumentEntity | null;
      incomingOriginalFileHash: string;
      actorId?: string | null;
      idempotencyKeyHash?: string | null;
      reasonCode: string;
    },
  ) {
    const matchedCvDocument = input.matchedCvDocument;
    const details = {
      applicationId: input.application.id,
      candidateId: input.application.candidateId,
      matchedCvDocumentId: matchedCvDocument?.id ?? null,
      matchedVersionNo: matchedCvDocument?.versionNo ?? null,
      incomingOriginalFileHash: input.incomingOriginalFileHash,
      matchedOriginalFileHash: matchedCvDocument?.originalFileHash ?? null,
      hasIdempotencyKey: Boolean(input.idempotencyKeyHash),
      idempotencyKeyHash: input.idempotencyKeyHash ?? null,
      reasonCode: input.reasonCode,
    };

    await this.recordDuplicateCheck(manager, {
      applicationId: input.application.id,
      checkType: DuplicateCheckType.FILE_DUPLICATE,
      status: DuplicateCheckStatus.DUPLICATE_FOUND,
      matchedEntityType: matchedCvDocument ? 'CV_DOCUMENT' : null,
      matchedEntityId: matchedCvDocument?.id ?? null,
      details,
    });
    await this.recordAuditLog(manager, {
      applicationId: input.application.id,
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      actorId: this.optionalText(input.actorId),
      action: 'CV_FILE_DUPLICATE_FOUND',
      objectId: matchedCvDocument?.id ?? input.application.id,
      metadata: details,
    });
  }

  private async recordDuplicateCheck(
    manager: EntityManager,
    input: {
      applicationId: string;
      checkType: DuplicateCheckType;
      status: DuplicateCheckStatus;
      matchedEntityType?: string | null;
      matchedEntityId?: string | null;
      score?: string | null;
      details?: Record<string, unknown> | null;
    },
  ) {
    await manager.getRepository(DuplicateCheckEntity).save(
      manager.getRepository(DuplicateCheckEntity).create({
        applicationId: input.applicationId,
        checkType: input.checkType,
        status: input.status,
        matchedEntityType: input.matchedEntityType ?? null,
        matchedEntityId: input.matchedEntityId ?? null,
        score: input.score ?? null,
        details: input.details ?? null,
      }),
    );
  }

  private async nextVersionNo(manager: EntityManager, applicationId: string) {
    const result = await manager.getRepository(CvDocumentEntity)
      .createQueryBuilder('cvDocument')
      .select('COALESCE(MAX(cvDocument.versionNo), 0)', 'max')
      .where('cvDocument.applicationId = :applicationId', { applicationId })
      .andWhere('cvDocument.documentType = :documentType', {
        documentType: CvDocumentType.ORIGINAL,
      })
      .getRawOne<{ max: string }>();
    return Number(result?.max ?? 0) + 1;
  }

  private async assertApplicationExists(applicationId: string) {
    const exists = await this.dataSource.getRepository(ApplicationEntity).exist({
      where: { id: applicationId },
    });
    if (!exists) throw new BadRequestException('Application not found');
  }

  private isCleanCvAccessible(cvDocument: CvDocumentEntity) {
    return (
      cvDocument.documentType === CvDocumentType.CLEAN &&
      cvDocument.storageZone === StorageZone.SAFE &&
      cvDocument.sanitizeStatus === CvSanitizeStatus.SANITIZED &&
      Boolean(cvDocument.cleanFileHash)
    );
  }

  private buildCleanCvFileName(cvDocument: CvDocumentEntity) {
    return `clean-cv-v${cvDocument.versionNo}.pdf`;
  }

  private isTerminalStatus(status: ApplicationStatus) {
    return TERMINAL_APPLICATION_STATUSES.includes(
      status as typeof TERMINAL_APPLICATION_STATUSES[number],
    );
  }

  private normalizeOriginalFileName(value: string) {
    const clientName = (value || 'cv').split(/[\\/]/).pop() ?? 'cv';
    const baseName = path.basename(clientName)
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim();
    return (baseName || 'cv').slice(0, 255);
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
