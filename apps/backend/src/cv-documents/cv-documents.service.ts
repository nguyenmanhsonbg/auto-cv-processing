import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { open, stat } from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import {
  CV_MALWARE_SCANNER,
  CvMalwareScanner,
  CvMalwareScanResult,
  CvMalwareScanStatus,
} from '../cv-sanitization/scanner/cv-malware-scanner.interface';
import { CvSanitizationService } from '../cv-sanitization/cv-sanitization.service';
import { resolveCvSafeStorageKey } from '../cv-sanitization/storage/cv-safe-storage';
import {
  ApplicationStatus,
  CvDocumentType,
  CvParseStatus,
  CvSanitizeStatus,
  CvScanStatus,
  StorageZone,
  TERMINAL_APPLICATION_STATUSES,
} from '../recruitment-common';
import { WorkflowEventEntity } from '../workflow-state/entities/workflow-event.entity';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import {
  assertCvQuarantineFilePath,
  deleteCvQuarantineFile,
  toCvQuarantineStorageKey,
} from './storage/cv-quarantine-storage';

const MAX_CV_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const DEFAULT_CV_SCANNER_TIMEOUT_MS = 15_000;

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
  reason?: string | null;
  actorId?: string | null;
  idempotencyKey?: string | null;
}

export interface CleanCvFileAccessInput {
  applicationId: string;
  cvDocumentId: string;
  actorId?: string | null;
  actorRole?: string | null;
  accessMode?: 'inline' | 'attachment';
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
  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
    @Inject(CV_MALWARE_SCANNER)
    private readonly malwareScanner: CvMalwareScanner,
    private readonly cvSanitizationService: CvSanitizationService,
  ) {}

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
        cvDocument = await this.markCvScanRequested(cvDocument.id);
        const scanResult = await this.scanOriginalCv(cvDocument, result.scanFilePath);
        cvDocument = await this.completeCvScan(cvDocument.id, scanResult);
      }

      this.assertCvScanAccepted(cvDocument);
      this.scheduleSanitizeAfterScanPass(cvDocument);
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

      const existingCvDocument = idempotencyKeyHash
        ? await this.findExistingOriginalByIdempotencyKeyAndHash(
            manager,
            applicationId,
            validatedFile.originalFileHash,
            idempotencyKeyHash,
          )
        : null;

      if (existingCvDocument) {
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
              cvDocumentId: existingCvDocument.id,
              documentType: existingCvDocument.documentType,
              versionNo: existingCvDocument.versionNo,
              originalFileHash: existingCvDocument.originalFileHash,
              hasIdempotencyKey: true,
              idempotencyKeyHash,
              duplicateFileDiscarded: true,
            },
          },
          manager,
        );

        return {
          cvDocument: existingCvDocument,
          keepUploadedFile: false,
          scanFilePath: null,
        };
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

  private async markCvScanRequested(cvDocumentId: string) {
    return this.dataSource.transaction(async (manager) => {
      const cvDocument = await this.findCvDocumentForScan(manager, cvDocumentId);
      cvDocument.scanStatus = CvScanStatus.SCANNING;
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
        scannerAllowedSource: 'QUARANTINE',
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: saved.applicationId,
          expectedFromStatus: ApplicationStatus.CV_STORED_QUARANTINE,
          toStatus: ApplicationStatus.CV_SCAN_REQUESTED,
          eventType: 'CV_SCAN_REQUESTED',
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
        action: 'CV_SCAN_REQUESTED',
        objectId: saved.id,
        metadata,
      });

      return saved;
    });
  }

  private async scanOriginalCv(cvDocument: CvDocumentEntity, filePath: string) {
    const timeoutMs = this.getScannerTimeoutMs();

    try {
      return await this.withTimeout(
        this.malwareScanner.scanOriginalCv({
          applicationId: cvDocument.applicationId,
          cvDocumentId: cvDocument.id,
          originalFileHash: cvDocument.originalFileHash ?? '',
          filePath,
          storageZone: cvDocument.storageZone,
          storagePath: cvDocument.storagePath,
          mimeType: cvDocument.mimeType,
          fileSize: Number(cvDocument.fileSize),
        }),
        timeoutMs,
        () => this.buildFailedScanResult('SCANNER_TIMEOUT', timeoutMs),
      );
    } catch {
      return this.buildFailedScanResult('SCANNER_FAILED', timeoutMs);
    }
  }

  private async completeCvScan(
    cvDocumentId: string,
    scanResult: CvMalwareScanResult,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const cvDocument = await this.findCvDocumentForScan(manager, cvDocumentId);
      const nextScanStatus = this.toCvScanStatus(scanResult.status);
      const nextApplicationStatus = this.toApplicationScanStatus(scanResult.status);
      const eventType = nextApplicationStatus;

      cvDocument.scanStatus = nextScanStatus;
      const saved = await manager.getRepository(CvDocumentEntity).save(cvDocument);
      const metadata = this.buildScanResultMetadata(saved, scanResult);

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: saved.applicationId,
          expectedFromStatus: ApplicationStatus.CV_SCAN_REQUESTED,
          toStatus: nextApplicationStatus,
          eventType,
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
        action: eventType,
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

  private buildScanResultMetadata(
    cvDocument: CvDocumentEntity,
    scanResult: CvMalwareScanResult,
  ) {
    return {
      applicationId: cvDocument.applicationId,
      candidateId: cvDocument.candidateId,
      cvDocumentId: cvDocument.id,
      documentType: cvDocument.documentType,
      versionNo: cvDocument.versionNo,
      originalFileHash: cvDocument.originalFileHash,
      scanStatus: cvDocument.scanStatus,
      scanner: scanResult.scanner,
      scannerResult: scanResult.status,
      scannedAt: scanResult.scannedAt.toISOString(),
      durationMs: scanResult.durationMs,
      reasonCode: scanResult.reasonCode ?? null,
      threatDetected: scanResult.status === CvMalwareScanStatus.REJECTED_MALWARE,
      scannerAllowedSource: 'QUARANTINE',
    };
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

  private toCvScanStatus(status: CvMalwareScanStatus) {
    if (status === CvMalwareScanStatus.PASSED) return CvScanStatus.PASSED;
    if (status === CvMalwareScanStatus.REJECTED_MALWARE) {
      return CvScanStatus.REJECTED_MALWARE;
    }
    return CvScanStatus.FAILED;
  }

  private toApplicationScanStatus(status: CvMalwareScanStatus) {
    if (status === CvMalwareScanStatus.PASSED) return ApplicationStatus.CV_SCAN_PASSED;
    if (status === CvMalwareScanStatus.REJECTED_MALWARE) {
      return ApplicationStatus.CV_REJECTED_MALWARE;
    }
    return ApplicationStatus.CV_SCAN_FAILED;
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

    setImmediate(() => {
      void this.cvSanitizationService.sanitizeCvDocument({
        applicationId: cvDocument.applicationId,
        cvDocumentId: cvDocument.id,
      }).catch(() => undefined);
    });
  }

  private buildFailedScanResult(reasonCode: string, durationMs: number): CvMalwareScanResult {
    return {
      status: CvMalwareScanStatus.FAILED,
      scanner: 'cv-malware-scanner',
      scannedAt: new Date(),
      durationMs,
      reasonCode,
    };
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    onTimeout: () => T,
  ) {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(onTimeout()), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private getScannerTimeoutMs() {
    const parsed = Number(process.env.CV_SCANNER_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 300_000);
    }
    return DEFAULT_CV_SCANNER_TIMEOUT_MS;
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

  private async findExistingOriginalByIdempotencyKeyAndHash(
    manager: EntityManager,
    applicationId: string,
    originalFileHash: string,
    idempotencyKeyHash: string,
  ) {
    const uploadEvent = await manager.getRepository(WorkflowEventEntity)
      .createQueryBuilder('event')
      .where('event.applicationId = :applicationId', { applicationId })
      .andWhere('event.eventType = :eventType', { eventType: 'CV_UPLOADED' })
      .andWhere("event.metadata ->> 'originalFileHash' = :originalFileHash", {
        originalFileHash,
      })
      .andWhere("event.metadata ->> 'idempotencyKeyHash' = :idempotencyKeyHash", {
        idempotencyKeyHash,
      })
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .getOne();
    const cvDocumentId = uploadEvent?.metadata?.cvDocumentId;

    if (typeof cvDocumentId !== 'string') {
      return null;
    }

    return manager.getRepository(CvDocumentEntity).findOne({
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
