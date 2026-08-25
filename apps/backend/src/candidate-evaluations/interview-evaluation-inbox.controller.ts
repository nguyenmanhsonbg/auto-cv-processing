import { UserRole } from '@interview-assistant/shared';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  InterviewEvaluationActor,
  InterviewEvaluationsService,
} from './interview-evaluations.service';

type AuthenticatedRequest = Request & {
  user: InterviewEvaluationActor;
};

@ApiTags('Interview evaluations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMMITTEE)
@Controller('interview-evaluations')
export class InterviewEvaluationInboxController {
  constructor(private readonly evaluationsService: InterviewEvaluationsService) {}

  @Get('assigned')
  @ApiOperation({ summary: 'List current interview evaluations assigned to the committee member' })
  async assigned(@Req() request: AuthenticatedRequest) {
    return this.evaluationsService.listAssignedEvaluations(request.user);
  }
}
