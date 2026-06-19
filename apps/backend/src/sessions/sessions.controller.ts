import { SessionStatus, UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CreateSubmissionDto } from '../submissions/dto/create-submission.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InterviewWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';
import { SessionIdentifierPipe } from './pipes/session-identifier.pipe';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly wsGateway: InterviewWebSocketGateway,
  ) { }

  /**
   * Helper to resolve session identifier (ID or slug) to session ID
   */
  private async resolveSessionId(
    identifier: string,
    scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean }
  ): Promise<string> {
    const session = await this.sessionsService.findByIdOrSlug(identifier, scope);
    return session.id;
  }

  @Get(':id/client-info')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get connected candidate IP and info' })
  async getClientInfo(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    const info = this.wsGateway.getClientInfo(sessionId);
    return info || { ip: null, userAgent: null, connectedAt: null };
  }

  @Get(':id/anticheat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get anti-cheat events for a session' })
  async getAntiCheatEvents(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.getAntiCheatEvents(sessionId);
  }

  // --- Protected endpoints (require JWT) ---

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER, UserRole.HR)
  @ApiOperation({ summary: 'Create a new interview session' })
  create(@Body() dto: CreateSessionDto, @Request() req: any) {
    const role = req?.user?.role;
    return this.sessionsService.create(dto, req.user.id, role);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List interview sessions (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', enum: SessionStatus, required: false })
  @ApiQuery({ name: 'targetLevel', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: SessionStatus,
    @Query('targetLevel') targetLevel?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Request() req?: any,
  ) {
    const role = req?.user?.role;
    const isAdmin = role === UserRole.ADMIN;
    const filterByCandidateOwner = role === UserRole.HR;
    const isHR = role === UserRole.HR;
    return this.sessionsService.findPaginated(
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined, search, status, targetLevel, sortBy, sortOrder },
      { userId: req?.user?.id, isAdmin, filterByCandidateOwner, isHR },
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a session by ID or slug' })
  findOne(@Param('id', SessionIdentifierPipe) id: string, @Request() req: any) {
    const role = req?.user?.role;
    const isAdmin = role === UserRole.ADMIN;
    const filterByCandidateOwner = role === UserRole.HR;
    const excludeQuestions = role === UserRole.HR;
    return this.sessionsService.findByIdOrSlug(id, { userId: req?.user?.id, isAdmin, filterByCandidateOwner, excludeQuestions });
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER, UserRole.HR)
  @ApiOperation({ summary: 'Update a session (ID or slug)' })
  async update(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() dto: UpdateSessionDto,
    @Request() req: any,
  ) {
    const isAdmin = req?.user?.role === 'ADMIN';
    const session = await this.sessionsService.findByIdOrSlug(id, { userId: req?.user?.id, isAdmin });
    return this.sessionsService.update(session.id, dto, { userId: req?.user?.id, isAdmin });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER, UserRole.HR)
  @ApiOperation({ summary: 'Partially update a session (ID or slug)' })
  async partialUpdate(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() dto: UpdateSessionDto,
    @Request() req: any,
  ) {
    const isAdmin = req?.user?.role === 'ADMIN';
    const session = await this.sessionsService.findByIdOrSlug(id, { userId: req?.user?.id, isAdmin });
    return this.sessionsService.update(session.id, dto, { userId: req?.user?.id, isAdmin });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Delete a session (ID or slug)' })
  async remove(@Param('id', SessionIdentifierPipe) id: string, @Request() req: any) {
    const isAdmin = req?.user?.role === 'ADMIN';
    const session = await this.sessionsService.findByIdOrSlug(id, { userId: req?.user?.id, isAdmin });
    return this.sessionsService.remove(session.id, { userId: req?.user?.id, isAdmin });
  }

  @Post(':id/suggest-next-question')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Get AI-suggested next question based on ratings' })
  async suggestNextQuestion(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.suggestNextQuestion(sessionId);
  }

  @Post(':id/activate-questions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Activate specific questions for a session' })
  async activateQuestions(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { questionIds: string[] },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.activateQuestions(sessionId, body.questionIds);
  }

  @Post(':id/survey/generate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Generate AI diagnostic survey questions for the session candidate' })
  async generateSurvey(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.generateSurvey(sessionId);
  }

  @Get(':id/survey')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Get survey questions for a session' })
  async getSurveyQuestions(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.getSurveyQuestions(sessionId);
  }

  @Patch(':id/survey')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Save survey answers (interviewer fills in candidate responses)' })
  async saveSurveyAnswers(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { answers: Array<{ id: string; answer: string }> },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.saveSurveyAnswers(sessionId, body.answers);
  }

  @Post(':id/suggest-from-survey')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'AI suggests questions to activate using profile + survey answers' })
  async suggestQuestionsFromSurvey(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.suggestQuestionsFromSurvey(sessionId);
  }

  @Post(':id/activate-from-survey')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Additively activate questions selected from survey suggestion (does not deactivate others)' })
  async activateQuestionsFromSurvey(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { questionIds: string[] },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.activateQuestionsFromSurvey(sessionId, body.questionIds);
  }

  @Post(':id/questions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Add questions to a session' })
  async addQuestions(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { questionIds: string[] },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.addQuestions(sessionId, body.questionIds);
  }

  @Delete(':id/questions/:questionId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Remove a question from a session' })
  async removeQuestion(
    @Param('id', SessionIdentifierPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.removeQuestion(sessionId, questionId);
  }

  @Post(':id/activate-next')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Activate the next inactive question by orderIndex' })
  async activateNext(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.activateNext(sessionId);
  }

  @Post(':id/activate-next-category')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Deactivate all questions and activate the first question of the next category' })
  async activateNextCategory(@Param('id', SessionIdentifierPipe) id: string) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.activateNextCategory(sessionId);
  }

  @Patch(':id/questions/:sqId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Update a session question (notes, rating, active state)' })
  async updateSessionQuestion(
    @Param('id', SessionIdentifierPipe) id: string,
    @Param('sqId', ParseUUIDPipe) sqId: string,
    @Body() body: { interviewerNote?: string; rating?: number; isActive?: boolean },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.updateSessionQuestion(sessionId, sqId, body);
  }

  @Post(':id/force-activate-question')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Force activate a question, deactivating all other active questions' })
  async forceActivate(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { sqId: string },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.forceActivate(sessionId, body.sqId);
  }

  @Post(':id/bulk-toggle-questions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Bulk activate or deactivate session questions' })
  async bulkToggleQuestions(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { sqIds: string[]; isActive: boolean },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.bulkToggleQuestions(sessionId, body.sqIds, body.isActive);
  }

  @Patch(':id/candidate-view')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Enable or disable candidate\'s permission to view activated questions' })
  async toggleCandidateView(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { enabled: boolean },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.toggleCandidateView(sessionId, body.enabled);
  }

  @Post(':id/reactivate-question')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Re-activate a specific session question' })
  async reactivateQuestion(
    @Param('id', SessionIdentifierPipe) id: string,
    @Body() body: { questionId: string },
  ) {
    const sessionId = await this.resolveSessionId(id);
    return this.sessionsService.reactivateQuestion(sessionId, body.questionId);
  }

  // --- Public endpoints (candidate access via token) ---

  @Get('access/:token')
  @Throttle({ default: { ttl: 60_000, limit: 5000 } })
  @ApiOperation({ summary: 'Get session by access token (public, for candidates)' })
  findByToken(@Param('token') token: string) {
    return this.sessionsService.findByToken(token);
  }

  @Post('access/:token/submit')
  @ApiOperation({ summary: 'Submit answer to a session question (public)' })
  submitAnswer(
    @Param('token') token: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.sessionsService.submitAnswer(token, dto);
  }

  @Post('access/:token/complete')
  @ApiOperation({ summary: 'Complete the interview session (public)' })
  completeSession(@Param('token') token: string) {
    return this.sessionsService.completeSession(token);
  }

  @Post('access/:token/submissions')
  @ApiOperation({ summary: 'Submit code for a question (candidate, validated against session token)' })
  createSubmission(
    @Param('token') token: string,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.sessionsService.createSubmissionForCandidate(token, dto);
  }

  @Get('access/:token/submissions/:submissionId')
  @ApiOperation({ summary: 'Poll submission status (candidate, validated against session token)' })
  getSubmission(
    @Param('token') token: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    return this.sessionsService.getSubmissionForCandidate(token, submissionId);
  }

  @Get('access/:token/survey')
  @ApiOperation({ summary: 'Get survey questions for this session (public, for candidates)' })
  getCandidateSurvey(@Param('token') token: string) {
    return this.sessionsService.getCandidateSurvey(token);
  }

  @Patch('access/:token/survey/answers')
  @ApiOperation({ summary: 'Submit candidate answers to survey questions (public)' })
  submitCandidateSurveyAnswers(
    @Param('token') token: string,
    @Body() body: { answers: Array<{ id: string; answer: string }> },
  ) {
    return this.sessionsService.submitCandidateSurveyAnswers(token, body.answers);
  }
}
