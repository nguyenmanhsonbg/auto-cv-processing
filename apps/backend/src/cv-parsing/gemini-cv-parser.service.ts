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

      return this.normalizeGeminiProfile(parsed);
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

    const targetSchema = this.rules?.prompt?.target_schema
      ? JSON.stringify(this.rules.prompt.target_schema, null, 2)
      : `{
  "name": string,
  "email": string,
  "phone": string,
  "birthYear": number,
  "education": string,
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

Work experience extraction rules:
- For each workExperience item, extract what the candidate actually did at that workplace.
- Put day-to-day duties and delivered work in responsibilities as concise bullets.
- Split responsibilities into separate list items. Do not combine many duties into one paragraph.
- If the CV has bullet points under a project or workplace, preserve that structure: one CV bullet becomes one responsibilities item.
- Keep description as a short 1 sentence overview only. Do not put the whole responsibility list into description.
- Put measurable outcomes or awards in achievements.
- Put the closest original CV wording for that workplace in rawDescription. Keep the candidate's wording as much as possible, but remove obvious layout noise.
- Do not invent responsibilities. If the CV only has a title/company and no duties, use empty arrays.
- Project responsibilities belong in projects[].responsibilities, not in projects[].description.
- Do not output "[REDACTED]" placeholders. If a value is unknown or unavailable, omit it or use an empty array.
- Preserve technical terms and product names exactly.

Target JSON shape:
${targetSchema}

Regex/parser hints, may be incomplete or wrong:
${JSON.stringify(input.parserHints, null, 2)}

CV text:
${rawText}`;
  }

  private normalizeGeminiProfile(profile: Record<string, unknown>) {
    const normalized = this.sanitizeJsonbValue(profile);
    const record = this.isRecord(normalized) ? normalized : {};

    return this.compactRecord({
      ...record,
      skills: this.toStringArray(record.skills),
      techstack: this.toStringArray(record.techstack),
      certifications: this.toStringArray(record.certifications),
      languages: this.toStringArray(record.languages),
      warnings: this.toStringArray(record.warnings),
      totalYearsExperience: this.toOptionalNumber(record.totalYearsExperience),
      birthYear: this.toOptionalInteger(record.birthYear),
      parseConfidence: this.clampConfidence(record.parseConfidence),
    });
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

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
