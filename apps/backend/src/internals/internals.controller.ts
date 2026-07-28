import { UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { CreateInternalDto } from './dto/create-internal.dto';
import { ListInternalApplicationsQueryDto } from './dto/list-internal-applications-query.dto';
import { ListInternalsQueryDto } from './dto/list-internals-query.dto';
import { UpdateInternalStatusDto } from './dto/update-internal-status.dto';
import { InternalsService } from './internals.service';
import { InternalApplicationSummary, InternalSummary } from './internals.types';

@ApiTags('Internals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('internals')
export class InternalsController {
  constructor(private readonly internalsService: InternalsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Create an Internal email record' })
  async create(@Body() dto: CreateInternalDto, @Request() req: any) {
    const data = await this.internalsService.create({
      email: dto.email,
      createdById: req?.user?.id ?? null,
    });
    return { success: true, data: this.toResponse(data), meta: this.meta() };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List Internal email records' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  async findAll(@Query() query: ListInternalsQueryDto) {
    const result = await this.internalsService.findPaginated(query);
    return {
      success: true,
      data: result.data.map((item) => this.toResponse(item)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: this.meta(),
    };
  }

  @Get(':id/applications')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List application history for an Internal email' })
  async findApplications(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListInternalApplicationsQueryDto,
  ) {
    const result = await this.internalsService.findApplications(id, query);
    return this.paginatedApplicationsResponse(result);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get an Internal email record' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.internalsService.findOne(id);
    return { success: true, data: this.toResponse(data), meta: this.meta() };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Activate or deactivate an Internal email record' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInternalStatusDto,
  ) {
    const data = await this.internalsService.updateStatus(id, dto.isActive);
    return { success: true, data: this.toResponse(data), meta: this.meta() };
  }

  private toResponse(data: InternalSummary) {
    return {
      internalId: data.internalId,
      email: data.email,
      isActive: data.isActive,
      applicationCount: data.applicationCount,
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toISOString(),
      updatedAt: data.updatedAt?.toISOString(),
    };
  }

  private paginatedApplicationsResponse(result: {
    data: InternalApplicationSummary[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }) {
    return {
      success: true,
      data: result.data.map((application) => ({
        referralId: application.referralId,
        applicationId: application.applicationId,
        candidate: application.candidate,
        jobPosting: application.jobPosting,
        processStatus: application.processStatus,
        hrReceptionStatus: application.hrReceptionStatus,
        evaluation: application.evaluation,
        appliedAt: application.appliedAt?.toISOString(),
        assignees: application.assignees,
        createdAt: application.createdAt?.toISOString(),
        updatedAt: application.updatedAt?.toISOString(),
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      meta: this.meta(),
    };
  }

  private meta() {
    return { timestamp: new Date().toISOString() };
  }
}
