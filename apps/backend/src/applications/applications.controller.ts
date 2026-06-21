import { UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import {
  ApiErrorResponses,
  apiPaginatedEnvelopeSchema,
  apiSuccessEnvelopeSchema,
} from '../common/swagger/api-envelope.schema';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import { ApplicationEntity } from './entities/application.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationTimelineQueryDto } from './dto/application-timeline-query.dto';
import { ListApplicationAuditLogsQueryDto } from './dto/list-application-audit-logs-query.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

const parsedProfileSchema = {
  type: 'object',
  nullable: true,
  properties: {
    applicationId: { type: 'string', format: 'uuid' },
    parsedProfileId: { type: 'string', format: 'uuid' },
    id: { type: 'string', format: 'uuid' },
    cvDocumentId: { type: 'string', format: 'uuid' },
    candidateId: { type: 'string', format: 'uuid' },
    parserVersion: { type: 'string', nullable: true },
    parsedData: { type: 'object', additionalProperties: true },
    profile: { type: 'object', additionalProperties: true },
    rawTextPreview: { type: 'string', nullable: true, maxLength: 503 },
    normalizedTextPreview: { type: 'string', nullable: true, maxLength: 503 },
    parseStatus: { type: 'string', example: 'SUCCESS' },
    status: { type: 'string', example: 'SUCCESS' },
    parseConfidence: { type: 'number', nullable: true },
    warnings: { type: 'array', items: { type: 'string' } },
    normalizedTextHash: { type: 'string', nullable: true },
    normalizedTextHashRecorded: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const auditLogSchema = {
  type: 'object',
  properties: {
    auditLogId: { type: 'string', format: 'uuid' },
    id: { type: 'string', format: 'uuid' },
    applicationId: { type: 'string', format: 'uuid', nullable: true },
    action: { type: 'string', example: 'CV_UPLOADED' },
    actorType: { type: 'string', nullable: true },
    actorId: { type: 'string', nullable: true },
    objectType: { type: 'string', nullable: true },
    objectId: { type: 'string', nullable: true },
    reason: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('applications')
@ApiErrorResponses([400, 401, 403, 404, 409, 500])
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly workflowStateService: WorkflowStateService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List recruitment applications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sourceChannel', required: false })
  async findAll(@Query() query: ListApplicationsQueryDto) {
    const result = await this.applicationsService.findPaginated(query);
    return {
      success: true,
      data: result.data.map((application) => this.toListItem(application)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: this.meta(),
    };
  }

  @Get(':id/timeline')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get application workflow timeline' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ApplicationTimelineQueryDto,
  ) {
    const data = await this.workflowStateService.findTimelineByApplicationId(id, {
      limit: query.limit,
      offset: query.offset,
      includeMetadata: false,
    });
    return {
      success: true,
      data,
      meta: this.meta(),
    };
  }

  @Get(':id/parsed-profile')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get latest parsed profile for an application' })
  @ApiResponse({
    status: 200,
    description: 'Latest parsed profile for the current clean CV. Returns data null when unavailable.',
    schema: apiSuccessEnvelopeSchema(parsedProfileSchema),
  })
  async parsedProfile(@Param('id', ParseUUIDPipe) id: string) {
    const parsedProfile = await this.applicationsService.findParsedProfileByApplicationId(id);
    return {
      success: true,
      data: parsedProfile ? this.toParsedProfileResponse(parsedProfile) : null,
      meta: this.meta(),
    };
  }

  @Get(':id/audit-logs')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List application audit logs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit logs for the application with sensitive metadata redacted.',
    schema: apiPaginatedEnvelopeSchema(auditLogSchema),
  })
  async auditLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListApplicationAuditLogsQueryDto,
  ) {
    const result = await this.applicationsService.findAuditLogsByApplicationId(id, query);
    return {
      success: true,
      data: result.data.map((log) => this.toAuditLogResponse(log)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: this.meta(),
    };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Override application status for controlled recovery' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Request() req: any,
  ) {
    const data = await this.applicationsService.overrideStatus(id, {
      status: dto.status,
      reason: dto.reason,
      expectedFromStatus: dto.expectedFromStatus,
      actorId: req?.user?.id,
    });
    return {
      success: true,
      data,
      meta: this.meta(),
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get recruitment application detail' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const application = await this.applicationsService.findDetail(id);
    return {
      success: true,
      data: this.toDetail(application),
      meta: this.meta(),
    };
  }

  private toParsedProfileResponse(parsedProfile: ParsedProfileEntity) {
    const parsedData = this.sanitizeParsedData(parsedProfile.parsedData);
    const rawTextPreview = this.previewText(parsedProfile.parsedData?.rawText);
    const normalizedTextPreview = this.previewText(parsedProfile.parsedData?.normalizedText);
    const parseConfidence = this.toNullableNumber(
      parsedData.parseConfidence ?? parsedData.confidence,
    );

    return {
      applicationId: parsedProfile.applicationId,
      parsedProfileId: parsedProfile.id,
      id: parsedProfile.id,
      cvDocumentId: parsedProfile.cvDocumentId,
      candidateId: parsedProfile.candidateId,
      parserVersion: parsedProfile.parserVersion,
      parsedData,
      profile: parsedData,
      rawTextPreview,
      normalizedTextPreview,
      parseStatus: 'SUCCESS',
      status: 'SUCCESS',
      parseConfidence,
      warnings: this.toStringArray(parsedData.warnings),
      normalizedTextHash: parsedProfile.normalizedTextHash,
      normalizedTextHashRecorded: Boolean(parsedProfile.normalizedTextHash),
      createdAt: parsedProfile.createdAt?.toISOString(),
      updatedAt: parsedProfile.createdAt?.toISOString(),
    };
  }

  private toAuditLogResponse(log: AuditLogEntity) {
    return {
      auditLogId: log.id,
      id: log.id,
      applicationId: log.applicationId,
      action: log.action,
      actorType: log.actorType,
      actorId: log.actorId,
      objectType: log.objectType,
      objectId: log.objectId,
      reason: this.auditReason(log.metadata),
      metadata: this.redactMetadata(log.metadata),
      createdAt: log.createdAt?.toISOString(),
    };
  }

  private toListItem(application: ApplicationEntity) {
    return {
      applicationId: application.id,
      candidate: this.toCandidateSummary(application),
      jobPosting: this.toJobPostingSummary(application),
      status: application.status,
      sourceChannel: application.sourceChannel,
      mappingScore: null,
      aiScreeningScore: null,
      createdAt: application.createdAt?.toISOString(),
      updatedAt: application.updatedAt?.toISOString(),
    };
  }

  private toDetail(application: ApplicationEntity) {
    const currentCv = application.currentCvDocument;
    const latestMapping = this.latestByCreatedAt(application.mappingResults);
    const latestForm = this.latestByCreatedAt(application.formSessions);
    const latestAiScreening = this.latestByCreatedAt(application.aiScreeningResults);

    return {
      applicationId: application.id,
      status: application.status,
      source: application.source,
      sourceChannel: application.sourceChannel,
      externalApplicationId: application.externalApplicationId,
      candidate: this.toCandidateSummary(application),
      jobPosting: this.toJobPostingSummary(application),
      cv: currentCv
        ? {
          currentCvDocumentId: currentCv.id,
          documentType: currentCv.documentType,
          versionNo: currentCv.versionNo,
          originalFileName: currentCv.originalFileName,
          scanStatus: currentCv.scanStatus,
          sanitizeStatus: currentCv.sanitizeStatus,
          parseStatus: currentCv.parseStatus,
          createdAt: currentCv.createdAt?.toISOString(),
        }
        : {
          currentCvDocumentId: application.currentCvDocumentId,
          scanStatus: null,
          sanitizeStatus: null,
          parseStatus: null,
        },
      mapping: latestMapping
        ? {
          mappingResultId: latestMapping.id,
          score: this.toNumber(latestMapping.score),
          status: latestMapping.status,
          recommendation: latestMapping.recommendation,
          createdAt: latestMapping.createdAt?.toISOString(),
        }
        : null,
      form: latestForm
        ? {
          formSessionId: latestForm.id,
          status: latestForm.status,
          expiresAt: latestForm.expiresAt?.toISOString(),
          submittedAt: latestForm.submittedAt?.toISOString() ?? null,
          createdAt: latestForm.createdAt?.toISOString(),
        }
        : null,
      aiScreening: latestAiScreening
        ? {
          aiScreeningResultId: latestAiScreening.id,
          score: this.toNumber(latestAiScreening.finalScore),
          status: latestAiScreening.status,
          recommendation: latestAiScreening.recommendation,
          createdAt: latestAiScreening.createdAt?.toISOString(),
        }
        : null,
      sources: (application.sources ?? []).map((source) => ({
        applicationSourceId: source.id,
        sourceType: source.sourceType,
        channel: source.channel,
        externalLeadId: source.externalLeadId,
        externalApplicationId: source.externalApplicationId,
        receivedAt: source.receivedAt?.toISOString(),
      })),
      createdAt: application.createdAt?.toISOString(),
      updatedAt: application.updatedAt?.toISOString(),
    };
  }

  private toCandidateSummary(application: ApplicationEntity) {
    const candidate = application.candidate;
    return candidate
      ? {
        candidateId: candidate.id,
        fullName: candidate.name,
        email: candidate.email ?? null,
        phone: candidate.phone ?? null,
      }
      : null;
  }

  private toJobPostingSummary(application: ApplicationEntity) {
    const posting = application.jobPosting;
    return posting
      ? {
        jobPostingId: posting.id,
        title: posting.title,
        jobDescriptionVersionId: application.jobDescriptionVersionId,
      }
      : {
        jobPostingId: application.jobPostingId,
        title: null,
        jobDescriptionVersionId: application.jobDescriptionVersionId,
      };
  }

  private latestByCreatedAt<T extends { createdAt?: Date }>(items?: T[] | null) {
    if (!items?.length) return null;
    return [...items].sort((a, b) => {
      const aTime = a.createdAt?.getTime() ?? 0;
      const bTime = b.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    })[0];
  }

  private toNumber(value?: string | null) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableNumber(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private sanitizeParsedData(value?: Record<string, unknown> | null) {
    if (!value) return {};
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (this.isSensitiveParsedDataKey(key)) continue;
      sanitized[key] = this.redactMetadata(item, key);
    }
    return sanitized;
  }

  private isSensitiveParsedDataKey(key: string) {
    const normalized = this.normalizeSensitiveKey(key);
    return [
      'rawtext',
      'normalizedtext',
      'rawcontent',
      'content',
      'filepath',
      'storagepath',
      'path',
      'stack',
      'scannerlog',
      'command',
      'prompt',
      'token',
      'secret',
    ].some((pattern) => normalized.includes(pattern));
  }

  private previewText(value: unknown) {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
  }

  private auditReason(metadata?: Record<string, unknown> | null) {
    if (!metadata) return null;
    for (const key of ['reason', 'reasonCode', 'errorCode']) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private redactMetadata(value: unknown, key = ''): unknown {
    if (this.isSensitiveMetadataKey(key)) return '[REDACTED]';

    if (Array.isArray(value)) {
      return value.map((item) => this.redactMetadata(item));
    }

    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, item]) => [
          entryKey,
          this.redactMetadata(item, entryKey),
        ]),
      );
    }

    if (typeof value === 'string' && this.looksLikePrivatePathOrCommand(value)) {
      return '[REDACTED]';
    }

    return value;
  }

  private isSensitiveMetadataKey(key: string) {
    const normalized = this.normalizeSensitiveKey(key);
    return [
      'path',
      'storagepath',
      'filepath',
      'rawcontent',
      'rawtext',
      'token',
      'secret',
      'stack',
      'scannerlog',
      'command',
      'prompt',
    ].some((pattern) => normalized.includes(pattern));
  }

  private looksLikePrivatePathOrCommand(value: string) {
    return /[a-z]:\\/i.test(value)
      || value.includes('/storage/')
      || value.includes('\\storage\\')
      || value.includes('/uploads/')
      || value.includes('\\uploads\\')
      || value.includes('ghostscript')
      || value.includes('docker ')
      || value.includes('podman ');
  }

  private normalizeSensitiveKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private meta() {
    return {
      timestamp: new Date().toISOString(),
    };
  }
}
