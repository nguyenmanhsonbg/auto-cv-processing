import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { JobDescriptionStatus } from '../recruitment-common';
import {
  CreateJobDescriptionDto,
  CreateJobDescriptionVersionDto,
  ListJobDescriptionsQueryDto,
  UpdateJobDescriptionDto,
} from './dto/job-description.dto';
import { JobDescriptionEntity } from './entities/job-description.entity';
import { JobDescriptionVersionEntity } from './entities/job-description-version.entity';
import { JobDescriptionVersionsService } from './job-description-versions.service';
import { JobDescriptionsService } from './job-descriptions.service';

@ApiTags('Job Descriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('job-descriptions')
@ApiErrorResponses([400, 401, 403, 404, 409, 500])
export class JobDescriptionsController {
  constructor(
    private readonly jobDescriptionsService: JobDescriptionsService,
    private readonly jobDescriptionVersionsService: JobDescriptionVersionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List job descriptions' })
  async findAll(@Query() query: ListJobDescriptionsQueryDto) {
    const result = await this.jobDescriptionsService.findPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: this.normalizeStatus(query.status),
      positionId: query.positionId,
      levelId: query.levelId,
      sourceSystem: query.sourceSystem,
      latestSyncedOnly: this.toBoolean(query.latestSyncedOnly),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      success: true,
      data: result.data.map((jobDescription) => this.toJobDescriptionResponse(jobDescription)),
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
  @ApiOperation({ summary: 'Create a draft job description' })
  async create(
    @Body() dto: CreateJobDescriptionDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const jobDescription = await this.jobDescriptionsService.create({
      title: dto.title,
      positionId: dto.positionId ?? null,
      levelId: dto.levelId ?? null,
      description: dto.description,
      overview: dto.overview ?? null,
      responsibilities: dto.responsibilities ?? null,
      summary: dto.summary,
      requirements: this.normalizeText(dto.requirements, 'Requirements', true) as string,
      benefits: this.normalizeStructuredObject(dto.benefits, 'Benefits', false),
      salary: dto.salary ?? null,
      annualLeaveDays: dto.annualLeaveDays ?? null,
      department: dto.department ?? null,
      applicationDeadline: dto.applicationDeadline ?? null,
      createdById: req?.user?.id,
    });

    return {
      success: true,
      data: this.toJobDescriptionResponse(jobDescription),
      meta: this.meta(idempotencyKey),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job description detail' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const jobDescription = await this.jobDescriptionsService.findOne(id);
    return {
      success: true,
      data: this.toJobDescriptionResponse(jobDescription),
      meta: this.meta(),
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a job description' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDescriptionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const jobDescription = await this.jobDescriptionsService.update(id, {
      title: dto.title,
      positionId: dto.positionId,
      levelId: dto.levelId,
      description: dto.description,
      overview: dto.overview,
      responsibilities: dto.responsibilities,
      summary: dto.summary,
      requirements: dto.requirements === undefined
        ? undefined
        : this.normalizeText(dto.requirements, 'Requirements', true) as string,
      benefits: dto.benefits === undefined
        ? undefined
        : this.normalizeStructuredObject(dto.benefits, 'Benefits', false),
      salary: dto.salary,
      annualLeaveDays: dto.annualLeaveDays,
      department: dto.department,
      applicationDeadline: dto.applicationDeadline,
    });

    return {
      success: true,
      data: this.toJobDescriptionResponse(jobDescription),
      meta: this.meta(idempotencyKey),
    };
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List job description versions' })
  async listVersions(@Param('id', ParseUUIDPipe) id: string) {
    const versions = await this.jobDescriptionVersionsService.findByJobDescription(id);
    return {
      success: true,
      data: versions.map((version) => this.toVersionResponse(version)),
      meta: this.meta(),
    };
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Create a job description version snapshot' })
  async createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CreateJobDescriptionVersionDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const version = await this.jobDescriptionVersionsService.createFromCurrentJobDescription({
      jobDescriptionId: id,
      createdById: req?.user?.id,
    });

    return {
      success: true,
      data: this.toVersionResponse(version),
      meta: this.meta(idempotencyKey),
    };
  }

  @Post(':id/mark-ready')
  @ApiOperation({ summary: 'Mark a job description as ready for job postings' })
  async markReady(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const jobDescription = await this.jobDescriptionsService.update(id, {
      status: JobDescriptionStatus.ACTIVE,
    });

    return {
      success: true,
      data: this.toJobDescriptionResponse(jobDescription),
      meta: this.meta(idempotencyKey),
    };
  }

  private normalizeStatus(status?: string): JobDescriptionStatus | undefined {
    if (!status || status === 'all') return undefined;

    const normalized = status.toUpperCase();
    if (normalized === 'READY' || normalized === 'JD_READY') return JobDescriptionStatus.ACTIVE;
    if (normalized === 'JD_DRAFT') return JobDescriptionStatus.DRAFT;
    if (normalized === 'JD_ARCHIVED') return JobDescriptionStatus.ARCHIVED;

    if (Object.values(JobDescriptionStatus).includes(normalized as JobDescriptionStatus)) {
      return normalized as JobDescriptionStatus;
    }

    throw new BadRequestException('Invalid job description status');
  }

  private toBoolean(value?: string) {
    return value === 'true';
  }

  private normalizeStructuredObject(
    value: unknown,
    fieldName: string,
    required: boolean,
  ): Record<string, unknown> | null {
    if (value == null || value === '') {
      if (required) throw new BadRequestException(`${fieldName} is required`);
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        if (required) throw new BadRequestException(`${fieldName} is required`);
        return null;
      }

      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (this.isRecord(parsed)) return parsed;
        } catch {
          throw new BadRequestException(`${fieldName} contains invalid JSON`);
        }
      }

      return { text: trimmed };
    }

    if (this.isRecord(value)) return value;

    throw new BadRequestException(`${fieldName} must be a JSON object or text`);
  }

  private normalizeText(
    value: unknown,
    fieldName: string,
    required: boolean,
  ): string | null {
    if (value == null || value === '') {
      if (required) throw new BadRequestException(`${fieldName} is required`);
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        if (required) throw new BadRequestException(`${fieldName} is required`);
        return null;
      }
      return trimmed;
    }

    if (this.isRecord(value)) {
      const textValue = this.firstTextValue(value, ['rawText', 'text', 'html']);
      if (textValue) return textValue;
      return JSON.stringify(value);
    }

    throw new BadRequestException(`${fieldName} must be text`);
  }

  private firstTextValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toJobDescriptionResponse(jobDescription: JobDescriptionEntity) {
    return {
      id: jobDescription.id,
      jobDescriptionId: jobDescription.id,
      title: jobDescription.title,
      positionId: jobDescription.positionId,
      position: jobDescription.position
        ? {
          id: jobDescription.position.id,
          name: jobDescription.position.name,
          description: jobDescription.position.description,
        }
        : null,
      levelId: jobDescription.levelId,
      level: jobDescription.level
        ? {
          id: jobDescription.level.id,
          name: jobDescription.level.name,
          displayName: jobDescription.level.displayName,
          orderIndex: jobDescription.level.orderIndex,
        }
        : null,
      description: jobDescription.description,
      overview: jobDescription.overview,
      responsibilities: jobDescription.responsibilities,
      summary: jobDescription.summary,
      requirements: jobDescription.requirements,
      benefits: jobDescription.benefits,
      salary: jobDescription.salary,
      annualLeaveDays: jobDescription.annualLeaveDays,
      department: jobDescription.department,
      applicationDeadline: jobDescription.applicationDeadline,
      status: jobDescription.status,
      sourceSystem: jobDescription.sourceSystem,
      sourceJobId: jobDescription.sourceJobId,
      sourceSlug: jobDescription.sourceSlug,
      sourceUrl: jobDescription.sourceUrl,
      sourceCreatedAt: jobDescription.sourceCreatedAt?.toISOString() ?? null,
      sourceModifiedAt: jobDescription.sourceModifiedAt?.toISOString() ?? null,
      sourceContentHash: jobDescription.sourceContentHash,
      lastSyncedAt: jobDescription.lastSyncedAt?.toISOString() ?? null,
      sourceCategories: (jobDescription.sourceCategories ?? []).map((category) => ({
        id: category.id,
        sourceSystem: category.sourceSystem,
        sourceCategoryId: category.sourceCategoryId,
        name: category.name,
        displayName: category.displayName,
        slug: category.slug,
      })),
      createdById: jobDescription.createdById,
      createdBy: this.toUserSummary(jobDescription.createdBy),
      createdAt: jobDescription.createdAt?.toISOString(),
      updatedAt: jobDescription.updatedAt?.toISOString(),
    };
  }

  private toVersionResponse(version: JobDescriptionVersionEntity) {
    return {
      id: version.id,
      jobDescriptionVersionId: version.id,
      jobDescriptionId: version.jobDescriptionId,
      versionNo: version.versionNo,
      snapshot: version.snapshot,
      status: version.status,
      createdById: version.createdById,
      createdBy: this.toUserSummary(version.createdBy),
      createdAt: version.createdAt?.toISOString(),
    };
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
