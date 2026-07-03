import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { resolveCvSafeStorageKey } from '../cv-sanitization/storage/cv-safe-storage';
import { FileParserService } from '../file-parser/file-parser.service';
import {
  ApplicationStatus,
  CvDocumentType,
  CvParseStatus,
  CvSanitizeStatus,
  StorageZone,
} from '../recruitment-common';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';

const DEFAULT_PARSER_VERSION = 'file-parser-v1';

export interface ParseCleanCvInput {
  applicationId: string;
  cvDocumentId: string;
  actorId?: string | null;
  idempotencyKey?: string | null;
  parserMode?: string | null;
}

interface ParseStartContext {
  cleanCvDocument: CvDocumentEntity;
  sourceFilePath: string;
  applicationStatus: ApplicationStatus;
  parsedProfile?: ParsedProfileEntity | null;
  idempotencyKeyHash: string | null;
  parserMode: string;
}

interface ParseResult {
  parsedData: Record<string, unknown>;
  normalizedText: string;
  normalizedTextHash: string;
  parserVersion: string;
}

@Injectable()
export class CvParsingService {
  private readonly logger = new Logger(CvParsingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workflowStateService: WorkflowStateService,
    private readonly fileParserService: FileParserService,
  ) {}

  async parseCleanCvDocument(input: ParseCleanCvInput) {
    const context = await this.prepareParse(input);

    if (context.parsedProfile) {
      return context.parsedProfile;
    }

    try {
      const parseResult = await this.parseCleanFile(context.sourceFilePath, context.parserMode);
      return await this.markParseSucceeded(context, parseResult);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      const reasonCode = this.toParseFailureReason(error);
      this.logger.error(
        `CV parse failed for application ${context.cleanCvDocument.applicationId}, document ${context.cleanCvDocument.id}: ${this.toErrorDetail(error)}`,
      );
      await this.markParseFailed(context, reasonCode);
      throw this.toParseException(reasonCode);
    }
  }

  private async prepareParse(input: ParseCleanCvInput): Promise<ParseStartContext> {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const cvDocumentId = this.requireText(input.cvDocumentId, 'CV document id');
    const parserMode = this.normalizeParserMode(input.parserMode);
    const idempotencyKeyHash = this.hashOptionalText(input.idempotencyKey);
    const requestedByActorId = this.optionalText(input.actorId);

    return this.dataSource.transaction(async (manager) => {
      const cleanCvDocument = await this.findCleanCvForParse(manager, applicationId, cvDocumentId);
      const existingProfile = await this.findExistingParsedProfile(manager, cleanCvDocument.id);

      if (existingProfile) {
        await this.recordAuditLog(manager, {
          applicationId,
          actorType: requestedByActorId ? 'USER' : 'SYSTEM',
          actorId: requestedByActorId,
          action: 'CV_PARSE_IDEMPOTENT_RETRY',
          objectId: existingProfile.id,
          metadata: {
            applicationId,
            cleanCvDocumentId: cleanCvDocument.id,
            parsedProfileId: existingProfile.id,
            cleanFileHash: cleanCvDocument.cleanFileHash,
            normalizedTextHash: existingProfile.normalizedTextHash,
            parserMode,
            idempotencyKeyHash,
          },
        });

        return {
          cleanCvDocument,
          sourceFilePath: '',
          applicationStatus: ApplicationStatus.CV_PARSED,
          parsedProfile: existingProfile,
          idempotencyKeyHash,
          parserMode,
        };
      }

      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!application) throw new BadRequestException('Application not found');
      if (!this.canStartParse(application.status)) {
        throw new BadRequestException('Application status does not allow CV parsing');
      }
      if (
        !cleanCvDocument.isCurrent &&
        application.currentCvDocumentId !== cleanCvDocument.id
      ) {
        throw new BadRequestException('Only the current clean CV can be parsed');
      }
      if (cleanCvDocument.parseStatus === CvParseStatus.PARSING) {
        throw new BadRequestException('CV is already being parsed');
      }

      const sourceFilePath = resolveCvSafeStorageKey(cleanCvDocument.storagePath);
      cleanCvDocument.parseStatus = CvParseStatus.PARSING;
      const savedClean = await manager.getRepository(CvDocumentEntity).save(cleanCvDocument);
      const metadata = {
        applicationId,
        cleanCvDocumentId: savedClean.id,
        versionNo: savedClean.versionNo,
        cleanFileHash: savedClean.cleanFileHash,
        parserMode,
        parseStatus: savedClean.parseStatus,
        parserSource: 'SAFE',
        idempotencyKeyHash,
      };

      await this.workflowStateService.recordEvent(
        {
          applicationId,
          fromStatus: application.status,
          toStatus: application.status,
          eventType: 'CV_PARSE_REQUESTED',
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
        action: 'CV_PARSE_REQUESTED',
        objectId: savedClean.id,
        metadata,
      });

      return {
        cleanCvDocument: savedClean,
        sourceFilePath,
        applicationStatus: application.status,
        parsedProfile: null,
        idempotencyKeyHash,
        parserMode,
      };
    });
  }

  private async parseCleanFile(filePath: string, parserMode: string): Promise<ParseResult> {
    const parsedData = this.sanitizeForJsonb(await this.fileParserService.parseFile(filePath));
    const parserError = this.optionalText(String(parsedData.error ?? ''));
    const rawText = typeof parsedData.rawText === 'string' ? parsedData.rawText : '';
    const normalizedText = this.normalizeText(rawText);

    if (parserError) {
      throw new Error('PARSER_FAILED');
    }

    if (!normalizedText) {
      throw new Error('EMPTY_PARSED_TEXT');
    }

    return {
      parsedData: {
        ...parsedData,
        parserMode,
      },
      normalizedText,
      normalizedTextHash: this.calculateTextSha256(normalizedText),
      parserVersion: DEFAULT_PARSER_VERSION,
    };
  }

  private sanitizeForJsonb(value: Record<string, unknown>): Record<string, unknown> {
    const sanitized = this.sanitizeJsonbValue(value);
    return this.isRecord(sanitized) ? sanitized : {};
  }

  private sanitizeJsonbValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/\u0000/g, '');
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonbValue(item));
    }

    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [
            key.replace(/\u0000/g, ''),
            this.sanitizeJsonbValue(item),
          ]),
      );
    }

    return value;
  }

  private async markParseSucceeded(context: ParseStartContext, parseResult: ParseResult) {
    return this.dataSource.transaction(async (manager) => {
      const cleanCvDocument = await this.findCleanCvById(
        manager,
        context.cleanCvDocument.id,
      );
      const existingProfile = await this.findExistingParsedProfile(manager, cleanCvDocument.id);
      if (existingProfile) return existingProfile;

      cleanCvDocument.parseStatus = CvParseStatus.PARSED;
      await manager.getRepository(CvDocumentEntity).save(cleanCvDocument);

      const parsedProfile = manager.getRepository(ParsedProfileEntity).create({
        applicationId: cleanCvDocument.applicationId,
        cvDocumentId: cleanCvDocument.id,
        candidateId: cleanCvDocument.candidateId,
        parsedData: parseResult.parsedData,
        normalizedTextHash: parseResult.normalizedTextHash,
        parserVersion: parseResult.parserVersion,
      });
      const savedProfile = await manager.getRepository(ParsedProfileEntity).save(parsedProfile);

      const metadata = {
        applicationId: cleanCvDocument.applicationId,
        cleanCvDocumentId: cleanCvDocument.id,
        parsedProfileId: savedProfile.id,
        versionNo: cleanCvDocument.versionNo,
        cleanFileHash: cleanCvDocument.cleanFileHash,
        normalizedTextHash: savedProfile.normalizedTextHash,
        parserVersion: savedProfile.parserVersion,
        parserMode: context.parserMode,
        rawTextLength: parseResult.normalizedText.length,
        extractedFields: this.listExtractedFields(parseResult.parsedData),
        idempotencyKeyHash: context.idempotencyKeyHash,
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: cleanCvDocument.applicationId,
          expectedFromStatus: context.applicationStatus,
          toStatus: ApplicationStatus.CV_PARSED,
          eventType: 'CV_PARSED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId: cleanCvDocument.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_PARSED',
        objectType: 'PARSED_PROFILE',
        objectId: savedProfile.id,
        metadata,
      });
      await this.recordAuditLog(manager, {
        applicationId: cleanCvDocument.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'PARSED_PROFILE_CREATED',
        objectType: 'PARSED_PROFILE',
        objectId: savedProfile.id,
        metadata,
      });

      return savedProfile;
    });
  }

  private async markParseFailed(context: ParseStartContext, reasonCode: string) {
    return this.dataSource.transaction(async (manager) => {
      const cleanCvDocument = await this.findCleanCvById(
        manager,
        context.cleanCvDocument.id,
      );
      cleanCvDocument.parseStatus = CvParseStatus.FAILED;
      await manager.getRepository(CvDocumentEntity).save(cleanCvDocument);

      const metadata = {
        applicationId: cleanCvDocument.applicationId,
        cleanCvDocumentId: cleanCvDocument.id,
        versionNo: cleanCvDocument.versionNo,
        cleanFileHash: cleanCvDocument.cleanFileHash,
        parseStatus: cleanCvDocument.parseStatus,
        reasonCode,
        manualReviewRequired: true,
        retryAllowed: true,
        candidateReuploadMayBeRequired: reasonCode === 'EMPTY_PARSED_TEXT',
        parserMode: context.parserMode,
        idempotencyKeyHash: context.idempotencyKeyHash,
      };

      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: cleanCvDocument.applicationId,
          expectedFromStatus: context.applicationStatus,
          toStatus: ApplicationStatus.CV_PARSE_FAILED,
          eventType: 'CV_PARSE_FAILED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata,
        },
        manager,
      );

      await this.recordAuditLog(manager, {
        applicationId: cleanCvDocument.applicationId,
        actorType: 'SYSTEM',
        actorId: null,
        action: 'CV_PARSE_FAILED',
        objectId: cleanCvDocument.id,
        metadata,
      });
    });
  }

  private async findCleanCvForParse(
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
    this.assertCleanCvCanBeParsed(cvDocument);
    return cvDocument;
  }

  private async findCleanCvById(manager: EntityManager, cvDocumentId: string) {
    const cvDocument = await manager.getRepository(CvDocumentEntity).findOne({
      where: { id: cvDocumentId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!cvDocument) throw new BadRequestException('CV document not found');
    this.assertCleanCvCanBeParsed(cvDocument);
    return cvDocument;
  }

  private assertCleanCvCanBeParsed(cvDocument: CvDocumentEntity) {
    if (cvDocument.documentType !== CvDocumentType.CLEAN) {
      throw new BadRequestException('Only clean CV documents can be parsed');
    }
    if (cvDocument.storageZone !== StorageZone.SAFE) {
      throw new BadRequestException('CV parsing requires safe storage');
    }
    if (cvDocument.sanitizeStatus !== CvSanitizeStatus.SANITIZED) {
      throw new BadRequestException('CV must be sanitized before parsing');
    }
    if (!cvDocument.cleanFileHash) {
      throw new BadRequestException('Clean CV hash is required before parsing');
    }
  }

  private findExistingParsedProfile(manager: EntityManager, cvDocumentId: string) {
    return manager.getRepository(ParsedProfileEntity).findOne({
      where: { cvDocumentId },
      order: { createdAt: 'DESC' },
    });
  }

  private canStartParse(status: ApplicationStatus) {
    return [
      ApplicationStatus.CV_SANITIZED,
      ApplicationStatus.CV_PARSE_FAILED,
    ].includes(status);
  }

  private toParseException(reasonCode: string) {
    const payload = {
      code: 'CV_PARSE_FAILED',
      message: 'CV parsing failed. Manual review or retry is required.',
    };

    if (reasonCode === 'EMPTY_PARSED_TEXT') {
      return new UnprocessableEntityException(payload);
    }

    return new ServiceUnavailableException(payload);
  }

  private toParseFailureReason(error: unknown) {
    if (error instanceof Error && error.message === 'EMPTY_PARSED_TEXT') {
      return 'EMPTY_PARSED_TEXT';
    }

    return 'PARSER_FAILED';
  }

  private toErrorDetail(error: unknown) {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private listExtractedFields(parsedData: Record<string, unknown>) {
    return Object.keys(parsedData)
      .filter((key) => key !== 'rawText')
      .sort();
  }

  private normalizeParserMode(value?: string | null) {
    const normalized = this.optionalText(value)?.toUpperCase() ?? 'DEFAULT';
    if (!/^[A-Z0-9_-]{1,40}$/.test(normalized)) {
      throw new BadRequestException('Parser mode is invalid');
    }
    return normalized;
  }

  private normalizeText(value: string) {
    return value.replace(/\s+/g, ' ').trim();
  }

  private calculateTextSha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashOptionalText(value?: string | null) {
    const normalized = this.optionalText(value);
    return normalized ? this.calculateTextSha256(normalized) : null;
  }

  private async recordAuditLog(
    manager: EntityManager,
    input: {
      applicationId: string;
      actorType: string;
      actorId?: string | null;
      action: string;
      objectType?: string;
      objectId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const auditRepo = manager.getRepository(AuditLogEntity);
    await auditRepo.save(auditRepo.create({
      actorType: input.actorType,
      actorId: this.optionalText(input.actorId),
      action: input.action,
      objectType: input.objectType ?? 'CV_DOCUMENT',
      objectId: input.objectId,
      applicationId: input.applicationId,
      metadata: input.metadata,
      ipAddress: null,
      userAgent: null,
    }));
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
