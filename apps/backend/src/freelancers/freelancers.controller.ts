import { UserRole } from '@interview-assistant/shared';
import { createReadStream } from 'node:fs';
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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { paginatedSuccess } from '../common/http/list-response';
import { CreateFreelancerDto } from './dto/create-freelancer.dto';
import { ListFreelancerApplicationsQueryDto } from './dto/list-freelancer-applications-query.dto';
import { ListFreelancersQueryDto } from './dto/list-freelancers-query.dto';
import { UpdateFreelancerStatusDto } from './dto/update-freelancer-status.dto';
import {
  FreelancerApplicationSummary,
  FreelancerCreateResult,
  FreelancerSummary,
  FreelancersService,
} from './freelancers.service';

class UpdateFreelancerApplicationEvaluationDto {
  @ApiProperty({
    nullable: true,
    maxLength: 2000,
    description: 'Freelancer-owned evaluation note. Use null to clear the note.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  evaluation!: string | null;
}

@ApiTags('Freelancers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('freelancers')
@ApiErrorResponses([400, 401, 403, 404, 409, 500])
export class FreelancersController {
  constructor(private readonly freelancersService: FreelancersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Create a freelancer account and one-time initial credentials' })
  async create(@Body() dto: CreateFreelancerDto, @Request() req: any) {
    const data = await this.freelancersService.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      createdById: req?.user?.id,
    });

    return {
      success: true,
      data: this.toFreelancerResponse(data),
      meta: this.meta(),
    };
  }

  @Get('me/summary')
  @Roles(UserRole.FREELANCER, UserRole.INTERNAL)
  @ApiOperation({ summary: 'Get the active freelancer summary for the current user' })
  async meSummary(@Request() req: any) {
    const data = await this.freelancersService.findMySummary(req?.user?.id, req?.user?.role);
    return {
      success: true,
      data: this.toFreelancerResponse(data),
      meta: this.meta(),
    };
  }

  @Get('me/applications')
  @Roles(UserRole.FREELANCER, UserRole.INTERNAL)
  @ApiOperation({ summary: 'List the current freelancer referral applications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'processStatus', required: false })
  @ApiQuery({ name: 'hrReceptionStatus', required: false })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async meApplications(
    @Request() req: any,
    @Query() query: ListFreelancerApplicationsQueryDto,
  ) {
    const result = await this.freelancersService.findMyApplications(req?.user?.id, query, req?.user?.role);
    return this.paginatedApplicationsResponse(result);
  }

  @Patch('me/applications/:referralId/evaluation')
  @Roles(UserRole.FREELANCER, UserRole.INTERNAL)
  @ApiOperation({ summary: 'Create or update the current freelancer evaluation note for a referral' })
  async updateMyApplicationEvaluation(
    @Request() req: any,
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body() dto: UpdateFreelancerApplicationEvaluationDto,
  ) {
    const data = await this.freelancersService.updateMyApplicationEvaluation(req?.user?.id, {
      referralId,
      evaluation: dto.evaluation,
    }, req?.user?.role);

    return {
      success: true,
      data: this.toFreelancerApplicationResponse(data),
      meta: this.meta(),
    };
  }

  @Get('me/applications/:referralId/cv')
  @Roles(UserRole.FREELANCER, UserRole.INTERNAL)
  @ApiOperation({ summary: 'Preview or download the current sanitized CV for a freelancer referral' })
  @ApiResponse({
    status: 200,
    description: 'Sanitized clean CV binary stream. Success is not wrapped in an envelope.',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getMyApplicationCv(
    @Request() req: any,
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Query('disposition') disposition: string | undefined,
    @Res() res: Response,
  ) {
    const accessMode = this.normalizeCleanFileDisposition(disposition);
    const cleanFile = await this.freelancersService.getMyApplicationCv(
      req?.user?.id,
      referralId,
      accessMode,
      req?.user?.role,
    );

    res.setHeader('Content-Type', cleanFile.mimeType);
    res.setHeader('Content-Length', String(cleanFile.fileSize));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${accessMode}; filename="${cleanFile.fileName}"`,
    );

    const stream = createReadStream(cleanFile.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Disposition');
        res.status(503).json({
          success: false,
          error: {
            code: 'CLEAN_CV_FILE_UNAVAILABLE',
            message: 'Clean CV file is not available.',
            details: [],
          },
          meta: this.meta(),
        });
        return;
      }

      res.end();
    });
    stream.pipe(res);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List freelancer accounts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['identifier', 'name', 'email', 'createdAt', 'updatedAt'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async findAll(@Query() query: ListFreelancersQueryDto) {
    const result = await this.freelancersService.findPaginated(query);
    return paginatedSuccess(
      result.data.map((freelancer) => this.toFreelancerResponse(freelancer)),
      result,
      this.meta(),
    );
  }

  @Get(':id/applications')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List minimal application rows for a freelancer' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'processStatus', required: false })
  @ApiQuery({ name: 'hrReceptionStatus', required: false })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async findApplications(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListFreelancerApplicationsQueryDto,
  ) {
    const result = await this.freelancersService.findApplications(id, query);
    return this.paginatedApplicationsResponse(result);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get freelancer account detail' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.freelancersService.findOne(id);
    return {
      success: true,
      data: this.toFreelancerResponse(data),
      meta: this.meta(),
    };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Activate or deactivate a freelancer account' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFreelancerStatusDto,
  ) {
    const data = await this.freelancersService.updateStatus(id, dto.isActive);
    return {
      success: true,
      data: this.toFreelancerResponse(data),
      meta: this.meta(),
    };
  }

  private paginatedApplicationsResponse(result: {
    data: FreelancerApplicationSummary[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }) {
    return paginatedSuccess(
      result.data.map((application) => this.toFreelancerApplicationResponse(application)),
      result,
      this.meta(),
    );
  }

  private toFreelancerResponse(data: FreelancerSummary | FreelancerCreateResult) {
    const response: Record<string, unknown> = {
      freelancerId: data.freelancerId,
      identifier: data.identifier,
      phone: data.phone,
      isActive: data.isActive,
      applicationCount: data.applicationCount,
      user: {
        userId: data.user.userId,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      },
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toISOString(),
      updatedAt: data.updatedAt?.toISOString(),
    };

    if ('initialPassword' in data) {
      response.initialPassword = data.initialPassword;
    }

    return response;
  }

  private toFreelancerApplicationResponse(data: FreelancerApplicationSummary) {
    return {
      referralId: data.referralId,
      applicationId: data.applicationId,
      candidate: {
        candidateId: data.candidate.candidateId,
        fullName: data.candidate.fullName,
      },
      jobPosting: {
        jobPostingId: data.jobPosting.jobPostingId,
        title: data.jobPosting.title,
        sourceSystem: data.jobPosting.sourceSystem,
        sourceJobId: data.jobPosting.sourceJobId,
        amisRecruitmentId: data.jobPosting.amisRecruitmentId,
      },
      processStatus: data.processStatus,
      hrReceptionStatus: data.hrReceptionStatus,
      evaluation: data.evaluation,
      appliedAt: data.appliedAt?.toISOString(),
      assignees: data.assignees,
      attractivePersonnelName: data.attractivePersonnelName,
      currentAmisStage: data.currentAmisStage
        ? {
            recruitmentRoundId: data.currentAmisStage.recruitmentRoundId,
            recruitmentRoundName: data.currentAmisStage.recruitmentRoundName,
            amisStatus: data.currentAmisStage.amisStatus,
            reasonRemoved: data.currentAmisStage.reasonRemoved,
            updatedAt: data.currentAmisStage.updatedAt?.toISOString() ?? null,
          }
        : null,
      statusCategory: data.statusCategory,
      createdAt: data.createdAt?.toISOString(),
      updatedAt: data.updatedAt?.toISOString(),
    };
  }

  private meta() {
    return {
      timestamp: new Date().toISOString(),
    };
  }

  private normalizeCleanFileDisposition(value?: string): 'inline' | 'attachment' {
    return value?.toLowerCase() === 'attachment' ? 'attachment' : 'inline';
  }
}
