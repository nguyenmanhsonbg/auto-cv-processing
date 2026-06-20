import { BadRequestException, Injectable } from '@nestjs/common';
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
    if (!input.file) throw new BadRequestException('CV file is required');
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const replaceCurrent = input.replaceCurrent ?? true;

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
        originalFileName: this.normalizeOriginalFileName(input.file.originalname),
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
