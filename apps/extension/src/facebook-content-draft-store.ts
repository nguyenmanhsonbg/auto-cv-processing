import type { AmisJobSnapshot } from './types';

export type FacebookContentDraftSource = 'AI' | 'TEMPLATE' | 'CUSTOM';

export interface FacebookContentDraft {
  content: string;
  source: FacebookContentDraftSource;
  recruitmentId?: string | null;
  tabId?: number | null;
  pageUrl?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionTitle?: string | null;
  snapshotTitle: string;
  snapshotFingerprint: string;
  updatedAt: string;
}

const FACEBOOK_DRAFT_BY_RECRUITMENT_PREFIX = 'vcs:facebook-content-draft:recruitment:';
const FACEBOOK_DRAFT_BY_SNAPSHOT_PREFIX = 'vcs:facebook-content-draft:snapshot:';
const FACEBOOK_DRAFT_BY_TAB_PREFIX = 'vcs:facebook-content-draft:tab:';
const FACEBOOK_DRAFT_BY_JOB_DESCRIPTION_PREFIX = 'vcs:facebook-content-draft:job-description:';
const LAST_FACEBOOK_DRAFT_KEY = 'vcs:facebook-content-draft:last';
const LAST_DRAFT_MAX_AGE_MS = 10 * 60 * 1000;

export async function saveFacebookContentDraft(input: {
  content: string;
  source: FacebookContentDraftSource;
  recruitmentId?: string | null;
  tabId?: number | null;
  pageUrl?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionTitle?: string | null;
  snapshot: AmisJobSnapshot;
}) {
  const content = input.content.trim();
  if (!content) return;

  const draft: FacebookContentDraft = {
    content,
    source: input.source,
    recruitmentId: input.recruitmentId ?? null,
    tabId: typeof input.tabId === 'number' ? input.tabId : null,
    pageUrl: input.pageUrl ?? null,
    jobDescriptionId: input.jobDescriptionId ?? null,
    jobDescriptionTitle: input.jobDescriptionTitle ?? null,
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
  if (typeof draft.tabId === 'number') {
    values[buildTabDraftKey(draft.tabId)] = draft;
  }
  if (draft.jobDescriptionId) {
    values[buildJobDescriptionDraftKey(draft.jobDescriptionId)] = draft;
  }

  if (draft.source !== 'CUSTOM') {
    const existingValues = await chrome.storage?.session?.get(Object.keys(values));
    if (Object.values(existingValues ?? {}).some((value) => isProtectedCustomDraft(value, draft))) {
      return;
    }
  }

  await chrome.storage?.session?.set(values);
}

export async function getFacebookContentDraft(input: {
  recruitmentId?: string | null;
  tabId?: number | null;
  jobDescriptionId?: string | null;
  snapshot: AmisJobSnapshot;
}) {
  const keys = [
    ...(typeof input.tabId === 'number' ? [buildTabDraftKey(input.tabId)] : []),
    ...(input.jobDescriptionId ? [buildJobDescriptionDraftKey(input.jobDescriptionId)] : []),
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
    && (!input.jobDescriptionId || !lastDraft.jobDescriptionId || lastDraft.jobDescriptionId === input.jobDescriptionId)
    && normalizeDraftText(lastDraft.snapshotTitle) === normalizeDraftText(input.snapshot.title)
  ) {
    return lastDraft;
  }

  return null;
}

export async function clearFacebookContentDraft(input: {
  recruitmentId?: string | null;
  tabId?: number | null;
  jobDescriptionId?: string | null;
  snapshot?: AmisJobSnapshot | null;
}) {
  const keys = [
    LAST_FACEBOOK_DRAFT_KEY,
    ...(typeof input.tabId === 'number' ? [buildTabDraftKey(input.tabId)] : []),
    ...(input.jobDescriptionId ? [buildJobDescriptionDraftKey(input.jobDescriptionId)] : []),
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

function buildTabDraftKey(tabId: number) {
  return `${FACEBOOK_DRAFT_BY_TAB_PREFIX}${tabId}`;
}

function buildJobDescriptionDraftKey(jobDescriptionId: string) {
  return `${FACEBOOK_DRAFT_BY_JOB_DESCRIPTION_PREFIX}${jobDescriptionId}`;
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
    && ['AI', 'TEMPLATE', 'CUSTOM'].includes((value as { source?: unknown }).source as string)
    && typeof (value as { snapshotTitle?: unknown }).snapshotTitle === 'string'
    && typeof (value as { snapshotFingerprint?: unknown }).snapshotFingerprint === 'string';
}

function isRecentDraft(draft: FacebookContentDraft) {
  const updatedAt = Date.parse(draft.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= LAST_DRAFT_MAX_AGE_MS;
}

function isProtectedCustomDraft(value: unknown, nextDraft: FacebookContentDraft) {
  if (!isFacebookContentDraft(value) || value.source !== 'CUSTOM' || !isRecentDraft(value)) return false;
  if (value.jobDescriptionId && nextDraft.jobDescriptionId && value.jobDescriptionId === nextDraft.jobDescriptionId) {
    return true;
  }
  if (value.recruitmentId && nextDraft.recruitmentId && value.recruitmentId === nextDraft.recruitmentId) {
    return true;
  }
  if (value.snapshotFingerprint === nextDraft.snapshotFingerprint) return true;
  return typeof value.tabId === 'number'
    && typeof nextDraft.tabId === 'number'
    && value.tabId === nextDraft.tabId
    && normalizeDraftText(value.snapshotTitle) === normalizeDraftText(nextDraft.snapshotTitle);
}

function normalizeDraftText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
