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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AggregateInterviewEvaluationDto } from './dto/aggregate-interview-evaluation.dto';
import { CreateInterviewEvaluationDto } from './dto/create-interview-evaluation.dto';
import { SaveInterviewReviewDto } from './dto/save-interview-review.dto';
import { SyncInterviewEvaluationContextDto } from './dto/sync-interview-evaluation-context.dto';
import {
  InterviewEvaluationActor,
  InterviewEvaluationsService,
} from './interview-evaluations.service';
import { InterviewEvaluationReviewerSection } from '@interview-assistant/shared';

type AuthenticatedRequest = Request & {
  user: InterviewEvaluationActor;
};

@ApiTags('Interview evaluations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR, UserRole.INTERVIEWER, UserRole.COMMITTEE)
@Controller('applications/:applicationId/interview-evaluations')
export class InterviewEvaluationsController {
  constructor(private readonly evaluationsService: InterviewEvaluationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get the interview evaluation card summary for an application' })
  async summary(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Query('amisUserId') amisUserId: string | undefined,
    @Query('amisRecruitmentId') amisRecruitmentId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.getSummary(
      applicationId,
      this.withAmisContext(request.user, amisUserId, amisRecruitmentId),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get the interview evaluation case and current round' })
  async detail(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Query('roundId') roundId: string | undefined,
    @Query('amisUserId') amisUserId: string | undefined,
    @Query('amisRecruitmentId') amisRecruitmentId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.getDetail(
      applicationId,
      this.withAmisContext(request.user, amisUserId, amisRecruitmentId),
      roundId,
    );
  }

  @Patch('context')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Synchronize the active AMIS interview round into the persistent evaluation case' })
  async syncContext(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: SyncInterviewEvaluationContextDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.syncAmisInterviewContext(applicationId, dto, request.user);
  }

  @Post('rounds')
  @Roles(UserRole.ADMIN, UserRole.HR, UserRole.COMMITTEE)
  @ApiOperation({ summary: 'Create an interview evaluation case and first round' })
  async createCase(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateInterviewEvaluationDto,
    @Query('amisUserId') amisUserId: string | undefined,
    @Query('amisRecruitmentId') amisRecruitmentId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.createCase(
      applicationId,
      dto,
      this.withAmisContext(request.user, amisUserId, amisRecruitmentId),
    );
  }

  @Patch('rounds/:roundId/reviews/:section')
  @ApiOperation({ summary: 'Save the current user interview review as a draft' })
  async saveReview(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('section') section: InterviewEvaluationReviewerSection,
    @Body() dto: SaveInterviewReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.saveReview(applicationId, roundId, section, dto, request.user);
  }

  @Post('rounds/:roundId/reviews/:section/submit')
  @ApiOperation({ summary: 'Submit the current user interview review' })
  async submitReview(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('section') section: InterviewEvaluationReviewerSection,
    @Body() dto: SaveInterviewReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.submitReview(applicationId, roundId, section, dto, request.user);
  }

  @Patch('rounds/:roundId/aggregate')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Save the HR or chair aggregation result' })
  async aggregate(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: AggregateInterviewEvaluationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.aggregate(applicationId, roundId, dto, request.user);
  }

  @Patch('rounds/:roundId/aggregate/draft')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Save the HR or chair aggregation as a draft' })
  async saveAggregateDraft(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: AggregateInterviewEvaluationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.saveAggregateDraft(applicationId, roundId, dto, request.user);
  }

  @Post('rounds/:roundId/complete')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Complete and lock the current interview round' })
  async complete(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.complete(applicationId, roundId, request.user);
  }

  @Post('rounds/:roundId/next')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Advance the single evaluation form to the next round' })
  async nextRound(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationsService.createNextRound(applicationId, roundId, request.user);
  }

  private withAmisContext(
    actor: InterviewEvaluationActor,
    amisUserId?: string,
    amisRecruitmentId?: string,
  ): InterviewEvaluationActor {
    return {
      ...actor,
      amisUserId: amisUserId?.trim() || actor.amisUserId || null,
      amisRecruitmentId: amisRecruitmentId?.trim() || actor.amisRecruitmentId || null,
    };
  }
}
