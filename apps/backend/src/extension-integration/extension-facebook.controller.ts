import { UserRole } from '@interview-assistant/shared';
import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import { CreateFacebookGroupDto, ReportFacebookPublishResultDto, UpdateFacebookGroupDto } from './dto';

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
        errorReason: history.errorReason,
        externalPostId: history.externalPostId,
        submittedAt: history.submittedAt?.toISOString() ?? null,
        createdAt: history.createdAt?.toISOString() ?? null,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
