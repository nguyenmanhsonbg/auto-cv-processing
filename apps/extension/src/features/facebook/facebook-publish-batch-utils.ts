import { parseFacebookGroupPostUrl } from './facebook-post-url.ts';

export interface FacebookCrosspostNotificationResult {
  groupId: string;
  externalPostId: string;
  externalPostUrl: string;
  facebookReviewStatus: 'POSTED';
  createdAtMs: number | null;
}

export interface FacebookCrosspostSearchGroup {
  groupId: string;
  name: string;
}

export function matchesFacebookUiLabel(value: string, expected: string) {
  const normalize = (text: string) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedValue = normalize(value);
  const normalizedExpected = normalize(expected);
  return Boolean(normalizedExpected)
    && (normalizedValue === normalizedExpected || normalizedValue.includes(normalizedExpected));
}

export function matchesFacebookSubmitLabel(value: string) {
  const normalize = (text: string) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return new Set([
    'post',
    'dang',
    'post post',
    'dang dang',
    'post to group',
    'dang bai',
    'dang tin',
    'dang len nhom',
    'dang vao nhom',
  ]).has(normalize(value));
}

export function matchesFacebookGroupPickerLabel(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized.includes('them nhom');
}

export function findFirstFacebookSelectableCandidate<T>(
  candidates: readonly T[],
  isSelectable: (candidate: T) => boolean,
) {
  return candidates.find(isSelectable) ?? null;
}

type FacebookBatchTargetReference = {
  targetExternalId?: string | null;
};

type FacebookRecord = Record<string, unknown>;

export function createFacebookBatchSelection<T extends FacebookBatchTargetReference>(
  targets: readonly T[],
): { anchor: T; crosspostTargets: T[] } | null {
  if (targets.length < 2) return null;
  if (targets.some((target) => !target.targetExternalId?.trim())) return null;

  const anchor = targets[0];
  if (!anchor) return null;

  const seenGroupIds = new Set<string>([anchor.targetExternalId!.trim()]);
  const crosspostTargets = targets.slice(1).filter((target) => {
    const groupId = target.targetExternalId?.trim();
    if (!groupId || seenGroupIds.has(groupId)) return false;
    seenGroupIds.add(groupId);
    return true;
  });

  return { anchor, crosspostTargets };
}

export function parseFacebookCrosspostNotifications(
  body: string,
  options: {
    selectedGroupIds: string[];
    submittedAtMs: number;
  },
): FacebookCrosspostNotificationResult[] {
  const selectedGroupIds = new Set(
    options.selectedGroupIds.map((groupId) => groupId.trim()).filter(Boolean),
  );
  if (selectedGroupIds.size === 0) return [];

  const candidates: FacebookCrosspostNotificationResult[] = [];
  for (const payload of parseFacebookJsonResponses(body)) {
    walkFacebookRecord(payload, (record) => {
      if (record.notif_type !== 'group_crossposting_published') return;

      const tracking = parseTracking(record.tracking);
      const dedupParts = readDedupKey(tracking?.dedup_key);
      const url = readString(record.url);
      const parsedUrl = parseFacebookGroupPostUrl(url);
      const groupId = dedupParts?.groupId
        ?? readNotificationGroupId(record)
        ?? parsedUrl?.groupId
        ?? null;
      const externalPostId = dedupParts?.postId
        ?? parsedUrl?.postId
        ?? null;
      const createdAtMs = readNotificationCreatedAtMs(record, tracking);

      if (!groupId || !externalPostId || createdAtMs === null) return;
      if (!selectedGroupIds.has(groupId) || createdAtMs < options.submittedAtMs) return;

      candidates.push({
        groupId,
        externalPostId,
        externalPostUrl: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${externalPostId}/`,
        facebookReviewStatus: 'POSTED',
        createdAtMs,
      });
    });
  }

  const newestByGroup = new Map<string, FacebookCrosspostNotificationResult>();
  for (const candidate of candidates) {
    const existing = newestByGroup.get(candidate.groupId);
    if (!existing || (candidate.createdAtMs ?? 0) > (existing.createdAtMs ?? 0)) {
      newestByGroup.set(candidate.groupId, candidate);
    }
  }

  return [...newestByGroup.values()].sort((left, right) => (
    options.selectedGroupIds.indexOf(left.groupId) - options.selectedGroupIds.indexOf(right.groupId)
  ));
}

export function parseFacebookCrosspostSearchGroups(body: string): FacebookCrosspostSearchGroup[] {
  const groups = new Map<string, FacebookCrosspostSearchGroup>();
  for (const payload of parseFacebookJsonResponses(body)) {
    walkFacebookRecord(payload, (record) => {
      const groupId = readString(record.id);
      const name = readString(record.name);
      if (!groupId || !/^\d{5,}$/.test(groupId) || !name) return;
      groups.set(groupId, { groupId, name });
    });
  }
  return [...groups.values()];
}

function parseFacebookJsonResponses(body: string): unknown[] {
  const candidates = [body, ...body.split(/\r?\n/)].map((value) => (
    value.trim().replace(/^for\s*\(;;\);/, '')
  )).filter(Boolean);
  const parsed: unknown[] = [];

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (!parsed.some((existing) => JSON.stringify(existing) === JSON.stringify(value))) {
        parsed.push(value);
      }
    } catch {
      // Facebook can send non-JSON lines around the GraphQL payload.
    }
  }

  return parsed;
}

function walkFacebookRecord(value: unknown, visitor: (record: FacebookRecord) => void) {
  if (Array.isArray(value)) {
    value.forEach((child) => walkFacebookRecord(child, visitor));
    return;
  }
  if (!isFacebookRecord(value)) return;

  visitor(value);
  Object.values(value).forEach((child) => walkFacebookRecord(child, visitor));
}

function parseTracking(value: unknown): FacebookRecord | null {
  if (isFacebookRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isFacebookRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readDedupKey(value: unknown) {
  if (typeof value !== 'string') return null;
  const [groupId, postId] = value.split('|').map((part) => part.trim());
  if (!groupId || !postId) return null;
  return { groupId, postId };
}

function readNotificationGroupId(record: FacebookRecord): string | null {
  const fromUids = parseTracking(record.tracking)?.from_uids;
  if (isFacebookRecord(fromUids)) {
    const firstGroupId = Object.keys(fromUids).find((key) => /^\d{5,}$/.test(key));
    if (firstGroupId) return firstGroupId;
  }

  const body = record.body;
  let groupId: string | null = null;
  walkFacebookRecord(body, (child) => {
    if (groupId || !isFacebookRecord(child.entity)) return;
    const entity = child.entity;
    const entityId = readString(entity.id);
    if (entityId && (entity.__typename === 'Group' || entity.__isEntity === 'Group' || entity.__isActor === 'Group')) {
      groupId = entityId;
    }
  });
  return groupId;
}

function readNotificationCreatedAtMs(record: FacebookRecord, tracking: FacebookRecord | null) {
  const timestamp = isFacebookRecord(record.creation_time)
    ? record.creation_time.timestamp
    : record.creation_time;
  const directTimestamp = readEpochMs(timestamp);
  if (directTimestamp !== null) return directTimestamp;

  return readEpochMs(tracking?.microtime_sent, true);
}

function readEpochMs(value: unknown, microseconds = false): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (microseconds) return Math.round(numeric / 1_000);
  return numeric < 100_000_000_000 ? Math.round(numeric * 1_000) : Math.round(numeric);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isFacebookRecord(value: unknown): value is FacebookRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
