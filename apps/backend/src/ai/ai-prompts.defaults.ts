import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/**
 * Default system prompts loaded from ai-prompts.yaml at startup.
 * Seeds the DB on first run; also used as in-process fallback.
 */
export const PROMPT_DEFAULTS: Record<
  string,
  { name: string; description: string; systemPrompt: string; model?: string }
> = parse(readFileSync(join(__dirname, '../assets/seed/ai-prompts.yaml'), 'utf8'));
