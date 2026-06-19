import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SOFT_SKILL_SUBCATEGORIES,
  AiEvaluationSuggestion,
  PERSONALITY_CATEGORIES,
} from '@interview-assistant/shared';
import { EvaluationEntity } from './entities/evaluation.entity';
import { SessionSurveyQuestionEntity } from '../sessions/entities/session-survey-question.entity';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { AiService } from '../ai/ai.service';
import { CategoriesService } from '../categories/categories.service';
import { InterviewWebSocketGateway } from '../websocket/websocket.gateway';

// Categories that feed into dedicated rating arrays and are NOT part of technicalRatings
const NON_TECHNICAL_CATEGORIES = ['SOFT_SKILL', 'PERSONALITY'];

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(EvaluationEntity)
    private readonly evaluationRepo: Repository<EvaluationEntity>,
    @InjectRepository(SessionSurveyQuestionEntity)
    private readonly surveyQuestionRepo: Repository<SessionSurveyQuestionEntity>,
    private readonly aiService: AiService,
    private readonly categoriesService: CategoriesService,
    private readonly wsGateway: InterviewWebSocketGateway,
  ) {}

  async create(
    dto: CreateEvaluationDto,
    evaluatorId: string,
  ): Promise<EvaluationEntity> {
    // Check if evaluation already exists for this session
    const existing = await this.evaluationRepo.findOne({
      where: { sessionId: dto.sessionId },
    });
    if (existing) {
      throw new BadRequestException(
        'Evaluation already exists for this session',
      );
    }

    // Initialize default technical ratings from DB — all subcategories that
    // belong to technical categories (everything except SOFT_SKILL / PERSONALITY)
    const technicalCats = await this.categoriesService.findCategoriesWithSubcategories(
      NON_TECHNICAL_CATEGORIES,
    );
    const defaultTechnicalRatings = technicalCats
      .flatMap(({ subs }) => subs)
      .map((sub) => ({ subcategory: sub.name, comment: undefined, rating: undefined }));

    const defaultSoftSkillRatings = [...SOFT_SKILL_SUBCATEGORIES].map((subcategory) => ({
      subcategory,
      comment: undefined,
      rating: undefined,
    }));

    const evaluation = this.evaluationRepo.create({
      ...dto,
      evaluatorId,
      technicalRatings: dto.technicalRatings || defaultTechnicalRatings,
      softSkillRatings: dto.softSkillRatings || defaultSoftSkillRatings,
    });

    return this.evaluationRepo.save(evaluation);
  }

  async findAll(): Promise<EvaluationEntity[]> {
    return this.evaluationRepo.find({
      relations: ['session', 'session.candidate', 'evaluator'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<EvaluationEntity> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { id },
      relations: ['session', 'session.candidate', 'evaluator'],
    });
    if (!evaluation) {
      throw new BadRequestException(`Evaluation with id ${id} not found`);
    }
    return evaluation;
  }

  async findBySessionId(sessionId: string): Promise<EvaluationEntity> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { sessionId },
      relations: ['session', 'session.candidate', 'evaluator'],
    });
    if (!evaluation) {
      throw new BadRequestException(
        `Evaluation for session ${sessionId} not found`,
      );
    }
    return evaluation;
  }

  async update(
    id: string,
    dto: UpdateEvaluationDto,
  ): Promise<EvaluationEntity> {
    const evaluation = await this.findOne(id);
    Object.assign(evaluation, dto);
    return this.evaluationRepo.save(evaluation);
  }

  async remove(id: string): Promise<void> {
    const evaluation = await this.findOne(id);
    await this.evaluationRepo.remove(evaluation);
  }

  async generateAiSummary(id: string): Promise<EvaluationEntity> {
    // findOne already loads session.candidate relations
    const evaluation = await this.findOne(id);
    this.wsGateway.emitEvalSummaryGenerating(evaluation.sessionId);
    evaluation.aiSummary = await this.aiService.generateEvaluationSummary(evaluation);
    const saved = await this.evaluationRepo.save(evaluation);
    this.wsGateway.emitEvalSummaryReady(evaluation.sessionId, saved.aiSummary);
    return saved;
  }

  async generateAiEvaluation(id: string): Promise<AiEvaluationSuggestion> {
    // Separate findOne with deeper relations to avoid bloating all existing reads
    const evaluation = await this.evaluationRepo.findOne({
      where: { id },
      relations: [
        'session',
        'session.candidate',
        'session.questions',
        'session.questions.question',
      ],
    });
    if (!evaluation) {
      throw new BadRequestException(`Evaluation with id ${id} not found`);
    }
    // Load all categories; exclude only PERSONALITY from technical subs — soft skill subcategories
    // must be included so the AI can suggest ratings for them (frontend routes them to softSkillRatings).
    // Use DB personality subcategory names (not the hardcoded PERSONALITY_CATEGORIES constant) so the
    // names AI returns exactly match the form fields keyed by the same DB subcategory names.
    const allCatsWithSubs = await this.categoriesService.findCategoriesWithSubcategories([]);
    const personalityCat = allCatsWithSubs.find(({ category }) => category.name === 'PERSONALITY');
    const personalityCatNames = personalityCat?.subs.map((s) => s.name) ?? [...PERSONALITY_CATEGORIES];
    const nonPersonalityCats = allCatsWithSubs.filter(({ category }) => category.name !== 'PERSONALITY');
    const technicalSubcategoryNames = nonPersonalityCats.flatMap(({ subs }) => subs.map((s) => s.name));

    // Load answered survey questions to give AI context on candidate's stated experience per subcategory
    const surveyRows = await this.surveyQuestionRepo.find({
      where: { sessionId: evaluation.sessionId },
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

    // Build the set of SOFT_SKILL subcategory names so we can route AI ratings correctly
    const softSkillCat = allCatsWithSubs.find(({ category }) => category.name === 'SOFT_SKILL');
    const softSkillSubNames = new Set(softSkillCat?.subs.map((s) => s.name) ?? []);

    // Persist 'analyzing' status before starting so a page reload can restore the spinner
    evaluation.aiAnalysisStatus = 'analyzing';
    await this.evaluationRepo.save(evaluation);
    this.wsGateway.emitEvalAnalyzing(evaluation.sessionId);

    try {
      const suggestion = await this.aiService.generateAiEvaluation(
        evaluation,
        technicalSubcategoryNames,
        personalityCatNames,
        surveyAnswers.length ? surveyAnswers : undefined,
      );
      evaluation.aiEvaluationSuggestion = suggestion;

      // Apply AI suggestions directly to the evaluation fields so the frontend does not need
      // to POST a separate PUT request after receiving the AI analysis response.
      evaluation.overallResult = suggestion.overallResult as any;
      if (suggestion.overallNotes) evaluation.overallNotes = suggestion.overallNotes;
      if (suggestion.overallNotes) evaluation.zoneExplanation = suggestion.overallNotes;
      if (suggestion.finalLevel) evaluation.finalLevel = suggestion.finalLevel;
      if (suggestion.finalZone) evaluation.finalZone = suggestion.finalZone as any;
      if (suggestion.finalSubZone) evaluation.finalSubZone = suggestion.finalSubZone as any;

      // Merge AI technical and soft-skill ratings into existing arrays (preserve interviewer overrides)
      const techMap = new Map((evaluation.technicalRatings ?? []).map((r) => [r.subcategory, r]));
      const softMap = new Map((evaluation.softSkillRatings ?? []).map((r) => [r.subcategory, r]));
      suggestion.technicalRatings.forEach(({ subcategory, suggestedRating, reasoning }) => {
        if (softSkillSubNames.has(subcategory)) {
          softMap.set(subcategory, { subcategory, rating: suggestedRating as any, comment: reasoning });
        } else {
          techMap.set(subcategory, { subcategory, rating: suggestedRating as any, comment: reasoning });
        }
      });
      evaluation.technicalRatings = Array.from(techMap.values());
      evaluation.softSkillRatings = Array.from(softMap.values());

      // Merge personality ratings
      const persMap = new Map((evaluation.personalityRatings ?? []).map((r) => [r.category, r]));
      suggestion.personalityRatings.forEach(({ category, suggestedRating, reasoning }) => {
        persMap.set(category, { category, rating: suggestedRating as any, reasoning });
      });
      evaluation.personalityRatings = Array.from(persMap.values());

      evaluation.aiAnalysisStatus = 'completed';
      await this.evaluationRepo.save(evaluation);
      this.wsGateway.emitEvalAnalysisReady(evaluation.sessionId, suggestion);
      return suggestion;
    } catch (err) {
      evaluation.aiAnalysisStatus = 'failed';
      await this.evaluationRepo.save(evaluation);
      throw err;
    }
  }
}
