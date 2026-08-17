import { UserRole } from '@interview-assistant/shared';
import {
  Controller,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RecruitmentChannel } from '../../recruitment-common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ApiErrorResponses } from '../../common/swagger/api-envelope.schema';
import { ChannelPublishingService } from './channel-publishing.service';

@ApiTags('Channel Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/job-postings')
@ApiErrorResponses([400, 401, 403, 500])
export class ChannelPublishingController {
  constructor(private readonly channelPublishingService: ChannelPublishingService) {}

  @Post(':jobPostingId/channels/:channel/prepare')
  @ApiOperation({ summary: 'Prepare a channel form from an internal job posting' })
  @ApiResponse({ status: 201, description: 'Channel form prepared for extension completion.' })
  async prepare(
    @Param('jobPostingId', ParseUUIDPipe) jobPostingId: string,
    @Param('channel', new ParseEnumPipe(RecruitmentChannel)) channel: RecruitmentChannel,
    @Request() req: { user: { id: string } },
  ) {
    const data = await this.channelPublishingService.prepare(channel, jobPostingId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), actorUserId: req.user.id },
    };
  }
}
