import { UserRole } from '@interview-assistant/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { FacebookReviewStatus } from '../facebook-publishing/facebook-publishing.types';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import { ExtensionInstancesService } from './extension-instances.service';
import {
  CreateFacebookGroupDto,
  FacebookPublishHistoryStatusCheckDto,
  DiscoverFacebookGroupsDto,
  GenerateFacebookPreviewContentDto,
  ManualIncludeFacebookGroupDto,
  ReportFacebookPublishResultDto,
  ReserveFacebookPublishTargetDto,
  ResolveFacebookAccountDto,
  UpdateFacebookGroupDto,
  VerifyFacebookGroupDto,
} from './dto';

interface ExtensionFacebookRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

type HeaderValue = string | string[] | undefined;

@ApiTags('Extension Facebook Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/facebook')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionFacebookController {
  constructor(
    private readonly facebookPublishingService: FacebookPublishingService,
    private readonly extensionInstancesService: ExtensionInstancesService,
  ) {}

  @Post('accounts/resolve')
  @ApiOperation({ summary: 'Resolve the stable Facebook account for the current browser session' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: ResolveFacebookAccountDto })
  @ApiResponse({ status: 201, description: 'Facebook account resolved.' })
  async resolveFacebookAccount(
    @Body() dto: ResolveFacebookAccountDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const account = await this.facebookPublishingService.resolveFacebookAccount({
      ownerUserId: req.user.id,
      facebookExternalId: dto.facebookExternalId,
      displayName: dto.displayName,
      profileUrl: dto.profileUrl,
      avatarUrl: dto.avatarUrl,
    });

    return { success: true, data: account, meta: { timestamp: new Date().toISOString() } };
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List Facebook accounts previously resolved for the current HR user' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiResponse({ status: 200, description: 'Facebook accounts returned.' })
  async listFacebookAccounts(
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const accounts = await this.facebookPublishingService.listFacebookAccounts(req.user.id);
    return { success: true, data: accounts, meta: { timestamp: new Date().toISOString() } };
  }

  @Get('groups')
  @ApiOperation({ summary: 'List active Facebook groups allowed for the current extension account' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiResponse({ status: 200, description: 'Active Facebook groups returned.' })
  async listGroups(
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
    @Query('facebookAccountId') facebookAccountId?: string,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const groups = await this.facebookPublishingService.listActiveExtensionGroups(
      req.user.id,
      extensionInstance?.id ?? null,
      facebookAccountId?.trim() || null,
    );

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
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: CreateFacebookGroupDto })
  @ApiResponse({ status: 201, description: 'Facebook group saved.' })
  async createGroup(
    @Body() dto: CreateFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const group = await this.facebookPublishingService.createExtensionGroup({
      ownerUserId: req.user.id,
      targetName: dto.targetName,
      targetUrl: dto.targetUrl,
      targetExternalId: dto.targetExternalId ?? null,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId ?? null,
    });

    return {
      success: true,
      data: group,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('groups/manual-include')
  @ApiOperation({ summary: 'Manually include a Facebook group excluded by the recruitment filter' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: ManualIncludeFacebookGroupDto })
  @ApiResponse({ status: 201, description: 'Facebook group manually included.' })
  async manuallyIncludeGroup(
    @Body() dto: ManualIncludeFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const group = await this.facebookPublishingService.manuallyIncludeExtensionGroup({
      ownerUserId: req.user.id,
      targetName: dto.targetName,
      targetUrl: dto.targetUrl,
      targetExternalId: dto.targetExternalId ?? null,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId,
    });

    return {
      success: true,
      data: group,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Post('groups/discover')
  @ApiOperation({ summary: 'Discover and sync Facebook groups from browser scan' })
  @ApiBody({ type: DiscoverFacebookGroupsDto })
  @ApiResponse({ status: 200, description: 'Discovered groups synced.' })
  async discoverGroups(
    @Body() dto: DiscoverFacebookGroupsDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const result = await this.facebookPublishingService.discoverAndSyncExtensionGroups({
      ownerUserId: req.user.id,
      groups: dto.groups,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId ?? null,
    });

    return {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('groups/sync-state')
  @ApiOperation({ summary: 'Get the Facebook group scan state for the current extension account' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiResponse({ status: 200, description: 'Facebook group scan state returned.' })
  async getGroupsSyncState(
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
    @Query('facebookAccountId') facebookAccountId?: string,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const state = await this.facebookPublishingService.getExtensionGroupSyncState(
      req.user.id,
      extensionInstance?.id ?? null,
      facebookAccountId?.trim() || null,
    );

    return {
      success: true,
      data: state,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('groups/sync')
  @ApiOperation({ summary: 'Reconcile Facebook groups from a completed hidden browser scan' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: DiscoverFacebookGroupsDto })
  @ApiResponse({ status: 200, description: 'Facebook groups reconciled.' })
  async syncGroups(
    @Body() dto: DiscoverFacebookGroupsDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const result = await this.facebookPublishingService.syncAndReconcileExtensionGroups({
      ownerUserId: req.user.id,
      groups: dto.groups,
      scanComplete: dto.scanComplete === true,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId ?? null,
    });

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
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: UpdateFacebookGroupDto })
  @ApiResponse({ status: 200, description: 'Facebook group updated.' })
  async updateGroup(
    @Param('targetId') targetId: string,
    @Body() dto: UpdateFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const group = await this.facebookPublishingService.updateExtensionGroup({
      ownerUserId: req.user.id,
      targetId,
      targetName: dto.targetName,
      targetUrl: dto.targetUrl,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId ?? null,
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
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: VerifyFacebookGroupDto })
  @ApiResponse({ status: 200, description: 'Facebook group verification status updated.' })
  async updateGroupVerification(
    @Param('targetId') targetId: string,
    @Body() dto: VerifyFacebookGroupDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const group = await this.facebookPublishingService.updateExtensionGroupVerification({
      ownerUserId: req.user.id,
      targetId: this.requireGroupTargetIdOrNotFound(targetId),
      eligibilityStatus: dto.eligibilityStatus,
      eligibilityReason: dto.eligibilityReason,
      verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : null,
      lastVerifiedByInstanceId: extensionInstance?.id ?? null,
      ownerExtensionInstanceId: extensionInstance?.id ?? null,
      facebookAccountId: dto.facebookAccountId ?? null,
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
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiResponse({ status: 200, description: 'Facebook group removed.' })
  async deleteGroup(
    @Param('targetId') targetId: string,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
    @Query('facebookAccountId') facebookAccountId?: string,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    let group;
    try {
      group = await this.facebookPublishingService.deleteExtensionGroup(
        req.user.id,
        this.requireDeleteTargetId(targetId),
        extensionInstance?.id ?? null,
        facebookAccountId?.trim() || null,
      );
    } catch (error) {
      this.rethrowMissingFacebookGroupAsNotFound(error);
    }

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
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiQuery({ name: 'status', required: false, enum: FacebookReviewStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Facebook publish histories returned.' })
  async listGroupPublishHistories(
    @Param('targetId') targetId: string,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const facebookReviewStatus = this.normalizeReviewStatusQuery(status);
    const normalizedPage = this.requirePositiveIntegerQuery(page);
    const normalizedLimit = this.normalizeLimitQuery(limit);
    const normalizedTargetId = this.requireGroupTargetIdOrNotFound(targetId);

    await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    let result;
    try {
      result = await this.facebookPublishingService.listExtensionGroupPublishHistories({
        ownerUserId: req.user.id,
        targetId: normalizedTargetId,
        facebookReviewStatus,
        page: normalizedPage,
        limit: normalizedLimit,
      });
    } catch (error) {
      this.rethrowMissingFacebookGroupAsNotFound(error);
    }

    return {
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('generate-preview-content')
  @ApiOperation({ summary: 'Generate a Facebook post preview from an extension job snapshot' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: GenerateFacebookPreviewContentDto })
  @ApiResponse({ status: 200, description: 'Facebook preview content generated.' })
  async generatePreviewContent(
    @Body() dto: GenerateFacebookPreviewContentDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const result = await this.facebookPublishingService.generateExtensionPreviewContent({
      snapshot: dto.snapshot,
      mode: dto.mode,
    });

    return {
      success: true,
      data: {
        content: result.content,
        mode: result.mode,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('publish-results')
  @ApiOperation({ summary: 'Report a browser-extension Facebook publish result' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: ReportFacebookPublishResultDto })
  @ApiResponse({ status: 201, description: 'Facebook publish result recorded.' })
  async reportPublishResult(
    @Body() dto: ReportFacebookPublishResultDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const history = await this.facebookPublishingService.reportExtensionPublishResult({
      ...dto,
      ownerUserId: req.user.id,
      submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : null,
      extensionInstanceId: extensionInstance?.id ?? null,
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
        extensionInstanceId: history.extensionInstanceId,
        submittedAt: history.submittedAt?.toISOString() ?? null,
        createdAt: history.createdAt?.toISOString() ?? null,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post('publish-reservations')
  @ApiOperation({ summary: 'Reserve one Facebook group daily quota slot before publishing' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: ReserveFacebookPublishTargetDto })
  @ApiResponse({ status: 201, description: 'Facebook publish quota reserved.' })
  async reservePublishTarget(
    @Body() dto: ReserveFacebookPublishTargetDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const reservation = await this.facebookPublishingService.reserveExtensionPublishTarget({
      ...dto,
      ownerUserId: req.user.id,
      extensionInstanceId: extensionInstance?.id ?? null,
    });

    return {
      success: true,
      data: { reservationId: reservation.reservationId },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Post('publish-histories/:historyId/status-check')
  @ApiOperation({ summary: 'Update a Facebook publish history moderation status after extension refresh' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: false })
  @ApiBody({ type: FacebookPublishHistoryStatusCheckDto })
  @ApiResponse({ status: 200, description: 'Facebook publish history status updated.' })
  async updatePublishHistoryStatusCheck(
    @Param('historyId') historyId: string,
    @Body() dto: FacebookPublishHistoryStatusCheckDto,
    @Request() req: ExtensionFacebookRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const normalizedHistoryId = this.requirePublishHistoryIdOrNotFound(historyId);
    const extensionInstance = await this.resolveOptionalExtensionInstance(req, extensionInstanceId);
    const history = await this.facebookPublishingService.updateExtensionPublishHistoryStatusCheck({
      ownerUserId: req.user.id,
      historyId: normalizedHistoryId,
      facebookReviewStatus: dto.facebookReviewStatus,
      message: dto.message,
      externalPostUrl: dto.externalPostUrl,
      externalPostId: dto.externalPostId,
      checkedAt: dto.checkedAt ? new Date(dto.checkedAt) : null,
      extensionInstanceId: extensionInstance?.id ?? null,
    });

    return {
      success: true,
      data: history,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  private normalizeReviewStatusQuery(status: string | undefined) {
    if (status === undefined) return null;

    if (!Object.values(FacebookReviewStatus).includes(status as FacebookReviewStatus)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    return status as FacebookReviewStatus;
  }

  private requirePositiveIntegerQuery(value: string | undefined) {
    if (value === undefined || !/^\d+$/.test(value)) {
      if (value === undefined) return undefined;
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    const parsedValue = Number(value);
    if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    return parsedValue;
  }

  private normalizeLimitQuery(value: string | undefined) {
    if (value !== undefined && value.trim() === '') return undefined;

    const normalizedLimit = this.requirePositiveIntegerQuery(value);
    if (normalizedLimit !== undefined && normalizedLimit > 50) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    return normalizedLimit;
  }

  private requireDeleteTargetId(targetId: string) {
    if (!isUUID(targetId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    return targetId;
  }

  private requireGroupTargetIdOrNotFound(targetId: string) {
    const normalizedTargetId = targetId?.trim();
    if (!normalizedTargetId || ['null', 'undefined', '""'].includes(normalizedTargetId)) {
      throw new HttpException(
        {
          code: 'NOT_FOUND',
          message: 'Requested resource was not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!isUUID(normalizedTargetId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }

    return normalizedTargetId;
  }

  private requirePublishHistoryIdOrNotFound(historyId: string) {
    const normalizedHistoryId = historyId?.trim();
    if (!normalizedHistoryId || ['null', 'undefined', '""'].includes(normalizedHistoryId) || !isUUID(normalizedHistoryId)) {
      throw new HttpException(
        {
          code: 'NOT_FOUND',
          message: 'Requested resource was not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return normalizedHistoryId;
  }

  private rethrowMissingFacebookGroupAsNotFound(error: unknown): never {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (this.isRecord(response) && response.code === 'FACEBOOK_GROUP_NOT_FOUND') {
        throw new HttpException(
          {
            code: 'FACEBOOK_GROUP_NOT_FOUND',
            message: 'Facebook group not found for this account.',
          },
          HttpStatus.NOT_FOUND,
        );
      }
    }

    throw error;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async resolveOptionalExtensionInstance(
    req: ExtensionFacebookRequest,
    extensionInstanceId: HeaderValue,
  ) {
    const instance = await this.extensionInstancesService.resolveOptionalForUser({
      ownerUserId: req.user.id,
      extensionInstanceId: this.optionalHeader(extensionInstanceId),
    });
    if (instance) {
      await this.extensionInstancesService.touch(instance);
    }
    return instance;
  }

  private optionalHeader(value: HeaderValue) {
    const headerValue = Array.isArray(value) ? value[0] : value;
    const normalizedValue = headerValue?.trim();
    return normalizedValue || undefined;
  }
}
