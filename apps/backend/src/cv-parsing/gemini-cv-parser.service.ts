import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
] as const;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TEXT_CHARS = 36_000;
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini 2.5 flash': 'gemini-2.5-flash',
  'gemini 2.5 flash lite': 'gemini-2.5-flash-lite',
  'gemini 3 flash': 'gemini-3-flash',
  'gemini 3.1 flash lite': 'gemini-3.1-flash-lite',
};

export interface GeminiCvParseInput {
  rawText: string;
  parserHints: Record<string, unknown>;
}

export interface GeminiCvParseResult {
  parsedData: Record<string, unknown>;
  parserVersion: string;
  model: string;
  attemptedModels: string[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: unknown;
}

@Injectable()
export class GeminiCvParserService implements OnModuleInit {
  private readonly logger = new Logger(GeminiCvParserService.name);
  private nextModelIndex = 0;
  private rules: any = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      const filePath = path.join(__dirname, 'cv-parsing-rules.yaml');
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        this.rules = YAML.parse(fileContent);
        this.logger.log('Loaded CV parsing rules YAML successfully.');
      } else {
        this.logger.warn(`CV parsing rules YAML not found at ${filePath}. Prompt builder will fall back to hardcoded defaults.`);
      }
    } catch (error) {
      this.logger.error('Failed to load CV parsing rules YAML', error);
    }
  }

  async parseProfile(input: GeminiCvParseInput): Promise<GeminiCvParseResult | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const models = this.getModels();
    const attemptedModels: string[] = [];
    const startIndex = this.nextModelIndex % models.length;
    this.nextModelIndex = (this.nextModelIndex + 1) % models.length;

    for (let offset = 0; offset < models.length; offset += 1) {
      const model = models[(startIndex + offset) % models.length];
      attemptedModels.push(model);

      try {
        const parsedData = await this.callGemini(model, apiKey, input);
        return {
          parsedData,
          parserVersion: `gemini-cv-parser-v1:${model}`,
          model,
          attemptedModels,
        };
      } catch (error) {
        this.logger.warn(
          `Gemini CV parse failed with ${model}: ${this.toSafeErrorMessage(error)}`,
        );
      }
    }

    this.logger.error(`Gemini CV parse failed for all models: ${attemptedModels.join(', ')}`);
    return null;
  }

  private async callGemini(
    model: string,
    apiKey: string,
    input: GeminiCvParseInput,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetch(
        `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: this.buildPrompt(input),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}: ${bodyText.slice(0, 500)}`);
      }

      const payload = JSON.parse(bodyText) as GeminiGenerateContentResponse;
      const content = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!content) {
        throw new Error(`EMPTY_GEMINI_RESPONSE: ${JSON.stringify(payload.promptFeedback ?? null)}`);
      }

      const parsed = this.extractJson(content);
      if (!this.isRecord(parsed)) {
        throw new Error('GEMINI_RESPONSE_NOT_OBJECT');
      }

      return this.normalizeGeminiProfile(parsed, input.rawText);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(input: GeminiCvParseInput) {
    const rawText = input.rawText.slice(0, this.getMaxTextChars());

    const systemInstruction = this.rules?.prompt?.system_instruction ||
      `You are an expert bilingual CV parser for English and Vietnamese resumes.

Return ONLY a valid JSON object. Do not include markdown or explanations.
Do not invent facts. If a field is not present, omit it or use an empty array.`;

    const levelGuidelines = this.rules?.prompt?.level_guidelines
      ? `Level categorization guidelines:\n${this.rules.prompt.level_guidelines}`
      : '';

    const projectExtractionRules = `Project extraction rules:
- Treat every explicitly named product, system, client project, or solution under the same employer as a separate workExperience.projects item, even when the CV does not label it with the word "project".
- Never stop after the first named project. Scan the complete employer section until the next employer or major CV section and include every named project.
- If an employer section contains EDENGUE followed by Viettel HIS, return both as separate projects under that employer.
- Keep employer projects in workExperience[].projects. Reserve top-level projects for personal, academic, freelance, or side projects.`;

    const targetSchema = this.rules?.prompt?.target_schema
      ? JSON.stringify(this.rules.prompt.target_schema, null, 2)
      : `{
  "name": string,
  "email": string,
  "phone": string,
  "birthYear": number,
  "education": string,
  "currentCompany": string,
  "totalYearsExperience": number,
  "experienceByLanguage": { "JavaScript": number },
  "skills": string[],
  "groupedSkills": { "backend": string[], "frontend": string[], "database": string[], "devops": string[], "testing": string[], "other": string[] },
  "techstack": string[],
  "certifications": string[],
  "level": "INTERN" | "FRESHER" | "JUNIOR" | "MIDDLE" | "SENIOR" | "LEAD" | "MANAGER",
  "workExperience": [
    {
      "company": string,
      "startDate": "YYYY-MM or original CV date",
      "endDate": "YYYY-MM or null when current",
      "role": string,
      "startYear": number,
      "endYear": number | null,
      "summary": string,
      "responsibilities": string[],
      "achievements": string[],
      "rawDescription": string,
      "technologies": string[],
      "projects": [
        {
          "name": string,
          "role": string,
          "startYear": number,
          "endYear": number | null,
          "techstack": string[],
          "teamSize": number,
          "scale": string,
          "architecture": string,
          "deployment": string,
          "description": string,
          "responsibilities": string[],
          "achievements": string[],
          "rawDescription": string
        }
      ]
    }
  ],
  "projects": [
    {
      "name": string,
      "role": string,
      "startYear": number,
      "endYear": number | null,
      "techstack": string[],
      "teamSize": number,
      "scale": string,
      "architecture": string,
      "deployment": string,
      "description": string,
      "responsibilities": string[],
      "achievements": string[],
      "rawDescription": string
    }
  ],
  "languages": string[],
  "parseConfidence": number,
  "warnings": string[]
}`;

    return `${systemInstruction}

${levelGuidelines}

${projectExtractionRules}

Work experience extraction rules:
- Extract every employer/workplace mentioned in the CV, most recent first. Do not stop after the first employer or after the first two employers; include internships and short engagements when they are explicitly work experience.
- Scan the complete CV from the work-experience heading until the next major section before writing JSON. Internally count each employer heading and verify that the output contains the same employers.
- A job remains a workExperience item even when it is short, old, marked as an internship, or has fewer bullet points than another job.
- Each employer must be a separate workExperience item with company, companyType, dates, primary role, responsibilities, technologies, and all explicitly named employer projects nested under that employer.
- Preserve the most precise employment dates available in startDate/endDate using YYYY-MM when the CV gives month precision. Use endDate: null for an explicitly current job. Keep startYear/endYear for backward compatibility.
- For each workExperience item, extract what the candidate actually did at that workplace.
- Put day-to-day duties and delivered work in responsibilities as concise bullets.
- Split responsibilities into separate list items. Do not combine many duties into one paragraph.
- If the CV has bullet points under a project or workplace, preserve that structure: one CV bullet becomes one responsibilities item.
- Keep description as a short 1 sentence overview only. Do not put the whole responsibility list into description.
- Put measurable outcomes or awards in achievements.
- Put the closest original CV wording for that workplace in rawDescription. Keep the candidate's wording as much as possible, but remove obvious layout noise.
- Do not invent responsibilities. If the CV only has a title/company and no duties, use empty arrays.
- Project responsibilities belong in projects[].responsibilities, not in projects[].description.
- Keep projects performed for an employer in that employer's workExperience[].projects. Use top-level projects only for personal, academic, freelance, or side projects.
- Do not output "[REDACTED]" placeholders. If a value is unknown or unavailable, omit it or use an empty array.
- Preserve technical terms and product names exactly.
- Never copy a technology from schema examples, instructions, or other candidate-like text. A skill is valid only when the supplied CV text contains direct evidence for it. In particular, do not output Go/Golang unless the CV contains the standalone term "Go" or "Golang"; do not treat MongoDB or URLs as evidence for Go.
- PDF text may contain layout spacing inside words (for example "J a v a" or "S p r i n g B o o t"). Normalize that layout noise mentally before extracting known technology names, but do not turn arbitrary substrings into skills.
- Extract languages separately from technical skills. Preserve the exact proficiency level, certificate name, score, band, or listening/reading breakdown when present. Recognize certificates such as TOEIC, IELTS, TOEFL, HSK, JLPT, Cambridge, and equivalent tests without inventing a score or level.
- Put language evidence in languages as readable strings such as "English - TOEIC 725 (Listening & Reading)" and put the certificate itself in certifications, preserving the exact score/level from the CV. Use an empty array when no language or certificate evidence is present.
- For every workExperience item, also return companyType as one of PRODUCT, OUTSOURCE, STARTUP, or ENTERPRISE. PRODUCT means the company builds its own product/platform; OUTSOURCE means it delivers projects for external clients; STARTUP means a small early-stage company; ENTERPRISE means a large corporation when no more specific classification is evidenced.
- Return aiValidation with completenessScore (0-100), highlights, concerns, summary, and sectionScores for exactly education, workExperience, skills, projects, and seniority. Each section score is 0-10 with label Strong (8-10), Good (6-7), Fair (4-5), or Weak (0-3).
- Return vcsSignals with university, companyType, advancedSkills, technicalChallenges, and seniorRoles. Every signal must include ok and evidence; use false and empty arrays when evidence is missing.
- seniorRoles may include only professional senior/leadership roles with explicit responsibility or scope. Academic or personal project leadership alone is not a senior professional role.
- Return currentCompany as the employer whose endDate is null or whose CV date is explicitly "present/current/nay". Do not select a project or client as currentCompany.
- Calculate totalYearsExperience from non-overlapping employment intervals only. Use the date precision in startDate/endDate, count a current interval through the parse date, and round to one decimal place. If dates are too incomplete, return the best evidence-based value and add a warning.

Target JSON shape:
${targetSchema}

Required profile analysis additions:
{
  "aiValidation": {
    "completenessScore": number,
    "highlights": string[],
    "concerns": string[],
    "summary": string,
    "sectionScores": [{ "section": "education | workExperience | skills | projects | seniority", "score": number, "label": "Strong | Good | Fair | Weak", "note": string }]
  },
  "vcsSignals": {
    "university": { "ok": boolean, "name": string | null, "topMatch": "HUST | UET | PTIT | null", "evidence": string },
    "companyType": { "ok": boolean, "companies": string[], "evidence": string },
    "advancedSkills": { "ok": boolean, "items": [{ "skill": string, "evidence": string }], "evidence": string | null },
    "technicalChallenges": { "ok": boolean, "items": [{ "challenge": string, "projectSize": string | null, "evidence": string }], "evidence": string | null },
    "seniorRoles": { "ok": boolean, "items": [{ "role": string, "projectSize": string | null, "evidence": string }], "evidence": string | null }
  }
}

Regex/parser hints, may be incomplete or wrong:
${JSON.stringify(input.parserHints, null, 2)}

CV text:
${rawText}`;
  }

  private normalizeGeminiProfile(profile: Record<string, unknown>, rawText: string) {
    const normalized = this.sanitizeJsonbValue(profile);
    const record = this.isRecord(normalized) ? normalized : {};
    const workExperience = this.normalizeWorkExperience(record.workExperience);
    const timeline = this.deriveEmploymentSummary(workExperience);

    return this.compactRecord({
      ...record,
      workExperience,
      currentCompany: this.optionalText(record.currentCompany) ?? timeline.currentCompany,
      skills: this.removeUnsupportedGo(this.collectSkills(record), rawText),
      techstack: this.toStringArray(record.techstack),
      certifications: this.toStringArray(record.certifications),
      languages: this.toStringArray(record.languages),
      warnings: this.toStringArray(record.warnings),
      totalYearsExperience: timeline.totalYearsExperience ?? this.toOptionalNumber(record.totalYearsExperience),
      birthYear: this.toOptionalInteger(record.birthYear),
      parseConfidence: this.clampConfidence(record.parseConfidence),
    });
  }

  private normalizeWorkExperience(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => this.isRecord(item));
  }

  private deriveEmploymentSummary(workExperience: Array<Record<string, unknown>>) {
    const current = workExperience.find((entry) =>
      entry.endDate == null || entry.endYear == null || /present|current|now|nay|hiện tại/i.test(String(entry.endDate ?? '')),
    );
    const intervals = workExperience
      .map((entry) => this.toMonthInterval(entry))
      .filter((interval): interval is { start: number; end: number } => interval !== null)
      .sort((a, b) => a.start - b.start);

    if (!intervals.length) return { currentCompany: this.optionalText(current?.company), totalYearsExperience: undefined };

    let totalMonths = 0;
    let mergedStart = intervals[0].start;
    let mergedEnd = intervals[0].end;
    for (const interval of intervals.slice(1)) {
      if (interval.start > mergedEnd) {
        totalMonths += mergedEnd - mergedStart;
        mergedStart = interval.start;
        mergedEnd = interval.end;
      } else {
        mergedEnd = Math.max(mergedEnd, interval.end);
      }
    }
    totalMonths += mergedEnd - mergedStart;

    return {
      currentCompany: this.optionalText(current?.company),
      totalYearsExperience: Math.round((totalMonths / 12) * 10) / 10,
    };
  }

  private toMonthInterval(entry: Record<string, unknown>) {
    const start = this.parseYearMonth(entry.startDate, entry.startYear);
    if (start === null) return null;
    const end = this.parseYearMonth(entry.endDate, entry.endYear) ?? (entry.endDate == null || entry.endYear == null ? this.currentMonthIndex() : null);
    if (end === null || end <= start) return null;
    return { start, end };
  }

  private parseYearMonth(date: unknown, year: unknown) {
    const dateText = this.optionalText(date);
    const dateMatch = dateText?.match(/(19|20)\d{2}(?:[-/]([01]\d))?/);
    const numericYear = this.toOptionalInteger(year);
    const parsedYear = dateMatch ? Number(dateMatch[0].slice(0, 4)) : numericYear;
    if (!parsedYear) return null;
    const month = dateMatch?.[2] ? Number(dateMatch[2]) : 1;
    return parsedYear * 12 + Math.max(0, Math.min(11, month - 1));
  }

  private currentMonthIndex() {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }

  private removeUnsupportedGo(skills: string[], rawText: string) {
    const hasGoEvidence = /(^|[^\p{L}\p{N}])(?:go|golang)([^\p{L}\p{N}]|$)/iu.test(rawText);
    if (hasGoEvidence) return skills;
    return skills.filter((skill) => !/^go(?:lang)?$/iu.test(skill.trim()));
  }

  private collectSkills(record: Record<string, unknown>) {
    const directSkills = this.toStringArray(record.skills) ?? [];
    const techstack = this.toStringArray(record.techstack) ?? [];
    const groupedSkills = this.isRecord(record.groupedSkills)
      ? Object.values(record.groupedSkills).flatMap((value) => this.toStringArray(value) ?? [])
      : [];

    return [...new Set([...directSkills, ...techstack, ...groupedSkills])];
  }

  private extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse((fenced ? fenced[1] : text).trim());
  }

  private getApiKey() {
    return this.optionalText(this.configService.get<string>('GEMINI_API_KEY'));
  }

  private getModels() {
    const configured = this.configService.get<string>('GEMINI_CV_PARSE_MODELS');
    const models = configured
      ?.split(',')
      .map((model) => this.normalizeModelName(model))
      .filter(Boolean);

    return models?.length ? models : [...DEFAULT_GEMINI_MODELS];
  }

  private normalizeModelName(value: string) {
    const normalized = value.trim();
    const aliased = GEMINI_MODEL_ALIASES[normalized.toLowerCase()] ?? normalized;
    return aliased.replace(/^models\//, '');
  }

  private getTimeoutMs() {
    const parsed = Number(this.configService.get<string>('GEMINI_CV_PARSE_TIMEOUT_MS'));
    return Number.isFinite(parsed) && parsed >= 5_000 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  private getMaxTextChars() {
    const parsed = Number(this.configService.get<string>('GEMINI_CV_PARSE_MAX_CHARS'));
    return Number.isFinite(parsed) && parsed >= 2_000 ? parsed : DEFAULT_MAX_TEXT_CHARS;
  }

  private toSafeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message.replace(this.getApiKey() ?? '', '[redacted]');
    return String(error);
  }

  private sanitizeJsonbValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const sanitized = value.replace(/\u0000/g, '').trim();
      return this.isRedactedPlaceholder(sanitized) ? undefined : sanitized;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeJsonbValue(item))
        .filter((item) => item !== undefined && item !== null && item !== '');
    }

    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined && item !== null)
          .map(([key, item]) => ({
            key: key.replace(/\u0000/g, ''),
            value: this.sanitizeJsonbValue(item),
          }))
          .filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== '')
          .map((entry) => [entry.key, entry.value]),
      );
    }

    return value;
  }

  private compactRecord(value: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    );
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) return undefined;
    const strings = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => Boolean(item) && !this.isRedactedPlaceholder(item));
    return strings.length ? [...new Set(strings)] : undefined;
  }

  private toOptionalNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  private toOptionalInteger(value: unknown) {
    const parsed = Math.trunc(typeof value === 'number' ? value : Number(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private clampConfidence(value: unknown) {
    const parsed = this.toOptionalNumber(value);
    if (parsed == null) return undefined;
    if (parsed > 1) return Math.min(100, parsed);
    return Math.round(parsed * 100);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isRedactedPlaceholder(value: string) {
    return /^\[?\s*redacted\s*\]?$/i.test(value);
  }

  private optionalText(value?: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }
}
