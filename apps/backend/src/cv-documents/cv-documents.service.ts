import { BadRequestException, Injectable } from '@nestjs/common';
import { open, unlink } from 'fs/promises';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
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
import { CvDocumentEntity } from './entities/cv-document.entity';

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
  reason?: string | null;
  actorId?: string | null;
  idempotencyKey?: string | null;
}

@Injectable()
export class CvDocumentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
  ) {}

  async uploadOriginalCv(input: UploadCvInput) {
    try {
      return await this.createOriginalCv(input);
    } catch (error) {
      await this.safeDeleteUploadedFile(input.file);
      throw error;
    }
  }

  private async createOriginalCv(input: UploadCvInput) {
    if (!input.file) throw new BadRequestException('CV file is required');
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const replaceCurrent = input.replaceCurrent ?? true;
    const validatedFile = await this.validateUploadedFile(input.file);

    return this.dataSource.transaction(async (manager) => {
      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
      });
      if (!application) throw new BadRequestException('Application not found');
      if (this.isTerminalStatus(application.status)) {
        throw new BadRequestException('Terminal application cannot receive CV upload');
      }

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
        mimeType: input.file.mimetype,
        fileSize: String(input.file.size),
        originalFileHash: null,
        cleanFileHash: null,
        storageZone: StorageZone.QUARANTINE,
        storagePath: this.toInternalStoragePath(input.file.path),
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
            replaceCurrent,
            hasReason: Boolean(this.optionalText(input.reason)),
            hasIdempotencyKey: Boolean(this.optionalText(input.idempotencyKey)),
          },
        },
        manager,
      );

      return saved;
    });
  }

  private async validateUploadedFile(file: Express.Multer.File) {
    const originalFileName = this.requireOriginalFileName(file.originalname);
    const extension = path.extname(originalFileName).toLowerCase() as CvFileExtension;
    const rule = CV_FILE_RULES[extension];

    if (!rule) {
      throw new BadRequestException('Unsupported CV file type');
    }

    if (file.mimetype !== rule.mimeType) {
      throw new BadRequestException('CV MIME type does not match file extension');
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new BadRequestException('CV file is empty');
    }

    if (file.size > MAX_CV_FILE_SIZE_BYTES) {
      throw new BadRequestException('CV file exceeds 20MB limit');
    }

    this.assertServerGeneratedFileName(file.filename, extension);
    await this.assertFileSignature(file.path, rule.signature);

    return {
      originalFileName: this.normalizeOriginalFileName(originalFileName),
    };
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
    const magicBytes = await this.readMagicBytes(filePath, 8);

    if (signature === 'pdf' && magicBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return;
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

  private async safeDeleteUploadedFile(file?: Express.Multer.File) {
    if (!file?.path) return;

    const resolvedFilePath = path.resolve(file.path);
    const resolvedQuarantineDir = path.resolve(
      process.env.CV_QUARANTINE_DIR || './storage/cv-quarantine',
    );

    if (!resolvedFilePath.startsWith(`${resolvedQuarantineDir}${path.sep}`)) {
      return;
    }

    await unlink(resolvedFilePath).catch(() => undefined);
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

  private toInternalStoragePath(filePath: string) {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
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
