import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import {
  ExtensionSyncResponseDto,
  AmisCareerCatalogItemDto,
  CreateAmisCareerQuestionDto,
  SyncAmisCareersDto,
  SyncAmisCareersResponseDto,
  SyncAmisJobPostingDto,
  UpdateAmisCareerQuestionCategoriesDto,
} from './dto';
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
@Controller('extension/amis')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionIntegrationController {
  constructor(private readonly extensionIntegrationService: ExtensionIntegrationService) {}

  @Post('job-postings/sync-and-publish')
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
    status: 201,
    description: 'AMIS job posting sync-and-publish result.',
    type: ExtensionSyncResponseDto,
  })
  async syncAndPublish(
    @Body() dto: SyncAmisJobPostingDto,
    @Request() req: ExtensionAuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: HeaderValue,
    @Headers('x-request-id') requestId: HeaderValue,
    @Headers('x-extension-version') extensionVersion: HeaderValue,
  ) {
    const idempotencyKeyValue = this.requireIdempotencyKey(idempotencyKey);
    const data = await this.extensionIntegrationService.syncAndPublishFromAmis(dto, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      idempotencyKey: idempotencyKeyValue,
      requestId: this.optionalHeader(requestId),
      extensionVersion: this.optionalHeader(extensionVersion),
    });

    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: this.optionalHeader(requestId) ?? null,
        idempotencyKey: idempotencyKeyValue,
        extensionVersion: this.optionalHeader(extensionVersion) ?? null,
      },
    };
  }

  @Post('careers/sync')
  @ApiOperation({ summary: 'Sync AMIS career catalog rows captured by the browser extension' })
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
  @ApiBody({ type: SyncAmisCareersDto })
  @ApiResponse({
    status: 201,
    description: 'AMIS career catalog sync result.',
    type: SyncAmisCareersResponseDto,
  })
  async syncCareers(
    @Body() dto: SyncAmisCareersDto,
    @Request() req: ExtensionAuthenticatedRequest,
    @Headers('x-request-id') requestId: HeaderValue,
    @Headers('x-extension-version') extensionVersion: HeaderValue,
  ) {
    const data = await this.extensionIntegrationService.syncAmisCareers(dto, {
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

  @Get('careers')
  @Roles(UserRole.ADMIN, UserRole.HR, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'List active AMIS careers synced into the app catalog' })
  @ApiResponse({
    status: 200,
    description: 'Active AMIS careers available for interview session question selection.',
    type: [AmisCareerCatalogItemDto],
  })
  async listCareers() {
    return this.extensionIntegrationService.listAmisCareers();
  }

  @Patch('careers/:amisCareerId/question-categories')
  @ApiOperation({ summary: 'Customize question categories used for an AMIS career' })
  @ApiBody({ type: UpdateAmisCareerQuestionCategoriesDto })
  @ApiResponse({
    status: 200,
    description: 'Updated AMIS career question category mapping.',
    type: AmisCareerCatalogItemDto,
  })
  async updateCareerQuestionCategories(
    @Param('amisCareerId') amisCareerId: string,
    @Body() dto: UpdateAmisCareerQuestionCategoriesDto,
  ) {
    return this.extensionIntegrationService.updateAmisCareerQuestionCategories(amisCareerId, dto);
  }

  @Get('careers/:amisCareerId/questions')
  @ApiOperation({ summary: 'List mapped questions for an AMIS career' })
  async getCareerQuestionContext(@Param('amisCareerId') amisCareerId: string) {
    return this.extensionIntegrationService.getAmisCareerQuestionContext(amisCareerId);
  }

  @Post('careers/:amisCareerId/questions')
  @ApiOperation({ summary: 'Create a question under a category mapped to an AMIS career' })
  @ApiBody({ type: CreateAmisCareerQuestionDto })
  async createCareerQuestion(
    @Param('amisCareerId') amisCareerId: string,
    @Body() dto: CreateAmisCareerQuestionDto,
  ) {
    return this.extensionIntegrationService.createAmisCareerQuestion(amisCareerId, dto);
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
