import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Headers, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses, apiErrorEnvelopeSchema } from '../common/swagger/api-envelope.schema';
import { SyncAmisJobPostingDto } from './dto';
import { ExtensionIntegrationService } from './extension-integration.service';

type HeaderValue = string | string[] | undefined;

interface ExtensionAuthenticatedRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

@ApiTags('Extension Integration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/amis/job-postings')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionIntegrationController {
  constructor(private readonly extensionIntegrationService: ExtensionIntegrationService) {}

  @Post('sync-and-publish')
  @ApiOperation({ summary: 'Sync and publish an AMIS job posting from the browser extension' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Required request idempotency key. This header is authoritative over any body mirror.',
  })
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
  @ApiBody({ type: SyncAmisJobPostingDto })
  @ApiResponse({
    status: 501,
    description: 'EXTENSION_INTEGRATION_NOT_IMPLEMENTED error envelope',
    schema: apiErrorEnvelopeSchema(
      'EXTENSION_INTEGRATION_NOT_IMPLEMENTED',
      'Extension integration sync-and-publish business flow is not implemented yet.',
    ),
  })
  async syncAndPublish(
    @Body() dto: SyncAmisJobPostingDto,
    @Request() req: ExtensionAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: HeaderValue,
    @Headers('x-request-id') requestId: HeaderValue,
    @Headers('x-extension-version') extensionVersion: HeaderValue,
  ) {
    return this.extensionIntegrationService.syncAndPublishFromAmis(dto, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      idempotencyKey: this.requireIdempotencyKey(idempotencyKey),
      requestId: this.optionalHeader(requestId),
      extensionVersion: this.optionalHeader(extensionVersion),
    });
  }

  private requireIdempotencyKey(value: HeaderValue) {
    const normalizedValue = this.optionalHeader(value);
    if (!normalizedValue) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required.',
      });
    }

    return normalizedValue;
  }

  private optionalHeader(value: HeaderValue) {
    const headerValue = Array.isArray(value) ? value[0] : value;
    const normalizedValue = headerValue?.trim();
    return normalizedValue || undefined;
  }
}
