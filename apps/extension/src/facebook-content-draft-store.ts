import type { AmisJobSnapshot } from './types';

export type FacebookContentDraftSource = 'AI' | 'CUSTOM';

export interface FacebookContentDraft {
  content: string;
  source: FacebookContentDraftSource;
  recruitmentId?: string | null;
  snapshotTitle: string;
  snapshotFingerprint: string;
  updatedAt: string;
}

const FACEBOOK_DRAFT_BY_RECRUITMENT_PREFIX = 'vcs:facebook-content-draft:recruitment:';
const FACEBOOK_DRAFT_BY_SNAPSHOT_PREFIX = 'vcs:facebook-content-draft:snapshot:';
const LAST_FACEBOOK_DRAFT_KEY = 'vcs:facebook-content-draft:last';
const LAST_DRAFT_MAX_AGE_MS = 10 * 60 * 1000;

export async function saveFacebookContentDraft(input: {
  content: string;
  source: FacebookContentDraftSource;
  recruitmentId?: string | null;
  snapshot: AmisJobSnapshot;
}) {
  const content = input.content.trim();
  if (!content) return;

  const draft: FacebookContentDraft = {
    content,
    source: input.source,
    recruitmentId: input.recruitmentId ?? null,
    snapshotTitle: input.snapshot.title,
    snapshotFingerprint: buildFacebookDraftSnapshotFingerprint(input.snapshot),
    updatedAt: new Date().toISOString(),
  };

  const values: Record<string, FacebookContentDraft> = {
    [LAST_FACEBOOK_DRAFT_KEY]: draft,
    [buildSnapshotDraftKey(draft.snapshotFingerprint)]: draft,
  };
  if (draft.recruitmentId) {
    values[buildRecruitmentDraftKey(draft.recruitmentId)] = draft;
  }

  await chrome.storage?.session?.set(values);
}

export async function getFacebookContentDraft(input: {
  recruitmentId?: string | null;
  snapshot: AmisJobSnapshot;
}) {
  const keys = [
    ...(input.recruitmentId ? [buildRecruitmentDraftKey(input.recruitmentId)] : []),
    buildSnapshotDraftKey(buildFacebookDraftSnapshotFingerprint(input.snapshot)),
  ];
  const values = await chrome.storage?.session?.get(keys);
  for (const key of keys) {
    const draft = values?.[key];
    if (isFacebookContentDraft(draft)) return draft;
  }

  const lastValues = await chrome.storage?.session?.get(LAST_FACEBOOK_DRAFT_KEY);
  const lastDraft = lastValues?.[LAST_FACEBOOK_DRAFT_KEY];
  if (
    isFacebookContentDraft(lastDraft)
    && isRecentDraft(lastDraft)
    && (!input.recruitmentId || !lastDraft.recruitmentId || lastDraft.recruitmentId === input.recruitmentId)
    && normalizeDraftText(lastDraft.snapshotTitle) === normalizeDraftText(input.snapshot.title)
  ) {
    return lastDraft;
  }

  return null;
}

export async function clearFacebookContentDraft(input: {
  recruitmentId?: string | null;
  snapshot?: AmisJobSnapshot | null;
}) {
  const keys = [
    LAST_FACEBOOK_DRAFT_KEY,
    ...(input.recruitmentId ? [buildRecruitmentDraftKey(input.recruitmentId)] : []),
    ...(input.snapshot ? [buildSnapshotDraftKey(buildFacebookDraftSnapshotFingerprint(input.snapshot))] : []),
  ];
  if (keys.length) await chrome.storage?.session?.remove(keys);
}

export function buildFacebookDraftSnapshotFingerprint(snapshot: AmisJobSnapshot) {
  return [
    snapshot.title,
    snapshot.description,
    snapshot.requirements.rawText,
    snapshot.deadline ?? '',
  ].join('|');
}

function buildRecruitmentDraftKey(recruitmentId: string) {
  return `${FACEBOOK_DRAFT_BY_RECRUITMENT_PREFIX}${recruitmentId}`;
}

function buildSnapshotDraftKey(snapshotFingerprint: string) {
  return `${FACEBOOK_DRAFT_BY_SNAPSHOT_PREFIX}${hashString(snapshotFingerprint)}`;
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function isFacebookContentDraft(value: unknown): value is FacebookContentDraft {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { content?: unknown }).content === 'string'
    && ((value as { source?: unknown }).source === 'AI' || (value as { source?: unknown }).source === 'CUSTOM')
    && typeof (value as { snapshotTitle?: unknown }).snapshotTitle === 'string'
    && typeof (value as { snapshotFingerprint?: unknown }).snapshotFingerprint === 'string';
}

function isRecentDraft(draft: FacebookContentDraft) {
  const updatedAt = Date.parse(draft.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= LAST_DRAFT_MAX_AGE_MS;
}

function normalizeDraftText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
