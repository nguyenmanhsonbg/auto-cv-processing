import type { AiValidation, ParsedProfile, ProfileSectionScore } from '@interview-assistant/shared';

export function profilePayload(profile?: ParsedProfile | null): ParsedProfile {
  const root = (profile ?? {}) as ParsedProfile & Record<string, unknown>;
  const parsedProfile = asRecord(root.parsedProfile);
  const evaluation = asRecord(root.evaluation);
  const generalCriteria = asRecord(evaluation?.generalCriteria);
  const roleSpecificCriteria = asRecord(evaluation?.roleSpecificCriteria);
  const summary = asRecord(evaluation?.summary);

  // The enrich_profile prompt returns parsedProfile/evaluation as nested objects,
  // while older application records store the canonical fields at the root. Read
  // both shapes so the preview stays consistent across existing and new analyses.
  const normalized = {
    ...parsedProfile,
    ...root,
    aiValidation: root.aiValidation ?? buildAiValidation(generalCriteria, roleSpecificCriteria, summary),
  } as ParsedProfile;

  return normalized;
}

function buildAiValidation(
  generalCriteria: Record<string, unknown> | null,
  roleSpecificCriteria: Record<string, unknown> | null,
  summary: Record<string, unknown> | null,
): AiValidation | undefined {
  if (!generalCriteria && !roleSpecificCriteria && !summary) return undefined;

  const sectionSources: Array<[ProfileSectionScore['section'], unknown]> = [
    ['education', generalCriteria?.education],
    ['workExperience', generalCriteria?.workHistory],
    ['skills', roleSpecificCriteria?.mustHaveSkills],
    ['projects', roleSpecificCriteria?.technicalChallenges],
    ['seniority', generalCriteria?.seniority],
  ];
  const sectionScores: ProfileSectionScore[] = [];
  for (const [section, value] of sectionSources) {
    const record = asRecord(value);
    const score = numberValue(record?.score);
    const label = textValue(record?.label);
    if (score == null || !isProfileScoreLabel(label)) continue;
    sectionScores.push({ section, score, label, ...(textValue(record?.note) ? { note: textValue(record?.note) } : {}) });
  }
  const completenessScore = numberValue(summary?.overallMatchScore);
  const highlights = stringList(summary?.highlights);
  const concerns = stringList(summary?.redFlagsOrGaps);
  const shortSummary = textValue(summary?.shortSummary);

  return {
    completenessScore: completenessScore ?? 0,
    highlights,
    concerns,
    summary: shortSummary ?? '',
    ...(sectionScores.length ? { sectionScores } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => Boolean(textValue(item))).map((item) => textValue(item)!) : [];
}

function isProfileScoreLabel(value: string | undefined): value is ProfileSectionScore['label'] {
  return value === 'Strong' || value === 'Good' || value === 'Fair' || value === 'Weak';
}
