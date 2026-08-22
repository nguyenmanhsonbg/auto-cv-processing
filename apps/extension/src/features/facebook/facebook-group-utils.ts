import type {
  AmisJobSnapshot,
  DiscoverFacebookGroupsResponse,
  DiscoveredFacebookGroupItem,
  FacebookGroupSyncDetailItem,
  FacebookGroupSyncDetails,
  FacebookPublishHistoryListItem,
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishTarget,
  FacebookPublishTargetEligibilityStatus,
} from '@/types/types';
import type { FacebookHistoryGroup } from '@/components/facebook/FacebookPostHistoryModal';
import { getValidFacebookGroupPostUrl } from '@/features/facebook/facebook-post-url';
import { ApiClientError } from '@/lib/api-client';
import { hashText, uniqueStrings } from '@/lib/utils';

export type FacebookGroupLoadState =
  | 'IDLE'
  | 'CHECKING_LOGIN'
  | 'WAITING_LOGIN'
  | 'LOADING_SAVED_GROUPS'
  | 'LOADING_GROUPS'
  | 'READY'
  | 'ERROR';

export interface FacebookGroupUiItem {
  key: string;
  id: string | null;
  name: string;
  url?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason: string | null;
  quotaLabel: string;
  selectable: boolean;
  disabledReason: string | null;
}

export function toFacebookGroupUiItem(group: FacebookPublishTarget): FacebookGroupUiItem {
  return {
    key: group.targetId ?? group.targetExternalId ?? group.targetUrl ?? group.targetName,
    id: group.targetId ?? null,
    name: group.targetName,
    url: group.targetUrl,
    eligibilityStatus: group.eligibilityStatus ?? 'UNKNOWN',
    eligibilityReason: group.eligibilityReason ?? null,
    quotaLabel: group.quotaLabel ?? `${group.todayPublishCount ?? 0}/${group.dailyPublishLimit ?? 10}`,
    selectable: isSelectableFacebookGroup(group),
    disabledReason: getFacebookGroupDisabledReason(group),
  };
}

export function isSelectableFacebookGroup(group: FacebookPublishTarget) {
  return Boolean(
    group.targetId
    && group.selectable
    && group.eligibilityStatus === 'CAN_POST'
    && !group.quotaExceeded,
  );
}

export function isPublishableFacebookGroup(group: FacebookPublishTarget) {
  return isSelectableFacebookGroup(group);
}

export function countItRecruitmentFacebookGroups(groups: FacebookPublishTarget[]) {
  return groups.length;
}

export function buildFacebookGroupSelectionMessage(
  selectedIds: string[],
  groups: FacebookPublishTarget[],
  prefix?: string | null,
) {
  const validCount = countItRecruitmentFacebookGroups(groups);
  const validGroupIds = new Set(groups.map((group) => group.targetId).filter((id): id is string => typeof id === 'string'));
  const selectedValidCount = uniqueStrings(selectedIds).filter((targetId) => validGroupIds.has(targetId)).length;
  const message = validCount > 0
    ? `${selectedValidCount}/${validCount} nhóm Facebook đã được chọn`
    : 'Không có nhóm Facebook nào.';

  return prefix ? `${prefix}. ${message}` : message;
}

export function getFacebookEligibilityLabel(status?: FacebookPublishTargetEligibilityStatus | null) {
  return status === 'CAN_POST' ? 'Có thể đăng' : 'Không thể đăng';
}

export function getFacebookGroupBadgeClass(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'is-success';
  return 'is-danger';
}

export function getFacebookGroupDisabledReason(group: FacebookPublishTarget) {
  if (!group.targetId) return 'Facebook group id is missing.';
  if (group.quotaExceeded) return group.disabledReason || 'Daily publish limit has been reached for this group.';
  if (group.eligibilityStatus === 'UNKNOWN') {
    const reason = group.disabledReason || group.eligibilityReason || '';
    if (isAmbiguousFacebookComposerVerificationReason(reason)) {
      return 'Click Check again to verify this group with the current Facebook browser session.';
    }

    return reason || 'Click Check to verify this group before publishing.';
  }
  if (group.eligibilityStatus === 'CANNOT_POST') {
    return group.disabledReason || group.eligibilityReason || 'Current Facebook account cannot post to this group.';
  }
  return group.disabledReason ?? null;
}

export function isAmbiguousFacebookComposerVerificationReason(reason: string) {
  const normalizedReason = reason.toLowerCase();
  return (
    normalizedReason.includes('composermatches=')
    || normalizedReason.includes('hidden and visible verification could not prove posting eligibility')
    || normalizedReason.includes('could not open facebook group post composer automatically')
    || normalizedReason.includes('could not verify facebook group composer automatically')
  );
}

export function isDuplicateFacebookGroupError(error: unknown) {
  return error instanceof ApiClientError && error.code === 'FACEBOOK_GROUP_ALREADY_EXISTS';
}

export function getFacebookGroupUrlValidationError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  if (!isFacebookGroupUrlCandidate(value)) {
    return 'Nhập sai định dạng URL nhóm Facebook. Vui lòng thử lại';
  }

  return getDuplicateFacebookGroupUrlError(value, groups, currentTargetId);
}

export function sortFacebookGroupsByDiscovery(groups: FacebookPublishTarget[]) {
  return [...groups].sort((left, right) => {
    const leftTime = left.lastDiscoveredAt ? Date.parse(left.lastDiscoveredAt) : NaN;
    const rightTime = right.lastDiscoveredAt ? Date.parse(right.lastDiscoveredAt) : NaN;

    const hasLeftTime = Number.isFinite(leftTime);
    const hasRightTime = Number.isFinite(rightTime);
    if (hasLeftTime && hasRightTime) {
      if (leftTime !== rightTime) return rightTime - leftTime;
    } else if (hasLeftTime) {
      return -1;
    } else if (hasRightTime) {
      return 1;
    }

    return left.targetName.localeCompare(right.targetName);
  });
}

export function getDuplicateFacebookGroupUrlError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  const externalId = readFacebookGroupExternalId(value);
  if (!externalId) return null;

  const existingGroup = groups.find(
    (group) =>
      normalizeFacebookGroupExternalId(group.targetExternalId) === externalId
      && group.targetId !== currentTargetId,
  );

  return existingGroup ? 'Link URL không được trùng với nhóm đã tồn tại trong hệ thống.' : null;
}

export function isFacebookPageUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

export function isFacebookGroupUrlCandidate(value: string) {
  return Boolean(readFacebookGroupExternalId(value));
}

export function readFacebookGroupExternalId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const isFacebookHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    if (!isFacebookHost) return null;

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const groupsIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'groups');
    const rawExternalId = groupsIndex >= 0 ? pathSegments[groupsIndex + 1] : undefined;
    return normalizeFacebookGroupExternalId(rawExternalId);
  } catch {
    return null;
  }
}

export function normalizeFacebookGroupExternalId(value: string | null | undefined) {
  if (!value) return null;

  try {
    return decodeURIComponent(value).trim().toLowerCase() || null;
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

export function uniqueDiscoveredGroups(groups: DiscoveredFacebookGroupItem[]) {
  const grouped = new Map<string, DiscoveredFacebookGroupItem>();
  for (const group of groups) {
    const key = normalizeFacebookGroupExternalId(group.targetExternalId);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, group);
  }
  return Array.from(grouped.values());
}

export function buildFacebookGroupDiscoverMessage(result: DiscoverFacebookGroupsResponse) {
  const parts: string[] = [];
  const filtered = result.filtered ?? 0;
  const duplicates = result.duplicates ?? 0;
  if (result.created > 0) parts.push(`đã tạo ${result.created}`);
  if (result.updated > 0) parts.push(`đã cập nhật ${result.updated}`);
  if (result.reactivated > 0) parts.push(`đã kích hoạt lại ${result.reactivated}`);
  if (result.removed > 0) parts.push(`đã đánh dấu ${result.removed} nhóm đã rời`);
  if (result.scanComplete && !result.reconciliationApplied) {
    parts.push('chưa cập nhật thay đổi vì dữ liệu quét chưa đủ để xác nhận');
  }
  if (filtered > 0) parts.push(`lọc ${filtered} nhóm không phù hợp`);
  const otherSkipped = Math.max(0, result.skipped - filtered - duplicates);
  if (otherSkipped > 0) parts.push(`bỏ qua ${otherSkipped}`);
  if (duplicates > 0) parts.push(`trùng ${duplicates}`);
  if (result.conflicts > 0) parts.push(`trùng lặp DB ${result.conflicts}`);
  const summary = parts.length > 0 ? parts.join(', ') : 'không có thay đổi mới';
  const issueText = result.errors.length > 0 ? ` Có ${result.errors.length} lỗi cần kiểm tra.` : '';
  return `Quét xong: ${summary}. Tổng: ${result.valid}/${result.requested} nhóm hợp lệ.${issueText}`;
}

export function getFacebookGroupDetailKey(group: FacebookGroupSyncDetailItem) {
  return group.externalId ?? group.url ?? group.name;
}

export function buildFacebookGroupSyncDetails(result: DiscoverFacebookGroupsResponse): FacebookGroupSyncDetails | null {
  const accepted = result.items
    .filter((item) => item.action === 'created' || item.action === 'updated' || item.action === 'reused')
    .map((item) => ({
      name: item.targetName,
      externalId: item.targetExternalId,
      reason:
        item.action === 'created'
          ? 'Đã thêm mới.'
          : item.action === 'updated'
            ? 'Đã cập nhật.'
            : 'Đã có sẵn trong hệ thống.',
    }));
  const removed = result.items
    .filter((item) => item.action === 'deactivated')
    .map((item) => ({ name: item.targetName, externalId: item.targetExternalId }));
  const reactivated = result.items
    .filter((item) => item.action === 'reactivated')
    .map((item) => ({ name: item.targetName, externalId: item.targetExternalId }));
  const skippedItems = result.items.filter((item) => item.action === 'skipped');
  const filtered = skippedItems
    .filter((item) => item.reason?.toLowerCase().includes('recruitment filter'))
    .map((item) => ({
      name: item.targetName,
      url: item.targetUrl,
      externalId: item.targetExternalId,
      targetId: item.targetId,
      reason: 'Không khớp bộ lọc nhóm tuyển dụng.',
    }));
  const skipped = skippedItems
    .filter((item) => !item.reason?.toLowerCase().includes('recruitment filter'))
    .map((item) => ({
      name: item.targetName,
      externalId: item.targetExternalId,
      reason: item.reason ?? 'Mục này không được đồng bộ.',
    }));
  const errors = result.errors ?? [];

  if (
    accepted.length === 0
    && removed.length === 0
    && reactivated.length === 0
    && filtered.length === 0
    && skipped.length === 0
    && errors.length === 0
  ) {
    return null;
  }
  return { accepted, removed, reactivated, filtered, skipped, errors };
}

export function getFacebookContentSnapshotKey(recruitmentId: string | null, snapshot: AmisJobSnapshot) {
  return [
    recruitmentId ?? 'snapshot',
    snapshot.title,
    snapshot.description,
    snapshot.requirements.rawText,
    snapshot.deadline ?? '',
  ].join('|');
}

export function buildFacebookJobIdentity(snapshot: AmisJobSnapshot) {
  return (snapshot.title || snapshot.description || snapshot.requirements.rawText)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getFacebookPlanKey(plan: FacebookPublishPlan) {
  return [
    plan.jobPostingId,
    plan.content.length,
    hashText(plan.content),
    plan.targets.map((target) => target.targetId ?? target.targetUrl ?? target.targetName).join('|'),
    plan.attachments
      ?.map((attachment) => [
        attachment.type,
        attachment.source,
        attachment.fileName,
        attachment.size,
      ].join('/'))
      .join('|') ?? '',
  ].join(':');
}

export function hydrateFacebookContentOverride(content: string, planContent: string) {
  const applyUrl = extractFacebookApplyUrl(planContent);
  if (!applyUrl) return content.trim();

  return content
    .replace(/\{\{\s*APPLY_URL\s*\}\}/gi, applyUrl)
    .replace(/\[\s*APPLY_URL\s*\]/gi, applyUrl)
    .trim();
}

export function extractFacebookApplyUrl(content: string) {
  const match = content.match(/(?:https?:\/\/|\/jobs\/)[^\s)]+/i);
  return match?.[0] ?? null;
}

export function isFacebookGroupLoading(state: FacebookGroupLoadState) {
  return (
    state === 'CHECKING_LOGIN'
    || state === 'WAITING_LOGIN'
    || state === 'LOADING_SAVED_GROUPS'
    || state === 'LOADING_GROUPS'
  );
}

export function isFacebookPublishProgressUpdateMessage(value: unknown): value is {
  type: 'FACEBOOK_PUBLISH_PROGRESS_UPDATED';
  payload: FacebookPublishProgress;
} {
  const payload = (value as { payload?: Partial<FacebookPublishProgress> } | null)?.payload;
  return (
    typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'FACEBOOK_PUBLISH_PROGRESS_UPDATED'
    && typeof payload?.status === 'string'
    && typeof payload.currentIndex === 'number'
    && typeof payload.total === 'number'
    && typeof payload.message === 'string'
    && Array.isArray(payload.results)
  );
}

export function replaceFacebookGroup(
  groups: FacebookPublishTarget[],
  group: FacebookPublishTarget,
): FacebookPublishTarget[] {
  const index = groups.findIndex(
    (item) =>
      (item.targetId && group.targetId && item.targetId === group.targetId)
      || (item.targetUrl && group.targetUrl && item.targetUrl === group.targetUrl),
  );
  if (index >= 0) {
    const updated = [...groups];
    updated[index] = group;
    return updated;
  }
  return [...groups, group];
}

export function isRefreshableFacebookHistoryItem(item: FacebookPublishHistoryListItem): boolean {
  return (
    (item.facebookReviewStatus === 'PENDING_REVIEW' || item.facebookReviewStatus === 'UNKNOWN')
    && Boolean(getValidFacebookGroupPostUrl(item.externalPostUrl) || item.targetUrl?.trim())
  );
}

export function withFacebookHistoryGroupFallback(
  item: FacebookPublishHistoryListItem,
  group: FacebookHistoryGroup | null,
): FacebookPublishHistoryListItem {
  if (!group) return item;
  if (item.targetUrl?.trim()) return item;

  return {
    ...item,
    targetId: item.targetId ?? group.id,
    targetName: item.targetName || group.name,
    targetUrl: group.url ?? item.targetUrl,
    targetExternalId: item.targetExternalId ?? group.externalId,
  };
}
