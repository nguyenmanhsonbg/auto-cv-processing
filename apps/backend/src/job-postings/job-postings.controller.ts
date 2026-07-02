import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { ChannelPostingStatus, JobPostingStatus, RecruitmentChannel } from '../recruitment-common';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import { type ExtensionFacebookPublishPlan } from '../facebook-publishing/facebook-publishing.types';
import {
  CloseJobPostingDto,
  CreateJobPostingDto,
  ListJobPostingsQueryDto,
  PublishJobPostingDto,
  UpdateJobPostingDto,
} from './dto/job-posting.dto';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsService } from './job-postings.service';

@ApiTags('Job Postings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('job-postings')
@ApiErrorResponses([400, 401, 403, 404, 409, 500])
export class JobPostingsController {
  constructor(
    private readonly jobPostingsService: JobPostingsService,
    private readonly facebookPublishingService: FacebookPublishingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List internal job postings' })
  async findAll(@Query() query: ListJobPostingsQueryDto) {
    const unsupportedStatus = this.isUnsupportedFeStatus(query.status);
    if (unsupportedStatus) {
      return {
        success: true,
        data: [],
        pagination: {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          total: 0,
          totalPages: 0,
        },
        meta: this.meta(),
      };
    }

    const result = await this.jobPostingsService.findPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: this.normalizeStatus(query.status),
      jobDescriptionId: query.jobDescriptionId,
      jobDescriptionVersionId: query.jobDescriptionVersionId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      success: true,
      data: result.data.map((posting) => this.toJobPostingResponse(posting)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: this.meta(),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft job posting' })
  async create(
    @Body() dto: CreateJobPostingDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const posting = await this.jobPostingsService.create({
      jobDescriptionVersionId: dto.jobDescriptionVersionId,
      title: dto.title,
      publicSlug: dto.publicSlug,
      openAt: dto.openAt ?? null,
      closeAt: dto.closeAt ?? null,
      createdById: req?.user?.id,
    });

    return {
      success: true,
      data: this.toJobPostingResponse(await this.jobPostingsService.findOne(posting.id)),
      meta: this.meta(idempotencyKey),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get internal job posting detail' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const posting = await this.jobPostingsService.findOne(id);
    return {
      success: true,
      data: this.toJobPostingResponse(posting),
      meta: this.meta(),
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a job posting' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobPostingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const posting = await this.jobPostingsService.update(id, {
      title: dto.title,
      publicSlug: dto.publicSlug,
      openAt: dto.openAt,
      closeAt: dto.closeAt,
    });

    return {
      success: true,
      data: this.toJobPostingResponse(await this.jobPostingsService.findOne(posting.id)),
      meta: this.meta(idempotencyKey),
    };
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a job posting to the public VCS portal or mark manual channel work' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishJobPostingDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const channels = dto.publishChannels?.length
      ? dto.publishChannels
      : [RecruitmentChannel.VCS_PORTAL];
    const canPublishPublicPortal = channels.includes(RecruitmentChannel.VCS_PORTAL);
    const canPublishFacebook = channels.includes(RecruitmentChannel.FACEBOOK);
    const facebookPublishPlan = canPublishFacebook
      ? await this.prepareFacebookPublishPlan(id, req?.user?.id, dto.facebookTargetIds)
      : undefined;
    const posting = canPublishPublicPortal
      ? await this.jobPostingsService.markPublished(id)
      : canPublishFacebook
        ? await this.jobPostingsService.markPublishing(id)
      : await this.jobPostingsService.markManualRequired(id);
    const latestPosting = await this.jobPostingsService.findOne(posting.id);

    return {
      success: true,
      data: {
        ...this.toJobPostingResponse(latestPosting),
        channels: this.toChannelStatuses(latestPosting, channels, facebookPublishPlan),
        ...(facebookPublishPlan ? { facebookPublishPlan } : {}),
      },
      meta: this.meta(idempotencyKey),
    };
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a job posting' })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseJobPostingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const posting = await this.jobPostingsService.close(id, dto.closeAt ?? new Date());
    return {
      success: true,
      data: this.toJobPostingResponse(await this.jobPostingsService.findOne(posting.id)),
      meta: this.meta(idempotencyKey),
    };
  }

  @Get(':id/channels')
  @ApiOperation({ summary: 'Get safe channel publish status placeholders' })
  async channels(@Param('id', ParseUUIDPipe) id: string) {
    const posting = await this.jobPostingsService.findOne(id);
    return {
      success: true,
      data: this.toChannelStatuses(posting),
      meta: this.meta(),
    };
  }

  private normalizeStatus(status?: string): JobPostingStatus | undefined {
    if (!status || status === 'all' || this.isUnsupportedFeStatus(status)) return undefined;
    const normalized = status.toUpperCase();

    if (Object.values(JobPostingStatus).includes(normalized as JobPostingStatus)) {
      return normalized as JobPostingStatus;
    }

    return undefined;
  }

  private isUnsupportedFeStatus(status?: string) {
    return status?.toUpperCase() === 'ARCHIVED';
  }

  private toJobPostingResponse(posting: JobPostingEntity) {
    return {
      id: posting.id,
      jobPostingId: posting.id,
      jobDescriptionId: posting.jobDescriptionId,
      jobDescription: posting.jobDescription
        ? {
          id: posting.jobDescription.id,
          jobDescriptionId: posting.jobDescription.id,
          title: posting.jobDescription.title,
          status: posting.jobDescription.status,
        }
        : null,
      jobDescriptionVersionId: posting.jobDescriptionVersionId,
      jobDescriptionVersion: posting.jobDescriptionVersion
        ? {
          id: posting.jobDescriptionVersion.id,
          jobDescriptionVersionId: posting.jobDescriptionVersion.id,
          jobDescriptionId: posting.jobDescriptionVersion.jobDescriptionId,
          versionNo: posting.jobDescriptionVersion.versionNo,
          status: posting.jobDescriptionVersion.status,
          snapshot: posting.jobDescriptionVersion.snapshot,
          jobDescription: posting.jobDescriptionVersion.jobDescription
            ? {
              id: posting.jobDescriptionVersion.jobDescription.id,
              jobDescriptionId: posting.jobDescriptionVersion.jobDescription.id,
              title: posting.jobDescriptionVersion.jobDescription.title,
              status: posting.jobDescriptionVersion.jobDescription.status,
            }
            : null,
        }
        : null,
      title: posting.title,
      publicSlug: posting.publicSlug,
      status: posting.status,
      openAt: posting.openAt?.toISOString() ?? null,
      closeAt: posting.closeAt?.toISOString() ?? null,
      createdById: posting.createdById,
      createdBy: this.toUserSummary(posting.createdBy),
      createdAt: posting.createdAt?.toISOString(),
      updatedAt: posting.updatedAt?.toISOString(),
    };
  }

  private toChannelStatuses(
    posting: JobPostingEntity,
    requestedChannels: string[] = [RecruitmentChannel.VCS_PORTAL],
    facebookPublishPlan?: ExtensionFacebookPublishPlan,
  ) {
    const normalizedChannels = requestedChannels.length
      ? requestedChannels
      : [RecruitmentChannel.VCS_PORTAL];

    return normalizedChannels.map((channel) => {
      if (channel === RecruitmentChannel.VCS_PORTAL) {
        return {
          channel,
          status: this.toPortalChannelStatus(posting.status),
          publishedUrl: posting.status === JobPostingStatus.PUBLISHED
            ? `/jobs/${posting.publicSlug}`
            : null,
          externalPostingId: null,
          manualInstruction: null,
          publishedAt: posting.status === JobPostingStatus.PUBLISHED
            ? posting.updatedAt?.toISOString()
            : null,
          updatedAt: posting.updatedAt?.toISOString(),
        };
      }

      if (channel === RecruitmentChannel.FACEBOOK) {
        const hasTargets = Boolean(facebookPublishPlan?.targets.length);
        return {
          channel,
          status: hasTargets ? ChannelPostingStatus.PUBLISHING : ChannelPostingStatus.NOT_CONFIGURED,
          publishedUrl: null,
          externalPostingId: null,
          manualInstruction: hasTargets
            ? 'Facebook publish plan is prepared for browser extension execution.'
            : 'No active Facebook publish targets are configured.',
          publishedAt: null,
          updatedAt: posting.updatedAt?.toISOString(),
        };
      }

      return {
        channel,
        status: ChannelPostingStatus.MANUAL_REQUIRED,
        publishedUrl: null,
        externalPostingId: null,
        manualInstruction: 'Manual publishing is required for this channel.',
        publishedAt: null,
        updatedAt: posting.updatedAt?.toISOString(),
      };
    });
  }

  private toPortalChannelStatus(status: JobPostingStatus) {
    if (status === JobPostingStatus.PUBLISHED) return ChannelPostingStatus.PUBLISHED;
    if (status === JobPostingStatus.PUBLISHING) return ChannelPostingStatus.PUBLISHING;
    if (status === JobPostingStatus.PUBLISH_FAILED) return ChannelPostingStatus.PUBLISH_FAILED;
    if (status === JobPostingStatus.CLOSED) return ChannelPostingStatus.CLOSED;
    if (status === JobPostingStatus.MANUAL_REQUIRED) return ChannelPostingStatus.MANUAL_REQUIRED;
    return ChannelPostingStatus.DRAFT;
  }

  private async prepareFacebookPublishPlan(
    jobPostingId: string,
    actorUserId: string | undefined,
    facebookTargetIds: string[] | undefined,
  ) {
    if (!actorUserId) {
      throw new BadRequestException('Actor user is required for Facebook publishing');
    }
    if (!facebookTargetIds?.length) {
      throw new BadRequestException({
        code: 'FACEBOOK_TARGETS_REQUIRED',
        message: 'Select at least one Facebook group before publishing.',
      });
    }

    const posting = await this.jobPostingsService.ensurePublishReady(jobPostingId);
    return this.facebookPublishingService.prepareExtensionPublishPlan(
      posting,
      actorUserId,
      facebookTargetIds,
    );
  }

  private toUserSummary(user?: { id: string; email?: string; name?: string; role?: string } | null) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role ?? null,
    };
  }

  private meta(idempotencyKey?: string) {
    return {
      idempotencyKey: idempotencyKey ?? null,
      timestamp: new Date().toISOString(),
    };
  }
}
