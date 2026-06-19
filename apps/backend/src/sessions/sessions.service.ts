import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { SessionStatus, ParsedProfile, PaginatedResponse } from '@interview-assistant/shared';
import { SessionEntity } from './entities/session.entity';
import { SessionQuestionEntity } from './entities/session-question.entity';
import { AntiCheatEventEntity } from './entities/anti-cheat-event.entity';
import { SessionSurveyQuestionEntity } from './entities/session-survey-question.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import {
  CandidateSessionResponseDto,
  CandidateSessionQuestionDto,
  CandidateQuestionDto,
  CandidateSubmissionResultDto,
} from './dto/candidate-session-response.dto';
import { InterviewWebSocketGateway } from '../websocket/websocket.gateway';
import { AiService } from '../ai/ai.service';
import { CandidatesService } from '../candidates/candidates.service';
import { QuestionsService } from '../questions/questions.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { CategoriesService } from '../categories/categories.service';
import { PositionsService } from '../positions/positions.service';
import { LevelsService } from '../levels/levels.service';
import { CreateSubmissionDto } from '../submissions/dto/create-submission.dto';
import { generateSessionSlug } from './utils/slug.utils';
import { validate as isUuid } from 'uuid';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(SessionQuestionEntity)
    private readonly sessionQuestionRepo: Repository<SessionQuestionEntity>,
    @InjectRepository(AntiCheatEventEntity)
    private readonly antiCheatEventRepo: Repository<AntiCheatEventEntity>,
    @InjectRepository(SessionSurveyQuestionEntity)
    private readonly surveyQuestionRepo: Repository<SessionSurveyQuestionEntity>,
    private readonly wsGateway: InterviewWebSocketGateway,
    private readonly aiService: AiService,
    private readonly candidatesService: CandidatesService,
    private readonly questionsService: QuestionsService,
    private readonly submissionsService: SubmissionsService,
    private readonly categoriesService: CategoriesService,
    private readonly positionsService: PositionsService,
    private readonly levelsService: LevelsService,
  ) {}

  private toSessionQuestionDto(sq: SessionQuestionEntity): CandidateSessionQuestionDto {
    const q = sq.question;
    const questionDto: CandidateQuestionDto | null = q
      ? {
          id: q.id,
          category: q.category ?? null,
          subcategory: q.subcategory,
          competencyType: q.competencyType ?? null,
          text: q.text,
          difficulty: q.difficulty,
          targetLevels: q.targetLevels,
          type: q.type,
          options: q.options ?? null,
          testCases: q.testCases ?? null,
          starterCode: q.starterCode ?? null,
          architectureTemplate: q.architectureTemplate ?? null,
          timeLimit: q.timeLimit ?? null,
          memoryLimit: q.memoryLimit ?? null,
        }
      : null;

    return {
      id: sq.id,
      sessionId: sq.sessionId,
      questionId: sq.questionId,
      question: questionDto,
      orderIndex: sq.orderIndex,
      isActive: sq.isActive,
      activatedAt: sq.activatedAt ?? null,
      candidateAnswer: sq.candidateAnswer ?? null,
      answeredAt: sq.answeredAt ?? null,
    };
  }

  private toSessionResponseDto(session: SessionEntity): CandidateSessionResponseDto {
    // When candidateViewEnabled is false, hide all questions from the candidate
    let questions = session.candidateViewEnabled === false
      ? []
      : (session.questions ?? []).map((sq) => this.toSessionQuestionDto(sq));

    // In sequential mode, expose only the first unanswered active question + already-answered ones.
    // The unanswered question is placed first so currentIndex=0 always lands on the active question.
    if (session.sequentialMode && session.candidateViewEnabled !== false) {
      const answered = questions.filter((sq) => sq.answeredAt !== null);
      const unanswered = questions
        .filter((sq) => sq.answeredAt === null)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (unanswered.length > 0) {
        const mostRecentlyActivated = unanswered
          .filter((sq) => sq.activatedAt)
          .sort((a, b) => new Date(b.activatedAt!).getTime() - new Date(a.activatedAt!).getTime())[0];
        const currentQuestion = mostRecentlyActivated || unanswered[0];
        questions = [currentQuestion, ...answered];
      } else {
        questions = answered;
      }
    }

    return {
      id: session.id,
      status: session.status,
      accessToken: session.accessToken,
      templatePosition: session.templatePosition,
      sequentialMode: session.sequentialMode,
      candidateViewEnabled: session.candidateViewEnabled ?? true,
      scheduledAt: session.scheduledAt ?? null,
      meetingPlatform: session.meetingPlatform ?? null,
      meetingLink: session.meetingLink ?? null,
      startedAt: session.startedAt ?? null,
      completedAt: session.completedAt ?? null,
      createdAt: session.createdAt,
      questions,
    };
  }

  async suggestNextQuestion(sessionId: string): Promise<{ sessionQuestionId: string; reasoning: string } | null> {
    const session = await this.findOne(sessionId);
    const questions = session.questions || [];

    const rated = questions
      .filter((sq) => sq.rating && sq.rating > 0)
      .map((sq) => ({
        sqId: sq.id,
        category: sq.question?.category || '',
        subcategory: sq.question?.subcategory || '',
        difficulty: sq.question?.difficulty || 1,
        rating: sq.rating!,
        text: sq.question?.text || '',
      }));

    const unrated = questions
      .filter((sq) => !sq.rating || sq.rating === 0)
      .map((sq) => ({
        sqId: sq.id,
        category: sq.question?.category || '',
        subcategory: sq.question?.subcategory || '',
        difficulty: sq.question?.difficulty || 1,
        text: sq.question?.text || '',
      }));

    if (unrated.length === 0) return null;

    this.wsGateway.emitNextQuestionGenerating(sessionId);
    const result = await this.aiService.suggestNextQuestion(rated, unrated);
    this.wsGateway.emitNextQuestionSuggested(sessionId, result);
    return result;
  }

  /**
   * Generate AI diagnostic survey questions for subcategories not clearly covered in the candidate's profile.
   * Replaces any previously generated survey questions for this session.
   */
  async generateSurvey(sessionId: string): Promise<SessionSurveyQuestionEntity[]> {
    const session = await this.findOne(sessionId);
    const profile = (session.candidate?.parsedProfile ?? {}) as ParsedProfile;

    // Get all distinct category/subcategory pairs from the active question bank
    const allQuestions = await this.questionsService.findAll({ isActive: true });
    const subcategorySet = new Map<string, string>();
    for (const q of allQuestions) {
      if (q.category && q.subcategory) {
        subcategorySet.set(`${q.category}::${q.subcategory}`, q.category);
      }
    }
    const subcategories = Array.from(subcategorySet.entries()).map(([key, category]) => ({
      category,
      subcategory: key.split('::')[1],
    }));

    await this.sessionRepo.update(sessionId, { isSurveyGenerating: true });
    this.wsGateway.emitSurveyGenerating(sessionId);
    try {
      const generated = await this.aiService.generateSurveyQuestions(profile, subcategories);

      // Replace existing survey questions
      await this.surveyQuestionRepo.delete({ sessionId });

      if (!generated.length) {
        this.wsGateway.emitSurveyGenerated(sessionId, []);
        return [];
      }

      const entities = generated.map((item, index) =>
        this.surveyQuestionRepo.create({
          sessionId,
          question: item.question,
          category: item.category,
          subcategory: item.subcategory ?? null,
          purpose: item.purpose,
          choices: item.choices ?? [],
          answer: null,
          orderIndex: index,
        }),
      );

      const saved = await this.surveyQuestionRepo.save(entities);
      this.wsGateway.emitSurveyGenerated(sessionId, saved);
      return saved;
    } catch (err) {
      this.wsGateway.emitSurveyGenerateFailed(sessionId);
      throw err;
    } finally {
      await this.sessionRepo.update(sessionId, { isSurveyGenerating: false });
    }
  }

  /** Save interviewer-selected answers to survey questions. */
  async saveSurveyAnswers(
    sessionId: string,
    answers: Array<{ id: string; answer: string }>,
  ): Promise<SessionSurveyQuestionEntity[]> {
    const existing = await this.surveyQuestionRepo.find({ where: { sessionId } });
    const answerMap = new Map(answers.map((a) => [a.id, a.answer]));

    for (const sq of existing) {
      if (answerMap.has(sq.id)) {
        sq.answer = answerMap.get(sq.id)!;
      }
    }

    return this.surveyQuestionRepo.save(existing);
  }

  /** Get all survey questions for a session. */
  async getSurveyQuestions(sessionId: string): Promise<SessionSurveyQuestionEntity[]> {
    return this.surveyQuestionRepo.find({
      where: { sessionId },
      order: { orderIndex: 'ASC' },
    });
  }

  /** Public: get survey questions by session access token (for candidates). */
  async getCandidateSurvey(token: string): Promise<SessionSurveyQuestionEntity[]> {
    const session = await this.findRawByToken(token);
    return this.surveyQuestionRepo.find({
      where: { sessionId: session.id },
      order: { orderIndex: 'ASC' },
    });
  }

  /** Public: candidate submits their own answers to survey questions. */
  async submitCandidateSurveyAnswers(
    token: string,
    answers: Array<{ id: string; answer: string }>,
  ): Promise<SessionSurveyQuestionEntity[]> {
    const session = await this.findRawByToken(token);
    const saved = await this.saveSurveyAnswers(session.id, answers);

    // Auto-start session if all survey questions are now answered and session is still DRAFT
    if (session.status === SessionStatus.DRAFT) {
      const unansweredCount = await this.surveyQuestionRepo.count({
        where: { sessionId: session.id, answer: IsNull() },
      });
      if (unansweredCount === 0) {
        await this.sessionRepo.update(session.id, {
          status: SessionStatus.IN_PROGRESS,
          startedAt: new Date(),
        });
        // Fire-and-forget: kick off AI suggestion immediately; socket events update all clients
        this.suggestQuestionsFromSurvey(session.id).catch(() => {
          // Error handled inside suggestQuestionsFromSurvey via emitSurveySuggestFailed
        });
      }
    }

    return saved;
  }

  /**
   * AI suggests interview questions to activate, using candidate profile + answered survey questions.
   */
  async suggestQuestionsFromSurvey(sessionId: string): Promise<{
    suggestions: Array<{ questionId: string; reasoning: string }>;
  }> {
    const session = await this.findOne(sessionId);
    const profile = (session.candidate?.parsedProfile ?? {}) as ParsedProfile;

    const surveyRows = await this.surveyQuestionRepo.find({
      where: { sessionId },
      order: { orderIndex: 'ASC' },
    });
    const surveyAnswers = surveyRows
      .filter((s) => s.answer)
      .map((s) => ({
        question: s.question,
        category: s.category,
        subcategory: s.subcategory ?? '',
        answer: s.answer!,
      }));

    const availableQuestions = await this.questionsService.findAll({ isActive: true });

    await this.sessionRepo.update(sessionId, { isSurveySuggestGenerating: true, surveySuggestions: null });
    this.wsGateway.emitSurveySuggestGenerating(sessionId);
    try {
      const suggestions = await this.aiService.suggestQuestionsFromSurvey(
        profile,
        surveyAnswers,
        availableQuestions,
        session.targetLevel,
        session.templatePosition,
      );
      await this.sessionRepo.update(sessionId, { isSurveySuggestGenerating: false, surveySuggestions: suggestions });
      this.wsGateway.emitSurveySuggestReady(sessionId, suggestions);
      return { suggestions };
    } catch (err) {
      await this.sessionRepo.update(sessionId, { isSurveySuggestGenerating: false });
      this.wsGateway.emitSurveySuggestFailed(sessionId);
      throw err;
    }
  }

  /**
   * Additively activate questions from survey suggestion.
   * Questions not yet linked to the session are added; already-linked ones are set active.
   * Does NOT deactivate other questions.
   */
  async activateQuestionsFromSurvey(
    sessionId: string,
    questionIds: string[],
  ): Promise<SessionEntity> {
    await this.findOne(sessionId);

    if (!questionIds.length) return this.findOne(sessionId);

    const existing = await this.sessionQuestionRepo.find({ where: { sessionId } });
    const existingQuestionIds = new Set(existing.map((sq) => sq.questionId));

    const maxOrderIndex = existing.reduce((max, sq) => Math.max(max, sq.orderIndex), -1);

    // Activate already-linked questions
    const toActivate = existing.filter((sq) => questionIds.includes(sq.questionId));
    for (const sq of toActivate) {
      sq.isActive = true;
      sq.activatedAt = new Date();
    }

    // Create new session question links for questions not yet in the session
    let newQuestionIds = questionIds.filter((id) => !existingQuestionIds.has(id));

    // Validate that new question IDs actually exist in the questions table
    if (newQuestionIds.length) {
      const validQuestions = await this.sessionQuestionRepo.manager
        .createQueryBuilder()
        .select('q.id')
        .from('questions', 'q')
        .where('q.id IN (:...ids)', { ids: newQuestionIds })
        .getRawMany();
      const validIds = new Set(validQuestions.map((q: { id: string }) => q.id));
      newQuestionIds = newQuestionIds.filter((id) => validIds.has(id));
    }

    const newSessionQuestions = newQuestionIds.map((questionId, index) =>
      this.sessionQuestionRepo.create({
        sessionId,
        questionId,
        orderIndex: maxOrderIndex + 1 + index,
        isActive: true,
        activatedAt: new Date(),
      }),
    );

    await Promise.all([
      toActivate.length ? this.sessionQuestionRepo.save(toActivate) : Promise.resolve(),
      newSessionQuestions.length ? this.sessionQuestionRepo.save(newSessionQuestions) : Promise.resolve(),
    ]);

    await this.sessionRepo.update(sessionId, { surveyActivatedAt: new Date() });
    this.wsGateway.emitSurveyActivated(sessionId);

    if (questionIds.length) {
      this.wsGateway.emitQuestionsActivated(sessionId, questionIds);
    }

    return this.findOne(sessionId);
  }

  async create(
    dto: CreateSessionDto,
    createdById: string,
    role?: string,
  ): Promise<SessionEntity> {
    const accessToken = nanoid(24);

    // Load candidate to generate slug
    const candidate = await this.candidatesService.findOne(dto.candidateId);
    const candidateName = candidate.name || candidate.email || 'candidate';
    const slug = generateSessionSlug(candidateName);

    // Resolve position name: prefer positionId (UUID) over legacy templatePosition string.
    // This avoids passing brittle position names across the wire — clients should send a positionId.
    let resolvedPositionName = dto.templatePosition || 'Backend Developer';
    if (dto.positionId) {
      const resolvedPosition = await this.positionsService.findOne(dto.positionId);
      resolvedPositionName = resolvedPosition.name;
    }

    const session = this.sessionRepo.create({
      candidateId: dto.candidateId,
      createdById,
      accessToken,
      slug,
      targetLevel: dto.targetLevel || 'ENTRY',
      templatePosition: resolvedPositionName,
      status: SessionStatus.DRAFT,
      sequentialMode: dto.sequentialMode ?? true,
      candidateViewEnabled: false,
      ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.meetingPlatform && { meetingPlatform: dto.meetingPlatform }),
      ...(dto.meetingLink && { meetingLink: dto.meetingLink }),
    });

    const saved = await this.sessionRepo.save(session);

    const isHR = role === 'HR';

    if (isHR) {
      // HR: auto-assign questions based on position's categories + selected target level.
      // All data is loaded in exactly 2 more queries (categories + questions) — no N+1.
      // Position name already resolved above.

      // 2. Fetch all categories applicable to this position in one query
      const positionCategories = await this.categoriesService.findAllCategories(resolvedPositionName);
      const categoryNames = positionCategories.map((c) => c.name);

      // 3. Resolve the level hierarchy: "higher level includes all lower levels".
      //    Load all levels and keep those with orderIndex ≤ selected level's orderIndex.
      let applicableLevelNames: string[] | undefined;
      if (dto.targetLevel) {
        const allLevels = await this.levelsService.findAll();
        const selectedLevel = allLevels.find((l) => l.name === dto.targetLevel);
        if (selectedLevel) {
          // Include current level and all levels below it (lower orderIndex = lower seniority)
          applicableLevelNames = allLevels
            .filter((l) => l.orderIndex <= selectedLevel.orderIndex)
            .map((l) => l.name);
        }
      }

      // 4. Single batch query: fetch all questions across all relevant categories + levels at once
      const autoQuestions = categoryNames.length
        ? await this.questionsService.findAll({
            isActive: true,
            categories: categoryNames,
            ...(applicableLevelNames?.length ? { targetLevels: applicableLevelNames } : {}),
          })
        : [];

      if (autoQuestions.length > 0) {
        const sessionQuestions = autoQuestions.map((q, index) =>
          this.sessionQuestionRepo.create({
            sessionId: saved.id,
            questionId: q.id,
            orderIndex: index,
          }),
        );
        await this.sessionQuestionRepo.save(sessionQuestions);
      }
    } else if (dto.questionIds?.length) {
      // Non-HR: use manually provided question list
      const sessionQuestions = dto.questionIds.map((questionId, index) =>
        this.sessionQuestionRepo.create({
          sessionId: saved.id,
          questionId,
          orderIndex: index,
        }),
      );
      await this.sessionQuestionRepo.save(sessionQuestions);
    }

    // Fire-and-forget: auto-generate survey questions in background
    this.generateSurvey(saved.id).catch((err) =>
      this.logger.warn(`Auto-generate survey failed for session ${saved.id}: ${err.message}`),
    );

    // For HR users, return session without question details (questions are hidden per HR restrictions)
    return this.findOne(saved.id, isHR ? { userId: createdById, isAdmin: false, excludeQuestions: true } : undefined);
  }

  async findAll(scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean }): Promise<SessionEntity[]> {
    const qb = this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.candidate', 'candidate')
      .leftJoinAndSelect('session.createdBy', 'createdBy')
      .leftJoinAndSelect('session.questions', 'questions')
      .orderBy('session.createdAt', 'DESC');

    if (scope && !scope.isAdmin) {
      qb.leftJoin('candidate.assignees', 'candidateAssignee');
      if (scope.filterByCandidateOwner) {
        // HR: sessions for candidates they own OR are assigned to
        qb.where('(candidate.createdById = :uid OR candidateAssignee.id = :uid)', { uid: scope.userId });
      } else {
        // INTERVIEWER: sessions they created OR for candidates they own/are assigned to
        qb.where(
          '(session.createdById = :uid OR candidate.createdById = :uid OR candidateAssignee.id = :uid)',
          { uid: scope.userId },
        );
      }
    }

    return qb.getMany();
  }

  async findPaginated(
    params: { page?: number; limit?: number; search?: string; status?: string; targetLevel?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC' },
    scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean; isHR?: boolean },
  ): Promise<PaginatedResponse<SessionEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      candidateName: 'candidate.name', status: 'session.status',
      targetLevel: 'session.targetLevel', createdAt: 'session.createdAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'session.createdAt';

    const qb = this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.candidate', 'candidate')
      .leftJoinAndSelect('session.createdBy', 'createdBy')
      .orderBy(sortCol, sortOrder);

    if (scope && !scope.isAdmin) {
      qb.leftJoin('candidate.assignees', 'candidateAssignee');
      if (scope.filterByCandidateOwner) {
        // HR: sessions for candidates they own OR are assigned to
        qb.where('(candidate.createdById = :uid OR candidateAssignee.id = :uid)', { uid: scope.userId });
      } else {
        // INTERVIEWER: sessions they created OR for candidates they own/are assigned to
        qb.where(
          '(session.createdById = :uid OR candidate.createdById = :uid OR candidateAssignee.id = :uid)',
          { uid: scope.userId },
        );
      }
    }
    if (params.search) {
      qb.andWhere('candidate.name ILIKE :search', { search: `%${params.search}%` });
    }
    if (params.status) {
      const statuses = params.status.split(',').filter(Boolean);
      if (statuses.length > 0) qb.andWhere('session.status IN (:...statuses)', { statuses });
    }
    if (params.targetLevel) {
      const levels = params.targetLevel.split(',').filter(Boolean);
      if (levels.length > 0) qb.andWhere('session.targetLevel IN (:...targetLevels)', { targetLevels: levels });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Filter out questions for HR users
    if (scope?.isHR) {
      data.forEach(session => {
        session.questions = [];
      });
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean; excludeQuestions?: boolean }): Promise<SessionEntity> {
    const relations = [
      'candidate',
      'candidate.assignees',
      'createdBy',
    ];

    // Conditionally include question relations based on excludeQuestions flag
    if (!scope?.excludeQuestions) {
      relations.push('questions', 'questions.question', 'questions.submissions');
    }

    const session = await this.sessionRepo.findOne({
      where: { id },
      relations,
    });
    if (!session) {
      throw new BadRequestException(`Session with id ${id} not found`);
    }
    if (scope && !scope.isAdmin) {
      const isAssignee = session.candidate?.assignees?.some(u => u.id === scope.userId) ?? false;
      if (scope.filterByCandidateOwner) {
        const ok = session.candidate?.createdById === scope.userId || isAssignee;
        if (!ok) {
          throw new BadRequestException(`Session with id ${id} not found`);
        }
      } else if (
        session.createdById !== scope.userId &&
        session.candidate?.createdById !== scope.userId &&
        !isAssignee
      ) {
        throw new BadRequestException(`Session with id ${id} not found`);
      }
    }

    // Filter out questions when requested (e.g. for HR users)
    if (scope?.excludeQuestions) {
      session.questions = [];
    }

    return session;
  }

  async findBySlug(slug: string, scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean; excludeQuestions?: boolean }): Promise<SessionEntity> {
    const relations = [
      'candidate',
      'candidate.assignees',
      'createdBy',
    ];

    // Conditionally include question relations based on excludeQuestions flag
    if (!scope?.excludeQuestions) {
      relations.push('questions', 'questions.question', 'questions.submissions');
    }

    const session = await this.sessionRepo.findOne({
      where: { slug },
      relations,
    });
    if (!session) {
      throw new BadRequestException(`Session with slug ${slug} not found`);
    }
    if (scope && !scope.isAdmin) {
      const isAssignee = session.candidate?.assignees?.some(u => u.id === scope.userId) ?? false;
      if (scope.filterByCandidateOwner) {
        const ok = session.candidate?.createdById === scope.userId || isAssignee;
        if (!ok) {
          throw new BadRequestException(`Session with slug ${slug} not found`);
        }
      } else if (
        session.createdById !== scope.userId &&
        session.candidate?.createdById !== scope.userId &&
        !isAssignee
      ) {
        throw new BadRequestException(`Session with slug ${slug} not found`);
      }
    }

    // Filter out questions when requested (e.g. for HR users)
    if (scope?.excludeQuestions) {
      session.questions = [];
    }

    return session;
  }

  async findByIdOrSlug(identifier: string, scope?: { userId: string; isAdmin: boolean; filterByCandidateOwner?: boolean; excludeQuestions?: boolean }): Promise<SessionEntity> {
    // Determine if identifier is UUID or slug
    if (isUuid(identifier)) {
      return this.findOne(identifier, scope);
    } else {
      return this.findBySlug(identifier, scope);
    }
  }

  async findByToken(token: string): Promise<CandidateSessionResponseDto> {
    // Only load active questions at the DB level — inactive ones are never sent to candidates.
    // candidate and createdBy relations are intentionally not loaded (not exposed to candidates).
    const session = await this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect(
        'session.questions',
        'sq',
        'sq.isActive = :active',
        { active: true },
      )
      .leftJoinAndSelect('sq.question', 'question')
      .where('session.accessToken = :token', { token })
      .getOne();

    if (!session) {
      throw new BadRequestException('Invalid session access token');
    }

    // Auto-start session on first access, but only if there are no unanswered survey questions.
    // If survey questions exist and haven't been answered yet, keep DRAFT so the candidate
    // can complete the survey before the interview begins.
    if (session.status === SessionStatus.DRAFT) {
      const unansweredCount = await this.surveyQuestionRepo.count({
        where: { sessionId: session.id, answer: IsNull() },
      });
      const hasSurveyQuestions = await this.surveyQuestionRepo.count({
        where: { sessionId: session.id },
      });
      // Only auto-start if no survey exists OR all survey questions are answered
      if (hasSurveyQuestions === 0 || unansweredCount === 0) {
        session.status = SessionStatus.IN_PROGRESS;
        session.startedAt = new Date();
        await this.sessionRepo.update(session.id, {
          status: SessionStatus.IN_PROGRESS,
          startedAt: session.startedAt,
        });
      }
    }

    return this.toSessionResponseDto(session);
  }

  /** Look up a session by accessToken without mapping to DTO (internal use only). */
  private async findRawByToken(token: string): Promise<SessionEntity> {
    const session = await this.sessionRepo.findOne({ where: { accessToken: token } });
    if (!session) {
      throw new BadRequestException('Invalid session access token');
    }
    return session;
  }

  async toggleCandidateView(id: string, enabled: boolean): Promise<{ candidateViewEnabled: boolean }> {
    await this.sessionRepo.update(id, { candidateViewEnabled: enabled });
    this.wsGateway.emitCandidateViewToggled(id, enabled);
    return { candidateViewEnabled: enabled };
  }

  async update(id: string, dto: UpdateSessionDto, scope?: { userId: string; isAdmin: boolean }): Promise<SessionEntity> {
    const session = await this.findOne(id, scope);

    if (dto.status) {
      session.status = dto.status;
      if (dto.status === SessionStatus.IN_PROGRESS && !session.startedAt) {
        session.startedAt = new Date();
      }
      if (dto.status === SessionStatus.COMPLETED && !session.completedAt) {
        session.completedAt = new Date();
      }
    }
    if (dto.targetLevel) session.targetLevel = dto.targetLevel;
    if (dto.templatePosition) session.templatePosition = dto.templatePosition;
    if (dto.categoryRatings !== undefined) session.categoryRatings = dto.categoryRatings;
    if (dto.sequentialMode !== undefined) session.sequentialMode = dto.sequentialMode;
    if (dto.scheduledAt !== undefined) {
      session.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : (null as any);
    }
    if (dto.meetingPlatform !== undefined) session.meetingPlatform = dto.meetingPlatform;
    if (dto.meetingLink !== undefined) {
      session.meetingLink = (dto.meetingLink || null) as any;
    }

    await this.sessionRepo.save(session);

    // Update linked questions if provided
    if (dto.questionIds) {
      await this.sessionQuestionRepo.delete({ sessionId: id });
      const sessionQuestions = dto.questionIds.map((questionId, index) =>
        this.sessionQuestionRepo.create({
          sessionId: id,
          questionId,
          orderIndex: index,
        }),
      );
      await this.sessionQuestionRepo.save(sessionQuestions);
    }

    return this.findOne(id);
  }

  async remove(id: string, scope?: { userId: string; isAdmin: boolean }): Promise<void> {
    const session = await this.findOne(id, scope);
    await this.sessionRepo.remove(session);
  }

  async submitAnswer(
    token: string,
    dto: SubmitAnswerDto,
  ): Promise<CandidateSessionQuestionDto> {
    const session = await this.findRawByToken(token);

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session is already completed');
    }

    const sessionQuestion = await this.sessionQuestionRepo.findOne({
      where: { id: dto.sessionQuestionId, sessionId: session.id, isActive: true },
      relations: ['question'],
    });
    if (!sessionQuestion) {
      throw new BadRequestException('Session question not found or not active');
    }

    sessionQuestion.candidateAnswer = dto.answer;
    sessionQuestion.answeredAt = new Date();
    const saved = await this.sessionQuestionRepo.save(sessionQuestion);
    saved.question = sessionQuestion.question;
    return this.toSessionQuestionDto(saved);
  }

  async completeSession(token: string): Promise<CandidateSessionResponseDto> {
    const session = await this.findRawByToken(token);

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session is already completed');
    }

    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date();
    await this.sessionRepo.save(session);

    return this.findByToken(token);
  }

  async createSubmissionForCandidate(
    token: string,
    dto: CreateSubmissionDto,
  ): Promise<CandidateSubmissionResultDto> {
    const session = await this.findRawByToken(token);

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session is already completed');
    }

    // Validate the question belongs to this session and is active
    const sessionQuestion = await this.sessionQuestionRepo.findOne({
      where: { id: dto.sessionQuestionId, sessionId: session.id, isActive: true },
    });
    if (!sessionQuestion) {
      throw new BadRequestException('Session question not found or not active');
    }

    const submission = await this.submissionsService.create(dto);
    return {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      results: submission.results ?? [],
    };
  }

  async getSubmissionForCandidate(
    token: string,
    submissionId: string,
  ): Promise<CandidateSubmissionResultDto> {
    const session = await this.findRawByToken(token);

    const submission = await this.submissionsService.findOne(submissionId);

    // Validate the submission belongs to a question in this session
    const sessionQuestion = await this.sessionQuestionRepo.findOne({
      where: { id: submission.sessionQuestionId, sessionId: session.id },
    });
    if (!sessionQuestion) {
      throw new BadRequestException('Submission not found');
    }

    return {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      results: submission.results ?? [],
    };
  }

  async updateStatus(
    id: string,
    status: SessionStatus,
  ): Promise<SessionEntity> {
    const session = await this.findOne(id);
    session.status = status;

    if (status === SessionStatus.IN_PROGRESS && !session.startedAt) {
      session.startedAt = new Date();
    }
    if (status === SessionStatus.COMPLETED && !session.completedAt) {
      session.completedAt = new Date();
    }

    await this.sessionRepo.save(session);
    return session;
  }

  async activateQuestions(
    sessionId: string,
    questionIds: string[],
  ): Promise<void> {
    await this.findOne(sessionId);

    // Deactivate all questions for this session
    await this.sessionQuestionRepo.update(
      { sessionId },
      { isActive: false },
    );

    // Activate the specified ones
    if (questionIds.length) {
      await this.sessionQuestionRepo.update(
        { sessionId, id: In(questionIds) },
        { isActive: true, activatedAt: new Date() },
      );
      this.wsGateway.emitQuestionsActivated(sessionId, questionIds);
    }
  }

  async addQuestions(
    sessionId: string,
    questionIds: string[],
  ): Promise<SessionQuestionEntity[]> {
    await this.findOne(sessionId);

    // Determine the current max orderIndex
    const existing = await this.sessionQuestionRepo.find({
      where: { sessionId },
      order: { orderIndex: 'DESC' },
      take: 1,
    });
    const startIndex = existing.length ? existing[0].orderIndex + 1 : 0;

    // Validate that question IDs actually exist
    let validQuestionIds = questionIds;
    if (questionIds.length) {
      const validQuestions = await this.sessionQuestionRepo.manager
        .createQueryBuilder()
        .select('q.id')
        .from('questions', 'q')
        .where('q.id IN (:...ids)', { ids: questionIds })
        .getRawMany();
      const validIds = new Set(validQuestions.map((q: { id: string }) => q.id));
      validQuestionIds = questionIds.filter((id) => validIds.has(id));
    }

    const sessionQuestions = validQuestionIds.map((questionId, index) =>
      this.sessionQuestionRepo.create({
        sessionId,
        questionId,
        orderIndex: startIndex + index,
      }),
    );
    return this.sessionQuestionRepo.save(sessionQuestions);
  }

  async removeQuestion(
    sessionId: string,
    sessionQuestionId: string,
  ): Promise<void> {
    const sq = await this.sessionQuestionRepo.findOne({
      where: { id: sessionQuestionId, sessionId },
    });
    if (!sq) {
      throw new BadRequestException(
        `Session question ${sessionQuestionId} not found in session ${sessionId}`,
      );
    }
    await this.sessionQuestionRepo.remove(sq);
  }

  async activateNext(sessionId: string): Promise<SessionQuestionEntity> {
    await this.findOne(sessionId);

    const allQuestions = await this.sessionQuestionRepo.find({
      where: { sessionId },
      order: { orderIndex: 'ASC' },
    });

    const nextInactive = allQuestions.find((sq) => !sq.isActive);
    if (!nextInactive) {
      throw new BadRequestException('No inactive questions remaining');
    }

    nextInactive.isActive = true;
    nextInactive.activatedAt = new Date();
    const saved = await this.sessionQuestionRepo.save(nextInactive);
    this.wsGateway.emitQuestionsActivated(sessionId, [saved.id]);
    return saved;
  }

  async activateNextCategory(sessionId: string): Promise<SessionQuestionEntity[]> {
    await this.findOne(sessionId);

    const allQuestions = await this.sessionQuestionRepo.find({
      where: { sessionId },
      relations: ['question'],
      order: { orderIndex: 'ASC' },
    });

    // Group by category preserving order
    const categoryOrder: string[] = [];
    const categoryMap = new Map<string, SessionQuestionEntity[]>();
    for (const sq of allQuestions) {
      const cat = sq.question.category;
      if (!categoryMap.has(cat)) {
        categoryOrder.push(cat);
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(sq);
    }

    // Find current active category
    const activeQuestions = allQuestions.filter((sq) => sq.isActive);
    const activeCategory = activeQuestions.length > 0 ? activeQuestions[0].question.category : null;

    // Find next category
    let nextCategory: string | null = null;
    if (activeCategory === null) {
      // No active category, pick the first one
      nextCategory = categoryOrder[0] ?? null;
    } else {
      const currentIdx = categoryOrder.indexOf(activeCategory);
      if (currentIdx < categoryOrder.length - 1) {
        nextCategory = categoryOrder[currentIdx + 1];
      }
    }

    if (!nextCategory) {
      throw new BadRequestException('No next category available');
    }

    // Deactivate all
    await this.sessionQuestionRepo.update(
      { sessionId },
      { isActive: false },
    );

    // Deactivate all and emit
    const deactivatedIds = allQuestions.filter(q => q.isActive).map(q => q.id);
    await this.sessionQuestionRepo.update({ sessionId }, { isActive: false });
    if (deactivatedIds.length) {
      this.wsGateway.emitQuestionsDeactivated(sessionId, deactivatedIds);
    }

    // Activate first question of next category
    const nextCategoryQuestions = categoryMap.get(nextCategory)!;
    const first = nextCategoryQuestions[0];
    first.isActive = true;
    first.activatedAt = new Date();
    await this.sessionQuestionRepo.save(first);
    this.wsGateway.emitQuestionsActivated(sessionId, [first.id]);

    return [first];
  }

  async updateSessionQuestion(
    sessionId: string,
    sqId: string,
    data: { interviewerNote?: string; rating?: number; isActive?: boolean },
  ): Promise<SessionQuestionEntity> {
    const sq = await this.sessionQuestionRepo.findOne({
      where: { id: sqId, sessionId },
    });
    if (!sq) {
      throw new BadRequestException(`Session question ${sqId} not found`);
    }

    if (data.interviewerNote !== undefined) sq.interviewerNote = data.interviewerNote;
    if (data.rating !== undefined) sq.rating = data.rating;
    if (data.isActive !== undefined) {
      sq.isActive = data.isActive;
      if (data.isActive) sq.activatedAt = new Date();
    }

    const saved = await this.sessionQuestionRepo.save(sq);

    // Emit AFTER save so the DB is consistent when candidates refetch
    if (data.isActive !== undefined) {
      if (data.isActive) {
        this.wsGateway.emitQuestionsActivated(sessionId, [sqId]);
      } else {
        this.wsGateway.emitQuestionsDeactivated(sessionId, [sqId]);
      }
    }

    return saved;
  }

  async forceActivate(
    sessionId: string,
    sqId: string,
  ): Promise<SessionQuestionEntity> {
    const session = await this.findOne(sessionId);

    const allQuestions = await this.sessionQuestionRepo.find({
      where: { sessionId },
    });

    // In non-sequential mode, deactivate all other active questions so only one is shown
    if (!session.sequentialMode) {
      const toDeactivate = allQuestions.filter(
        (sq) => sq.isActive && sq.id !== sqId,
      );
      if (toDeactivate.length) {
        await this.sessionQuestionRepo.update(
          { id: In(toDeactivate.map((sq) => sq.id)) },
          { isActive: false },
        );
        this.wsGateway.emitQuestionsDeactivated(
          sessionId,
          toDeactivate.map((sq) => sq.id),
        );
      }
    }

    // Activate the target question
    const target = allQuestions.find((sq) => sq.id === sqId);
    if (!target) {
      throw new BadRequestException(`Session question ${sqId} not found`);
    }
    target.isActive = true;
    target.activatedAt = new Date();
    const saved = await this.sessionQuestionRepo.save(target);
    this.wsGateway.emitQuestionsActivated(sessionId, [saved.id]);
    return saved;
  }

  async reactivateQuestion(
    sessionId: string,
    sessionQuestionId: string,
  ): Promise<SessionQuestionEntity> {
    const sq = await this.sessionQuestionRepo.findOne({
      where: { id: sessionQuestionId, sessionId },
    });
    if (!sq) {
      throw new BadRequestException(
        `Session question ${sessionQuestionId} not found in session ${sessionId}`,
      );
    }

    sq.isActive = true;
    sq.activatedAt = new Date();
    const saved = await this.sessionQuestionRepo.save(sq);
    this.wsGateway.emitQuestionsActivated(sessionId, [saved.id]);
    return saved;
  }

  async bulkToggleQuestions(
    sessionId: string,
    sqIds: string[],
    isActive: boolean,
  ): Promise<{ updated: number }> {
    if (!sqIds.length) return { updated: 0 };

    await this.findOne(sessionId);

    // Only update questions that belong to this session
    const questions = await this.sessionQuestionRepo.find({
      where: { sessionId, id: In(sqIds) },
    });
    if (!questions.length) return { updated: 0 };

    const ids = questions.map((q) => q.id);
    const updateData: Record<string, unknown> = { isActive };
    if (isActive) updateData.activatedAt = new Date();

    await this.sessionQuestionRepo.update({ id: In(ids) }, updateData as any);

    if (isActive) {
      this.wsGateway.emitQuestionsActivated(sessionId, ids);
    } else {
      this.wsGateway.emitQuestionsDeactivated(sessionId, ids);
    }

    return { updated: ids.length };
  }

  async recordAntiCheatEvent(sessionId: string, type: string, metadata?: Record<string, any>) {
    return this.antiCheatEventRepo.save({ sessionId, type, metadata: metadata ?? null });
  }

  async getAntiCheatEvents(sessionId: string) {
    return this.antiCheatEventRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }
}
