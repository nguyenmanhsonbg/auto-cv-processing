import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createFacebookGroup,
  deleteFacebookGroup,
  generateFacebookPreviewContent,
  getFacebookGroups,
  listFacebookGroupPublishHistories,
  manuallyIncludeFacebookGroup,
  resolveFacebookAccount,
  syncFacebookGroups,
  updateFacebookGroup,
  updateFacebookPublishHistoryStatusCheck,
  verifyFacebookGroup,
} from '@/lib/api-client';
import { clearAccessToken } from '@/features/auth/auth-store';
import { summarizeFacebookPublishResults, updateFacebookChannelStatus } from './facebook-channel-status';
import {
  buildFacebookDraftSnapshotFingerprint,
  clearFacebookContentDraft as clearStoredFacebookContentDraft,
  getFacebookContentDraft,
  saveFacebookContentDraft as persistFacebookContentDraft,
} from '@/stores/facebook-content-draft-store';
import { getSelectedFacebookGroupIds, setSelectedFacebookGroupIds } from '@/stores/facebook-group-preferences';
import { setActiveFacebookAccountId } from '@/stores/facebook-account-store';
import {
  beginFacebookImagePublish,
  getFacebookImageAttachments,
  removeFacebookImageAttachments,
  saveFacebookImageAttachments,
  syncFacebookImagePublishStatuses,
  updateFacebookImagePublishTargetStatus,
  type FacebookImageAttachmentScope,
} from '@/stores/facebook-image-attachment-store';
import {
  ensureFacebookSession,
  publishFacebookPlan,
  refreshFacebookPostReviewStatus,
  verifyFacebookGroupPostingEligibility,
} from './facebook-publish-orchestrator';
import { collectFacebookGroupsFromGraphql } from './facebook-group-graphql-capture';
import { getLastFacebookPublishProgress, saveLastFacebookPublishProgress } from '@/stores/facebook-publish-store';
import {
  FACEBOOK_HISTORY_PAGE_SIZE,
  FACEBOOK_HISTORY_REFRESH_BATCH_SIZE,
  type FacebookHistoryGroup,
  type FacebookPostHistoryFilter,
  type FacebookPostHistoryLoadState,
  type FacebookPreviewModalMode,
} from '@/components/facebook';
import {
  buildFacebookGroupDiscoverMessage,
  buildFacebookGroupSelectionMessage,
  buildFacebookGroupSyncDetails,
  buildFacebookJobIdentity,
  getDuplicateFacebookGroupUrlError,
  getFacebookContentSnapshotKey,
  getFacebookGroupDetailKey,
  getFacebookGroupDisabledReason,
  getFacebookGroupUrlValidationError,
  getFacebookPlanKey,
  isDuplicateFacebookGroupError,
  isFacebookGroupLoading,
  isFacebookPageUrl,
  isPublishableFacebookGroup,
  isRefreshableFacebookHistoryItem,
  isSelectableFacebookGroup,
  replaceFacebookGroup,
  sortFacebookGroupsByDiscovery,
  toFacebookGroupUiItem,
  uniqueDiscoveredGroups,
  withFacebookHistoryGroupFallback,
  type FacebookGroupLoadState,
} from './facebook-group-utils';
import {
  deduplicateFacebookImageAttachments,
  getFacebookImageContentKey,
  getFacebookImageFileValidationError,
  readFileAsDataUrl,
  withFacebookImageAttachments,
} from './facebook-image-utils';
import {
  closeTabSafely,
  collectFacebookGroupsFromPage,
  mapGraphqlScanResult,
  runScriptInTab,
  waitForTabComplete,
  type FacebookGroupsScanRunResult,
} from './facebook-group-dom-scanner';
import { FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST } from './facebook-history-refresh-message';
import { FACEBOOK_MAX_IMAGE_ATTACHMENTS } from '@/lib/config';
import { isString, sleep, toErrorMessage, uniqueStrings } from '@/lib/utils';
import { buildAmisJobSnapshotFromJobDescription, getActiveTab } from '@/integrations/amis/amis-helpers';
import type { ExtensionToastKind } from '@/components/toast';
import type {
  AmisJobSnapshot,
  ExtensionChannel,
  ExtensionSyncResponse,
  FacebookAccount,
  FacebookGroupSyncDetailItem,
  FacebookGroupSyncDetails,
  FacebookImageAttachDecisionPrompt,
  FacebookImageAttachFailureContext,
  FacebookImageAttachFailureDecision,
  FacebookPublishAttachment,
  FacebookPublishHistoriesResponse,
  FacebookPublishHistoryListItem,
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishTarget,
  FacebookReviewStatus,
  JobDescriptionSummary,
} from '@/types/types';

export type FacebookContentState = 'IDLE' | 'GENERATING' | 'READY' | 'ERROR';
export type FacebookContentSource = 'EMPTY' | 'DEFAULT' | 'AI' | 'TEMPLATE' | 'CUSTOM';
export type FacebookImageAttachmentState = 'IDLE' | 'READING' | 'READY' | 'ERROR';

export type FacebookContentDraftScope = {
  tabId?: number | null;
  pageUrl?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionTitle?: string | null;
};

export interface FacebookGroupsSyncResult {
  groups: FacebookPublishTarget[];
  selectedIds: string[];
  discoverySummary?: string | null;
  details?: FacebookGroupSyncDetails | null;
  scanComplete?: boolean;
}

export type UseFacebookManagerOptions = {
  token: string | null;
  snapshot: AmisJobSnapshot | null;
  amisRecruitmentId: string | null;
  selectedPostingChannels: ExtensionChannel[];
  selectedJobDescription?: JobDescriptionSummary | null;
  syncResult?: ExtensionSyncResponse | null;
  onToggleChannel: (channel: ExtensionChannel) => void;
  showToast: (kind: ExtensionToastKind, title: string, message: string) => void;
  onAuthRequired: (message?: string | null) => void;
  setSyncResult: React.Dispatch<React.SetStateAction<ExtensionSyncResponse | null>>;
};

export function useFacebookManager({
  token,
  snapshot,
  amisRecruitmentId,
  selectedPostingChannels,
  selectedJobDescription = null,
  syncResult = null,
  onToggleChannel,
  showToast,
  onAuthRequired,
  setSyncResult,
}: UseFacebookManagerOptions) {
  const [facebookProgress, setFacebookProgress] = useState<FacebookPublishProgress | null>(null);
  const [facebookPublishResultsVisible, setFacebookPublishResultsVisible] = useState(false);
  const [facebookRunning, setFacebookRunning] = useState(false);
  const [facebookGroups, setFacebookGroups] = useState<FacebookPublishTarget[]>([]);
  const [facebookAccount, setFacebookAccount] = useState<FacebookAccount | null>(null);
  const [facebookPreviewIdentity, setFacebookPreviewIdentity] = useState<Pick<FacebookAccount, 'displayName' | 'avatarUrl'> | null>(null);
  const [selectedFacebookGroupIds, setSelectedFacebookGroupIdsState] = useState<string[]>([]);

  const [facebookContent, setFacebookContent] = useState('');
  const [facebookContentState, setFacebookContentState] = useState<FacebookContentState>('IDLE');
  const [, setFacebookContentMessage] = useState<string | null>(null);
  const [facebookPreviewModalMode, setFacebookPreviewModalMode] = useState<FacebookPreviewModalMode | null>(null);
  const [facebookContentDraft, setFacebookContentDraft] = useState('');

  const [facebookImageAttachments, setFacebookImageAttachments] = useState<FacebookPublishAttachment[]>([]);
  const [facebookImageAttachmentState, setFacebookImageAttachmentState] = useState<FacebookImageAttachmentState>('IDLE');
  const [facebookImageAttachmentError, setFacebookImageAttachmentError] = useState<string | null>(null);
  const [facebookImageAttachPrompt, setFacebookImageAttachPrompt] = useState<FacebookImageAttachDecisionPrompt | null>(null);

  const [facebookGroupLoadState, setFacebookGroupLoadState] = useState<FacebookGroupLoadState>('IDLE');
  const [facebookGroupMessage, setFacebookGroupMessage] = useState<string | null>(null);
  const [facebookGroupDiagnostic, setFacebookGroupDiagnostic] = useState<string | null>(null);
  const [facebookGroupSyncDetails, setFacebookGroupSyncDetails] = useState<FacebookGroupSyncDetails | null>(null);
  const [isFacebookGroupSyncDetailsOpen, setIsFacebookGroupSyncDetailsOpen] = useState(false);
  const [manualIncludingFacebookGroupKeys, setManualIncludingFacebookGroupKeys] = useState<string[]>([]);

  const [isFacebookSettingsOpen, setIsFacebookSettingsOpen] = useState(false);
  const [facebookSettingsState, setFacebookSettingsState] = useState<
    'IDLE' | 'LOADING' | 'READY' | 'SAVING' | 'VERIFYING' | 'ERROR' | 'DISCOVERING'
  >('IDLE');
  const [facebookSettingsMessage, setFacebookSettingsMessage] = useState<string | null>(null);
  const [verifyingFacebookGroupIds, setVerifyingFacebookGroupIds] = useState<string[]>([]);
  const [queuedFacebookGroupIds, setQueuedFacebookGroupIds] = useState<string[]>([]);

  const [selectedFacebookHistoryGroup, setSelectedFacebookHistoryGroup] = useState<FacebookHistoryGroup | null>(null);
  const [facebookHistoryFilter, setFacebookHistoryFilter] = useState<FacebookPostHistoryFilter>('ALL');
  const [facebookHistoryPage, setFacebookHistoryPage] = useState(1);
  const [facebookHistoryData, setFacebookHistoryData] = useState<FacebookPublishHistoriesResponse | null>(null);
  const [facebookHistoryLoadState, setFacebookHistoryLoadState] = useState<FacebookPostHistoryLoadState>('IDLE');
  const [facebookHistoryMessage, setFacebookHistoryMessage] = useState<string | null>(null);
  const [isRefreshingFacebookHistoriesBatch, setIsRefreshingFacebookHistoryGroup] = useState(false);

  const [isFacebookGroupFormOpen, setIsFacebookGroupFormOpen] = useState(false);
  const [facebookGroupName, setFacebookGroupName] = useState('');
  const [facebookGroupNameError, setFacebookGroupNameError] = useState<string | null>(null);
  const [facebookGroupUrl, setFacebookGroupUrl] = useState('');
  const [facebookGroupUrlError, setFacebookGroupUrlError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(token);
  const channelsRef = useRef<ExtensionChannel[]>(selectedPostingChannels);
  const facebookGroupsRef = useRef<FacebookPublishTarget[]>(facebookGroups);
  const selectedFacebookGroupIdsRef = useRef<string[]>(selectedFacebookGroupIds);
  const facebookImageInputRef = useRef<HTMLInputElement | null>(null);
  const facebookContentGenerationSeqRef = useRef(0);
  const facebookImageReadSeqRef = useRef(0);
  const facebookImageRestoreSeqRef = useRef(0);
  const facebookImageAttachPromptResolverRef = useRef<((decision: FacebookImageAttachFailureDecision) => void) | null>(null);
  const facebookGroupVerificationQueueRef = useRef<FacebookPublishTarget[]>([]);
  const facebookGroupVerificationRunningRef = useRef(false);
  const activeFacebookGroupVerificationIdRef = useRef<string | null>(null);
  const facebookContentRef = useRef('');
  const facebookContentSourceRef = useRef<FacebookContentSource>('EMPTY');
  const facebookContentSnapshotKeyRef = useRef<string | null>(null);
  const facebookContentSnapshotFingerprintRef = useRef<string | null>(null);
  const facebookContentJobIdentityRef = useRef<string | null>(null);
  const facebookContentDraftScopeRef = useRef<FacebookContentDraftScope>({});
  const startedFacebookPlanKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    channelsRef.current = selectedPostingChannels;
  }, [selectedPostingChannels]);

  useEffect(() => {
    facebookGroupsRef.current = facebookGroups;
  }, [facebookGroups]);

  useEffect(() => {
    selectedFacebookGroupIdsRef.current = selectedFacebookGroupIds;
  }, [selectedFacebookGroupIds]);

  useEffect(() => () => {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    facebookImageAttachPromptResolverRef.current = null;
  }, []);

  const facebookSelected = selectedPostingChannels.includes('FACEBOOK');
  const isFacebookImageReading = facebookImageAttachmentState === 'READING';
  const hasFacebookImageAttachmentError = Boolean(facebookImageAttachmentError) || facebookImageAttachmentState === 'ERROR';
  const facebookImageUploadDisabled = isFacebookImageReading;
  const facebookImageAddDisabled = facebookImageAttachments.length >= FACEBOOK_MAX_IMAGE_ATTACHMENTS
    || isFacebookImageReading;

  const validFacebookGroups = useMemo(() => facebookGroups, [facebookGroups]);
  const visibleFacebookGroups = useMemo(() => {
    if (isFacebookGroupLoading(facebookGroupLoadState)) return [];
    if (facebookGroups.length > 0) {
      return validFacebookGroups.map(toFacebookGroupUiItem);
    }
    const planTargets = syncResult?.facebookPublishPlan?.targets.map(toFacebookGroupUiItem) ?? [];
    return planTargets;
  }, [facebookGroupLoadState, facebookGroups.length, syncResult?.facebookPublishPlan?.targets, validFacebookGroups]);

  const visibleSelectedFacebookGroupCount = useMemo(() => {
    if (facebookGroups.length > 0) {
      const selectedIdSet = new Set(selectedFacebookGroupIds);
      return validFacebookGroups.filter((group) => group.targetId && selectedIdSet.has(group.targetId)).length;
    }
    return syncResult?.facebookPublishPlan?.targets.length ?? 0;
  }, [facebookGroups.length, syncResult?.facebookPublishPlan?.targets, selectedFacebookGroupIds, validFacebookGroups]);

  const facebookContentBusy = facebookContentState === 'GENERATING';
  const facebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(facebookGroupUrl, facebookGroups);
  const facebookGroupUrlFieldError = facebookGroupDuplicateUrlError ?? facebookGroupUrlError;

  const getFacebookImageAttachmentScope = useCallback((
    recruitmentId: string | null = amisRecruitmentId,
    nextSnapshot: AmisJobSnapshot | null = snapshot,
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ): FacebookImageAttachmentScope => ({
    recruitmentId,
    jobDescriptionId: jobDescription?.id ?? null,
    snapshotFingerprint: nextSnapshot ? buildFacebookDraftSnapshotFingerprint(nextSnapshot) : null,
  }), [amisRecruitmentId, snapshot, selectedJobDescription]);

  const updateSelectedFacebookGroupIds = useCallback(async (targetIds: string[], accountId = facebookAccount?.id) => {
    setSelectedFacebookGroupIdsState(targetIds);
    await setSelectedFacebookGroupIds(targetIds, accountId);
  }, [facebookAccount?.id]);

  const reconcileSelectedFacebookGroups = useCallback(async (
    groups: FacebookPublishTarget[],
    targetIds: string[] = selectedFacebookGroupIdsRef.current,
    accountId = facebookAccount?.id,
  ) => {
    const publishableGroupIds = new Set(groups.filter(isPublishableFacebookGroup).map((group) => group.targetId).filter(isString));
    const nextTargetIds = uniqueStrings(targetIds).filter((targetId) => publishableGroupIds.has(targetId));
    await updateSelectedFacebookGroupIds(nextTargetIds, accountId);
    return nextTargetIds;
  }, [facebookAccount?.id, updateSelectedFacebookGroupIds]);

  const toggleFacebookGroupSelection = useCallback((targetId: string | null | undefined) => {
    if (!targetId) return;
    const group = facebookGroups.find((item) => item.targetId === targetId);
    if (group && !isSelectableFacebookGroup(group)) {
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(getFacebookGroupDisabledReason(group));
      return;
    }
    const nextTargetIds = selectedFacebookGroupIds.includes(targetId)
      ? selectedFacebookGroupIds.filter((item) => item !== targetId)
      : [...selectedFacebookGroupIds, targetId];
    void updateSelectedFacebookGroupIds(nextTargetIds);
    if (selectedPostingChannels.includes('FACEBOOK') && facebookGroups.length > 0) {
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(buildFacebookGroupSelectionMessage(uniqueStrings(nextTargetIds), facebookGroups));
    }
  }, [facebookGroups, selectedFacebookGroupIds, selectedPostingChannels, updateSelectedFacebookGroupIds]);

  const isFacebookContentScopedToCurrentSnapshot = useCallback(() => {
    if (!snapshot) return false;
    return facebookContentSnapshotFingerprintRef.current === buildFacebookDraftSnapshotFingerprint(snapshot)
      && facebookContentJobIdentityRef.current === buildFacebookJobIdentity(snapshot);
  }, [snapshot]);

  const getEffectiveFacebookContent = useCallback((options: { includeDraft?: boolean } = {}) => {
    if (!isFacebookContentScopedToCurrentSnapshot()) return '';
    const draftContent = options.includeDraft ? facebookContentDraft.trim() : '';
    return draftContent || facebookContentRef.current.trim() || facebookContent.trim();
  }, [facebookContent, facebookContentDraft, isFacebookContentScopedToCurrentSnapshot]);

  const getCurrentFacebookPublishPlanContent = useCallback(() => {
    if (!syncResult?.facebookPublishPlan?.content?.trim()) return '';
    if (amisRecruitmentId && syncResult.amisRecruitmentId !== amisRecruitmentId) return '';
    return syncResult.facebookPublishPlan.content.trim();
  }, [amisRecruitmentId, syncResult]);

  const getFacebookContentDraftScope = useCallback(async (
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ): Promise<FacebookContentDraftScope> => {
    const scope: FacebookContentDraftScope = {
      jobDescriptionId: jobDescription?.id ?? null,
      jobDescriptionTitle: jobDescription?.title ?? null,
    };
    try {
      const activeTab = await getActiveTab();
      if (activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        scope.tabId = activeTab.id;
        scope.pageUrl = activeTab.url;
      }
    } catch {
      // The draft remains usable by JD/recruitment keys when no AMIS tab is active.
    }
    facebookContentDraftScopeRef.current = scope;
    return scope;
  }, [selectedJobDescription]);

  const clearFacebookContent = useCallback(() => {
    facebookContentGenerationSeqRef.current += 1;
    facebookContentRef.current = '';
    facebookContentSourceRef.current = 'EMPTY';
    facebookContentSnapshotKeyRef.current = null;
    facebookContentSnapshotFingerprintRef.current = null;
    facebookContentJobIdentityRef.current = null;
    setFacebookContent('');
    setFacebookContentDraft('');
    setFacebookContentState('IDLE');
    setFacebookContentMessage(null);
  }, []);

  const resetFacebookImageAttachmentView = useCallback(() => {
    facebookImageReadSeqRef.current += 1;
    facebookImageRestoreSeqRef.current += 1;
    setFacebookImageAttachments([]);
    setFacebookImageAttachmentState('IDLE');
    setFacebookImageAttachmentError(null);
    if (facebookImageInputRef.current) {
      facebookImageInputRef.current.value = '';
    }
  }, []);

  const clearFacebookImageViewIfReleased = useCallback(async (released: boolean) => {
    if (!released) return;
    try {
      const remainingAttachments = await getFacebookImageAttachments(getFacebookImageAttachmentScope());
      if (remainingAttachments.length === 0) resetFacebookImageAttachmentView();
    } catch {
      // A storage read failure must not interrupt history refresh or publish completion.
    }
  }, [getFacebookImageAttachmentScope, resetFacebookImageAttachmentView]);

  const restoreFacebookImageAttachments = useCallback(async (
    recruitmentId: string | null,
    nextSnapshot: AmisJobSnapshot | null,
    jobDescription: JobDescriptionSummary | null,
  ) => {
    const restoreSeq = facebookImageRestoreSeqRef.current + 1;
    facebookImageRestoreSeqRef.current = restoreSeq;
    const scope = getFacebookImageAttachmentScope(recruitmentId, nextSnapshot, jobDescription);
    setFacebookImageAttachments([]);
    setFacebookImageAttachmentState('READING');
    setFacebookImageAttachmentError(null);

    if (!recruitmentId && !nextSnapshot && !jobDescription?.id) {
      setFacebookImageAttachments([]);
      setFacebookImageAttachmentState('IDLE');
      setFacebookImageAttachmentError(null);
      return;
    }

    try {
      const attachments = await getFacebookImageAttachments(scope);
      if (facebookImageRestoreSeqRef.current !== restoreSeq) return;
      const uniqueAttachments = deduplicateFacebookImageAttachments(attachments);
      setFacebookImageAttachments(uniqueAttachments.slice(0, FACEBOOK_MAX_IMAGE_ATTACHMENTS));
      setFacebookImageAttachmentState(uniqueAttachments.length > 0 ? 'READY' : 'IDLE');
      setFacebookImageAttachmentError(null);
    } catch (err) {
      if (facebookImageRestoreSeqRef.current !== restoreSeq) return;
      setFacebookImageAttachments([]);
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(toErrorMessage(err));
    }
  }, [getFacebookImageAttachmentScope]);

  const generateFacebookPostContent = useCallback(async (options: {
    snapshotOverride?: AmisJobSnapshot;
    selectedJobDescriptionOverride?: JobDescriptionSummary | null;
    forceFacebookChannel?: boolean;
    mode?: 'TEMPLATE' | 'AI';
  } = {}) => {
    if (!token) {
      onAuthRequired('Sign in to VCS Recruitment before generating Facebook content.');
      return null;
    }
    const sourceSnapshot = options.snapshotOverride
      ?? snapshot
      ?? (selectedJobDescription ? buildAmisJobSnapshotFromJobDescription(selectedJobDescription) : null);
    if (!sourceSnapshot) {
      setFacebookContentState('ERROR');
      setFacebookContentMessage('Load an AMIS job snapshot before generating Facebook content.');
      return null;
    }
    const generationSeq = facebookContentGenerationSeqRef.current + 1;
    facebookContentGenerationSeqRef.current = generationSeq;

    setFacebookContentState('GENERATING');
    setFacebookContentMessage(null);

    try {
      let content = '';
      const requestedMode = options.mode ?? 'TEMPLATE';
      let contentMode: 'AI' | 'TEMPLATE' = requestedMode;

      const response = await generateFacebookPreviewContent(token, {
        snapshot: sourceSnapshot,
        mode: requestedMode,
      });
      if (facebookContentGenerationSeqRef.current !== generationSeq) return null;
      content = response.content.trim();
      contentMode = response.mode === 'AI' ? 'AI' : 'TEMPLATE';

      if (!content) {
        throw new Error('Backend did not return Facebook preview content.');
      }
      setFacebookContent(content);
      facebookContentRef.current = content;
      facebookContentSourceRef.current = contentMode;
      facebookContentSnapshotKeyRef.current = getFacebookContentSnapshotKey(amisRecruitmentId, sourceSnapshot);
      facebookContentSnapshotFingerprintRef.current = buildFacebookDraftSnapshotFingerprint(sourceSnapshot);
      facebookContentJobIdentityRef.current = buildFacebookJobIdentity(sourceSnapshot);
      setFacebookContentState('READY');

      const draftScope = await getFacebookContentDraftScope(
        options.selectedJobDescriptionOverride ?? selectedJobDescription,
      );
      if (facebookContentGenerationSeqRef.current !== generationSeq) return null;
      await persistFacebookContentDraft({
        content,
        source: contentMode,
        recruitmentId: amisRecruitmentId,
        ...draftScope,
        snapshot: sourceSnapshot,
      });
      return content;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
      } else if (facebookContentGenerationSeqRef.current === generationSeq) {
        setFacebookContentState('ERROR');
        setFacebookContentMessage(toErrorMessage(err));
      }
      return null;
    }
  }, [amisRecruitmentId, getFacebookContentDraftScope, onAuthRequired, selectedJobDescription, snapshot, token]);

  const ensureFacebookDefaultContent = useCallback(async () => {
    const currentContent = getEffectiveFacebookContent();
    if (currentContent) return currentContent;

    const publishPlanContent = getCurrentFacebookPublishPlanContent();
    if (publishPlanContent) {
      facebookContentRef.current = publishPlanContent;
      if (snapshot) {
        facebookContentSnapshotKeyRef.current = getFacebookContentSnapshotKey(amisRecruitmentId, snapshot);
        facebookContentSnapshotFingerprintRef.current = buildFacebookDraftSnapshotFingerprint(snapshot);
        facebookContentJobIdentityRef.current = buildFacebookJobIdentity(snapshot);
      }
      setFacebookContent(publishPlanContent);
      setFacebookContentState('READY');
      setFacebookContentMessage('Đang dùng nội dung Facebook mặc định từ kế hoạch đăng hiện tại.');
      return publishPlanContent;
    }

    if (!snapshot || !token) return '';
    return (await generateFacebookPostContent())?.trim() ?? '';
  }, [amisRecruitmentId, generateFacebookPostContent, getCurrentFacebookPublishPlanContent, getEffectiveFacebookContent, snapshot, token]);

  const generateFacebookDraftContent = useCallback(async () => {
    const content = await generateFacebookPostContent({ mode: 'AI' });
    if (content !== null) {
      setFacebookContentDraft(content);
    }
  }, [generateFacebookPostContent]);

  const saveFacebookContentDraft = useCallback(async () => {
    facebookContentGenerationSeqRef.current += 1;
    const content = facebookContentDraft.trim();
    setFacebookContent(content);
    facebookContentRef.current = content;
    facebookContentSourceRef.current = 'CUSTOM';
    if (snapshot) {
      facebookContentSnapshotKeyRef.current = getFacebookContentSnapshotKey(amisRecruitmentId, snapshot);
      facebookContentSnapshotFingerprintRef.current = buildFacebookDraftSnapshotFingerprint(snapshot);
      facebookContentJobIdentityRef.current = buildFacebookJobIdentity(snapshot);
      const draftScope = await getFacebookContentDraftScope();
      await persistFacebookContentDraft({
        content,
        source: 'CUSTOM',
        recruitmentId: amisRecruitmentId,
        ...draftScope,
        snapshot,
      });
    }
    setFacebookContentState(content ? 'READY' : 'IDLE');
    setFacebookContentMessage(content ? 'Đã lưu thay đổi nội dung Facebook.' : null);
    setFacebookPreviewModalMode('PREVIEW');
  }, [amisRecruitmentId, facebookContentDraft, getFacebookContentDraftScope, snapshot]);

  const openFacebookPreviewModal = useCallback(async () => {
    const content = await ensureFacebookDefaultContent();
    if (content) {
      facebookContentRef.current = content;
      setFacebookContent(content);
    }
    setFacebookPreviewModalMode('PREVIEW');
  }, [ensureFacebookDefaultContent]);

  const handleFacebookImageFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const availableSlots = FACEBOOK_MAX_IMAGE_ATTACHMENTS - facebookImageAttachments.length;
    if (availableSlots <= 0 || files.length > availableSlots) {
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(`Bài đăng chỉ được tối đa ${FACEBOOK_MAX_IMAGE_ATTACHMENTS} ảnh.`);
      return;
    }

    const readSeq = facebookImageReadSeqRef.current + 1;
    facebookImageReadSeqRef.current = readSeq;
    const validationError = files
      .map((file) => getFacebookImageFileValidationError(file))
      .find(Boolean) ?? null;
    if (validationError) {
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(validationError);
      return;
    }

    setFacebookImageAttachmentState('READING');
    setFacebookImageAttachmentError(null);
    try {
      const dataUrls = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
      if (facebookImageReadSeqRef.current !== readSeq) return;
      const existingContentKeys = new Set(
        facebookImageAttachments.map((attachment) => getFacebookImageContentKey(attachment.dataUrl)),
      );
      const selectedContentKeys = new Set<string>();
      const isDuplicate = dataUrls.some((dataUrl) => {
        const imageContentKey = getFacebookImageContentKey(dataUrl);
        if (!imageContentKey || existingContentKeys.has(imageContentKey) || selectedContentKeys.has(imageContentKey)) {
          return true;
        }
        selectedContentKeys.add(imageContentKey);
        return false;
      });
      if (isDuplicate) {
        setFacebookImageAttachmentState('ERROR');
        setFacebookImageAttachmentError('Ảnh này đã được tải lên. Vui lòng chọn ảnh khác.');
        return;
      }

      const newAttachments = files.map((file, index): FacebookPublishAttachment => ({
        type: 'IMAGE',
        source: 'LOCAL_UPLOAD',
        fileName: file.name || 'facebook-image',
        mimeType: file.type,
        size: file.size,
        dataUrl: dataUrls[index],
      }));
      const nextAttachments = [...facebookImageAttachments, ...newAttachments];
      await saveFacebookImageAttachments(getFacebookImageAttachmentScope(), nextAttachments);
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachments(nextAttachments);
      setFacebookImageAttachmentState('READY');
    } catch (err) {
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(toErrorMessage(err));
    }
  }, [facebookImageAttachments, getFacebookImageAttachmentScope]);

  const clearFacebookImageAttachment = useCallback(async (index?: number) => {
    facebookImageReadSeqRef.current += 1;
    const nextAttachments = typeof index === 'number'
      ? facebookImageAttachments.filter((_, attachmentIndex) => attachmentIndex !== index)
      : [];
    try {
      if (nextAttachments.length > 0) {
        await saveFacebookImageAttachments(getFacebookImageAttachmentScope(), nextAttachments);
      } else {
        await removeFacebookImageAttachments(getFacebookImageAttachmentScope());
      }
      setFacebookImageAttachments(nextAttachments);
      setFacebookImageAttachmentState('IDLE');
      setFacebookImageAttachmentError(null);
    } catch (err) {
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(toErrorMessage(err));
    }
    if (facebookImageInputRef.current) {
      facebookImageInputRef.current.value = '';
    }
  }, [facebookImageAttachments, getFacebookImageAttachmentScope]);

  const requestFacebookImageAttachDecision = useCallback((
    context: FacebookImageAttachFailureContext,
  ): Promise<FacebookImageAttachFailureDecision> => {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    setFacebookImageAttachPrompt(context);
    return new Promise((resolve) => {
      facebookImageAttachPromptResolverRef.current = (decision) => {
        facebookImageAttachPromptResolverRef.current = null;
        setFacebookImageAttachPrompt(null);
        resolve(decision);
      };
    });
  }, []);

  const resolveFacebookImageAttachPrompt = useCallback((decision: FacebookImageAttachFailureDecision) => {
    facebookImageAttachPromptResolverRef.current?.(decision);
  }, []);

  const loadFacebookGroupsForFacebookChannel = useCallback(async (accessToken: string): Promise<FacebookGroupsSyncResult> => {
    setFacebookGroupSyncDetails(null);
    setFacebookGroupLoadState('CHECKING_LOGIN');
    setFacebookGroupMessage('Đang kiểm tra đăng nhập Facebook ở trình duyệt này.');

    const session = await ensureFacebookSession({
      onStatus: (event) => {
        setFacebookGroupLoadState(event.status === 'READY' ? 'LOADING_SAVED_GROUPS' : event.status);
        setFacebookGroupMessage(event.message);
      },
    });

    if (!session.account) {
      throw new Error('Could not identify the logged-in Facebook account. Please refresh Facebook and try again.');
    }
    setFacebookPreviewIdentity({
      displayName: session.account.displayName ?? null,
      avatarUrl: session.account.avatarUrl ?? null,
    });
    const resolvedAccount = await resolveFacebookAccount(accessToken, session.account);
    setFacebookAccount(resolvedAccount);
    setFacebookPreviewIdentity({
      displayName: resolvedAccount.displayName,
      avatarUrl: resolvedAccount.avatarUrl,
    });
    await setActiveFacebookAccountId(resolvedAccount.id);

    setFacebookGroupLoadState('LOADING_SAVED_GROUPS');
    setFacebookGroupMessage('Đang tải danh sách group Facebook đã lưu...');
    const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(accessToken, resolvedAccount.id));
    setFacebookGroups(groups);
    const selectedIds = await reconcileSelectedFacebookGroups(
      groups,
      await getSelectedFacebookGroupIds(resolvedAccount.id),
      resolvedAccount.id,
    );
    setFacebookGroupLoadState('READY');
    setFacebookGroupMessage(
      groups.length > 0
        ? buildFacebookGroupSelectionMessage(selectedIds, groups)
        : 'Đã quét được 0 nhóm',
    );
    return {
      groups,
      selectedIds,
      discoverySummary: null,
      details: null,
      scanComplete: false,
    };
  }, [reconcileSelectedFacebookGroups]);

  const collectJoinedFacebookGroupsFromFacebookPage = useCallback(async (
    onMessage?: (message: string) => void,
    options: { ensureSession?: boolean; expectedFacebookExternalId?: string } = {},
  ): Promise<FacebookGroupsScanRunResult> => {
    if (options.ensureSession !== false) {
      await ensureFacebookSession({
        onStatus: (event) => {
          if (onMessage && event.status !== 'READY') {
            onMessage(event.message);
          }
        },
      });
    }

    const tabs = await chrome.tabs?.query({ currentWindow: true }) as Array<{ id?: number; url?: string; active?: boolean }> ?? [];
    const [activeTab] = tabs.filter((candidate) => candidate.active === true);
    const existingFacebookTab = tabs.find((candidate) => isFacebookPageUrl(candidate.url));
    const useActiveFacebookTab = isFacebookPageUrl(activeTab?.url);
    const useExistingFacebookTab = Boolean(existingFacebookTab?.id);
    const tab = existingFacebookTab
      ? existingFacebookTab
      : await chrome.tabs?.create({
        url: 'about:blank',
        active: false,
      });
    if (!tab?.id) {
      throw new Error('Không thể mở tab danh sách nhóm Facebook.');
    }

    try {
      const graphqlResult = options.expectedFacebookExternalId
        ? await collectFacebookGroupsFromGraphql(
          tab.id,
          options.expectedFacebookExternalId,
          onMessage,
          { activateTab: useActiveFacebookTab },
        )
        : null;
      if (graphqlResult) {
        return mapGraphqlScanResult(graphqlResult);
      }

      await chrome.tabs?.update(tab.id, {
        url: 'https://www.facebook.com/groups/joins/?nav_source=tab',
        active: false,
      });
      await waitForTabComplete(tab.id);
      await sleep(1_000);

      const scanResult = await runScriptInTab<FacebookGroupsScanRunResult>(tab.id, collectFacebookGroupsFromPage);
      return {
        groups: uniqueDiscoveredGroups(scanResult.groups ?? []),
        scanComplete: scanResult.scanComplete === true,
      };
    } finally {
      if (!useExistingFacebookTab) await closeTabSafely(tab.id);
    }
  }, []);

  const syncFacebookGroupsFromBrowser = useCallback(async (
    accessToken: string,
    options: { sessionReady?: boolean } = {},
  ): Promise<FacebookGroupsSyncResult> => {
    setFacebookGroups([]);
    setFacebookGroupSyncDetails(null);
    setFacebookGroupDiagnostic(null);
    let activeAccount = facebookAccount;
    if (!options.sessionReady) {
      setFacebookGroupLoadState('CHECKING_LOGIN');
      setFacebookGroupMessage('Đang kiểm tra đăng nhập Facebook ở trình duyệt này.');

      const session = await ensureFacebookSession({
        onStatus: (event) => {
          setFacebookGroupLoadState(event.status === 'READY' ? 'LOADING_GROUPS' : event.status);
          setFacebookGroupMessage(event.message);
        },
      });
      if (!session.account) {
        throw new Error('Could not identify the logged-in Facebook account. Please refresh Facebook and try again.');
      }
      setFacebookPreviewIdentity({
        displayName: session.account.displayName ?? null,
        avatarUrl: session.account.avatarUrl ?? null,
      });
      activeAccount = await resolveFacebookAccount(accessToken, session.account);
      setFacebookAccount(activeAccount);
      setFacebookPreviewIdentity({
        displayName: activeAccount.displayName,
        avatarUrl: activeAccount.avatarUrl,
      });
      await setActiveFacebookAccountId(activeAccount.id);
    }

    if (!activeAccount) {
      throw new Error('Facebook account is not resolved. Please check Facebook login again.');
    }

    setFacebookGroupLoadState('LOADING_GROUPS');
    setFacebookGroupMessage('Đang quét danh sách nhóm đã tham gia trên Facebook...');

    const scanResult = await collectJoinedFacebookGroupsFromFacebookPage(
      (message) => {
        if (!message) return;
        if (message.includes('[FB_GQL_')) setFacebookGroupDiagnostic(message);
        setFacebookGroupMessage(message);
      },
      { ensureSession: false, expectedFacebookExternalId: activeAccount.facebookExternalId },
    );
    const discoveredGroups = scanResult.groups;

    let discoverySummary: string | null = null;
    let details: FacebookGroupSyncDetails | null = null;
    if (!scanResult.scanComplete) {
      discoverySummary = 'Quét chưa hoàn tất nên chưa thay đổi dữ liệu nhóm.';
      setFacebookGroupMessage(discoverySummary);
    } else {
      setFacebookGroupMessage(`Đã quét được ${discoveredGroups.length} nhóm.`);
      const discoverResult = await syncFacebookGroups(accessToken, {
        scanComplete: true,
        facebookAccountId: activeAccount.id,
        groups: discoveredGroups.map((item) => ({
          targetName: item.targetName,
          targetUrl: item.targetUrl,
          targetExternalId: item.targetExternalId,
        })),
      });
      discoverySummary = buildFacebookGroupDiscoverMessage(discoverResult);
      details = buildFacebookGroupSyncDetails(discoverResult);
      setFacebookGroupSyncDetails(details);
    }

    setFacebookGroupMessage('Đang tải danh sách nhóm Facebook đã đồng bộ...');
    const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(accessToken, activeAccount.id));
    setFacebookGroups(groups);
    const selectedIds = await reconcileSelectedFacebookGroups(
      groups,
      await getSelectedFacebookGroupIds(activeAccount.id),
      activeAccount.id,
    );

    setFacebookGroupLoadState('READY');
    setFacebookGroupMessage(
      groups.length > 0
        ? buildFacebookGroupSelectionMessage(selectedIds, groups, discoverySummary)
        : 'Đã quét được 0 nhóm',
    );

    return { groups, selectedIds, discoverySummary, details, scanComplete: scanResult.scanComplete };
  }, [collectJoinedFacebookGroupsFromFacebookPage, facebookAccount, reconcileSelectedFacebookGroups]);

  const handleSyncFacebookGroups = useCallback(async () => {
    if (!token || isFacebookGroupLoading(facebookGroupLoadState)) return;
    try {
      const result = await syncFacebookGroupsFromBrowser(token);
      if (result.groups.length === 0) {
        setFacebookGroupMessage('Đã quét được 0 nhóm');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
      }
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(toErrorMessage(err));
    }
  }, [facebookGroupLoadState, onAuthRequired, syncFacebookGroupsFromBrowser, token]);

  const refreshFacebookGroupsForSettings = useCallback(async (accessToken = token) => {
    if (!accessToken) return;
    setFacebookSettingsState('LOADING');
    setFacebookSettingsMessage(null);
    try {
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(accessToken, facebookAccount?.id));
      setFacebookGroups(groups);
      await reconcileSelectedFacebookGroups(groups);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(
        groups.length > 0 ? null : 'Chưa có nhóm Facebook nào được cấu hình cho tài khoản này.',
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
        return;
      }
      if (isDuplicateFacebookGroupError(err)) {
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage('Nhóm Facebook đã tồn tại.');
        return;
      }
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage(toErrorMessage(err));
    }
  }, [facebookAccount?.id, onAuthRequired, reconcileSelectedFacebookGroups, token]);

  const openFacebookGroupSettings = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!token) {
      onAuthRequired('Sign in to VCS Recruitment before configuring Facebook groups.');
      return;
    }
    setIsFacebookSettingsOpen(true);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsMessage(null);
    await refreshFacebookGroupsForSettings(token);
  }, [onAuthRequired, refreshFacebookGroupsForSettings, token]);

  const closeFacebookGroupSettings = useCallback(() => {
    setIsFacebookSettingsOpen(false);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsState('IDLE');
    setFacebookSettingsMessage(null);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
  }, []);

  const openFacebookGroupCreateModal = useCallback(() => {
    setIsFacebookGroupFormOpen(true);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setFacebookSettingsMessage(null);
    setFacebookSettingsState('READY');
  }, []);

  const closeFacebookGroupCreateModal = useCallback(() => {
    if (facebookSettingsState === 'SAVING') return;
    setIsFacebookGroupFormOpen(false);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setFacebookSettingsMessage(validFacebookGroups.length > 0 ? null : 'Chưa có nhóm Facebook nào.');
    setFacebookSettingsState('READY');
  }, [facebookSettingsState, validFacebookGroups.length]);

  const saveFacebookGroupForm = useCallback(async (name: string, url: string, editingGroup?: FacebookPublishTarget | null) => {
    if (!token) return;
    const targetName = name.trim();
    const targetUrl = url.trim();
    const nameError = targetName ? null : 'Tên nhóm là bắt buộc, không được để trống.';
    const targetUrlError = editingGroup ? null : getFacebookGroupUrlValidationError(targetUrl, facebookGroups);
    setFacebookGroupNameError(nameError);
    setFacebookGroupUrlError(targetUrlError);
    if (nameError || targetUrlError) {
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      return;
    }
    setFacebookSettingsState('SAVING');
    setFacebookSettingsMessage(null);

    try {
      if (editingGroup?.targetId) {
        await updateFacebookGroup(token, editingGroup.targetId, {
          targetName,
          facebookAccountId: facebookAccount?.id,
        });
        const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
        setFacebookGroups(groups);
        const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage(null);
        showToast('SUCCESS', 'Thành công', 'Đã sửa nhóm thành công.');
        if (selectedPostingChannels.includes('FACEBOOK')) {
          setFacebookGroupLoadState('READY');
          setFacebookGroupMessage(buildFacebookGroupSelectionMessage(nextSelectedIds, groups));
        }
      } else {
        await createFacebookGroup(token, {
          targetName,
          targetUrl,
          facebookAccountId: facebookAccount?.id,
        });
        const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
        setFacebookGroups(groups);
        const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
        setFacebookGroupName('');
        setFacebookGroupNameError(null);
        setFacebookGroupUrl('');
        setFacebookGroupUrlError(null);
        setIsFacebookGroupFormOpen(false);
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage(null);
        showToast('SUCCESS', 'Thành công', 'Đã thêm nhóm thành công');
        if (selectedPostingChannels.includes('FACEBOOK')) {
          setFacebookGroupLoadState('READY');
          setFacebookGroupMessage(buildFacebookGroupSelectionMessage(nextSelectedIds, groups));
        }
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
        return;
      }
      if (isDuplicateFacebookGroupError(err)) {
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage(null);
        setFacebookGroupUrlError('Link URL không được trùng với nhóm đã tồn tại trong hệ thống.');
        return;
      }
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage(toErrorMessage(err));
    }
  }, [facebookAccount?.id, facebookGroups, onAuthRequired, reconcileSelectedFacebookGroups, selectedPostingChannels, showToast, token]);

  const confirmDeleteFacebookGroup = useCallback(async (group: FacebookPublishTarget) => {
    if (!token || !group.targetId) return false;
    setFacebookSettingsState('SAVING');
    setFacebookSettingsMessage(null);
    try {
      await deleteFacebookGroup(token, group.targetId, facebookAccount?.id);
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(
        groups,
        selectedFacebookGroupIds.filter((targetId) => targetId !== group.targetId),
      );
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      showToast('SUCCESS', 'Thành công', 'Đã xóa nhóm thành công');
      if (selectedPostingChannels.includes('FACEBOOK')) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(
          groups.length > 0
            ? buildFacebookGroupSelectionMessage(nextSelectedIds, groups)
            : 'Đã quét được 0 nhóm',
        );
      }
      return true;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
        return false;
      }
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage(toErrorMessage(err));
      return false;
    }
  }, [facebookAccount?.id, onAuthRequired, reconcileSelectedFacebookGroups, selectedFacebookGroupIds, selectedPostingChannels, showToast, token]);

  const processFacebookGroupVerificationQueue = useCallback(async () => {
    if (facebookGroupVerificationRunningRef.current) return;
    facebookGroupVerificationRunningRef.current = true;

    try {
      while (facebookGroupVerificationQueueRef.current.length > 0) {
        const group = facebookGroupVerificationQueueRef.current[0];
        facebookGroupVerificationQueueRef.current = facebookGroupVerificationQueueRef.current.slice(1);
        setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));
        if (!group.targetId) continue;

        const accessToken = tokenRef.current;
        if (!accessToken) {
          onAuthRequired('Sign in to VCS Recruitment before checking Facebook groups.');
          setFacebookSettingsState('ERROR');
          setFacebookSettingsMessage('Sign in to VCS Recruitment before checking Facebook groups.');
          break;
        }

        activeFacebookGroupVerificationIdRef.current = group.targetId;
        setVerifyingFacebookGroupIds([group.targetId]);
        setFacebookSettingsState('READY');
        try {
          const eligibility = await verifyFacebookGroupPostingEligibility(group);
          const savedGroup = await verifyFacebookGroup(accessToken, group.targetId, {
            eligibilityStatus: eligibility.eligibilityStatus,
            eligibilityReason: eligibility.eligibilityReason,
            verifiedAt: eligibility.verifiedAt,
            facebookAccountId: facebookAccount?.id,
          });
          const groups = replaceFacebookGroup(facebookGroupsRef.current, savedGroup);
          facebookGroupsRef.current = groups;
          setFacebookGroups(groups);
          const nextSelectedIds = await reconcileSelectedFacebookGroups(groups, selectedFacebookGroupIdsRef.current);
          if (channelsRef.current.includes('FACEBOOK')) {
            setFacebookGroupLoadState('READY');
            setFacebookGroupMessage(buildFacebookGroupSelectionMessage(nextSelectedIds, groups));
          }
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 401) {
            facebookGroupVerificationQueueRef.current = [];
            setQueuedFacebookGroupIds([]);
            await clearAccessToken();
            onAuthRequired('Authentication expired. Sign in again before checking Facebook groups.');
            return;
          }
          setFacebookSettingsState('READY');
          setFacebookSettingsMessage(`Could not check "${group.targetName}": ${toErrorMessage(err)}`);
        } finally {
          activeFacebookGroupVerificationIdRef.current = null;
          setVerifyingFacebookGroupIds([]);
        }
      }
    } finally {
      facebookGroupVerificationRunningRef.current = false;
      activeFacebookGroupVerificationIdRef.current = null;
      setVerifyingFacebookGroupIds([]);
      setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));
      if (facebookGroupVerificationQueueRef.current.length > 0) {
        void processFacebookGroupVerificationQueue();
      }
    }
  }, [facebookAccount?.id, onAuthRequired, reconcileSelectedFacebookGroups]);

  const verifyFacebookGroupAction = useCallback((group: FacebookPublishTarget) => {
    if (!tokenRef.current || !group.targetId) return;
    if (
      activeFacebookGroupVerificationIdRef.current === group.targetId
      || facebookGroupVerificationQueueRef.current.some((item) => item.targetId === group.targetId)
    ) {
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      return;
    }
    facebookGroupVerificationQueueRef.current = [...facebookGroupVerificationQueueRef.current, group];
    setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));
    setFacebookSettingsState('READY');
    setFacebookSettingsMessage(null);
    void processFacebookGroupVerificationQueue();
  }, [processFacebookGroupVerificationQueue]);

  const manualIncludeFacebookGroupAction = useCallback(async (item: FacebookGroupSyncDetailItem) => {
    if (!token || !facebookAccount || !item.url) return;
    const key = getFacebookGroupDetailKey(item);
    setManualIncludingFacebookGroupKeys((keys) => [...keys, key]);
    try {
      await manuallyIncludeFacebookGroup(token, {
        targetName: item.name,
        targetUrl: item.url,
        targetExternalId: item.externalId,
        facebookAccountId: facebookAccount.id,
      });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      await reconcileSelectedFacebookGroups(groups);
      setFacebookGroupSyncDetails((details) => {
        if (!details) return null;
        return {
          ...details,
          filtered: details.filtered.filter((filteredItem) => getFacebookGroupDetailKey(filteredItem) !== key),
          accepted: [...details.accepted, item],
        };
      });
      showToast('SUCCESS', 'Thành công', `Đã thêm nhóm "${item.name}" vào danh sách`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
        return;
      }
      showToast('ERROR', 'Thất bại', toErrorMessage(err));
    } finally {
      setManualIncludingFacebookGroupKeys((keys) => keys.filter((k) => k !== key));
    }
  }, [facebookAccount?.id, onAuthRequired, reconcileSelectedFacebookGroups, showToast, token]);

  const syncFacebookImageStatusesFromHistory = useCallback(async (items: FacebookPublishHistoryListItem[]) => {
    if (items.length === 0) return;
    try {
      const released = await syncFacebookImagePublishStatuses(items.map((item) => ({
        jobPostingId: item.jobPostingId,
        targetId: item.targetId,
        targetExternalId: item.targetExternalId,
        targetName: item.targetName,
        targetUrl: item.targetUrl,
        facebookReviewStatus: item.facebookReviewStatus,
      })));
      await clearFacebookImageViewIfReleased(released);
    } catch {
      // Image lifecycle persistence must not prevent history from loading.
    }
  }, [clearFacebookImageViewIfReleased]);

  const syncFacebookImageStatusFromHistoryItem = useCallback(async (
    item: FacebookPublishHistoryListItem,
    facebookReviewStatus: FacebookReviewStatus,
  ) => {
    try {
      const released = await updateFacebookImagePublishTargetStatus({
        jobPostingId: item.jobPostingId,
        targetId: item.targetId,
        targetExternalId: item.targetExternalId,
        targetName: item.targetName,
        targetUrl: item.targetUrl,
        facebookReviewStatus,
      });
      await clearFacebookImageViewIfReleased(released);
    } catch {
      // Image lifecycle persistence must not prevent a Facebook status refresh from completing.
    }
  }, [clearFacebookImageViewIfReleased]);

  const loadFacebookPostHistory = useCallback(async (
    group = selectedFacebookHistoryGroup,
    filter = facebookHistoryFilter,
    page = facebookHistoryPage,
  ) => {
    if (!group) return;
    if (!group.id) {
      setFacebookHistoryLoadState('ERROR');
      setFacebookHistoryMessage('Không thể tải lịch sử vì nhóm Facebook chưa có mã định danh.');
      return;
    }
    const accessToken = tokenRef.current;
    if (!accessToken) {
      setFacebookHistoryLoadState('ERROR');
      setFacebookHistoryMessage('Sign in to VCS Recruitment before viewing Facebook post history.');
      onAuthRequired();
      return;
    }
    setFacebookHistoryLoadState('LOADING');
    setFacebookHistoryMessage(null);
    try {
      const data = await listFacebookGroupPublishHistories(accessToken, group.id, {
        status: filter,
        page,
        limit: FACEBOOK_HISTORY_PAGE_SIZE,
      });
      if (data.total > 0 && data.items.length === 0 && page > data.totalPages) {
        await loadFacebookPostHistory(group, filter, data.totalPages);
        return;
      }
      setFacebookHistoryData(data);
      setFacebookHistoryPage(data.page);
      setFacebookHistoryLoadState('READY');
      setFacebookHistoryMessage(null);
      await syncFacebookImageStatusesFromHistory(data.items);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
        setFacebookHistoryLoadState('ERROR');
        setFacebookHistoryMessage('Authentication expired. Sign in again before viewing Facebook history.');
        return;
      }
      setFacebookHistoryLoadState('ERROR');
      setFacebookHistoryMessage(toErrorMessage(err));
    }
  }, [facebookHistoryFilter, facebookHistoryPage, onAuthRequired, selectedFacebookHistoryGroup, syncFacebookImageStatusesFromHistory]);

  const openFacebookPostHistory = useCallback((group: FacebookHistoryGroup) => {
    setSelectedFacebookHistoryGroup(group);
    setFacebookHistoryFilter('ALL');
    setFacebookHistoryPage(1);
    setFacebookHistoryData(null);
    setFacebookHistoryLoadState('IDLE');
    setFacebookHistoryMessage(null);
    void loadFacebookPostHistory(group, 'ALL', 1);
  }, [loadFacebookPostHistory]);

  const closeFacebookPostHistory = useCallback(() => {
    setSelectedFacebookHistoryGroup(null);
    setFacebookHistoryFilter('ALL');
    setFacebookHistoryPage(1);
    setFacebookHistoryData(null);
    setFacebookHistoryLoadState('IDLE');
    setFacebookHistoryMessage(null);
    setIsRefreshingFacebookHistoryGroup(false);
  }, []);

  const handleFacebookHistoryFilterChange = useCallback(async (filter: FacebookPostHistoryFilter) => {
    setFacebookHistoryFilter(filter);
    setFacebookHistoryPage(1);
    await loadFacebookPostHistory(selectedFacebookHistoryGroup, filter, 1);
  }, [loadFacebookPostHistory, selectedFacebookHistoryGroup]);

  const handleFacebookHistoryPageChange = useCallback(async (page: number) => {
    const pageCount = Math.max(1, facebookHistoryData?.totalPages ?? 1);
    const nextPage = Math.min(pageCount, Math.max(1, page));
    setFacebookHistoryPage(nextPage);
    await loadFacebookPostHistory(selectedFacebookHistoryGroup, facebookHistoryFilter, nextPage);
  }, [facebookHistoryData?.totalPages, facebookHistoryFilter, loadFacebookPostHistory, selectedFacebookHistoryGroup]);

  const loadRefreshableFacebookHistoryItems = useCallback(async (accessToken: string, group: FacebookHistoryGroup) => {
    const statuses: FacebookReviewStatus[] = ['PENDING_REVIEW', 'UNKNOWN'];
    const items: FacebookPublishHistoryListItem[] = [];
    for (const status of statuses) {
      let page = 1;
      let totalPages = 1;
      do {
        const response = await listFacebookGroupPublishHistories(accessToken, group.id ?? '', {
          status,
          page,
          limit: FACEBOOK_HISTORY_REFRESH_BATCH_SIZE,
        });
        items.push(...response.items
          .map((item) => withFacebookHistoryGroupFallback(item, group))
          .filter(isRefreshableFacebookHistoryItem));
        totalPages = response.totalPages;
        page += 1;
      } while (page <= totalPages);
    }
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }, []);

  const refreshFacebookPostHistoriesBatch = useCallback(async () => {
    const group = selectedFacebookHistoryGroup;
    const accessToken = tokenRef.current;
    if (!group?.id) {
      setFacebookHistoryMessage('Không thể refresh vì nhóm Facebook chưa có mã định danh.');
      return;
    }
    if (!accessToken) {
      onAuthRequired();
      setFacebookHistoryMessage('Sign in to VCS Recruitment before refreshing Facebook post status.');
      return;
    }
    setIsRefreshingFacebookHistoryGroup(true);
    setFacebookHistoryMessage('Đang lấy danh sách bài cần kiểm tra lại.');
    try {
      const itemsToRefresh = await loadRefreshableFacebookHistoryItems(accessToken, group);
      if (itemsToRefresh.length === 0) {
        setFacebookHistoryMessage(null);
        showToast(
          FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.kind,
          FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.title,
          FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.message,
        );
        return;
      }
      for (let index = 0; index < itemsToRefresh.length; index += 1) {
        const item = itemsToRefresh[index];
        setFacebookHistoryMessage(`Đang kiểm tra ${index + 1}/${itemsToRefresh.length}: ${item.title}`);
        try {
          const statusCheck = await refreshFacebookPostReviewStatus(item);
          await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
          await syncFacebookImageStatusFromHistoryItem(item, statusCheck.facebookReviewStatus);
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 401) {
            await clearAccessToken();
            onAuthRequired();
            setFacebookHistoryMessage('Authentication expired. Sign in again before refreshing Facebook history.');
            return;
          }
        }
      }
      await loadFacebookPostHistory(group, facebookHistoryFilter, facebookHistoryPage);
      setFacebookHistoryMessage(null);
      showToast(
        FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.kind,
        FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.title,
        FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.message,
      );
    } catch (err) {
      setFacebookHistoryMessage(toErrorMessage(err));
    } finally {
      setIsRefreshingFacebookHistoryGroup(false);
    }
  }, [facebookHistoryFilter, facebookHistoryPage, loadFacebookPostHistory, loadRefreshableFacebookHistoryItems, onAuthRequired, selectedFacebookHistoryGroup, showToast, syncFacebookImageStatusFromHistoryItem]);

  const refreshFacebookPostHistoryItem = useCallback(async (item: FacebookPublishHistoryListItem) => {
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    try {
      const statusCheck = await refreshFacebookPostReviewStatus(item);
      await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
      await syncFacebookImageStatusFromHistoryItem(item, statusCheck.facebookReviewStatus);
      await loadFacebookPostHistory(selectedFacebookHistoryGroup, facebookHistoryFilter, facebookHistoryPage);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        onAuthRequired();
      }
    }
  }, [facebookHistoryFilter, facebookHistoryPage, loadFacebookPostHistory, onAuthRequired, selectedFacebookHistoryGroup, syncFacebookImageStatusFromHistoryItem]);

  const restoreFacebookProgress = useCallback(async () => {
    try {
      const saved = await getLastFacebookPublishProgress();
      if (saved) setFacebookProgress(saved);
    } catch {
      // Ignore
    }
  }, []);

  const restoreSelectedFacebookGroups = useCallback(async (accountId?: string) => {
    try {
      const savedIds = await getSelectedFacebookGroupIds(accountId);
      setSelectedFacebookGroupIdsState(savedIds);
    } catch {
      // Ignore
    }
  }, []);

  const applyStoredFacebookContentDraft = useCallback(async (
    recruitmentId: string | null,
    nextSnapshot: AmisJobSnapshot,
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ) => {
    const generationSeq = facebookContentGenerationSeqRef.current;
    const draftScope = await getFacebookContentDraftScope(jobDescription);
    if (facebookContentGenerationSeqRef.current !== generationSeq) return false;

    const draft = await getFacebookContentDraft({
      recruitmentId,
      tabId: draftScope.tabId,
      jobDescriptionId: draftScope.jobDescriptionId,
      snapshot: nextSnapshot,
    });
    if (facebookContentGenerationSeqRef.current !== generationSeq) return false;

    const content = draft?.content.trim();
    if (!content) return false;

    facebookContentSnapshotKeyRef.current = getFacebookContentSnapshotKey(recruitmentId, nextSnapshot);
    facebookContentSnapshotFingerprintRef.current = buildFacebookDraftSnapshotFingerprint(nextSnapshot);
    facebookContentJobIdentityRef.current = buildFacebookJobIdentity(nextSnapshot);
    facebookContentRef.current = content;
    facebookContentSourceRef.current = draft?.source ?? 'CUSTOM';
    setFacebookContent(content);
    setFacebookContentDraft(content);
    setFacebookContentState('READY');
    setFacebookContentMessage('Đang dùng bản nháp Facebook đã lưu cho JD hiện tại.');
    return true;
  }, [getFacebookContentDraftScope, selectedJobDescription]);

  const executeFacebookPublish = useCallback(async (
    planForPublish: FacebookPublishPlan,
  ) => {
    if (!token) throw new Error('Missing token');
    const imageScope = getFacebookImageAttachmentScope();
    const storedImageAttachments = planForPublish.attachments?.length
      ? []
      : await getFacebookImageAttachments(imageScope);
    const publishPlan = withFacebookImageAttachments(planForPublish, storedImageAttachments);
    setFacebookPublishResultsVisible(true);
    const planKey = getFacebookPlanKey(publishPlan);
    if (startedFacebookPlanKeys.current.has(planKey)) return null;

    if (publishPlan.attachments?.length) {
      await beginFacebookImagePublish(
        imageScope,
        publishPlan.jobPostingId,
        publishPlan.targets,
      );
    }

    startedFacebookPlanKeys.current.add(planKey);
    setFacebookRunning(true);
    try {
      const facebookResults = await publishFacebookPlan(token, publishPlan, {
        onProgress: (progress) => {
          setFacebookProgress(progress);
          void saveLastFacebookPublishProgress(progress);
        },
        onImageAttachFailed: requestFacebookImageAttachDecision,
      });

      if (publishPlan.attachments?.length) {
        try {
          const released = await syncFacebookImagePublishStatuses(facebookResults.map((publishResult) => {
            const target = publishPlan.targets.find((candidate) => (
              candidate.targetId === publishResult.targetId
              || candidate.targetUrl === publishResult.targetUrl
              || candidate.targetName === publishResult.targetName
            ));
            return {
              jobPostingId: publishPlan.jobPostingId,
              targetId: publishResult.targetId,
              targetExternalId: target?.targetExternalId ?? null,
              targetName: publishResult.targetName,
              targetUrl: publishResult.targetUrl ?? target?.targetUrl ?? null,
              facebookReviewStatus: publishResult.facebookReviewStatus ?? 'UNKNOWN',
            };
          }));
          await clearFacebookImageViewIfReleased(released);
        } catch {
          // Facebook's result is authoritative
        }
      }

      const summary = summarizeFacebookPublishResults(facebookResults);
      setSyncResult((current) => current ? updateFacebookChannelStatus(current, facebookResults) : current);

      if (summary.successCount > 0) {
        const previousDraftScope = facebookContentDraftScopeRef.current;
        const draftScope = await getFacebookContentDraftScope();
        await clearStoredFacebookContentDraft({
          recruitmentId: amisRecruitmentId,
          tabId: draftScope.tabId ?? previousDraftScope.tabId,
          jobDescriptionId: draftScope.jobDescriptionId ?? previousDraftScope.jobDescriptionId,
          snapshot,
        });
      }
      return { facebookResults, summary };
    } finally {
      setFacebookRunning(false);
    }
  }, [amisRecruitmentId, clearFacebookImageViewIfReleased, getFacebookContentDraftScope, getFacebookImageAttachmentScope, requestFacebookImageAttachDecision, setSyncResult, snapshot, token]);

  const facebookConfig = useMemo(() => ({
    selectedPostingChannels,
    onToggleChannel,
    facebookGroupLoadState,
    facebookGroupMessage,
    facebookGroupDiagnostic,
    visibleFacebookGroups,
    visibleSelectedFacebookGroupCount,
    selectedFacebookGroupIds,
    onToggleFacebookGroupSelection: toggleFacebookGroupSelection,
    onOpenFacebookPostHistory: openFacebookPostHistory,
    onOpenFacebookGroupSettings: openFacebookGroupSettings,
    onOpenFacebookIneligibleModal: () => setIsFacebookGroupSyncDetailsOpen(true),
    onSyncFacebookGroups: handleSyncFacebookGroups,
    facebookImageInputRef,
    facebookImageAttachments,
    isFacebookImageReading,
    facebookImageAttachmentError,
    facebookImageUploadDisabled,
    onHandleFacebookImageFileChange: handleFacebookImageFileChange,
    onClearFacebookImageAttachment: clearFacebookImageAttachment,
    facebookSelected,
    facebookContentBusy,
    facebookPreviewIdentity,
    snapshot,
    getEffectiveFacebookContent,
    onGenerateFacebookPostContent: generateFacebookPostContent,
    onOpenFacebookPreviewModal: openFacebookPreviewModal,
    facebookPublishResultsVisible,
    facebookProgress,
    facebookRunning,
  }), [
    clearFacebookImageAttachment,
    facebookContentBusy,
    facebookGroupDiagnostic,
    facebookGroupLoadState,
    facebookGroupMessage,
    facebookImageAttachmentError,
    facebookImageAttachments,
    facebookImageInputRef,
    facebookImageUploadDisabled,
    facebookPreviewIdentity,
    facebookProgress,
    facebookPublishResultsVisible,
    facebookRunning,
    facebookSelected,
    generateFacebookPostContent,
    getEffectiveFacebookContent,
    handleFacebookImageFileChange,
    handleSyncFacebookGroups,
    isFacebookImageReading,
    onToggleChannel,
    openFacebookGroupSettings,
    openFacebookPostHistory,
    openFacebookPreviewModal,
    selectedFacebookGroupIds,
    selectedPostingChannels,
    snapshot,
    toggleFacebookGroupSelection,
    visibleFacebookGroups,
    visibleSelectedFacebookGroupCount,
  ]);

  return {
    // States
    facebookAccount,
    facebookGroups,
    selectedFacebookGroupIds,
    facebookSelected,
    facebookRunning,
    isFacebookImageReading,
    hasFacebookImageAttachmentError,
    facebookProgress,
    facebookPublishResultsVisible,
    facebookContent,
    facebookContentState,
    facebookImageAttachments,

    // State setters
    setFacebookGroups,
    setFacebookAccount,
    setFacebookPreviewIdentity,
    setFacebookGroupLoadState,
    setFacebookGroupMessage,
    setFacebookProgress,
    setFacebookPublishResultsVisible,
    setFacebookRunning,

    // Methods
    loadFacebookGroupsForFacebookChannel,
    syncFacebookGroupsFromBrowser,
    handleSyncFacebookGroups,
    restoreSelectedFacebookGroups,
    restoreFacebookProgress,
    restoreFacebookImageAttachments,
    applyStoredFacebookContentDraft,
    clearFacebookContent,
    resetFacebookImageAttachmentView,
    generateFacebookPostContent,
    getEffectiveFacebookContent,
    executeFacebookPublish,
    refreshFacebookPostHistoryItem,

    // Config object for JobPostingPanel
    facebookConfig,

    // Modal state & props
    modals: {
      previewModal: {
        mode: facebookPreviewModalMode,
        token,
        snapshot,
        selectedJobDescription,
        facebookAccount,
        facebookPreviewIdentity,
        facebookContentBusy,
        facebookContentDraft,
        facebookImageAttachments,
        facebookImageUploadDisabled,
        facebookImageAddDisabled,
        isFacebookImageReading,
        facebookImageAttachmentError,
        getEffectiveFacebookContent,
        onClose: () => setFacebookPreviewModalMode(null),
        onSetMode: setFacebookPreviewModalMode,
        onContentDraftChange: setFacebookContentDraft,
        onOpenImageFilePicker: () => {
          if (!facebookImageAddDisabled) facebookImageInputRef.current?.click();
        },
        onClearImageAttachment: (index?: number) => void clearFacebookImageAttachment(index),
        onSaveContentDraft: () => void saveFacebookContentDraft(),
        onGeneratePostContent: (opts?: { mode?: 'TEMPLATE' | 'AI' }) => void generateFacebookPostContent(opts),
        onGenerateDraftContent: () => void generateFacebookDraftContent(),
        onOpenEditModal: () => {
          setFacebookContentDraft(getEffectiveFacebookContent());
          setFacebookPreviewModalMode('EDIT');
        },
      },
      settingsModal: {
        isOpen: isFacebookSettingsOpen,
        facebookGroups,
        facebookSettingsState,
        facebookSettingsMessage,
        verifyingFacebookGroupIds,
        queuedFacebookGroupIds,
        isGroupFormOpen: isFacebookGroupFormOpen,
        onClose: closeFacebookGroupSettings,
        onOpenCreateModal: openFacebookGroupCreateModal,
        onCheckEligibility: (group: FacebookPublishTarget) => void verifyFacebookGroupAction(group),
        onEditGroup: (group: FacebookPublishTarget, name: string, url: string) => void saveFacebookGroupForm(name, url, group),
        onDeleteGroup: (group: FacebookPublishTarget) => confirmDeleteFacebookGroup(group),
        onCreateGroup: (name: string, url: string) => void saveFacebookGroupForm(name, url),
        createGroupName: facebookGroupName,
        createGroupUrl: facebookGroupUrl,
        createGroupNameError: facebookGroupNameError,
        createGroupUrlError: facebookGroupUrlFieldError,
        onCreateGroupNameChange: (name: string) => {
          setFacebookGroupName(name);
          if (facebookGroupNameError) setFacebookGroupNameError(null);
        },
        onCreateGroupUrlChange: (url: string) => {
          setFacebookGroupUrl(url);
          if (facebookGroupUrlError) setFacebookGroupUrlError(null);
        },
        onCloseCreateModal: closeFacebookGroupCreateModal,
      },
      imageAttachPromptModal: {
        prompt: facebookImageAttachPrompt,
        onResolve: resolveFacebookImageAttachPrompt,
      },
      syncDetailsModal: {
        isOpen: isFacebookGroupSyncDetailsOpen,
        syncDetails: facebookGroupSyncDetails,
        totalGroupCount: facebookGroups.length,
        manualIncludingKeys: manualIncludingFacebookGroupKeys,
        onClose: () => setIsFacebookGroupSyncDetailsOpen(false),
        onManuallyInclude: (group: FacebookGroupSyncDetailItem) => void manualIncludeFacebookGroupAction(group),
      },
      postHistoryModal: {
        group: selectedFacebookHistoryGroup,
        historyData: facebookHistoryData,
        page: facebookHistoryPage,
        filter: facebookHistoryFilter,
        loadState: facebookHistoryLoadState,
        message: facebookHistoryMessage,
        isRefreshing: isRefreshingFacebookHistoriesBatch,
        onClose: closeFacebookPostHistory,
        onChangeFilter: (f: FacebookPostHistoryFilter) => void handleFacebookHistoryFilterChange(f),
        onChangePage: (p: number) => void handleFacebookHistoryPageChange(p),
        onRefresh: () => void refreshFacebookPostHistoriesBatch(),
      },
    },
  };
}
