import { query } from '@anthropic-ai/claude-agent-sdk';
import { AiEvaluationSuggestion, ParsedProfile, ProfileAnomalyDetection, TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS, PERSONALITY_CATEGORIES } from '@interview-assistant/shared';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { EvaluationEntity } from '../evaluations/entities/evaluation.entity';
import { QuestionEntity } from '../questions/entities/question.entity';
import { PROMPT_DEFAULTS } from './ai-prompts.defaults';
import { AiPromptsService } from './ai-prompts.service';
import { AiModelOverridesService } from './ai-model-overrides.service';

/**
 * Available Claude models with their full identifiers.
 * Users can select specific models per prompt type.
 */
export const AVAILABLE_MODELS = {
  // Opus family (most capable, highest cost)
  'claude-opus-4': 'claude-opus-4-20250514',
  'claude-opus-4.5': 'claude-opus-4-5-20250220',
  'claude-opus-4.6': 'claude-opus-4-6',

  // Sonnet family (balanced performance and cost)
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250220',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-sonnet-3.5': 'claude-3-5-sonnet-20241022',

  // Haiku family (fastest, lowest cost)
  'claude-haiku-4': 'claude-haiku-4-20250415',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
} as const;

type ClaudeModel = string;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  // Cache resolved system prompts for the process lifetime — prompts rarely change
  // and each uncached lookup adds a DB round-trip per request.
  private readonly promptCache = new Map<string, { systemPrompt: string; model: ClaudeModel }>();
  private nextModelIndex = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prompts: AiPromptsService,
    private readonly modelOverrides: AiModelOverridesService,
  ) {
    this.logger.log('AI: using Claude Agent SDK');
  }

  /**
   * Map model identifier from DB to actual model identifier.
   * Supports both legacy shorthand names (sonnet, opus, haiku) and specific model identifiers.
   */
  private resolveModel(model?: string): ClaudeModel {
    if (!model) return AVAILABLE_MODELS['claude-sonnet-4.6'];

    // If it's a full model identifier from AVAILABLE_MODELS, return it directly
    if (model in AVAILABLE_MODELS) {
      return AVAILABLE_MODELS[model as keyof typeof AVAILABLE_MODELS];
    }

    // If it's already a claude-* identifier, return it as-is
    if (model.startsWith('claude-')) {
      return model;
    }

    // Legacy shorthand mappings for backward compatibility
    switch (model.toLowerCase()) {
      case 'haiku':
        return AVAILABLE_MODELS['claude-haiku-4.5'];
      case 'opus':
        return AVAILABLE_MODELS['claude-opus-4.6'];
      case 'sonnet':
        return AVAILABLE_MODELS['claude-sonnet-4.6'];
      default:
        this.logger.warn(`Unknown model: ${model}, falling back to sonnet-4.6`);
        return AVAILABLE_MODELS['claude-sonnet-4.6'];
    }
  }

  /**
   * Strip markdown code fences (```json ... ```) before JSON.parse.
   */
  private extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/s);
    const raw = fenced ? fenced[1].trim() : text.trim();
    return JSON.parse(raw);
  }

  /**
   * Resolve a system prompt by key — returns the DB-overridden prompt if one exists,
   * otherwise falls back to the built-in default. Result is cached in memory so
   * subsequent calls skip the DB round-trip.
   *
   * To force a refresh (e.g. after an admin edits a prompt), restart the process
   * or call clearPromptCache().
   */
  private async getSystemPrompt(key: keyof typeof PROMPT_DEFAULTS): Promise<{ systemPrompt: string; model: ClaudeModel }> {
    if (this.promptCache.has(key)) {
      return this.promptCache.get(key)!;
    }
    const [row, override] = await Promise.all([
      this.prompts.findByKey(key),
      this.modelOverrides.findByKey(key),
    ]);
    const systemPrompt = row?.systemPrompt ?? PROMPT_DEFAULTS[key].systemPrompt;
    const model = this.resolveModel(
      override?.model ?? row?.model ?? PROMPT_DEFAULTS[key].model ?? 'sonnet',
    );
    const resolved = { systemPrompt, model };
    this.promptCache.set(key, resolved);
    return resolved;
  }

  /** Invalidate the prompt cache so updated DB prompts take effect without a restart. */
  clearPromptCache(): void {
    this.promptCache.clear();
    this.logger.log('AI prompt cache cleared');
  }

  /**
   * Send a message to Claude via the Agent SDK.
   * No built-in tools are enabled — pure text generation.
   */
  private async callClaude(
    systemPrompt: string,
    userPrompt: string,
    model: ClaudeModel,
    _maxTokens = 2048,
  ): Promise<string> {
    for await (const message of query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        model,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        maxTurns: 1,
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          throw new Error(`Claude error: ${message.subtype}`);
        }
        return message.result;
      }
    }
    throw new Error('No result received from Claude');
  }

  /**
   * Use Claude to enrich regex-extracted CV data and add an AI validation report.
   * Returns null on any failure so the upload flow degrades gracefully.
   */
  async enrichParsedProfile(
    rawText: string,
    regexResult: Record<string, unknown>,
  ): Promise<ParsedProfile | null> {
    const truncated = rawText.slice(0, 36000);

    const { systemPrompt, model } = await this.getSystemPrompt('enrich_profile');

    const userPrompt = `Regex pre-extraction hints (use as reference, may be inaccurate):
${JSON.stringify(regexResult, null, 2)}

CV Text:
${truncated}`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 1500);
      const parsed = this.extractJson(text) as ParsedProfile;
      return parsed;
    } catch (err) {
      this.logger.error(`enrichParsedProfile failed: ${err}`);
      return null;
    }
  }

  /**
   * Fallback: let Claude read the file directly when the file parser fails
   * (e.g. pdf-parse can't extract text from a scanned/image-only PDF).
   * Uses the Agent SDK's Read tool to access the file on disk.
   */
  async analyzeFileDirectly(filePath: string, mimeType: string): Promise<ParsedProfile | null> {
    const supportedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!supportedTypes.includes(mimeType) && !mimeType.includes('pdf')) {
      this.logger.warn(`analyzeFileDirectly: unsupported mime type ${mimeType}`);
      return null;
    }

    try {
      const { systemPrompt, model } = await this.getSystemPrompt('enrich_profile');

      for await (const message of query({
        prompt: `Read and extract all CV/resume information from the file at: ${filePath}\n\nReturn the result as JSON.`,
        options: {
          systemPrompt,
          model,
          tools: ['Read'],
          allowedTools: ['Read'],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          maxTurns: 5,
        },
      })) {
        if (message.type === 'result') {
          if (message.subtype !== 'success') {
            throw new Error(`Claude error: ${message.subtype}`);
          }
          return this.extractJson(message.result) as ParsedProfile;
        }
      }
      return null;
    } catch (err) {
      this.logger.error(`analyzeFileDirectly failed: ${err}`);
      return null;
    }
  }

  /**
   * Suggest relevant questions from the bank based on candidate profile and target level.
   * Returns [] on any failure.
   */
  async suggestQuestions(
    profile: ParsedProfile,
    targetLevel: string,
    templatePosition: string,
    availableQuestions: QuestionEntity[],
  ): Promise<Array<{ questionId: string; reasoning: string }>> {
    const profileSummary = {
      name: profile.name,
      totalYearsExperience: profile.totalYearsExperience,
      skills: profile.skills?.slice(0, 20),
      techstack: profile.techstack?.slice(0, 20),
      projects: profile.projects?.slice(0, 3).map((p) => ({
        name: p.name,
        role: p.role,
        techstack: p.techstack?.slice(0, 8),
      })),
    };

    const questionList = availableQuestions.map((q) => ({
      id: q.id,
      subcategory: q.subcategory,
      text: q.text.slice(0, 120),
      difficulty: q.difficulty,
    }));

    const { systemPrompt, model } = await this.getSystemPrompt('suggest_questions');

    const userPrompt = `Candidate: ${profileSummary.name || 'Unknown'}, ${profileSummary.totalYearsExperience || '?'} years experience
Target: ${targetLevel} ${templatePosition}
Skills: ${profileSummary.skills?.join(', ') || 'N/A'}
Tech stack: ${profileSummary.techstack?.join(', ') || 'N/A'}
Projects: ${profileSummary.projects?.map((p) => `${p.name} (${p.role}): ${p.techstack?.join(', ')}`).join('; ') || 'N/A'}

Available questions (${questionList.length} total):
${questionList.map((q) => `ID:${q.id} | [${q.subcategory}] ${q.text} | difficulty:${q.difficulty}`).join('\n')}`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 800);
      const parsed = this.extractJson(text) as Array<{
        questionId: string;
        reasoning: string;
      }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.error(`suggestQuestions failed: ${err}`);
      return [];
    }
  }

  /**
   * Generate a Vietnamese evaluation summary from a completed evaluation.
   * Throws InternalServerErrorException on failure (explicit user action).
   */
  async generateEvaluationSummary(
    evaluation: EvaluationEntity,
  ): Promise<string> {
    const ratingLabel = (r?: number): string => {
      switch (r) {
        case 1: return 'Cơ bản';
        case 2: return 'Ứng dụng';
        case 3: return 'Thành thạo';
        case 4: return 'Chuyên gia';
        case 5: return 'Định hướng';
        default: return 'Chưa đánh giá';
      }
    };

    const candidate = evaluation.session?.candidate;

    const technicalSection = evaluation.technicalRatings
      .map((r) => `  ${r.subcategory}: ${ratingLabel(r.rating)}${r.comment ? ` — ${r.comment}` : ''}`)
      .join('\n');

    const personalitySection = evaluation.personalityRatings
      .map((r) => `  ${r.category}: ${ratingLabel(r.rating)}${r.reasoning ? ` — ${r.reasoning}` : ''}`)
      .join('\n');

    const hrSection = evaluation.hrEvaluation
      ? Object.entries(evaluation.hrEvaluation)
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')
      : '  Không có';

    const { systemPrompt, model } = await this.getSystemPrompt('evaluation_summary');

    const userPrompt = `Ứng viên: ${candidate?.name || 'N/A'} — ${candidate?.position || 'N/A'} — ${candidate?.level || 'N/A'}
Kết quả tổng thể: ${evaluation.overallResult}

Đánh giá kỹ thuật:
${technicalSection || '  Không có'}

Đánh giá tính cách:
${personalitySection || '  Không có'}

Đánh giá HR:
${hrSection}

Lương kỳ vọng: ${evaluation.expectedSalary || 'Không có'}
<notes>${evaluation.overallNotes || 'Không có'}</notes>`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 512);
      return text.trim();
    } catch (err) {
      this.logger.error(`generateEvaluationSummary failed: ${err}`);
      throw new InternalServerErrorException(
        'Failed to generate AI summary. Please try again.',
      );
    }
  }

  /**
   * Generate diagnostic survey questions for subcategories not clearly shown in the candidate's profile.
   * Each question includes clickable choices so the interviewer can answer quickly.
   * Returns [] on any failure.
   */
  async generateSurveyQuestions(
    profile: ParsedProfile,
    subcategories: Array<{ category: string; subcategory: string }>,
  ): Promise<Array<{ question: string; category: string; subcategory: string; purpose: string; choices: string[] }>> {
    const profileSummary = {
      name: profile.name,
      totalYearsExperience: profile.totalYearsExperience,
      skills: profile.skills?.slice(0, 30),
      techstack: profile.techstack?.slice(0, 30),
      workExperience: profile.workExperience?.slice(0, 4).map((w) => ({
        company: w.company,
        role: w.role,
        startYear: w.startYear,
        endYear: w.endYear,
      })),
      projects: profile.projects?.slice(0, 4).map((p) => ({
        name: p.name,
        role: p.role,
        techstack: p.techstack?.slice(0, 6),
      })),
    };

    const subcategoryList = subcategories
      .map((s) => `${s.category}::${s.subcategory}`)
      .join('\n');

    const { systemPrompt, model } = await this.getSystemPrompt('generate_survey_questions');

    const userPrompt =
      `Hồ sơ ứng viên:\n${JSON.stringify(profileSummary, null, 2)}\n\n` +
      `Danh sách subcategory cần đánh giá:\n${subcategoryList}`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 2000);
      const parsed = this.extractJson(text) as Array<{
        question: string;
        category: string;
        subcategory: string;
        purpose: string;
        choices: string[];
      }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.error(`generateSurveyQuestions failed: ${err}`);
      return [];
    }
  }

  /**
   * Suggest interview questions from the bank using candidate profile + survey answers.
   * Returns [] on any failure.
   */
  async suggestQuestionsFromSurvey(
    profile: ParsedProfile,
    surveyAnswers: Array<{ question: string; category: string; subcategory: string; answer: string }>,
    availableQuestions: QuestionEntity[],
    targetLevel: string,
    templatePosition: string,
  ): Promise<Array<{ questionId: string; reasoning: string }>> {
    const profileSummary = {
      name: profile.name,
      totalYearsExperience: profile.totalYearsExperience,
      skills: profile.skills?.slice(0, 20),
      techstack: profile.techstack?.slice(0, 20),
    };

    const surveySection = surveyAnswers
      .map((s) => `[${s.category}::${s.subcategory}] Q: ${s.question}\nA: ${s.answer}`)
      .join('\n\n');

    const questionList = availableQuestions.map((q) => ({
      id: q.id,
      subcategory: q.subcategory,
      text: q.text.slice(0, 120),
      difficulty: q.difficulty,
    }));

    const allSubcategories = [...new Set(availableQuestions.map((q) => q.subcategory).filter(Boolean))];

    const { systemPrompt, model } = await this.getSystemPrompt('suggest_questions_from_survey');

    const userPrompt =
      `Ứng viên: ${profileSummary.name || 'Unknown'}, ${profileSummary.totalYearsExperience || '?'} năm kinh nghiệm\n` +
      `Mục tiêu: ${targetLevel} ${templatePosition}\n` +
      `Skills: ${profileSummary.skills?.join(', ') || 'N/A'}\n` +
      `Tech stack: ${profileSummary.techstack?.join(', ') || 'N/A'}\n\n` +
      `<survey_answers>\n${surveySection || 'Không có'}\n</survey_answers>\n\n` +
      `Tất cả subcategory trong ngân hàng câu hỏi (${allSubcategories.length}): ${allSubcategories.join(', ')}\n\n` +
      `Câu hỏi khả dụng (${questionList.length} câu):\n` +
      questionList.map((q) => `ID:${q.id} | [${q.subcategory}] ${q.text} | difficulty:${q.difficulty}`).join('\n');

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 5000);
      const parsed = this.extractJson(text) as Array<{
        questionId: string;
        reasoning: string;
      }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      this.logger.error(`suggestQuestionsFromSurvey failed: ${err}`);
      return [];
    }
  }

  /**
   * Suggest the best next question to ask based on rated and unrated session questions.
   * Returns null on failure so the caller can fall back gracefully.
   */
  async suggestNextQuestion(
    ratedQuestions: Array<{ sqId: string; category: string; subcategory: string; difficulty: number; rating: number; text: string }>,
    unratedQuestions: Array<{ sqId: string; category: string; subcategory: string; difficulty: number; text: string }>,
  ): Promise<{ sessionQuestionId: string; reasoning: string } | null> {
    const { systemPrompt, model } = await this.getSystemPrompt('suggest_next_question');

    const rated = ratedQuestions.map(
      (q) => `ID:${q.sqId} | [${q.category}::${q.subcategory}] difficulty:${q.difficulty} | rating:${q.rating} | ${q.text.slice(0, 80)}`,
    ).join('\n');

    const unrated = unratedQuestions.map(
      (q) => `ID:${q.sqId} | [${q.category}::${q.subcategory}] difficulty:${q.difficulty} | ${q.text.slice(0, 80)}`,
    ).join('\n');

    const userPrompt = `Câu hỏi đã đánh giá (${ratedQuestions.length}):\n${rated || 'Chưa có'}\n\nCâu hỏi chưa đánh giá (${unratedQuestions.length}):\n${unrated}`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 300);
      const parsed = this.extractJson(text) as { sessionQuestionId: string; reasoning: string };
      if (parsed?.sessionQuestionId) return parsed;
      return null;
    } catch (err) {
      this.logger.error(`suggestNextQuestion failed: ${err}`);
      return null;
    }
  }

  /**
   * Analyze session Q&A transcripts and return AI-suggested BM04 ratings.
   * Does NOT persist anything — caller decides whether to save.
   * Throws InternalServerErrorException on failure (explicit user action).
   */
  async generateAiEvaluation(
    evaluation: EvaluationEntity,
    technicalSubcategories: string[],
    personalityCategories: string[],
    surveyAnswers?: Array<{ question: string; category: string; subcategory: string; answer: string }>,
  ): Promise<AiEvaluationSuggestion> {
    const candidate = evaluation.session?.candidate;
    const parsedProfile = candidate?.parsedProfile as ParsedProfile | undefined;

    const qa = (evaluation.session?.questions ?? [])
      .filter((sq) => sq.rating != null)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((sq) =>
        `<question subcategory="${sq.question?.subcategory ?? 'N/A'}" difficulty="${sq.question?.difficulty ?? 1}" rating="${sq.rating}" rating_label="${TECHNICAL_RATING_LABELS[sq.rating as number] ?? sq.rating}">${sq.question?.text ?? '?'}</question>\n` +
        `<answer>${sq.candidateAnswer}</answer>` +
        (sq.interviewerNote ? `\n<interviewer_note>${sq.interviewerNote}</interviewer_note>` : ''),
      )
      .join('\n\n');

    // Category-level ratings set explicitly by interviewer during session
    const categoryRatings = Object.entries(evaluation.session?.categoryRatings ?? {})
      .map(([key, rating]) => {
        const isPersonality = (PERSONALITY_CATEGORIES as readonly string[]).some((cat) => key.startsWith(cat));
        const labels = isPersonality ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS;
        const label = labels[rating as number] ?? rating;
        return `  ${key}: ${rating} (${label})`;
      })
      .join('\n');

    // Candidate parsed profile summary
    const profileLines: string[] = [];
    if (parsedProfile?.totalYearsExperience != null) {
      profileLines.push(`Kinh nghiệm: ${parsedProfile.totalYearsExperience} năm`);
    }
    if (parsedProfile?.experienceByLanguage && Object.keys(parsedProfile.experienceByLanguage).length > 0) {
      const langs = Object.entries(parsedProfile.experienceByLanguage).map(([l, y]) => `${l}(${y}y)`).join(', ');
      profileLines.push(`Ngôn ngữ/framework: ${langs}`);
    }
    if (parsedProfile?.techstack?.length) {
      profileLines.push(`Techstack: ${parsedProfile.techstack.slice(0, 20).join(', ')}`);
    } else if (parsedProfile?.skills?.length) {
      profileLines.push(`Skills: ${parsedProfile.skills.slice(0, 20).join(', ')}`);
    }
    if (parsedProfile?.workExperience?.length) {
      const exp = parsedProfile.workExperience.map((w) =>
        `${w.company ?? '?'} (${w.role ?? '?'}, ${w.startYear ?? '?'}–${w.endYear ?? 'nay'})`
      ).join('; ');
      profileLines.push(`Kinh nghiệm làm việc: ${exp}`);
    }
    if (parsedProfile?.projects?.length) {
      const projs = parsedProfile.projects.slice(0, 5).map((p) =>
        `${p.name ?? '?'}${p.teamSize ? ` (${p.teamSize} người)` : ''}${p.techstack?.length ? ` [${p.techstack.slice(0, 5).join(', ')}]` : ''}`
      ).join('; ');
      profileLines.push(`Dự án: ${projs}`);
    }

    const { systemPrompt, model } = await this.getSystemPrompt('evaluate_session');

    const surveySection = surveyAnswers?.length
      ? `<survey_answers>\n${surveyAnswers.map((s) => `[${s.category}::${s.subcategory}] Q: ${s.question}\nA: ${s.answer}`).join('\n\n')}\n</survey_answers>\n\n`
      : '';

    const userPrompt =
      `Ứng viên: ${candidate?.name ?? 'N/A'} — ${candidate?.position ?? 'N/A'} — ${candidate?.level ?? 'N/A'}\n` +
      `Cấp độ mục tiêu: ${evaluation.session?.targetLevel ?? 'N/A'}\n\n` +
      (profileLines.length > 0 ? `<candidate_profile>\n${profileLines.join('\n')}\n</candidate_profile>\n\n` : '') +
      surveySection +
      (categoryRatings ? `<interviewer_category_ratings>\n${categoryRatings}\n</interviewer_category_ratings>\n\n` : '') +
      `Subcategory cần đánh giá (kỹ thuật + kỹ năng mềm): ${technicalSubcategories.join(', ')}\n` +
      `Category tính cách cần đánh giá: ${personalityCategories.join(', ')}\n\n` +
      `<interview_transcript>\n${qa || 'Không có câu trả lời nào được ghi nhận.'}\n</interview_transcript>`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 3000);
      return this.extractJson(text) as AiEvaluationSuggestion;
    } catch (err) {
      this.logger.error(`generateAiEvaluation failed: ${err}`);
      throw new InternalServerErrorException(
        'Failed to generate AI evaluation. Please try again.',
      );
    }
  }

  /**
   * Detect anomalies in candidate profile (career transitions, skill mismatches,
   * geographic patterns, timeline inconsistencies).
   * Returns null on any failure so the analysis flow degrades gracefully.
   */
  async detectProfileAnomalies(
    profile: ParsedProfile,
  ): Promise<ProfileAnomalyDetection | null> {
    const profileSummary = {
      name: profile.name,
      birthYear: profile.birthYear,
      education: profile.education,
      level: profile.level,
      totalYearsExperience: profile.totalYearsExperience,
      experienceByLanguage: profile.experienceByLanguage,
      skills: profile.skills?.slice(0, 50),
      techstack: profile.techstack?.slice(0, 50),
      workExperience: profile.workExperience?.map((w) => ({
        company: w.company,
        companyType: w.companyType,
        role: w.role,
        startYear: w.startYear,
        endYear: w.endYear,
        projects: w.projects?.slice(0, 5).map((p) => ({
          name: p.name,
          role: p.role,
          startYear: p.startYear,
          endYear: p.endYear,
          techstack: p.techstack?.slice(0, 8),
          teamSize: p.teamSize,
          scale: p.scale,
        })),
      })),
      projects: profile.projects?.slice(0, 10).map((p) => ({
        name: p.name,
        role: p.role,
        startYear: p.startYear,
        endYear: p.endYear,
        techstack: p.techstack?.slice(0, 8),
        teamSize: p.teamSize,
        scale: p.scale,
      })),
    };

    const { systemPrompt, model } = await this.getSystemPrompt('detect_profile_anomalies');

    const userPrompt = `Analyze the following candidate profile for anomalies:

${JSON.stringify(profileSummary, null, 2)}`;

    try {
      const text = await this.callClaude(systemPrompt, userPrompt, model, 2000);
      const parsed = this.extractJson(text) as ProfileAnomalyDetection;

      // Add timestamp
      parsed.analyzedAt = new Date().toISOString();

      return parsed;
    } catch (err) {
      this.logger.error(`detectProfileAnomalies failed: ${err}`);
      return null;
    }
  }

  /**
   * Generate Facebook post content based on ai-facebook-content-promt.yaml rules and JD input.
   */
  async generateFacebookPostContent(jdInput: string): Promise<string> {
    try {
      const yamlPath = join(__dirname, '../assets/seed/ai-facebook-content-promt.yaml');
      const yamlContent = readFileSync(yamlPath, 'utf8');
      const config = parse(yamlContent);

      const systemPrompt = [
        config.role || '',
        `Company Rules:\n${Array.isArray(config.company_rules?.rules) ? config.company_rules.rules.map((r: string) => `- ${r}`).join('\n') : ''}`,
        `Objective:\n${config.objective?.main || ''}\n${Array.isArray(config.objective?.goals) ? config.objective.goals.map((g: string) => `- ${g}`).join('\n') : ''}`,
        `Writing Constraints:\n- Language: ${config.writing_constraints?.language || ''}\n- Word Count: ${config.writing_constraints?.word_count || ''}\n- Tone: ${Array.isArray(config.writing_constraints?.tone) ? config.writing_constraints.tone.join(', ') : ''}\n- Platform Fit: ${Array.isArray(config.writing_constraints?.platform_fit) ? config.writing_constraints.platform_fit.join(', ') : ''}`,
        `Factual Rules:\n${Array.isArray(config.writing_constraints?.factual_rules) ? config.writing_constraints.factual_rules.map((fr: string) => `- ${fr}`).join('\n') : ''}`,
        `Content Selection:\nPriority Order:\n${Array.isArray(config.content_selection_rules?.priority_order) ? config.content_selection_rules.priority_order.map((po: string) => `- ${po}`).join('\n') : ''}`,
        `Negative Rules:\n${Array.isArray(config.negative_rules) ? config.negative_rules.map((nr: string) => `- ${nr}`).join('\n') : ''}`,
        config.final_output_instruction || '',
      ].join('\n\n');

      const template = config.prompt_template || 'JD:\n"""\n{{JD_INPUT}}\n"""';
      const userPrompt = template.replace('{{JD_INPUT}}', jdInput);

      const models = this.getModels();
      const attemptedModels: string[] = [];
      const startIndex = this.nextModelIndex % models.length;
      this.nextModelIndex = (this.nextModelIndex + 1) % models.length;

      let result = '';
      let success = false;
      let lastError: any = null;

      for (let offset = 0; offset < models.length; offset += 1) {
        const model = models[(startIndex + offset) % models.length];
        attemptedModels.push(model);

        try {
          result = await this.callGemini(systemPrompt, userPrompt, model);
          success = true;
          break;
        } catch (error) {
          lastError = error;
          this.logger.warn(
            `Facebook content generation failed with Gemini model ${model}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      if (!success) {
        throw lastError || new Error(`All Gemini models failed: ${attemptedModels.join(', ')}`);
      }

      return result.trim();
    } catch (err) {
      this.logger.error(`generateFacebookPostContent failed: ${err}`);
      throw new InternalServerErrorException('Failed to generate Facebook content via AI');
    }
  }

  /**
   * Helper to retrieve configured Gemini models
   */
  private getModels(): string[] {
    const configured = this.config.get<string>('GEMINI_CV_PARSE_MODELS');
    const DEFAULT_GEMINI_MODELS = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3-flash',
      'gemini-3.1-flash-lite',
    ];
    const GEMINI_MODEL_ALIASES: Record<string, string> = {
      'gemini 2.5 flash': 'gemini-2.5-flash',
      'gemini 2.5 flash lite': 'gemini-2.5-flash-lite',
      'gemini 3 flash': 'gemini-3-flash',
      'gemini 3.1 flash lite': 'gemini-3.1-flash-lite',
    };

    const models = configured
      ?.split(',')
      .map((model) => {
        const normalized = model.trim();
        const aliased = GEMINI_MODEL_ALIASES[normalized.toLowerCase()] ?? normalized;
        return aliased.replace(/^models\//, '');
      })
      .filter(Boolean);

    return models?.length ? models : [...DEFAULT_GEMINI_MODELS];
  }

  /**
   * Helper to make a request to Gemini API (generateContent)
   */
  private async callGemini(
    systemInstruction: string,
    userPrompt: string,
    model = 'gemini-2.5-flash',
  ): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: userPrompt,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: systemInstruction,
            },
          ],
        },
        generationConfig: {
          temperature: 0.7,
        },
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini API error (HTTP ${response.status}): ${bodyText.slice(0, 500)}`);
    }

    const payload = JSON.parse(bodyText);
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return text;
  }
}
