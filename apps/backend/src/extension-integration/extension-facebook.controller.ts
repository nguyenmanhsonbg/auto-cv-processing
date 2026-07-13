import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { FacebookReviewStatus } from '../facebook-publishing/facebook-publishing.types';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import {
  CreateFacebookGroupDto,
  FacebookPublishHistoryStatusCheckDto,
  GenerateFacebookPreviewDto,
  ReportFacebookPublishResultDto,
  UpdateFacebookGroupDto,
  VerifyFacebookGroupDto,
  DiscoverFacebookGroupsDto,
} from './dto';

interface ExtensionFacebookRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

@ApiTags('Extension Facebook Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/facebook')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionFacebookController {
  constructor(private readonly facebookPublishingService: FacebookPublishingService) {}

  @Post('generate-preview-content')
  @ApiOperation({ summary: 'Generate Facebook content preview based on job posting or snapshot' })
  @ApiBody({ type: GenerateFacebookPreviewDto })
  @ApiResponse({ status: 200, description: 'Generated content returned.' })
  async generatePreviewContent(
    @Body() dto: GenerateFacebookPreviewDto,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const mode = dto.mode || 'TEMPLATE';
    const content = await this.facebookPublishingService.generatePreviewContent(mode, {
      jobPostingId: dto.jobPostingId,
      snapshot: dto.snapshot,
    });

    return {
      success: true,
      data: {
        content,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('groups')
  @ApiOperation({ summary: 'List active Facebook groups allowed for the current extension account' })
  @ApiResponse({ status: 200, description: 'Active Facebook groups returned.' })
  async listGroups(@Request() req: ExtensionFacebookRequest) {
    const groups = await this.facebookPublishingService.listActiveExtensionGroups(req.user.id);

    return {
      success: true,
      data: groups,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('groups')
  @ApiOperation({ summary: 'Add a Facebook group allowed for the current extension account' })
  @ApiBody({ type: CreateFacebookGroupDto })
  @ApiResponse({ status: 201, description: 'Facebook group saved.' })
  async createGroup(@Body() dto: CreateFacebookGroupDto, @Request() req: ExtensionFacebookRequest) {
    const group = await this.facebookPublishingService.createExtensionGroup({
      ownerUserId: req.user.id,
      targetName: dto.targetName,
      targetUrl: dto.targetUrl,
    });

    return {
      success: true,
      data: group,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('groups/discover')
  @ApiOperation({ summary: 'Discover and sync user Facebook groups, auto-classifying IT groups' })
  @ApiBody({ type: DiscoverFacebookGroupsDto })
  @ApiResponse({ status: 200, description: 'Groups synced successfully.' })
  async discoverGroups(
    @Body() dto: DiscoverFacebookGroupsDto,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const result = await this.facebookPublishingService.discoverExtensionGroups(
      req.user.id,
      dto.groups,
    );

    return {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Put('groups/:targetId')
  @ApiOperation({ summary: 'Update a Facebook group allowed for the current extension account' })
  @ApiBody({ type: UpdateFacebookGroupDto })
  @ApiResponse({ status: 200, description: 'Facebook group updated.' })
  async updateGroup(
    @Param('targetId') targetId: string,
    @Body() dto: UpdateFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const group = await this.facebookPublishingService.updateExtensionGroup({
      ownerUserId: req.user.id,
      targetId,
      targetName: dto.targetName,
      targetUrl: dto.targetUrl,
    });

    return {
      success: true,
      data: group,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('groups/:targetId/verify-result')
  @ApiOperation({ summary: 'Update the Facebook group posting eligibility checked by the extension browser session' })
  @ApiBody({ type: VerifyFacebookGroupDto })
  @ApiResponse({ status: 200, description: 'Facebook group verification status updated.' })
  async updateGroupVerification(
    @Param('targetId') targetId: string,
    @Body() dto: VerifyFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const group = await this.facebookPublishingService.updateExtensionGroupVerification({
      ownerUserId: req.user.id,
      targetId,
      eligibilityStatus: dto.eligibilityStatus,
      eligibilityReason: dto.eligibilityReason,
      verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : null,
    });

    return {
      success: true,
      data: group,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Delete('groups/:targetId')
  @ApiOperation({ summary: 'Remove a Facebook group allowed for the current extension account' })
  @ApiResponse({ status: 200, description: 'Facebook group removed.' })
  async deleteGroup(@Param('targetId') targetId: string, @Request() req: ExtensionFacebookRequest) {
    const group = await this.facebookPublishingService.deleteExtensionGroup(req.user.id, targetId);

    return {
      success: true,
      data: group,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('groups/:targetId/publish-histories')
  @ApiOperation({ summary: 'List Facebook publish histories for a configured group' })
  @ApiQuery({ name: 'status', required: false, enum: FacebookReviewStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Facebook publish histories returned.' })
  async listGroupPublishHistories(
    @Param('targetId') targetId: string,
    @Query('status') status: FacebookReviewStatus | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const result = await this.facebookPublishingService.listExtensionGroupPublishHistories({
      ownerUserId: req.user.id,
      targetId,
      facebookReviewStatus: this.normalizeReviewStatusQuery(status),
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('publish-results')
  @ApiOperation({ summary: 'Report a browser-extension Facebook publish result' })
  @ApiBody({ type: ReportFacebookPublishResultDto })
  @ApiResponse({ status: 201, description: 'Facebook publish result recorded.' })
  async reportPublishResult(@Body() dto: ReportFacebookPublishResultDto) {
    const history = await this.facebookPublishingService.reportExtensionPublishResult({
      ...dto,
      submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : null,
    });

    return {
      success: true,
      data: {
        id: history.id,
        jobPostingId: history.jobPostingId,
        targetId: history.targetId,
        targetType: history.targetType,
        targetName: history.targetName,
        targetUrl: history.targetUrl,
        status: history.status,
        facebookReviewStatus: history.facebookReviewStatus,
        message: history.message,
        errorReason: history.errorReason,
        externalPostId: history.externalPostId,
        externalPostUrl: history.externalPostUrl,
        submittedAt: history.submittedAt?.toISOString() ?? null,
        createdAt: history.createdAt?.toISOString() ?? null,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('publish-histories/:historyId/status-check')
  @ApiOperation({ summary: 'Update a Facebook publish history moderation status after extension refresh' })
  @ApiBody({ type: FacebookPublishHistoryStatusCheckDto })
  @ApiResponse({ status: 200, description: 'Facebook publish history status updated.' })
  async updatePublishHistoryStatusCheck(
    @Param('historyId') historyId: string,
    @Body() dto: FacebookPublishHistoryStatusCheckDto,
    @Request() req: ExtensionFacebookRequest,
  ) {
    const history = await this.facebookPublishingService.updateExtensionPublishHistoryStatusCheck({
      ownerUserId: req.user.id,
      historyId,
      facebookReviewStatus: dto.facebookReviewStatus,
      message: dto.message,
      externalPostUrl: dto.externalPostUrl,
      externalPostId: dto.externalPostId,
      checkedAt: dto.checkedAt ? new Date(dto.checkedAt) : null,
    });

    return {
      success: true,
      data: history,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  private normalizeReviewStatusQuery(status: FacebookReviewStatus | undefined) {
    if (!status) return null;
    return Object.values(FacebookReviewStatus).includes(status) ? status : null;
  }
}
