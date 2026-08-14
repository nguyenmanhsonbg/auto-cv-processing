import type { AiValidation, ParsedProfile, ProfileSectionScore } from './types/candidate';

export function profilePayload(profile?: ParsedProfile | null): ParsedProfile {
  const root = (profile ?? {}) as ParsedProfile & Record<string, unknown>;
  const parsedProfile = asRecord(root.parsedProfile);
  const evaluation = asRecord(root.evaluation);
  const generalCriteria = asRecord(evaluation?.generalCriteria);
  const roleSpecificCriteria = asRecord(evaluation?.roleSpecificCriteria);
  const summary = asRecord(evaluation?.summary);

  // New analyses store parsedProfile/evaluation as nested objects; older records store canonical fields at root.
  return {
    ...parsedProfile,
    ...root,
    aiValidation: root.aiValidation ?? buildAiValidation(generalCriteria, roleSpecificCriteria, summary),
  } as ParsedProfile;
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
    const note = textValue(record?.note);
    sectionScores.push({ section, score, label, ...(note ? { note } : {}) });
  }

  return {
    completenessScore: numberValue(summary?.overallMatchScore) ?? 0,
    highlights: stringList(summary?.highlights),
    concerns: stringList(summary?.redFlagsOrGaps),
    summary: textValue(summary?.shortSummary) ?? '',
    ...(sectionScores.length ? { sectionScores } : {}),
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const text = textValue(item);
      return text ? [text] : [];
    })
    : [];
}

function isProfileScoreLabel(value: string | undefined): value is ProfileSectionScore['label'] {
  return value === 'Strong' || value === 'Good' || value === 'Fair' || value === 'Weak';
}
