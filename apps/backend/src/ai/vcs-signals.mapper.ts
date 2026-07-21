import type { VcsSignals } from '@interview-assistant/shared';

type AnyRecord = Record<string, unknown>;

export function normalizeVcsSignals(input: unknown): VcsSignals {
  const root = asRecord(input);
  const parsedProfile = asRecord(root?.parsedProfile);
  const explicit = asRecord(root?.vcsSignals) ?? asRecord(parsedProfile?.vcsSignals);
  const evaluation = asRecord(root?.evaluation);
  const generalCriteria = asRecord(evaluation?.generalCriteria);
  const roleSpecificCriteria = asRecord(evaluation?.roleSpecificCriteria);

  return {
    university: normalizeUniversity(
      asRecord(explicit?.university),
      asRecord(generalCriteria?.education),
      parsedProfile,
    ),
    companyType: normalizeCompanyType(
      asRecord(explicit?.companyType),
      asRecord(generalCriteria?.workHistory),
      parsedProfile,
    ),
    advancedSkills: normalizeAdvancedSkills(
      asRecord(explicit?.advancedSkills),
      asRecord(roleSpecificCriteria?.advancedSkills),
    ),
    technicalChallenges: normalizeTechnicalChallenges(
      asRecord(explicit?.technicalChallenges),
      asRecord(roleSpecificCriteria?.technicalChallenges),
    ),
    seniorRoles: normalizeSeniorRoles(
      asRecord(explicit?.seniorRoles),
      asRecord(generalCriteria?.seniority),
      parsedProfile,
    ),
  };
}

function normalizeUniversity(
  explicit: AnyRecord | null,
  legacy: AnyRecord | null,
  profile: AnyRecord | null,
): VcsSignals['university'] {
  const evidence = text(explicit?.evidence) ?? text(legacy?.note) ?? '';
  const name = text(explicit?.name) ?? text(profile?.education);
  const topMatch = toTopUniversity(explicit?.topMatch);
  const result: VcsSignals['university'] = {
    ok: booleanOr(explicit?.ok, booleanValue(legacy?.isTopVNUniversity) ?? scoreAtLeast(legacy?.score, 8)),
    evidence,
  };

  if (name) result.name = name;
  if (topMatch) result.topMatch = topMatch;
  return result;
}

function normalizeCompanyType(
  explicit: AnyRecord | null,
  legacy: AnyRecord | null,
  profile: AnyRecord | null,
): VcsSignals['companyType'] {
  const evidence = text(explicit?.evidence) ?? text(legacy?.note) ?? '';
  const companies = strings(explicit?.companies) ?? productCompanies(profile?.companies);
  const result: VcsSignals['companyType'] = {
    ok: booleanOr(
      explicit?.ok,
      booleanValue(legacy?.hasProductCompanyExp) ?? (Boolean(companies?.length) || scoreAtLeast(legacy?.score, 8)),
    ),
    evidence,
  };

  if (companies?.length) result.companies = companies;
  return result;
}

function normalizeAdvancedSkills(
  explicit: AnyRecord | null,
  legacy: AnyRecord | null,
): VcsSignals['advancedSkills'] {
  const evidence = text(explicit?.evidence) ?? text(legacy?.note) ?? '';
  const items = normalizeSkillItems(explicit?.items) ??
    strings(legacy?.matched)?.map((skill) => ({ skill, evidence }));
  const result: VcsSignals['advancedSkills'] = {
    ok: booleanOr(explicit?.ok, Boolean(items?.length) || scoreAtLeast(legacy?.score, 6)),
    evidence,
  };

  if (items?.length) result.items = items;
  return result;
}

function normalizeTechnicalChallenges(
  explicit: AnyRecord | null,
  legacy: AnyRecord | null,
): VcsSignals['technicalChallenges'] {
  const evidence = text(explicit?.evidence) ?? text(legacy?.note) ?? '';
  const items = normalizeChallengeItems(explicit?.items) ??
    strings(legacy?.evidenceFound)?.map((challenge) => ({ challenge, evidence }));
  const result: VcsSignals['technicalChallenges'] = {
    ok: booleanOr(explicit?.ok, Boolean(items?.length) || scoreAtLeast(legacy?.score, 6)),
    evidence,
  };

  if (items?.length) result.items = items;
  return result;
}

function normalizeSeniorRoles(
  explicit: AnyRecord | null,
  legacy: AnyRecord | null,
  profile: AnyRecord | null,
): VcsSignals['seniorRoles'] {
  const evidence = text(explicit?.evidence) ?? text(legacy?.note) ?? '';
  // Senior roles must come from explicit AI evidence. Inferring seniority from
  // every work-experience title creates false positives without scope or context.
  const items = normalizeRoleItems(explicit?.items);
  const result: VcsSignals['seniorRoles'] = {
    ok: booleanOr(explicit?.ok, Boolean(items?.length) || scoreAtLeast(legacy?.score, 6)),
    evidence,
  };

  if (items?.length) result.items = items;
  return result;
}

function normalizeItemRecords(
  value: unknown,
  labelKey: 'skill' | 'challenge' | 'role',
): AnyRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item) => {
      const record = asRecord(item);
      const label = text(record?.[labelKey]);
      if (!label) return null;
      const result: AnyRecord = {
        [labelKey]: label,
        evidence: text(record?.evidence) ?? '',
      };
      const projectSize = text(record?.projectSize);
      if (projectSize) result.projectSize = projectSize;
      return result;
    })
    .filter((item): item is AnyRecord => item !== null);

  return items.length ? items : undefined;
}

function normalizeSkillItems(value: unknown): VcsSignals['advancedSkills']['items'] | undefined {
  return normalizeItemRecords(value, 'skill') as VcsSignals['advancedSkills']['items'] | undefined;
}

function normalizeChallengeItems(value: unknown): VcsSignals['technicalChallenges']['items'] | undefined {
  return normalizeItemRecords(value, 'challenge') as VcsSignals['technicalChallenges']['items'] | undefined;
}

function normalizeRoleItems(value: unknown): VcsSignals['seniorRoles']['items'] | undefined {
  return normalizeItemRecords(value, 'role') as VcsSignals['seniorRoles']['items'] | undefined;
}

function productCompanies(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const companies = value
    .map((item) => {
      const record = asRecord(item);
      return record?.type === 'PRODUCT' ? text(record.name) : null;
    })
    .filter((name): name is string => Boolean(name));

  return companies.length ? [...new Set(companies)] : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return result.length ? [...new Set(result)] : undefined;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function scoreAtLeast(value: unknown, minimum: number): boolean {
  const score = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(score) && score >= minimum;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toTopUniversity(value: unknown): VcsSignals['university']['topMatch'] {
  return value === 'HUST' || value === 'UET' || value === 'PTIT' ? value : undefined;
}

function asRecord(value: unknown): AnyRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as AnyRecord
    : null;
}
