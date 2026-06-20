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
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import { ApplicationEntity } from './entities/application.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationTimelineQueryDto } from './dto/application-timeline-query.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('applications')
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

  private meta() {
    return {
      timestamp: new Date().toISOString(),
    };
  }
}
