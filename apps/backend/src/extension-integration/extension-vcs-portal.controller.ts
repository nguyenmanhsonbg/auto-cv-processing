import { UserRole } from '@interview-assistant/shared';
import { Controller, Headers, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { SyncVcsPortalJdsResponseDto } from './dto';
import { VcsPortalJdSyncService } from './vcs-portal-jd-sync.service';

type HeaderValue = string | string[] | undefined;

interface ExtensionAuthenticatedRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

@ApiTags('Extension VCS Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/vcs-portal')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionVcsPortalController {
  constructor(private readonly vcsPortalJdSyncService: VcsPortalJdSyncService) {}

  @Post('jds/sync')
  @ApiOperation({ summary: 'Full sync VCS Portal job descriptions and questions' })
  @ApiHeader({
    name: 'X-Request-Id',
    required: false,
    description: 'Optional upstream request correlation id from the extension.',
  })
  @ApiHeader({
    name: 'X-Extension-Version',
    required: false,
    description: 'Optional browser extension version.',
  })
  @ApiResponse({
    status: 201,
    description: 'VCS Portal JD sync summary. Extension should refresh the JD list after this.',
    type: SyncVcsPortalJdsResponseDto,
  })
  async syncJobDescriptions(
    @Request() req: ExtensionAuthenticatedRequest,
    @Headers('x-request-id') requestId: HeaderValue,
    @Headers('x-extension-version') extensionVersion: HeaderValue,
  ) {
    const data = await this.vcsPortalJdSyncService.syncAllFromPortal({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      requestId: this.optionalHeader(requestId),
      extensionVersion: this.optionalHeader(extensionVersion),
    });

    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: this.optionalHeader(requestId) ?? null,
        extensionVersion: this.optionalHeader(extensionVersion) ?? null,
      },
    };
  }

  private optionalHeader(value: HeaderValue) {
    const headerValue = Array.isArray(value) ? value[0] : value;
    const normalizedValue = headerValue?.trim();
    return normalizedValue || undefined;
  }
}
