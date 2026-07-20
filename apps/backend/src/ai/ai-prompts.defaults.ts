import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const facebookContentPrompt = parse(
  readFileSync(join(__dirname, '../assets/seed/ai-facebook-content-promt.yaml'), 'utf8'),
) as {
  name: string;
  role: string;
  company_rules?: { rules?: string[] };
  writing_constraints?: Record<string, unknown>;
  negative_rules?: string[];
  final_output_instruction?: string;
  prompt_template?: string;
};

const facebookSystemPrompt = [
  facebookContentPrompt.role,
  'Company rules:',
  ...(facebookContentPrompt.company_rules?.rules ?? []),
  'Writing constraints:',
  JSON.stringify(facebookContentPrompt.writing_constraints ?? {}),
  'Negative rules:',
  ...(facebookContentPrompt.negative_rules ?? []),
  facebookContentPrompt.final_output_instruction ?? '',
].filter(Boolean).join('\n');

/**
 * Default system prompts loaded from ai-prompts.yaml at startup.
 * Seeds the DB on first run; also used as in-process fallback.
 */
export const PROMPT_DEFAULTS: Record<
  string,
  { name: string; description: string; systemPrompt: string; model?: string; userPromptTemplate?: string }
> = {
  ...parse(readFileSync(join(__dirname, '../assets/seed/ai-prompts.yaml'), 'utf8')),
  ...parse(readFileSync(join(__dirname, '../assets/seed/ai-jd-promts.yaml'), 'utf8')),
  vcs_facebook_recruitment_content_generator: {
    name: facebookContentPrompt.name,
    description: 'Generates a Vietnamese Facebook recruitment post from a job description.',
    systemPrompt: facebookSystemPrompt,
    userPromptTemplate: facebookContentPrompt.prompt_template,
    model: 'gemini-2.5-flash',
  },
};
