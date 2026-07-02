import { UserRole } from '@interview-assistant/shared';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import { ReportFacebookPublishResultDto } from './dto';

@ApiTags('Extension Facebook Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/facebook')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionFacebookController {
  constructor(private readonly facebookPublishingService: FacebookPublishingService) {}

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
