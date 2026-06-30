import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@interview-assistant/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { ImportFacebookSessionDto } from './dto/facebook-publish.dto';
import { FacebookSessionService } from './facebook-session.service';

@ApiTags('Facebook Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('integrations/facebook')
@ApiErrorResponses([400, 401, 403, 409, 500])
export class FacebookPublishingController {
  constructor(private readonly sessionService: FacebookSessionService) {}

  @Get('session/status')
  @ApiOperation({ summary: 'Check whether Facebook RPA storageState is ready' })
  async sessionStatus() {
    return {
      success: true,
      data: await this.sessionService.getStatus(),
      meta: this.meta(),
    };
  }

  @Post('session/login/start')
  @ApiOperation({ summary: 'Open a real browser for Facebook login and RPA session capture' })
  async loginStart() {
    return {
      success: true,
      data: await this.sessionService.startLogin(),
      meta: this.meta(),
    };
  }

  @Post('session/login/complete')
  @ApiOperation({ summary: 'Complete Facebook login by checking saved RPA storageState' })
  async loginComplete() {
    return {
      success: true,
      data: await this.sessionService.completeLogin(),
      meta: this.meta(),
    };
  }

  @Post('session/import')
  @ApiOperation({ summary: 'Import Playwright storageState for Facebook RPA' })
  async importSession(@Body() dto: ImportFacebookSessionDto) {
    return {
      success: true,
      data: await this.sessionService.importStorageState(dto.sessionOwnerKey, dto.storageState),
      meta: this.meta(),
    };
  }

  private meta() {
    return {
      timestamp: new Date().toISOString(),
    };
  }
}
