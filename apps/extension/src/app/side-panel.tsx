import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isEmailAddress } from '@interview-assistant/shared';
import { extractAmisJobFromDetailApi } from '@/integrations/amis/amis-detail-api-extractor';
import { extractAmisJobFromPage } from '@/integrations/amis/amis-page-extractor';
import { getLastAutoSyncState } from '@/stores/amis-auto-sync-store';
import { getLastAmisCapture } from '@/stores/amis-capture-store';
import { ensureAmisHooksInActiveTab } from '@/integrations/amis/amis-hook-installer';
import { hashText } from '@/hash-text';
import {
  clearAmisTemplateContextForTab,
  getAmisTemplateContextForRecruitment,
  getAmisTemplateContextForTab,
  saveAmisTemplateContext,
  saveAmisTemplateContextForRecruitment,
} from '@/integrations/amis/amis-template-context-store';
import {
  ApiClientError,
  createFacebookGroup,
  deleteFacebookGroup,
  downloadCleanCvFile,
  ensureRegisteredExtensionInstance,
  getApplicationDetail,
  getApplicationParsedProfile,
  getAmisApplicationsForRecruitment,
  getCurrentUser,
  getFacebookGroups,
  getJobDescriptionQuestionSet,
  generateFacebookPreviewContent,
  listFacebookGroupPublishHistories,
  manuallyIncludeFacebookGroup,
  listJobDescriptions,
  heartbeatExtensionInstance,
  login,
  refreshAccessToken,
  requestInternalPassword,
  resolveFacebookAccount,
  runApplicationAiScreening,
  syncAmisApplications,
  syncAndPublishAmisJob,
  syncFacebookGroups,
  updateAmisApplicationStage,
  updateFacebookGroup,
  updateFacebookPublishHistoryStatusCheck,
  verifyFacebookGroup,
} from '@/lib/api-client';
import { createAiMatchPreviewPdfBase64 } from '@/features/recruitment/ai-match-preview-pdf-export';
import { clearAccessToken, getAccessToken, setAuthTokens, subscribeAuthTokenChanges } from '@/features/auth/auth-store';
import { getSelectedChannels, setSelectedChannels } from '@/stores/channel-preferences';
import { toVietnameseErrorMessage } from '@/lib/error-messages';
import {
  DEFAULT_POSTING_CHANNELS,
  FACEBOOK_MAX_IMAGE_ATTACHMENTS,
  FRONTEND_BASE_URL,
  POSTING_CHANNELS,
} from '@/lib/config';
import { summarizeFacebookPublishResults, updateFacebookChannelStatus } from '@/features/facebook/facebook-channel-status';
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
import { getValidFacebookGroupPostUrl } from '@/features/facebook/facebook-post-url';
import {
  ensureFacebookLoginInTab,
  ensureFacebookSession,
  publishFacebookPlan,
  refreshFacebookPostReviewStatus,
  verifyFacebookGroupPostingEligibility,
  type FacebookAccountIdentity,
} from '@/features/facebook/facebook-publish-orchestrator';
import {
  collectFacebookGroupsFromGraphql,
  type FacebookGraphqlCollectionResult,
} from '@/features/facebook/facebook-group-graphql-capture';
import { getLastFacebookPublishProgress, saveLastFacebookPublishProgress } from '@/stores/facebook-publish-store';
import { createMockAmisSyncRequest } from '@/lib/mock-amis';
import { ReferralManagementPanel } from '@/features/referrals/referral-management';
import { FreelancerCvPanel } from '@/features/freelancer/freelancer-cv-panel';
import { LoginForm } from '@/features/auth/LoginForm';
import { FilterDropdown, SearchField, SelectFilter } from '@/components/filters';
import {
  BackIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CvIcon,
  DoubleBackIcon,
  DoubleChevronRightIcon,
  DownloadIcon,
  EditIcon,
  ExternalLinkIcon,
  FacebookGenerateIcon,
  GearIcon,
  HistoryIcon,
  HomeIcon,
  ImageFrameIcon,
  InfoExportIcon,
  MenuLinesIcon,
  MoreVerticalIcon,
  PeopleIcon,
  PinIcon,
  PostingIcon,
  RefreshIcon,
  SaveIcon,
  SourceIcon,
  SparklesIcon,
  TrashIcon,
  WarningIcon,
} from '@/components/icons';
import { CandidateAvatar } from '@/components/candidates/CandidateAvatar';
import { FacebookGroupFormModal } from '@/components/facebook/FacebookGroupFormModal';
import { clearSelectedJobQuestionContextForTab, saveSelectedJobQuestionContext } from '@/stores/selected-job-question-store';
import type {
  AmisAutoSyncState,
  AmisApplicationsForRecruitment,
  AmisApplicationItem,
  AmisCandidateStageChangedPayload,
  AmisExtractionResult,
  AmisJobSnapshot,
  AmisRecruitmentRound,
  ApiPagination,
  ChannelPostingResult,
  ExtensionChannel,
  ExtensionSyncResponse,
  DiscoverFacebookGroupsResponse,
  ExtensionUser,
  FacebookImageAttachFailureContext,
  FacebookImageAttachFailureDecision,
  FacebookPublishAttachment,
  FacebookPublishHistoriesResponse,
  FacebookPublishHistoryListItem,
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishTarget,
  FacebookAccount,
  FacebookPublishTargetEligibilityStatus,
  FacebookReviewStatus,
  JobDescriptionQuestionSetContext,
  JobDescriptionSummary,
  SyncAmisJobPostingRequest,
  SyncVcsPortalJdsResponse,
} from '@/types/types';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
type ExtensionToastKind = 'SUCCESS' | 'ERROR';
type ExtensionToastState = {
  id: number;
  kind: ExtensionToastKind;
  title: string;
  message: string;
};
type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
type WorkspaceTab = 'overview' | 'posting' | 'cv' | 'freelancer' | 'internal';
type CvWorkspaceView = 'overview' | 'list';
type CvStatusFilter = 'ALL' | 'PASSED' | 'REVIEW' | 'FAILED';
type CvQuestionFilter = 'ALL' | 'ANSWERED' | 'NOT_ANSWERED';
type CvSyncFilter = 'ALL' | 'AMIS_SYNCED' | 'AMIS_NOT_SYNCED';
type CvEvaluationFilter = 'ALL' | 'NOT_EVALUATED' | 'EVALUATION_NOT_UPLOADED' | 'EVALUATION_UPLOADED';
type CvSyncStatusBucket = 'SYNCED' | 'NOT_SYNCED' | 'ERROR';
type CvSortMode = 'SCORE_DESC' | 'SCORE_ASC' | 'APPLIED_DESC' | 'APPLIED_ASC';
type CvSourceFilter = 'ALL' | 'FACEBOOK' | 'VCS_PORTAL' | 'FREELANCER' | 'INTERNAL';
type CvFilterDropdownKey = 'QUESTION' | 'SYNC' | 'EVALUATION' | 'SOURCE' | 'SORT';
type FacebookPostHistoryFilter = 'ALL' | FacebookReviewStatus;
type FacebookPostHistoryLoadState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type FacebookContentState = 'IDLE' | 'GENERATING' | 'READY' | 'ERROR';
type FacebookContentSource = 'EMPTY' | 'DEFAULT' | 'AI' | 'TEMPLATE' | 'CUSTOM';
type FacebookContentDraftScope = {
  tabId?: number | null;
  pageUrl?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionTitle?: string | null;
};
type FacebookGroupLoadState =
  | 'IDLE'
  | 'CHECKING_LOGIN'
  | 'WAITING_LOGIN'
  | 'LOADING_SAVED_GROUPS'
  | 'LOADING_GROUPS'
  | 'READY'
  | 'ERROR';
type FacebookPreviewModalMode = 'PREVIEW' | 'EDIT';
type FacebookGroupModalMode = 'SETTINGS' | 'EDIT' | 'DELETE';
type ApplicationsState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type FacebookImageAttachmentState = 'IDLE' | 'READING' | 'READY' | 'ERROR';

const FACEBOOK_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const FACEBOOK_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FACEBOOK_IMAGE_ALLOWED_TYPES = new Set(FACEBOOK_IMAGE_ACCEPT.split(','));

interface FacebookHistoryGroup {
  id: string | null;
  name: string;
  url?: string | null;
  externalId?: string | null;
}

interface FacebookImageAttachDecisionPrompt extends FacebookImageAttachFailureContext { }

interface DiscoveredFacebookGroupItem {
  targetName: string;
  targetUrl: string;
  targetExternalId: string;
}

interface FacebookGroupsScanRunResult {
  groups: DiscoveredFacebookGroupItem[];
  scanComplete: boolean;
  expectedCount?: number | null;
  account?: FacebookAccountIdentity | null;
}

interface FacebookGroupsSyncResult {
  groups: FacebookPublishTarget[];
  selectedIds: string[];
  discoverySummary: string | null;
  details: FacebookGroupSyncDetails | null;
  scanComplete: boolean;
}

interface FacebookGroupSyncDetailItem {
  name: string;
  url?: string | null;
  externalId: string | null;
  targetId?: string | null;
  reason?: string | null;
}

interface FacebookGroupSyncDetails {
  requested: number;
  accepted: FacebookGroupSyncDetailItem[];
  removed: Array<{ name: string; externalId: string | null }>;
  reactivated: Array<{ name: string; externalId: string | null }>;
  filtered: FacebookGroupSyncDetailItem[];
  skipped: FacebookGroupSyncDetailItem[];
  errors: string[];
}

interface FacebookGroupUiItem {
  key: string;
  id: string | null;
  name: string;
  url?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  quotaLabel: string | null;
  selectable: boolean;
  disabledReason?: string | null;
}

interface AmisCandidateSourceSelectionDiagnostics {
  fieldFound: boolean;
  formScrollPasses: number;
  controlFound: boolean;
  dropdownOpened: boolean;
  popupFound: boolean;
  searchInputFound: boolean;
  searchInputLocation: 'FIELD' | 'POPUP' | null;
  searchQuery: string;
  optionScrollPasses: number;
  visibleOptionLabels: string[];
  sourceOptionFound: boolean;
  sourceOptionClicked: boolean;
  confirmedFieldValue: string;
  selectionAttempts: number;
}

interface AmisCandidateSourceSelectionResponse {
  ok: boolean;
  sourceName?: string;
  sourceId?: string;
  code?: string;
  diagnostics?: AmisCandidateSourceSelectionDiagnostics;
  error?: string;
}

const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_APPLICATIONS';
const UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE = 'VCS_UPLOAD_AMIS_CV_FILE';
const SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE = 'VCS_SELECT_AMIS_CANDIDATE_SOURCE';
const AMIS_SOURCE_NAME_BY_CHANNEL: Readonly<Record<string, string>> = {
  VCSPORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ITViec',
  LINKEDIN: 'LinkedIn',
  VIETNAMWORKS: 'VietnamWorks',
};
const GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_CONTEXT';
const GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_ROUNDS';
const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
const AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE = 'AMIS_CANDIDATE_STAGE_CHANGED';
const AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_ROUNDS_CHANGED';
const JOB_DESCRIPTION_QUESTION_SELECTION_PREFIX = 'vcs:selected-jd-questions:';
const MAX_POSTING_SNAPSHOT_REFRESH_ATTEMPTS = 3;
const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'posting', label: 'Đăng bài' },
  { id: 'cv', label: 'CV' },
  { id: 'freelancer', label: 'Freelancer' },
  { id: 'internal', label: 'Nội bộ' },
];
const CV_APPLICATION_PAGE_SIZE = 5;
const GET_AMIS_CANDIDATE_FORM_STATE_MESSAGE_TYPE = 'VCS_GET_AMIS_CANDIDATE_FORM_STATE';
const CV_QUESTION_FILTER_OPTIONS: Array<{ value: CvQuestionFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'NOT_ANSWERED', label: 'Chưa trả lời' },
  { value: 'ANSWERED', label: 'Đã trả lời' },
];
const CV_SYNC_FILTER_OPTIONS: Array<{ value: CvSyncFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'AMIS_NOT_SYNCED', label: 'Chưa đồng bộ' },
  { value: 'AMIS_SYNCED', label: 'Đã đồng bộ' },
];
const CV_EVALUATION_FILTER_OPTIONS: Array<{ value: CvEvaluationFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'NOT_EVALUATED', label: 'Chưa đánh giá bằng AI' },
  { value: 'EVALUATION_NOT_UPLOADED', label: 'Chưa tải lên file đánh giá' },
  { value: 'EVALUATION_UPLOADED', label: 'Đã tải lên file đánh giá' },
];
const CV_SORT_OPTIONS: Array<{ value: CvSortMode; label: string }> = [
  { value: 'APPLIED_DESC', label: 'Đã nộp mới đây' },
  { value: 'APPLIED_ASC', label: 'Đã nộp lâu nhất' },
  { value: 'SCORE_DESC', label: 'Điểm cao đến thấp' },
  { value: 'SCORE_ASC', label: 'Điểm thấp đến cao' },
];
const CV_SOURCE_FILTER_OPTIONS: Array<{ value: CvSourceFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'VCS_PORTAL', label: 'VCS Portal' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'INTERNAL', label: 'Nội bộ' },
];
const JOB_DESCRIPTION_STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Công khai' },
  { value: 'DRAFT', label: 'Nội bộ' },
  { value: 'CLOSED', label: 'Đóng' },
  { value: 'ARCHIVED', label: 'Ngừng tuyển' },
];
const FACEBOOK_HISTORY_PAGE_SIZE = 5;
const FACEBOOK_HISTORY_REFRESH_BATCH_SIZE = 50;
const FACEBOOK_GROUP_PAGE_SIZE = 5;
const FACEBOOK_INELIGIBLE_PAGE_SIZE = 5;
const FACEBOOK_HISTORY_FILTERS: Array<{ value: FacebookPostHistoryFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'POSTED', label: 'Đã đăng' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];
const POSTING_CHANNEL_SET = new Set<ExtensionChannel>(POSTING_CHANNELS);
type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

const AMIS_CV_UPLOAD_CONFIRMATION_TIMEOUT_MS = 60_000;
type ApplicationQuestionStatusCode = 'ANSWERED' | 'NOT_ANSWERED';
type ApplicationQuestionStatus = {
  code: ApplicationQuestionStatusCode;
  label: string;
  tone: 'is-success' | 'is-warning' | 'is-danger' | 'is-muted';
};

function getJobDescriptionQuestionSelectionStorageKey(jobDescriptionId: string) {
  return `${JOB_DESCRIPTION_QUESTION_SELECTION_PREFIX}${jobDescriptionId}`;
}

const EXTENSION_UI_ZOOM_STORAGE_KEY = 'vcs-extension-ui-zoom';
const EXTENSION_UI_ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
type ExtensionUiZoomLevel = (typeof EXTENSION_UI_ZOOM_LEVELS)[number];

function readExtensionUiZoom(): ExtensionUiZoomLevel {
  try {
    const storedZoom = Number(window.localStorage.getItem(EXTENSION_UI_ZOOM_STORAGE_KEY));
    const matchingZoom = EXTENSION_UI_ZOOM_LEVELS.find((zoom) => zoom === storedZoom);
    return matchingZoom ?? 1;
  } catch {
    return 1;
  }
}

function getExtensionUiZoomIndex(zoom: number) {
  const exactIndex = EXTENSION_UI_ZOOM_LEVELS.indexOf(zoom as ExtensionUiZoomLevel);
  if (exactIndex >= 0) return exactIndex;

  return EXTENSION_UI_ZOOM_LEVELS.reduce((nearestIndex, level, index, levels) => (
    Math.abs(level - zoom) < Math.abs(levels[nearestIndex] - zoom) ? index : nearestIndex
  ), 0);
}

type AmisTabContextResolution =
  | { kind: 'OUTSIDE' }
  | { kind: 'JOB_INITIATION' }
  | {
    kind: 'AMIS';
    context: ReturnType<typeof parseAmisRecruitmentContextFromUrl>;
    pageKind: string | null;
  };

async function resolveAmisTabContext(activeTab: { id: number; url?: string }): Promise<AmisTabContextResolution> {
  const activeTabUrl = activeTab.url;
  if (!activeTabUrl?.startsWith('https://amisapp.misa.vn/')) return { kind: 'OUTSIDE' };
  if (isAmisJobInitiationPage(activeTabUrl)) return { kind: 'JOB_INITIATION' };

  const context = parseAmisRecruitmentContextFromUrl(activeTabUrl);
  let pageKind: string | null = null;
  if (!context.amisRecruitmentId) {
    const pageContext = await sendMessageToAmisTab(activeTab.id, {
      type: GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE,
    });
    if (isAmisRecruitmentContextResponse(pageContext)) {
      pageKind = pageContext.pageKind ?? null;
      if (pageContext.ok) {
        context.amisRecruitmentId = pageContext.amisRecruitmentId ?? null;
        context.amisRecruitmentRoundId = pageContext.amisRecruitmentRoundId ?? null;
        context.sourceUrl = pageContext.sourceUrl ?? null;
      }
    }
  }

  return { kind: 'AMIS', context, pageKind };
}

async function buildAmisSourceSelectionMessage(
  tabId: number,
  applications: ExtensionApplication[],
) {
  const sourceChannels = new Set(applications.map((application) => normalizeAmisSourceChannel(application.sourceChannel)));
  const uniqueSourceChannel = sourceChannels.size === 1 ? [...sourceChannels][0] : null;
  const amisSourceName = getAmisSourceName(uniqueSourceChannel);
  const hasVcsPortalSource = sourceChannels.has('VCSPORTAL');

  if (amisSourceName && (applications.length === 1 || uniqueSourceChannel === 'VCSPORTAL')) {
    try {
      const sourceResponse = await sendMessageToAmisTab(tabId, {
        type: SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE,
        payload: { sourceName: amisSourceName },
      }, 0);
      return isConfirmedAmisCandidateSourceSelection(sourceResponse, amisSourceName)
        ? ` Đã chọn nguồn ứng viên ${amisSourceName} trên AMIS.`
        : ` CV đã được đưa vào form, nhưng chưa thể tự chọn nguồn ${amisSourceName}.${formatAmisCandidateSourceSelectionFailure(sourceResponse)}`;
    } catch (error) {
      return ` CV đã được đưa vào form, nhưng chưa thể tự chọn nguồn ${amisSourceName}. ${toErrorMessage(error)}`;
    }
  }

  if (applications.length === 1 && uniqueSourceChannel) {
    return ` Không tìm thấy mapping nguồn AMIS cho "${applications[0].sourceChannel ?? uniqueSourceChannel}"; extension không tự gán nguồn.`;
  }
  if (hasVcsPortalSource) {
    return ' CV đã được đưa vào form, nhưng không tự chọn nguồn VCS Portal vì lượt đồng bộ có nhiều nguồn khác nhau.';
  }
  return '';
}

async function extractPostingSnapshotFromActiveTab(
  tabId: number,
  recruitmentId: string,
  extractFromDetailApi: (tabId: number, recruitmentId: string) => Promise<AmisExtractionResult | undefined>,
  extractFromDom: (tabId: number) => Promise<AmisExtractionResult | undefined>,
) {
  const apiExtraction = await extractFromDetailApi(tabId, recruitmentId);
  return apiExtraction?.detected && apiExtraction.missingFields.length === 0
    ? apiExtraction
    : extractFromDom(tabId);
}

type AmisSyncPreconditionInput = {
  hasToken: boolean;
  hasSnapshot: boolean;
  hasRecruitmentId: boolean;
  missingFieldCount: number;
  isFacebookImageReading: boolean;
  hasFacebookImageAttachmentError: boolean;
  shouldPublishFacebook: boolean;
  facebookTargetCount: number;
};

function getAmisSyncPreconditionResult(input: AmisSyncPreconditionInput) {
  if (!input.hasToken || !input.hasSnapshot || !input.hasRecruitmentId || input.missingFieldCount > 0) return 'SKIP';
  if (input.isFacebookImageReading) return 'Vui lòng chờ ảnh upload được xử lý xong trước khi đăng bài.';
  if (input.hasFacebookImageAttachmentError) return 'Vui lòng bỏ ảnh lỗi hoặc chọn ảnh hợp lệ trước khi đăng bài.';
  if (input.shouldPublishFacebook && input.facebookTargetCount === 0) {
    return 'Select at least one Facebook group before publishing.';
  }
  return null;
}

async function resolveAmisSyncFacebookPublishPlan(
  response: ExtensionSyncResponse,
  shouldPublishFacebook: boolean,
  content: string,
  startFacebookPublish: (plan: FacebookPublishPlan, contentOverride?: string | null) => Promise<FacebookPublishPlan | null>,
) {
  if (!response.facebookPublishPlan || !shouldPublishFacebook) {
    return { publishedFacebookPlan: null, confirmedFacebookContent: null };
  }

  const publishedFacebookPlan = await startFacebookPublish(response.facebookPublishPlan, content);
  return {
    publishedFacebookPlan,
    confirmedFacebookContent: publishedFacebookPlan?.content ?? response.facebookPublishPlan.content,
  };
}

type FacebookPublishResultItem = FacebookPublishProgress['results'][number];

function getFacebookPublishDisplayTargets(
  selectedTargets: FacebookGroupUiItem[],
  resultTargets: FacebookGroupUiItem[],
  progressResults: FacebookPublishResultItem[],
) {
  if (selectedTargets.length > 0) return selectedTargets;
  if (resultTargets.length > 0) return resultTargets;
  return progressResults.map((item) => ({
    key: item.targetId ?? item.targetUrl ?? item.targetName,
    id: item.targetId ?? null,
    name: item.targetName,
    url: item.targetUrl,
    eligibilityStatus: 'UNKNOWN' as const,
    eligibilityReason: null,
    quotaLabel: null,
    selectable: false,
    disabledReason: null,
  }));
}

function getFacebookPublishChannelStatus(progress: FacebookPublishProgress | null) {
  if (progress?.status === 'SUCCESS') return { className: 'is-posted', label: 'Đã đăng' };
  if (progress?.status === 'PARTIAL_SUCCESS' || progress?.status === 'ERROR') {
    return { className: 'is-failed', label: 'Đăng lỗi' };
  }
  return { className: 'is-processing', label: 'Đang đăng' };
}

async function persistSelectedJobQuestions(jobDescriptionId: string, questionIds: string[]) {
  try {
    await chrome.storage?.session?.set({
      [getJobDescriptionQuestionSelectionStorageKey(jobDescriptionId)]: questionIds,
    });
  } catch {
    // Selection is a panel convenience state; failing to persist must not block AMIS work.
  }
}

async function ensureAmisHooksForCurrentTab() {
  const result = await ensureAmisHooksInActiveTab().catch(() => null);
  if (result?.status === 'INJECTED') {
    await sleep(250);
  }
}

async function collectFacebookGroupsWithGraphqlCrossCheck(
  tabId: number,
  graphqlResult: FacebookGraphqlCollectionResult,
  account: FacebookAccountIdentity | null | undefined,
  onMessage?: (message: string) => void,
): Promise<FacebookGroupsScanRunResult> {
  let pageScanResult: FacebookGroupsScanRunResult | null = null;
  try {
    await waitForTabComplete(tabId);
    await sleep(3_000);
    pageScanResult = await runScriptInTab<FacebookGroupsScanRunResult>(tabId, collectFacebookGroupsFromPage);
  } catch (error) {
    onMessage?.(`[FB_GQL_VALIDATION] Không thể đối chiếu DOM với GraphQL: ${toErrorMessage(error)}`);
  }

  const mergedGroups = uniqueDiscoveredGroups([
    ...graphqlResult.groups,
    ...(pageScanResult?.groups ?? []),
  ]);
  // GraphQL is the authoritative source for this scan. DOM extraction is
  // only a best-effort cross-check because the hidden tab may not expose
  // the same rendered list as an active Facebook tab.
  const scanComplete = graphqlResult.scanComplete;
  if (scanComplete) {
    onMessage?.(`Đã xác nhận đủ ${mergedGroups.length} nhóm bằng GraphQL.`);
  } else {
    onMessage?.(
      `[FB_GQL_VALIDATION] GraphQL=${graphqlResult.groups.length}/${graphqlResult.expectedCount ?? '?'}; `
      + `DOM=${pageScanResult?.groups.length ?? 0}/${pageScanResult?.expectedCount ?? '?'}; merged=${mergedGroups.length}; `
      + `graphqlComplete=${String(graphqlResult.scanComplete)}; domComplete=${String(pageScanResult?.scanComplete === true)}.`,
    );
  }

  return mapGraphqlScanResult({ ...graphqlResult, groups: mergedGroups, scanComplete }, account);
}

async function collectFacebookGroupsFromDomPage(
  tabId: number,
  account: FacebookAccountIdentity | null | undefined,
  onMessage?: (message: string) => void,
): Promise<FacebookGroupsScanRunResult> {
  await chrome.tabs?.update(tabId, {
    url: 'https://www.facebook.com/groups/joins/?nav_source=tab',
    active: false,
  });
  await waitForTabComplete(tabId);
  await sleep(1_000);

  const scanResult = await runScriptInTab<FacebookGroupsScanRunResult>(tabId, collectFacebookGroupsFromPage);
  if (!scanResult.scanComplete) {
    onMessage?.('Quét trang chưa hoàn tất; tab Facebook được giữ lại để tiếp tục kiểm tra.');
  }
  return {
    groups: uniqueDiscoveredGroups(scanResult.groups ?? []),
    scanComplete: scanResult.scanComplete === true,
    expectedCount: scanResult.expectedCount,
    account,
  };
}

async function refreshFacebookHistoryItems(
  accessToken: string,
  items: FacebookPublishHistoryListItem[],
  onProgress: (message: string) => void,
  syncImageStatus: (item: FacebookPublishHistoryListItem, status: FacebookReviewStatus) => Promise<void>,
) {
  const summary = {
    postedCount: 0,
    rejectedCount: 0,
    deletedCount: 0,
    unresolvedCount: 0,
    issueCount: 0,
    authExpired: false,
  };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    onProgress(`Đang kiểm tra ${index + 1}/${items.length}: ${item.title}`);

    try {
      const statusCheck = await refreshFacebookPostReviewStatus(item);
      await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
      await syncImageStatus(item, statusCheck.facebookReviewStatus);
      if (statusCheck.facebookReviewStatus === 'POSTED') summary.postedCount += 1;
      else if (statusCheck.facebookReviewStatus === 'REJECTED') summary.rejectedCount += 1;
      else if (statusCheck.facebookReviewStatus === 'DELETED') summary.deletedCount += 1;
      else summary.unresolvedCount += 1;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        summary.authExpired = true;
        return summary;
      }

      summary.issueCount += 1;
    }
  }

  return summary;
}

function SidePanel() {
  const [state, setState] = useState<PanelState>('AUTH_LOADING');
  const [extensionUiZoom, setExtensionUiZoom] = useState<ExtensionUiZoomLevel>(readExtensionUiZoom);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('posting');
  const [pinnedWorkspaceTab, setPinnedWorkspaceTab] = useState<WorkspaceTab | null>(null);
  const [referralRefreshVersion, setReferralRefreshVersion] = useState(0);
  const [cvWorkspaceView, setCvWorkspaceView] = useState<CvWorkspaceView>('list');
  const [user, setUser] = useState<ExtensionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isFreelancerPasswordFormOpen, setIsFreelancerPasswordFormOpen] = useState(false);
  const [isInternalPasswordRequestOpen, setIsInternalPasswordRequestOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const loadReferralRecruitmentRounds = useCallback(async (
    targets: Array<{ jobPostingId: string; amisRecruitmentId: string }>,
  ) => {
    if (targets.length === 0) return [];

    let activeTab: Awaited<ReturnType<typeof getActiveTab>>;
    try {
      activeTab = await getActiveTab();
    } catch {
      return targets.map((target) => ({ ...target, rounds: [] as AmisRecruitmentRound[] }));
    }

    if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
      return targets.map((target) => ({ ...target, rounds: [] as AmisRecruitmentRound[] }));
    }

    return Promise.all(targets.map(async (target) => {
      try {
        const response = await sendMessageToAmisTab(activeTab.id, {
          type: GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE,
          payload: { amisRecruitmentId: target.amisRecruitmentId },
        });
        if (
          isAmisRecruitmentRoundsResponse(response)
          && response.ok
          && response.amisRecruitmentId === target.amisRecruitmentId
        ) {
          return { ...target, rounds: response.rounds };
        }
      } catch {
        // The referral filter falls back to rounds already present on applications.
      }
      return { ...target, rounds: [] as AmisRecruitmentRound[] };
    }));
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [internalEmail, setInternalEmail] = useState('');
  const [internalPasswordMessage, setInternalPasswordMessage] = useState<string | null>(null);
  const [internalPasswordSubmitting, setInternalPasswordSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<AmisJobSnapshot | null>(null);
  const [amisRecruitmentId, setAmisRecruitmentId] = useState<string | null>(null);
  const [amisRecruitmentRoundId, setAmisRecruitmentRoundId] = useState<string | null>(null);
  const [amisUrl, setAmisUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<ExtensionChannel[]>([...DEFAULT_POSTING_CHANNELS]);
  const [result, setResult] = useState<ExtensionSyncResponse | null>(null);
  const [extractionResult, setExtractionResult] = useState<AmisExtractionResult | null>(null);
  const [autoSyncState, setAutoSyncState] = useState<AmisAutoSyncState | null>(null);
  const [facebookProgress, setFacebookProgress] = useState<FacebookPublishProgress | null>(null);
  const [facebookPublishResultsVisible, setFacebookPublishResultsVisible] = useState(false);
  const [isFacebookResultsExpanded, setIsFacebookResultsExpanded] = useState(true);
  const [expandedPublishResultChannels, setExpandedPublishResultChannels] = useState<Record<string, boolean>>({});
  const [facebookRunning, setFacebookRunning] = useState(false);
  const [facebookGroups, setFacebookGroups] = useState<FacebookPublishTarget[]>([]);
  const [facebookGroupSearchInput, setFacebookGroupSearchInput] = useState('');
  const [facebookGroupSearchQuery, setFacebookGroupSearchQuery] = useState('');
  const [facebookSettingsGroupSearchInput, setFacebookSettingsGroupSearchInput] = useState('');
  const [facebookSettingsGroupSearchQuery, setFacebookSettingsGroupSearchQuery] = useState('');
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
  const [isFacebookGroupListExpanded, setIsFacebookGroupListExpanded] = useState(true);
  const [facebookIneligiblePage, setFacebookIneligiblePage] = useState(1);
  const [manualIncludingFacebookGroupKeys, setManualIncludingFacebookGroupKeys] = useState<string[]>([]);
  const [extensionToast, setExtensionToast] = useState<ExtensionToastState | null>(null);
  const [isFacebookSettingsOpen, setIsFacebookSettingsOpen] = useState(false);
  const [facebookSettingsState, setFacebookSettingsState] = useState<
    'IDLE' | 'LOADING' | 'READY' | 'SAVING' | 'VERIFYING' | 'ERROR' | 'DISCOVERING'
  >('IDLE');
  const [facebookSettingsMessage, setFacebookSettingsMessage] = useState<string | null>(null);
  const [verifyingFacebookGroupIds, setVerifyingFacebookGroupIds] = useState<string[]>([]);
  const [queuedFacebookGroupIds, setQueuedFacebookGroupIds] = useState<string[]>([]);
  const [facebookGroupModalMode, setFacebookGroupModalMode] = useState<FacebookGroupModalMode>('SETTINGS');
  const [facebookGroupPage, setFacebookGroupPage] = useState(1);
  const [selectedFacebookGroup, setSelectedFacebookGroup] = useState<FacebookPublishTarget | null>(null);
  const [selectedFacebookHistoryGroup, setSelectedFacebookHistoryGroup] = useState<FacebookHistoryGroup | null>(null);
  const [facebookHistoryFilter, setFacebookHistoryFilter] = useState<FacebookPostHistoryFilter>('ALL');
  const [facebookHistoryPage, setFacebookHistoryPage] = useState(1);
  const [facebookHistoryData, setFacebookHistoryData] = useState<FacebookPublishHistoriesResponse | null>(null);
  const [facebookHistoryLoadState, setFacebookHistoryLoadState] = useState<FacebookPostHistoryLoadState>('IDLE');
  const [facebookHistoryMessage, setFacebookHistoryMessage] = useState<string | null>(null);
  const [isRefreshingFacebookHistoryGroup, setIsRefreshingFacebookHistoryGroup] = useState(false);

  const [isFacebookGroupFormOpen, setIsFacebookGroupFormOpen] = useState(false);
  const [facebookGroupName, setFacebookGroupName] = useState('');
  const [facebookGroupNameError, setFacebookGroupNameError] = useState<string | null>(null);
  const [facebookGroupUrl, setFacebookGroupUrl] = useState('');
  const [facebookGroupUrlError, setFacebookGroupUrlError] = useState<string | null>(null);
  const [editFacebookGroupName, setEditFacebookGroupName] = useState('');
  const [editFacebookGroupUrl, setEditFacebookGroupUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescriptionSummary[]>([]);
  const [jobDescriptionPagination, setJobDescriptionPagination] = useState<ApiPagination | null>(null);
  const [jobDescriptionSearch, setJobDescriptionSearch] = useState('');
  const [jobDescriptionStatusFilter, setJobDescriptionStatusFilter] = useState('ALL');
  const [jobDescriptionStatus, setJobDescriptionStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [jobDescriptionError, setJobDescriptionError] = useState<string | null>(null);
  const [jobDescriptionFillState, setJobDescriptionFillState] = useState<JobDescriptionFillState>('IDLE');
  const [jobDescriptionFillMessage, setJobDescriptionFillMessage] = useState<string | null>(null);
  const [fillingJobDescriptionId, setFillingJobDescriptionId] = useState<string | null>(null);
  const [vcsPortalSyncResult] = useState<SyncVcsPortalJdsResponse | null>(null);
  const [selectedJobDescription, setSelectedJobDescription] = useState<JobDescriptionSummary | null>(null);
  const [lockedAmisJobDescriptionId, setLockedAmisJobDescriptionId] = useState<string | null>(null);
  const [, setCareerQuestionState] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [, setCareerQuestionMessage] = useState<string | null>(null);
  const [jobDescriptionQuestionContext, setJobDescriptionQuestionContext] = useState<JobDescriptionQuestionSetContext | null>(null);
  const [selectedJobQuestionIds, setSelectedJobQuestionIds] = useState<Set<string>>(new Set());
  const [applicationsState, setApplicationsState] = useState<ApplicationsState>('IDLE');
  const [applicationsContext, setApplicationsContext] = useState<AmisApplicationsForRecruitment | null>(null);
  const [amisRecruitmentRounds, setAmisRecruitmentRounds] = useState<AmisRecruitmentRound[]>([]);
  const [activeAmisCandidateId, setActiveAmisCandidateId] = useState<string | null>(null);
  const [applicationsMessage, setApplicationsMessage] = useState<string | null>(null);
  const [isAmisCandidateFormOpen, setIsAmisCandidateFormOpen] = useState(false);
  const [cvUploadApplicationId, setCvUploadApplicationId] = useState<string | null>(null);
  const [pendingAmisUploadApplicationIds, setPendingAmisUploadApplicationIds] = useState<Set<string>>(new Set());
  const [aiEvaluationApplicationId, setAiEvaluationApplicationId] = useState<string | null>(null);
  const [aiEvaluationUploadedApplicationIds, setAiEvaluationUploadedApplicationIds] = useState<Set<string>>(() => new Set());
  const [aiScreeningApplicationId, setAiScreeningApplicationId] = useState<string | null>(null);
  const [selectedCvApplicationIds, setSelectedCvApplicationIds] = useState<Set<string>>(new Set());
  const [cvQuestionFilter, setCvQuestionFilter] = useState<CvQuestionFilter>('ALL');
  const [cvSyncFilter, setCvSyncFilter] = useState<CvSyncFilter>('ALL');
  const [cvEvaluationFilter, setCvEvaluationFilter] = useState<CvEvaluationFilter>('ALL');
  const [cvSortMode, setCvSortMode] = useState<CvSortMode>('APPLIED_DESC');
  const [cvSourceFilter, setCvSourceFilter] = useState<CvSourceFilter>('ALL');
  const [openCvFilter, setOpenCvFilter] = useState<CvFilterDropdownKey | null>(null);
  const [cvApplicationPage, setCvApplicationPage] = useState(1);
  const amisCandidateFormOpenRef = useRef(false);
  const amisUnsavedChangesPromptOpenRef = useRef(false);
  const pendingAmisUploadCancelTimeoutRef = useRef<number | null>(null);
  const lastJobQuestionContextIdRef = useRef<string | null>(null);
  const lastApplicationsFallbackSyncUrlRef = useRef<string | null>(null);
  const activeAmisRecruitmentIdRef = useRef<string | null>(null);
  const activeSnapshotRecruitmentIdRef = useRef<string | null>(null);
  const applicationsRequestSeqRef = useRef(0);
  const amisCandidateStageOverridesRef = useRef(new Map<string, {
    amisRecruitmentRoundId: string;
    amisRecruitmentRoundName: string | null;
    amisStatus: number | null;
    reasonRemoved: string | null;
  }>());
  const processedAmisCandidateStageEventsRef = useRef(new Map<string, string>());
  const pendingAmisUploadApplicationIdsRef = useRef(new Set<string>());
  const pendingAmisUploadTimeoutsRef = useRef(new Map<string, number>());
  const postingSnapshotRefreshSeqRef = useRef(0);
  const amisJobSelectionSeqRef = useRef(0);
  const postingSnapshotRefreshAttemptsRef = useRef(new Map<string, number>());
  const missedRecruitmentContextCountRef = useRef(0);
  const lastAmisJobInitiationResetKeyRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const channelsRef = useRef<ExtensionChannel[]>(channels);
  const facebookGroupsRef = useRef<FacebookPublishTarget[]>(facebookGroups);
  const facebookGroupScanTabIdRef = useRef<number | null>(null);
  const facebookGroupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const facebookSettingsGroupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const extensionToastSequenceRef = useRef(0);
  const extensionToastTimerRef = useRef<number | null>(null);
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
  const jobDescriptionSearchDebounceRef = useRef<number | null>(null);
  const startedFacebookPlanKeys = useRef(new Set<string>());
  const lastCtrlWheelZoomAtRef = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(EXTENSION_UI_ZOOM_STORAGE_KEY, String(extensionUiZoom));
    } catch {
      // Some extension contexts can deny storage access; zoom still works for this session.
    }
  }, [extensionUiZoom]);

  useEffect(() => {
    const changeZoom = (direction: 1 | -1) => {
      setExtensionUiZoom((currentZoom) => {
        const currentIndex = getExtensionUiZoomIndex(currentZoom);
        const nextIndex = Math.max(0, Math.min(
          EXTENSION_UI_ZOOM_LEVELS.length - 1,
          currentIndex + direction,
        ));
        return EXTENSION_UI_ZOOM_LEVELS[nextIndex];
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === '0') {
        event.preventDefault();
        setExtensionUiZoom(1);
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        changeZoom(1);
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        changeZoom(-1);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.deltaY === 0) return;

      event.preventDefault();
      const now = Date.now();
      if (now - lastCtrlWheelZoomAtRef.current < 80) return;
      lastCtrlWheelZoomAtRef.current = now;
      changeZoom(event.deltaY < 0 ? 1 : -1);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', handleWheel, true);
    };
  }, []);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => () => {
    if (jobDescriptionSearchDebounceRef.current !== null) {
      window.clearTimeout(jobDescriptionSearchDebounceRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (extensionToastTimerRef.current !== null) {
      window.clearTimeout(extensionToastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    const heartbeat = () => {
      void heartbeatExtensionInstance(token).catch(() => {
        // User-facing API calls handle auth/disabled errors where action context is clearer.
      });
    };

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    facebookGroupsRef.current = facebookGroups;
  }, [facebookGroups]);

  useEffect(() => {
    selectedFacebookGroupIdsRef.current = selectedFacebookGroupIds;
  }, [selectedFacebookGroupIds]);

  useEffect(() => {
    if (!openCvFilter) return undefined;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.cv-filter-dropdown')) {
        setOpenCvFilter(null);
      }
    };

    document.addEventListener('pointerdown', closeWhenClickingOutside);
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside);
  }, [openCvFilter]);

  useEffect(() => {
    let disposed = false;

    const schedulePendingUploadCancellation = () => {
      if (pendingAmisUploadApplicationIdsRef.current.size === 0) return;
      if (pendingAmisUploadCancelTimeoutRef.current !== null) {
        window.clearTimeout(pendingAmisUploadCancelTimeoutRef.current);
      }

      pendingAmisUploadCancelTimeoutRef.current = window.setTimeout(async () => {
        pendingAmisUploadCancelTimeoutRef.current = null;
        if (
          amisCandidateFormOpenRef.current
          || amisUnsavedChangesPromptOpenRef.current
          || pendingAmisUploadApplicationIdsRef.current.size === 0
        ) return;

        if (token && amisRecruitmentId) {
          await loadAmisApplications(token, amisRecruitmentId, { silent: true });
        }

        if (
          !amisCandidateFormOpenRef.current
          && !amisUnsavedChangesPromptOpenRef.current
          && pendingAmisUploadApplicationIdsRef.current.size > 0
        ) {
          clearPendingAmisUploads();
          setApplicationsMessage('Đã hủy lưu trên AMIS. Hồ sơ chưa được lưu.');
        }
      }, 1_200);
    };

    const checkAmisCandidateForm = async () => {
      try {
        const activeTab = await getActiveTab();
        if (disposed || !activeTab.id || !activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
          if (!disposed) setIsAmisCandidateFormOpen(false);
          return;
        }

        const response = await sendMessageToAmisTab(activeTab.id, {
          type: GET_AMIS_CANDIDATE_FORM_STATE_MESSAGE_TYPE,
        });
        if (!disposed) {
          const nextFormOpen = Boolean((response as { open?: unknown } | null)?.open);
          const nextPromptOpen = Boolean((response as { unsavedChangesPromptOpen?: unknown } | null)?.unsavedChangesPromptOpen);
          const formWasOpen = amisCandidateFormOpenRef.current;
          const promptWasOpen = amisUnsavedChangesPromptOpenRef.current;

          amisCandidateFormOpenRef.current = nextFormOpen;
          amisUnsavedChangesPromptOpenRef.current = nextPromptOpen;
          setIsAmisCandidateFormOpen(nextFormOpen);

          if (
            (!nextFormOpen && !nextPromptOpen)
            && ((formWasOpen && !nextFormOpen) || (promptWasOpen && !nextPromptOpen))
          ) {
            schedulePendingUploadCancellation();
          }
        }
      } catch {
        if (!disposed) setIsAmisCandidateFormOpen(false);
      }
    };

    void checkAmisCandidateForm();
    const intervalId = window.setInterval(() => void checkAmisCandidateForm(), 700);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      if (pendingAmisUploadCancelTimeoutRef.current !== null) {
        window.clearTimeout(pendingAmisUploadCancelTimeoutRef.current);
        pendingAmisUploadCancelTimeoutRef.current = null;
      }
    };
  }, [amisRecruitmentId, token]);

  useEffect(() => {
    activeAmisRecruitmentIdRef.current = amisRecruitmentId;
    amisCandidateStageOverridesRef.current.clear();
    processedAmisCandidateStageEventsRef.current.clear();
  }, [amisRecruitmentId]);

  useEffect(() => () => {
    for (const timeoutId of pendingAmisUploadTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    pendingAmisUploadTimeoutsRef.current.clear();
    if (pendingAmisUploadCancelTimeoutRef.current !== null) {
      window.clearTimeout(pendingAmisUploadCancelTimeoutRef.current);
      pendingAmisUploadCancelTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    facebookImageAttachPromptResolverRef.current = null;
  }, []);

  useEffect(() => subscribeAuthTokenChanges(({ accessToken }) => {
    setToken(accessToken);
    if (!accessToken) {
      setUser(null);
      setState('AUTH_REQUIRED');
    }
  }), []);

  useEffect(() => {
    void restoreAuth();
    void restoreSelectedChannels();
    void restoreSelectedFacebookGroups();
    void loadLatestAmisCapture({ silent: true });
    void restoreFacebookProgress();
    void bootstrapAmisTab();
  }, []);

  useEffect(() => {
    chrome.runtime?.onMessage.addListener((message, sender) => {
      if (isAmisCaptureUpdatedMessage(message)) {
        void applyAmisCaptureUpdatedMessage(message.payload, message.sourceTabId ?? sender.tab?.id);
        return;
      }

      if (isAutoSyncUpdateMessage(message)) {
        void applyAutoSyncUpdateMessage(message.payload);
        return;
      }

      if (isRecruitmentContextChangedMessage(message)) {
        void refreshAmisRecruitmentContextFromActiveTab({
          silent: true,
          sourceTabId: sender.tab?.id,
        });
        return;
      }

      if (isAmisCandidateStageChangedMessage(message)) {
        void applyAmisCandidateStageChangedMessage(
          message.payload,
          message.sourceTabId ?? sender.tab?.id,
        );
        return;
      }

      if (isAmisRecruitmentRoundsChangedMessage(message)) {
        if (
          activeAmisRecruitmentIdRef.current
          && activeAmisRecruitmentIdRef.current !== message.payload.amisRecruitmentId
        ) {
          return;
        }
        setAmisRecruitmentRounds(message.payload.rounds);
        return;
      }

      if (isFacebookPublishProgressUpdateMessage(message)) {
        setFacebookPublishResultsVisible(true);
        setFacebookProgress(message.payload);
        setFacebookRunning(
          message.payload.status === 'LOGIN_REQUIRED'
          || message.payload.status === 'WAITING_LOGIN'
          || message.payload.status === 'POSTING'
          || message.payload.status === 'REPORTING'
          || message.payload.status === 'DELAYING',
        );
        return;
      }

      if (isApplicationsSyncedMessage(message)) {
        void applyApplicationsSyncedMessage(message);
      }
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    void refreshAmisRecruitmentContextFromActiveTab({ silent: true });
    const intervalId = window.setInterval(() => {
      void refreshAmisRecruitmentContextFromActiveTab({ silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (!token || !amisRecruitmentId) {
      clearPendingAmisUploads();
      setApplicationsContext(null);
      setApplicationsState('IDLE');
      setApplicationsMessage(null);
      setSelectedCvApplicationIds(new Set());
      setCvApplicationPage(1);
      return;
    }

    void loadAmisApplications(token, amisRecruitmentId, { silent: true });
    const intervalId = window.setInterval(() => {
      void loadAmisApplications(token, amisRecruitmentId, { silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [token, amisRecruitmentId]);

  useEffect(() => {
    if (!applicationsContext) return;
    const currentIds = new Set(applicationsContext.applications.map((application) => application.applicationId));
    setSelectedCvApplicationIds((current) =>
      new Set(Array.from(current).filter((applicationId) => currentIds.has(applicationId))),
    );
  }, [applicationsContext]);

  useEffect(() => {
    let cancelled = false;
    const nextSnapshot = snapshot;
    const nextRecruitmentId = amisRecruitmentId;

    async function prepareFacebookContent() {
      clearFacebookPostContentState();
      await restoreFacebookImageAttachments(nextRecruitmentId, nextSnapshot, selectedJobDescription);
      if (!token || !nextRecruitmentId || !nextSnapshot) return;

      const restored = await applyStoredFacebookContentDraft(
        nextRecruitmentId,
        nextSnapshot,
        selectedJobDescription,
      );
      if (cancelled || restored) return;

      await generateFacebookPostContent({
        snapshotOverride: nextSnapshot,
        forceFacebookChannel: true,
      });
    }

    void prepareFacebookContent();
    return () => {
      cancelled = true;
      facebookImageRestoreSeqRef.current += 1;
    };
  }, [
    token,
    amisRecruitmentId,
    snapshot?.title,
    snapshot?.summary,
    snapshot?.description,
    snapshot?.requirements.rawText,
    snapshot?.location,
    snapshot?.deadline,
    selectedJobDescription?.id,
  ]);

  const selectedPostingChannels = useMemo(() => normalizePostingChannels(channels), [channels]);
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!amisRecruitmentId) missing.push('AMIS recruitment id');
    if (!snapshot?.title.trim()) missing.push('title');
    if (!snapshot?.description.trim()) missing.push('description');
    if (!snapshot?.requirements.rawText.trim()) missing.push('requirements');
    if (!selectedJobDescription?.id) missing.push('selected JD');
    if (selectedPostingChannels.includes('FACEBOOK') && selectedFacebookGroupIds.length === 0) missing.push('facebook group');
    return missing;
  }, [amisRecruitmentId, selectedFacebookGroupIds.length, selectedJobDescription?.id, selectedPostingChannels, snapshot]);

  const visibleWorkspaceTabs = useMemo<WorkspaceTab[]>(() => {
    if (pinnedWorkspaceTab && pinnedWorkspaceTab !== activeWorkspaceTab) {
      return [pinnedWorkspaceTab, activeWorkspaceTab];
    }

    return [activeWorkspaceTab];
  }, [activeWorkspaceTab, pinnedWorkspaceTab]);

  const facebookSelected = selectedPostingChannels.includes('FACEBOOK');
  const facebookContentBusy = facebookContentState === 'GENERATING';
  const isFacebookImageReading = facebookImageAttachmentState === 'READING';
  const hasFacebookImageAttachmentError = facebookImageAttachmentState === 'ERROR';
  const facebookImageUploadDisabled = facebookRunning || state === 'SYNCING' || isFacebookImageReading;
  const facebookImageAddDisabled = facebookImageUploadDisabled || facebookImageAttachments.length >= FACEBOOK_MAX_IMAGE_ATTACHMENTS;
  const syncDisabled = state === 'EXTRACTING'
    || state === 'SYNCING'
    || facebookRunning
    || facebookContentBusy
    || isFacebookImageReading
    || hasFacebookImageAttachmentError
    || missingFields.length > 0;
  const validFacebookGroups = useMemo(() => facebookGroups, [facebookGroups]);
  const filteredFacebookSettingsGroups = useMemo(() => {
    const query = facebookSettingsGroupSearchQuery.trim().toLocaleLowerCase('vi-VN');
    if (!query) return validFacebookGroups;

    return validFacebookGroups.filter((group) => (
      group.targetName.toLocaleLowerCase('vi-VN').includes(query)
    ));
  }, [facebookSettingsGroupSearchQuery, validFacebookGroups]);
  const facebookGroupPageCount = Math.max(
    1,
    Math.ceil(filteredFacebookSettingsGroups.length / FACEBOOK_GROUP_PAGE_SIZE),
  );
  const currentFacebookGroupPage = Math.min(facebookGroupPage, facebookGroupPageCount);
  const facebookGroupPageItems = useMemo(() => {
    const startIndex = (currentFacebookGroupPage - 1) * FACEBOOK_GROUP_PAGE_SIZE;
    return filteredFacebookSettingsGroups.slice(startIndex, startIndex + FACEBOOK_GROUP_PAGE_SIZE);
  }, [currentFacebookGroupPage, filteredFacebookSettingsGroups]);
  const facebookGroupPaginationItems = buildCompactPaginationPages(
    currentFacebookGroupPage,
    facebookGroupPageCount,
  );
  const facebookGroupTotalItems = filteredFacebookSettingsGroups.length;
  const facebookGroupVisibleStart = facebookGroupTotalItems === 0
    ? 0
    : ((currentFacebookGroupPage - 1) * FACEBOOK_GROUP_PAGE_SIZE) + 1;
  const facebookGroupVisibleEnd = Math.min(
    facebookGroupVisibleStart + facebookGroupPageItems.length - 1,
    facebookGroupTotalItems,
  );
  const facebookIneligibleGroups = facebookGroupSyncDetails?.filtered ?? [];
  const facebookIneligiblePageCount = Math.max(
    1,
    Math.ceil(facebookIneligibleGroups.length / FACEBOOK_INELIGIBLE_PAGE_SIZE),
  );
  const currentFacebookIneligiblePage = Math.min(facebookIneligiblePage, facebookIneligiblePageCount);
  const facebookIneligiblePageItems = useMemo(() => {
    const startIndex = (currentFacebookIneligiblePage - 1) * FACEBOOK_INELIGIBLE_PAGE_SIZE;
    return facebookIneligibleGroups.slice(startIndex, startIndex + FACEBOOK_INELIGIBLE_PAGE_SIZE);
  }, [currentFacebookIneligiblePage, facebookIneligibleGroups]);
  const facebookIneligiblePaginationItems = buildFacebookIneligiblePaginationItems(
    currentFacebookIneligiblePage,
    facebookIneligiblePageCount,
  );
  const facebookIneligibleTotalItems = facebookIneligibleGroups.length;
  const facebookIneligibleTotalGroupCount = facebookGroupSyncDetails?.requested
    ?? (facebookIneligibleTotalItems
      + (facebookGroupSyncDetails?.accepted.length ?? 0));
  const facebookIneligibleVisibleStart = facebookIneligibleTotalItems === 0
    ? 0
    : ((currentFacebookIneligiblePage - 1) * FACEBOOK_INELIGIBLE_PAGE_SIZE) + 1;
  const facebookIneligibleVisibleEnd = Math.min(
    facebookIneligibleVisibleStart + facebookIneligiblePageItems.length - 1,
    facebookIneligibleTotalItems,
  );
  useEffect(() => {
    setFacebookIneligiblePage((page) => Math.min(page, facebookIneligiblePageCount));
  }, [facebookIneligiblePageCount]);
  const visibleFacebookGroups = useMemo(() => {
    if (isFacebookGroupLoading(facebookGroupLoadState)) return [];

    if (facebookGroups.length > 0) {
      return validFacebookGroups.map(toFacebookGroupUiItem);
    }

    const planTargets = result?.facebookPublishPlan?.targets.map(toFacebookGroupUiItem) ?? [];
    if (planTargets.length > 0) return planTargets;

    return facebookProgress?.results.map((target) => ({
      key: target.targetId ?? target.targetUrl ?? target.targetName,
      id: target.targetId ?? null,
      name: target.targetName,
      url: target.targetUrl,
      eligibilityStatus: 'UNKNOWN' as const,
      eligibilityReason: null,
      quotaLabel: null,
      selectable: Boolean(target.targetId),
      disabledReason: target.targetId ? null : 'Facebook group id is missing.',
    })) ?? [];
  }, [facebookGroupLoadState, facebookGroups.length, facebookProgress, result, validFacebookGroups]);
  const filteredFacebookGroups = useMemo(() => {
    const query = facebookGroupSearchQuery.trim().toLocaleLowerCase('vi-VN');
    if (!query) return visibleFacebookGroups;

    return visibleFacebookGroups.filter((group) => (
      group.name.toLocaleLowerCase('vi-VN').includes(query)
    ));
  }, [facebookGroupSearchQuery, visibleFacebookGroups]);
  const visibleSelectedFacebookGroupCount = useMemo(() => {
    const visibleGroupIds = new Set(visibleFacebookGroups.map((group) => group.id).filter(isString));
    return selectedFacebookGroupIds.filter((targetId) => visibleGroupIds.has(targetId)).length;
  }, [selectedFacebookGroupIds, visibleFacebookGroups]);
  const facebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(facebookGroupUrl, facebookGroups);
  const facebookGroupUrlFieldError = facebookGroupDuplicateUrlError ?? facebookGroupUrlError;

  async function restoreAuth() {
    try {
      let storedToken = await getAccessToken();
      if (!storedToken) {
        storedToken = await refreshAccessToken();
      }
      if (!storedToken) {
        setState('AUTH_REQUIRED');
        return;
      }

      const currentUser = await getCurrentUser(storedToken);
      if (currentUser.role === 'FREELANCER' || currentUser.role === 'INTERNAL') {
        setToken(storedToken);
        setUser(currentUser);
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      if (currentUser.role !== 'ADMIN' && currentUser.role !== 'HR') {
        await clearAccessToken();
        setError('Only ADMIN and HR can sync postings.');
        setState('AUTH_REQUIRED');
        return;
      }
      const latestToken = await getAccessToken();
      if (!latestToken) {
        setState('AUTH_REQUIRED');
        return;
      }

      await ensureRegisteredExtensionInstance(latestToken);
      setToken(latestToken);
      setUser(currentUser);
      setActiveWorkspaceTab('posting');
      setState('READY');
      await loadJobDescriptions(latestToken);
      await loadLatestAmisCapture({ silent: true }, latestToken);
    } catch {
      await clearAccessToken();
      setState('AUTH_REQUIRED');
    }
  }

  async function restoreSelectedChannels() {
    setChannels(normalizePostingChannels(await getSelectedChannels()));
  }

  async function restoreSelectedFacebookGroups() {
    // The selected account is resolved only after the Facebook session check.
    // Never restore selections from an unknown account into the current session.
    setSelectedFacebookGroupIdsState([]);
  }

  async function updateSelectedFacebookGroupIds(targetIds: string[], accountId = facebookAccount?.id) {
    const uniqueTargetIds = uniqueStrings(targetIds);
    selectedFacebookGroupIdsRef.current = uniqueTargetIds;
    setSelectedFacebookGroupIdsState(uniqueTargetIds);
    await setSelectedFacebookGroupIds(uniqueTargetIds, accountId);
  }

  async function reconcileSelectedFacebookGroups(
    groups: FacebookPublishTarget[],
    targetIds = selectedFacebookGroupIds,
    accountId = facebookAccount?.id,
  ) {
    const publishableGroupIds = new Set(groups.filter(isPublishableFacebookGroup).map((group) => group.targetId).filter(isString));
    const nextTargetIds = uniqueStrings(targetIds).filter((targetId) => publishableGroupIds.has(targetId));
    await updateSelectedFacebookGroupIds(nextTargetIds, accountId);
    return nextTargetIds;
  }

  function toggleFacebookGroupSelection(targetId: string | null | undefined) {
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
  }

  async function handleFacebookImageFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    if (facebookImageAttachments.length >= FACEBOOK_MAX_IMAGE_ATTACHMENTS) {
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(`Bài đăng chỉ được tối đa ${FACEBOOK_MAX_IMAGE_ATTACHMENTS} ảnh.`);
      return;
    }

    const readSeq = facebookImageReadSeqRef.current + 1;
    facebookImageReadSeqRef.current = readSeq;
    const validationError = getFacebookImageFileValidationError(file);
    if (validationError) {
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(validationError);
      return;
    }

    setFacebookImageAttachmentState('READING');
    setFacebookImageAttachmentError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (facebookImageReadSeqRef.current !== readSeq) return;
      const imageContentKey = getFacebookImageContentKey(dataUrl);
      const isDuplicate = facebookImageAttachments.some((attachment) => (
        getFacebookImageContentKey(attachment.dataUrl) === imageContentKey
      ));
      if (isDuplicate) {
        setFacebookImageAttachmentState('ERROR');
        setFacebookImageAttachmentError('Ảnh này đã được tải lên. Vui lòng chọn ảnh khác.');
        return;
      }

      const attachment: FacebookPublishAttachment = {
        type: 'IMAGE',
        source: 'LOCAL_UPLOAD',
        fileName: file.name || 'facebook-image',
        mimeType: file.type,
        size: file.size,
        dataUrl,
      };
      const nextAttachments = [...facebookImageAttachments, attachment];
      await saveFacebookImageAttachments(getFacebookImageAttachmentScope(), nextAttachments);
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachments(nextAttachments);
      setFacebookImageAttachmentState('READY');
    } catch (err) {
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(toErrorMessage(err));
    }
  }

  async function clearFacebookImageAttachment(index?: number) {
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
  }

  function clearFacebookContent() {
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
  }

  async function getFacebookContentDraftScope(
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ): Promise<FacebookContentDraftScope> {
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
  }

  function getFacebookImageAttachmentScope(
    recruitmentId: string | null = amisRecruitmentId,
    nextSnapshot: AmisJobSnapshot | null = snapshot,
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ): FacebookImageAttachmentScope {
    return {
      recruitmentId,
      jobDescriptionId: jobDescription?.id ?? null,
      snapshotFingerprint: nextSnapshot ? buildFacebookDraftSnapshotFingerprint(nextSnapshot) : null,
    };
  }

  async function restoreFacebookImageAttachments(
    recruitmentId: string | null,
    nextSnapshot: AmisJobSnapshot | null,
    jobDescription: JobDescriptionSummary | null,
  ) {
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
  }

  function resetFacebookImageAttachmentView() {
    facebookImageReadSeqRef.current += 1;
    facebookImageRestoreSeqRef.current += 1;
    setFacebookImageAttachments([]);
    setFacebookImageAttachmentState('IDLE');
    setFacebookImageAttachmentError(null);
    if (facebookImageInputRef.current) {
      facebookImageInputRef.current.value = '';
    }
  }

  function openFacebookImageFilePicker() {
    if (facebookImageAddDisabled) return;
    facebookImageInputRef.current?.click();
  }

  async function generateFacebookPostContent(options: {
    snapshotOverride?: AmisJobSnapshot;
    selectedJobDescriptionOverride?: JobDescriptionSummary | null;
    forceFacebookChannel?: boolean;
    mode?: 'TEMPLATE' | 'AI';
  } = {}) {
    if (!token) {
      setError('Sign in to VCS Recruitment before generating Facebook content.');
      setState('AUTH_REQUIRED');
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
      const requestedMode = options.mode ?? 'TEMPLATE';

      const response = await generateFacebookPreviewContent(token, {
        snapshot: sourceSnapshot,
        mode: requestedMode,
      });
      if (facebookContentGenerationSeqRef.current !== generationSeq) return null;
      const content = response.content.trim();
      const contentMode = response.mode === 'AI' ? 'AI' : 'TEMPLATE';

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
      // setFacebookContentMessage(
      //   contentMode === 'AI'
      //     ? 'Facebook content replaced with an AI-generated version.'
      //     : 'Đã sinh nội dung Facebook từ JD hiện tại.',
      // );
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
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      } else if (facebookContentGenerationSeqRef.current === generationSeq) {
        setFacebookContentState('ERROR');
        setFacebookContentMessage(toErrorMessage(err));
      }
      return null;
    }
  }

  async function openFacebookPreviewModal() {
    const content = await ensureFacebookDefaultContent();
    if (content) {
      facebookContentRef.current = content;
      setFacebookContent(content);
    }
    setFacebookPreviewModalMode('PREVIEW');
  }

  async function openFacebookEditModal() {
    const content = await ensureFacebookDefaultContent();
    setFacebookContentDraft(content);
    setFacebookPreviewModalMode('EDIT');
  }

  async function ensureFacebookDefaultContent() {
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
  }

  async function generateFacebookDraftContent() {
    const content = await generateFacebookPostContent({ mode: 'AI' });
    if (content !== null) {
      setFacebookContentDraft(content);
    }
  }

  async function saveFacebookContentDraft() {
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
  }

  function getCurrentFacebookPublishPlanContent() {
    if (!result?.facebookPublishPlan?.content?.trim()) return '';
    if (amisRecruitmentId && result.amisRecruitmentId !== amisRecruitmentId) return '';
    return result.facebookPublishPlan.content.trim();
  }

  function getEffectiveFacebookContent(options: { includeDraft?: boolean } = {}) {
    if (!isFacebookContentScopedToCurrentSnapshot()) return '';
    const draftContent = options.includeDraft ? facebookContentDraft.trim() : '';
    return draftContent || facebookContentRef.current.trim() || facebookContent.trim();
  }

  function isFacebookContentScopedToCurrentSnapshot() {
    if (!snapshot) return false;

    return facebookContentSnapshotFingerprintRef.current === buildFacebookDraftSnapshotFingerprint(snapshot)
      && facebookContentJobIdentityRef.current === buildFacebookJobIdentity(snapshot);
  }

  function requestFacebookImageAttachDecision(
    context: FacebookImageAttachFailureContext,
  ): Promise<FacebookImageAttachFailureDecision> {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    setFacebookImageAttachPrompt(context);

    return new Promise((resolve) => {
      facebookImageAttachPromptResolverRef.current = (decision) => {
        facebookImageAttachPromptResolverRef.current = null;
        setFacebookImageAttachPrompt(null);
        resolve(decision);
      };
    });
  }

  function resolveFacebookImageAttachPrompt(decision: FacebookImageAttachFailureDecision) {
    facebookImageAttachPromptResolverRef.current?.(decision);
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const auth = await login(email, password);
      if (auth.user.role === 'FREELANCER' || auth.user.role === 'INTERNAL') {
        await setAuthTokens({
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
        }, { rememberMe });
        setToken(auth.accessToken);
        setUser(auth.user);
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      if (auth.user.role !== 'ADMIN' && auth.user.role !== 'HR') {
        throw new ApiClientError('FORBIDDEN', 'Only ADMIN and HR can sync postings.', 403);
      }
      await setAuthTokens({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      }, { rememberMe });
      await ensureRegisteredExtensionInstance(auth.accessToken);
      setToken(auth.accessToken);
      setUser(auth.user);
      setActiveWorkspaceTab('posting');
      setState('READY');
      await loadJobDescriptions(auth.accessToken);
      await loadLatestAmisCapture({ silent: true }, auth.accessToken);
    } catch (err) {
      setError(toErrorMessage(err));
      setState('AUTH_REQUIRED');
    }
  }

  async function submitInternalPasswordRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInternalPasswordMessage(null);
    const normalizedEmail = internalEmail.trim().toLowerCase();
    if (!isEmailAddress(normalizedEmail)) {
      setError('Vui lòng nhập đúng email nhân sự nội bộ.');
      return;
    }

    setInternalPasswordSubmitting(true);
    try {
      const response = await requestInternalPassword(normalizedEmail);
      setInternalPasswordMessage(response.message);
      setInternalEmail(normalizedEmail);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setInternalPasswordSubmitting(false);
    }
  }

  function openInternalPasswordRequest() {
    setError(null);
    setInternalPasswordMessage(null);
    setIsForgotPasswordOpen(false);
    setInternalEmail('');
    setIsInternalPasswordRequestOpen(true);
  }

  function openForgotPassword() {
    setError(null);
    setIsInternalPasswordRequestOpen(false);
    setIsForgotPasswordOpen(true);
  }

  function cancelInternalPasswordRequest() {
    setError(null);
    setInternalPasswordMessage(null);
    setIsInternalPasswordRequestOpen(false);
  }

  function cancelForgotPassword() {
    setError(null);
    setIsForgotPasswordOpen(false);
  }

  async function logout() {
    await clearAccessToken();
    setToken(null);
    setRememberMe(false);
    setUser(null);
    setIsFreelancerPasswordFormOpen(false);
    setIsInternalPasswordRequestOpen(false);
    setJobDescriptions([]);
    setJobDescriptionPagination(null);
    setJobDescriptionStatus('IDLE');
    setCvQuestionFilter('ALL');
    setCvSyncFilter('ALL');
    setCvEvaluationFilter('ALL');
    setCvSourceFilter('ALL');
    setCvSortMode('APPLIED_DESC');
    setOpenCvFilter(null);
    setCvApplicationPage(1);
    setSelectedCvApplicationIds(new Set());
    setState('AUTH_REQUIRED');
  }

  async function loadJobDescriptions(
    accessToken = token,
    page = 1,
    filters: { search?: string; status?: string } = {},
  ) {
    if (!accessToken) return;

    setJobDescriptionStatus('LOADING');
    setJobDescriptionError(null);

    try {
      const response = await listJobDescriptions(accessToken, {
        page,
        limit: 5,
        search: filters.search ?? jobDescriptionSearch,
        status: filters.status ?? jobDescriptionStatusFilter,
      });
      setJobDescriptions(response.data);
      setJobDescriptionPagination(response.pagination);
      setJobDescriptionStatus('READY');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      }

      setJobDescriptionError(toErrorMessage(err));
      setJobDescriptionStatus('ERROR');
    }
  }

  async function loadAmisApplications(
    accessToken = token,
    recruitmentId = amisRecruitmentId,
    options: { silent?: boolean } = {},
  ) {
    if (!accessToken || !recruitmentId) return;

    const requestSeq = ++applicationsRequestSeqRef.current;
    if (!options.silent) {
      setApplicationsState('LOADING');
      setApplicationsMessage(null);
    }

    try {
      const context = await getAmisApplicationsForRecruitment(accessToken, recruitmentId);
      if (
        requestSeq !== applicationsRequestSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== recruitmentId
      ) {
        return;
      }

      setApplicationsContext(mergeAmisCandidateStageOverrides(context));
      const hasNewAmisUploadConfirmation = reconcilePendingAmisUploads(context);
      setApplicationsState('READY');
      if (pendingAmisUploadApplicationIdsRef.current.size === 0 && !hasNewAmisUploadConfirmation) {
        setApplicationsMessage(null);
      }
    } catch (err) {
      if (
        requestSeq !== applicationsRequestSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== recruitmentId
      ) {
        return;
      }

      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      setApplicationsContext(null);
      setApplicationsState('ERROR');
      setApplicationsMessage(toErrorMessage(err));
    }
  }

  async function applyAmisCandidateStageChangedMessage(
    payload: AmisCandidateStageChangedPayload,
    sourceTabId?: number,
  ) {
    if (!payload.amisRecruitmentRoundId) return;
    if (activeAmisRecruitmentIdRef.current !== payload.amisRecruitmentId) return;

    try {
      const activeTab = await getActiveTab();
      if (sourceTabId !== undefined && activeTab.id !== sourceTabId) return;
    } catch {
      return;
    }

    const eventKey = `${payload.amisRecruitmentId}:${payload.amisCandidateId}`;
    const reasonRemoved = payload.reasonRemoved ?? null;
    const eventSignature = [
      payload.amisRecruitmentRoundId,
      payload.amisRecruitmentRoundName ?? '',
      payload.amisStatus ?? '',
      reasonRemoved ?? '',
    ].join(':');
    if (processedAmisCandidateStageEventsRef.current.get(eventKey) === eventSignature) return;
    processedAmisCandidateStageEventsRef.current.set(eventKey, eventSignature);
    amisCandidateStageOverridesRef.current.set(eventKey, {
      amisRecruitmentRoundId: payload.amisRecruitmentRoundId,
      amisRecruitmentRoundName: payload.amisRecruitmentRoundName,
      amisStatus: payload.amisStatus,
      reasonRemoved,
    });

    setApplicationsContext((current) => {
      if (!current || current.amisRecruitmentId !== payload.amisRecruitmentId) return current;

      return {
        ...current,
        applications: current.applications.map((application) => application.amisCandidateId === payload.amisCandidateId
          ? {
            ...application,
            amisRecruitmentRoundId: payload.amisRecruitmentRoundId,
            amisRecruitmentRoundName: payload.amisRecruitmentRoundName,
            amisStatus: payload.amisStatus,
            amisReasonRemoved: reasonRemoved,
          }
          : application),
      };
    });

    if (payload.isTransitionEvent !== true) return;

    const accessToken = tokenRef.current;
    if (!accessToken) return;

    try {
      await updateAmisApplicationStage(accessToken, payload);
      setReferralRefreshVersion((current) => current + 1);
      await loadAmisApplications(accessToken, payload.amisRecruitmentId, { silent: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      setApplicationsMessage(`Stage update could not be saved: ${toErrorMessage(err)}`);
    }
  }

  function mergeAmisCandidateStageOverrides(context: AmisApplicationsForRecruitment) {
    return {
      ...context,
      applications: context.applications.map((application) => {
        if (!application.amisCandidateId) return application;

        const eventKey = `${context.amisRecruitmentId}:${application.amisCandidateId}`;
        const override = amisCandidateStageOverridesRef.current.get(eventKey);
        if (!override) return application;

        if (application.amisRecruitmentRoundId === override.amisRecruitmentRoundId
          && application.amisStatus === override.amisStatus
          && application.amisReasonRemoved === override.reasonRemoved) {
          amisCandidateStageOverridesRef.current.delete(eventKey);
          return application;
        }

        return {
          ...application,
          amisRecruitmentRoundId: override.amisRecruitmentRoundId,
          amisRecruitmentRoundName: override.amisRecruitmentRoundName,
          amisStatus: override.amisStatus,
          amisReasonRemoved: override.reasonRemoved,
        };
      }),
    };
  }

  function clearAmisContextForNonRecruitmentPage() {
    lastAmisJobInitiationResetKeyRef.current = null;
    missedRecruitmentContextCountRef.current = 0;
    setActiveAmisCandidateId(null);
    setActiveAmisRecruitmentContext(null, null);
  }

  async function handleAmisJobInitiationContext(activeTab: ChromeTab) {
    missedRecruitmentContextCountRef.current = 0;
    await resetSelectedJobDescriptionForAmisJobInitiation(activeTab);
    setActiveAmisCandidateId(null);
    setActiveAmisRecruitmentContext(null, null);
  }

  function handleMissingAmisRecruitmentContext(
    activeTab: { id: number; url?: string },
    pageKind: string | null,
  ) {
    missedRecruitmentContextCountRef.current += 1;
    const shouldClearContext = pageKind === 'LIST'
      || !isLikelyAmisRecruitmentPage(activeTab.url ?? '')
      || missedRecruitmentContextCountRef.current >= 2;
    const shouldKeepExistingContext = Boolean(
      activeAmisRecruitmentIdRef.current
      && activeTab.url?.startsWith('https://amisapp.misa.vn/')
      && pageKind !== 'LIST',
    );

    if (!shouldKeepExistingContext && shouldClearContext) {
      setActiveAmisRecruitmentContext(null, null);
    }
  }

  async function refreshResolvedAmisRecruitmentContext(
    activeTab: { id: number; url?: string },
    context: ReturnType<typeof parseAmisRecruitmentContextFromUrl>,
    pageKind: string | null,
  ) {
    setActiveAmisCandidateId(context.amisCandidateId);

    if (!context.amisRecruitmentId) {
      handleMissingAmisRecruitmentContext(activeTab, pageKind);
      return;
    }

    missedRecruitmentContextCountRef.current = 0;
    const contextChanged = setActiveAmisRecruitmentContext(
      context.amisRecruitmentId,
      context.amisRecruitmentRoundId ?? null,
    );

    try {
      const roundsResponse = await sendMessageToAmisTab(activeTab.id, {
        type: GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE,
        payload: { amisRecruitmentId: context.amisRecruitmentId },
      });
      if (
        isAmisRecruitmentRoundsResponse(roundsResponse)
        && roundsResponse.ok
        && roundsResponse.amisRecruitmentId === context.amisRecruitmentId
      ) {
        setAmisRecruitmentRounds(roundsResponse.rounds);
      }
    } catch {
      // The passive AMIS response capture may arrive shortly after route hydration.
    }

    await refreshPostingSnapshotForActiveContext(context.amisRecruitmentId, activeTab, {
      force: contextChanged,
      silent: true,
      sourceUrl: context.sourceUrl ?? activeTab.url,
    });

    if (tokenRef.current && context.sourceUrl && lastApplicationsFallbackSyncUrlRef.current !== context.sourceUrl) {
      await syncAmisApplicationsFromAmisTab(tokenRef.current, activeTab.id, context.sourceUrl);
    }
  }

  async function refreshAmisRecruitmentContextFromActiveTab(options: { silent?: boolean; sourceTabId?: number } = {}) {
    try {
      const activeTab = await getActiveTab();
      if (options.sourceTabId !== undefined && activeTab.id !== options.sourceTabId) return;

      const resolution = await resolveAmisTabContext(activeTab);
      if (resolution.kind === 'OUTSIDE') {
        clearAmisContextForNonRecruitmentPage();
        return;
      }
      if (resolution.kind === 'JOB_INITIATION') {
        await handleAmisJobInitiationContext(activeTab);
        return;
      }

      lastAmisJobInitiationResetKeyRef.current = null;
      await refreshResolvedAmisRecruitmentContext(activeTab, resolution.context, resolution.pageKind);
    } catch (err) {
      if (!options.silent) setApplicationsMessage(toErrorMessage(err));
    }
  }

  async function resetSelectedJobDescriptionForAmisJobInitiation(activeTab: ChromeTab) {
    const resetKey = `${activeTab.id}:${normalizeAmisJobInitiationUrl(activeTab.url ?? '')}`;
    if (lastAmisJobInitiationResetKeyRef.current === resetKey) return;
    lastAmisJobInitiationResetKeyRef.current = resetKey;

    setSelectedJobDescription(null);
    setLockedAmisJobDescriptionId(null);
    setJobDescriptionQuestionContext(null);
    setSelectedJobQuestionIds(new Set());
    setCareerQuestionState('IDLE');
    setCareerQuestionMessage('Select a JD to view its synced question set.');
    setJobDescriptionFillState('IDLE');
    setJobDescriptionFillMessage(null);
    setFillingJobDescriptionId(null);
    lastJobQuestionContextIdRef.current = null;
    clearFacebookContent();
    await clearSelectedJobQuestionContextForTab(activeTab.id);
  }

  async function syncAmisApplicationsFromAmisTab(
    accessToken: string,
    tabId: number,
    sourceUrl: string,
  ) {
    const response = await sendMessageToAmisTab(tabId, {
      type: FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE,
      payload: { sourceUrl },
    });

    if (!isAmisApplicationsFetchResponse(response) || !response.ok || response.items.length === 0) return;

    const result = await syncAmisApplications(accessToken, {
      items: response.items,
      sourceUrl: response.sourceUrl,
      metadata: {
        autoSync: true,
        trigger: 'AMIS_APPLICATIONS_SIDE_PANEL_FALLBACK',
        capturedAt: new Date().toISOString(),
        rawCount: response.rawCount,
      },
    });

    lastApplicationsFallbackSyncUrlRef.current = sourceUrl;
    setActiveAmisRecruitmentContext(result.amisRecruitmentId, activeAmisRecruitmentIdRef.current === result.amisRecruitmentId ? amisRecruitmentRoundId : null);
    await loadAmisApplications(accessToken, result.amisRecruitmentId, { silent: true });
  }

  function clearPendingAmisUploadTimeout(applicationId: string) {
    const timeoutId = pendingAmisUploadTimeoutsRef.current.get(applicationId);
    if (timeoutId === undefined) return;

    window.clearTimeout(timeoutId);
    pendingAmisUploadTimeoutsRef.current.delete(applicationId);
  }

  function clearPendingAmisUploads() {
    for (const applicationId of pendingAmisUploadTimeoutsRef.current.keys()) {
      clearPendingAmisUploadTimeout(applicationId);
    }
    pendingAmisUploadApplicationIdsRef.current = new Set();
    setPendingAmisUploadApplicationIds(new Set());
  }

  function registerPendingAmisUploads(applications: ExtensionApplication[]) {
    const nextPendingIds = new Set(pendingAmisUploadApplicationIdsRef.current);

    for (const application of applications) {
      const applicationId = application.applicationId;
      nextPendingIds.add(applicationId);
      clearPendingAmisUploadTimeout(applicationId);

      const timeoutId = window.setTimeout(() => {
        const pendingIds = new Set(pendingAmisUploadApplicationIdsRef.current);
        if (!pendingIds.delete(applicationId)) return;

        pendingAmisUploadApplicationIdsRef.current = pendingIds;
        pendingAmisUploadTimeoutsRef.current.delete(applicationId);
        setPendingAmisUploadApplicationIds(pendingIds);
        setApplicationsMessage('AMIS chưa xác nhận đã lưu CV. Vui lòng kiểm tra form AMIS và thử lại nếu cần.');
      }, AMIS_CV_UPLOAD_CONFIRMATION_TIMEOUT_MS);

      pendingAmisUploadTimeoutsRef.current.set(applicationId, timeoutId);
    }

    pendingAmisUploadApplicationIdsRef.current = nextPendingIds;
    setPendingAmisUploadApplicationIds(nextPendingIds);
  }

  function reconcilePendingAmisUploads(context: AmisApplicationsForRecruitment) {
    const pendingIds = pendingAmisUploadApplicationIdsRef.current;
    if (pendingIds.size === 0) return false;

    const confirmedApplications = context.applications.filter((application) =>
      pendingIds.has(application.applicationId)
      && Boolean(application.attachmentCvId || application.attachmentCvName),
    );
    if (confirmedApplications.length === 0) return false;

    const nextPendingIds = new Set(pendingIds);
    for (const application of confirmedApplications) {
      nextPendingIds.delete(application.applicationId);
      clearPendingAmisUploadTimeout(application.applicationId);
    }

    pendingAmisUploadApplicationIdsRef.current = nextPendingIds;
    setPendingAmisUploadApplicationIds(nextPendingIds);
    setApplicationsMessage(
      nextPendingIds.size === 0
        ? `AMIS đã lưu ${confirmedApplications.length} hồ sơ.`
        : `AMIS đã lưu ${confirmedApplications.length} hồ sơ. Còn ${nextPendingIds.size} hồ sơ đang chờ xác nhận.`,
    );
    return true;
  }

  async function applyApplicationsSyncedMessage(message: {
    payload: {
      amisRecruitmentId: string;
      jobPostingId: string;
      syncedCount: number;
    };
  }) {
    if (
      activeAmisRecruitmentIdRef.current &&
      activeAmisRecruitmentIdRef.current !== message.payload.amisRecruitmentId
    ) {
      await refreshAmisRecruitmentContextFromActiveTab({ silent: true });
      if (
        activeAmisRecruitmentIdRef.current &&
        activeAmisRecruitmentIdRef.current !== message.payload.amisRecruitmentId
      ) {
        return;
      }
    }

    setActiveAmisRecruitmentContext(message.payload.amisRecruitmentId, amisRecruitmentRoundId);
    setReferralRefreshVersion((current) => current + 1);
    if (tokenRef.current) {
      void loadAmisApplications(tokenRef.current, message.payload.amisRecruitmentId, { silent: true });
    }
  }

  async function applyAmisCaptureUpdatedMessage(
    capture: AmisExtractionResult,
    sourceTabId?: number,
  ) {
    try {
      const activeTab = await getActiveTab();
      if (sourceTabId !== undefined && activeTab.id !== sourceTabId) return;
      if (!capture.detected || !capture.snapshot || !capture.amisRecruitmentId) return;

      applyExtractionResult(capture);
      await selectExistingJobDescriptionForAmisCapture(capture, tokenRef.current, sourceTabId);
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 401)) {
        setJobDescriptionError(toErrorMessage(err));
      }
    }
  }

  async function applyAutoSyncUpdateMessage(latestState: AmisAutoSyncState) {
    const stateRecruitmentId = getAutoSyncStateRecruitmentId(latestState);
    if (
      activeAmisRecruitmentIdRef.current &&
      stateRecruitmentId &&
      activeAmisRecruitmentIdRef.current !== stateRecruitmentId
    ) {
      await refreshAmisRecruitmentContextFromActiveTab({ silent: true });
      if (
        activeAmisRecruitmentIdRef.current &&
        activeAmisRecruitmentIdRef.current !== stateRecruitmentId
      ) {
        return;
      }
    }

    applyAutoSyncState(latestState, { force: true });
  }

  async function uploadApplicationCvToAmisForm(application: AmisApplicationsForRecruitment['applications'][number]) {
    await uploadApplicationCvsToAmisForm([application]);
  }

  async function runAiScreeningForApplication(
    application: AmisApplicationsForRecruitment['applications'][number],
  ) {
    if (!token || aiScreeningApplicationId) return;
    if (normalizeStatus(application.aiScreeningStatus) === 'DONE') return;
    if (getApplicationQuestionStatus(application).code !== 'ANSWERED') return;

    setAiScreeningApplicationId(application.applicationId);
    setApplicationsMessage(null);
    try {
      await runApplicationAiScreening(token, application.applicationId);
      await loadAmisApplications(token, amisRecruitmentId, { silent: true });
      setApplicationsMessage(`Đã đánh giá AI cho ${application.candidateName}.`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }
      await loadAmisApplications(token, amisRecruitmentId, { silent: true });
      setApplicationsMessage(toErrorMessage(err));
    } finally {
      setAiScreeningApplicationId(null);
    }
  }

  async function uploadAiEvaluationToAmis(application: AmisApplicationsForRecruitment['applications'][number]) {
    if (!token) return;
    setAiEvaluationApplicationId(application.applicationId);
    setApplicationsMessage(null);
    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        throw new Error('Open the AMIS candidate documents tab first.');
      }

      const [applicationDetail, parsedProfile] = await Promise.all([
        getApplicationDetail(token, application.applicationId),
        getApplicationParsedProfile(token, application.applicationId),
      ]);
      const previewPdf = await createAiMatchPreviewPdfBase64({
        profile: parsedProfile?.parsedData ?? parsedProfile?.profile,
        mapping: applicationDetail?.mapping,
        screening: applicationDetail?.aiScreening,
        candidate: applicationDetail?.candidate
          ? {
            fullName: applicationDetail.candidate.fullName,
            email: applicationDetail.candidate.email,
            phone: applicationDetail.candidate.phone,
          }
          : {
            fullName: application.candidateName,
            email: application.email,
            phone: application.mobile,
          },
      });
      if (previewPdf.length < 1000) {
        throw new Error('PDF đánh giá AI được tạo ra không hợp lệ hoặc đang rỗng.');
      }

      const response = await sendMessageToAmisTab(activeTab.id, {
        type: UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE,
        payload: {
          waitForCandidateForm: false,
          files: [{
            fileName: `ai-match-preview-${application.candidateName || 'candidate'}.pdf`,
            mimeType: 'application/pdf',
            dataBase64: previewPdf,
          }],
        },
      });
      if (!isAmisResponseWithOk<AmisUploadCvFileResponse>(response) || !response.ok) {
        throw new Error(isAmisResponseWithOk<AmisUploadCvFileResponse>(response)
          ? response.error ?? 'AMIS did not accept the AI evaluation PDF.'
          : 'AMIS tab did not confirm AI evaluation upload.');
      }
      setAiEvaluationUploadedApplicationIds((currentIds) => new Set(currentIds).add(application.applicationId));
      setApplicationsMessage('Đã tạo PDF đánh giá AI và đưa vào form Tài liệu AMIS.');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }
      setApplicationsMessage(toErrorMessage(err));
    } finally {
      setAiEvaluationApplicationId(null);
    }
  }

  async function uploadApplicationCvsToAmisForm(applications: AmisApplicationsForRecruitment['applications']) {
    if (!token) return;
    const uploadableApplications = applications.filter((application) =>
      canUploadApplicationCv(application)
      && !pendingAmisUploadApplicationIdsRef.current.has(application.applicationId),
    );
    if (uploadableApplications.length === 0) {
      setApplicationsMessage('Select at least one application with a sanitized clean CV.');
      return;
    }

    setCvUploadApplicationId(uploadableApplications.length === 1 ? uploadableApplications[0].applicationId : 'BATCH');
    setApplicationsMessage(null);

    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        throw new Error('Open the AMIS recruitment tab and the "Thêm ứng viên" modal first.');
      }

      const cleanCvs = await Promise.all(uploadableApplications.map((application) =>
        downloadCleanCvFile(token, application.applicationId, application.currentCvDocumentId as string),
      ));

      const response = await sendMessageToAmisTab(activeTab.id, {
        type: UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE,
        payload: {
          files: cleanCvs.map((cleanCv, index) => ({
            fileName: buildAmisUploadCvFileName(uploadableApplications[index], cleanCv.fileName),
            mimeType: cleanCv.mimeType,
            dataBase64: arrayBufferToBase64(cleanCv.data),
          })),
        },
      });

      if (!isAmisResponseWithOk<AmisUploadCvFileResponse>(response) || !response.ok) {
        throw new Error(isAmisResponseWithOk<AmisUploadCvFileResponse>(response)
          ? response.error ?? 'AMIS did not accept the CV file.'
          : `AMIS tab did not confirm CV upload. Response: ${JSON.stringify(response ?? null).slice(0, 160)}`);
      }

      registerPendingAmisUploads(uploadableApplications);
      const sourceSelectionMessage = await buildAmisSourceSelectionMessage(activeTab.id, uploadableApplications);

      setApplicationsMessage(
        `Đã đưa ${response.fileCount ?? cleanCvs.length} CV vào form AMIS.${sourceSelectionMessage} Vui lòng bấm Lưu trên AMIS để hoàn tất.`,
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      setApplicationsMessage(toErrorMessage(err));
    } finally {
      setCvUploadApplicationId(null);
    }
  }

  function setActiveAmisRecruitmentContext(
    recruitmentId: string | null,
    recruitmentRoundId: string | null,
    options: { clearPosting?: boolean } = {},
  ) {
    const normalizedRecruitmentId = normalizeOptionalText(recruitmentId);
    const normalizedRoundId = normalizeOptionalText(recruitmentRoundId);
    const previousRecruitmentId = activeAmisRecruitmentIdRef.current;

    activeAmisRecruitmentIdRef.current = normalizedRecruitmentId;
    setAmisRecruitmentId(normalizedRecruitmentId);
    setAmisRecruitmentRoundId(normalizedRoundId);

    if (previousRecruitmentId !== normalizedRecruitmentId) {
      applicationsRequestSeqRef.current += 1;
      lastApplicationsFallbackSyncUrlRef.current = null;
      setAmisRecruitmentRounds([]);
      clearPendingAmisUploads();
      setApplicationsContext(null);
      setApplicationsMessage(null);
      setApplicationsState(normalizedRecruitmentId ? 'LOADING' : 'IDLE');
      setSelectedJobDescription(null);
      setLockedAmisJobDescriptionId(null);
      setJobDescriptionQuestionContext(null);
      setSelectedJobQuestionIds(new Set());
      setCareerQuestionState('IDLE');
      setCareerQuestionMessage('Select a JD to view its synced question set.');
      const shouldClearFacebookContent = shouldClearFacebookContentForRecruitmentChange(
        previousRecruitmentId,
        normalizedRecruitmentId,
      );
      if (shouldClearFacebookContent) {
        clearFacebookPostContentState();
      }
      if (options.clearPosting === false) {
        postingSnapshotRefreshSeqRef.current += 1;
        activeSnapshotRecruitmentIdRef.current = null;
      } else {
        clearPostingStateForRecruitmentChange({ clearFacebookContent: false });
      }
    }

    return previousRecruitmentId !== normalizedRecruitmentId;
  }

  function shouldClearFacebookContentForRecruitmentChange(previousRecruitmentId: string | null, nextRecruitmentId: string | null) {
    if (previousRecruitmentId && nextRecruitmentId && previousRecruitmentId !== nextRecruitmentId) return true;
    return facebookContentSourceRef.current === 'EMPTY' || facebookContentSourceRef.current === 'DEFAULT';
  }

  function clearPostingStateForRecruitmentChange(options: { clearFacebookContent?: boolean } = {}) {
    postingSnapshotRefreshSeqRef.current += 1;
    activeSnapshotRecruitmentIdRef.current = null;
    setSnapshot(null);
    setExtractionResult(null);
    setResult(null);
    setAutoSyncState(null);
    setAmisUrl(undefined);
    setError(null);
    if (options.clearFacebookContent !== false) {
      clearFacebookPostContentState();
    }
    setState((current) => (
      current === 'AUTH_LOADING' || current === 'AUTH_REQUIRED' ? current : 'READY'
    ));
  }

  function clearFacebookPostContentState() {
    facebookContentGenerationSeqRef.current += 1;
    facebookContentSnapshotKeyRef.current = null;
    facebookContentSnapshotFingerprintRef.current = null;
    facebookContentJobIdentityRef.current = null;
    facebookContentRef.current = '';
    facebookContentSourceRef.current = 'EMPTY';
    setFacebookContent('');
    setFacebookContentDraft('');
    setFacebookContentState('IDLE');
    setFacebookContentMessage(null);
    setFacebookPreviewModalMode(null);
  }

  async function refreshPostingSnapshotForActiveContext(
    recruitmentId: string,
    activeTab: ChromeTab,
    options: { force?: boolean; silent?: boolean; sourceUrl?: string } = {},
  ) {
    const normalizedRecruitmentId = normalizeOptionalText(recruitmentId);
    if (!normalizedRecruitmentId) return;
    if (!options.force && activeSnapshotRecruitmentIdRef.current === normalizedRecruitmentId) return;

    const refreshSeq = ++postingSnapshotRefreshSeqRef.current;
    if (await applyStoredPostingSnapshotForRecruitment(normalizedRecruitmentId, refreshSeq)) return;

    if (!chrome.scripting || !activeTab.id || !activeTab.url?.startsWith('https://amisapp.misa.vn/')) return;

    const sourceUrl = options.sourceUrl ?? activeTab.url;
    const attemptKey = `${normalizedRecruitmentId}:${activeTab.id}:${sourceUrl}`;
    const attempts = postingSnapshotRefreshAttemptsRef.current.get(attemptKey) ?? 0;
    if (!options.force && attempts >= MAX_POSTING_SNAPSHOT_REFRESH_ATTEMPTS) return;
    postingSnapshotRefreshAttemptsRef.current.set(attemptKey, attempts + 1);

    try {
      const extraction = await extractPostingSnapshotFromActiveTab(
        activeTab.id,
        normalizedRecruitmentId,
        extractAmisJobFromDetailApiInActiveTab,
        extractAmisJobFromDomInActiveTab,
      );
      if (
        !extraction ||
        refreshSeq !== postingSnapshotRefreshSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== normalizedRecruitmentId
      ) {
        return;
      }

      if (
        isExtractionForRecruitment(extraction, normalizedRecruitmentId)
        && extraction.missingFields.length === 0
      ) {
        postingSnapshotRefreshAttemptsRef.current.delete(attemptKey);
        applyExtractionResult(extraction);
        await selectExistingJobDescriptionForAmisCapture(extraction, tokenRef.current, activeTab.id);
        setState('READY');
        return;
      }

      if (!options.silent) {
        setExtractionResult(extraction);
        setError(`Active AMIS page did not expose a snapshot for recruitment ${normalizedRecruitmentId}.`);
      }
    } catch (err) {
      if (!options.silent) setError(toErrorMessage(err));
    }
  }

  async function extractAmisJobFromDetailApiInActiveTab(tabId: number, recruitmentId: string) {
    if (!chrome.scripting) return undefined;

    const injectionResults = await chrome.scripting.executeScript<[string], AmisExtractionResult>({
      target: { tabId },
      func: extractAmisJobFromDetailApi,
      args: [recruitmentId],
      world: 'MAIN',
    });
    return injectionResults[0]?.result;
  }

  async function extractAmisJobFromDomInActiveTab(tabId: number) {
    if (!chrome.scripting) return undefined;

    const injectionResults = await chrome.scripting.executeScript<[], AmisExtractionResult>({
      target: { tabId },
      func: extractAmisJobFromPage,
    });
    return injectionResults[0]?.result;
  }

  async function selectExistingJobDescriptionForAmisCapture(
    capture: AmisExtractionResult,
    accessToken = tokenRef.current,
    sourceTabId?: number,
  ): Promise<void> {
    const recruitmentId = normalizeOptionalText(capture.amisRecruitmentId);
    if (!accessToken || !recruitmentId || !capture.snapshot || capture.missingFields.length > 0) return;

    const selectionSeq = amisJobSelectionSeqRef.current + 1;
    amisJobSelectionSeqRef.current = selectionSeq;

    try {
      const activeTab = await getActiveTab();
      if (sourceTabId !== undefined && activeTab.id !== sourceTabId) return;
      const tabTemplateContext = await getAmisTemplateContextForTab(sourceTabId ?? activeTab.id);
      const templateContext = tabTemplateContext
        ?? await getAmisTemplateContextForRecruitment(recruitmentId);

      if (templateContext?.templateJobDescriptionId) {
        const sourceJobDescription = await resolveAmisTemplateJobDescription(
          accessToken,
          templateContext.templateJobDescriptionId,
        );
        if (
          !sourceJobDescription
          || selectionSeq !== amisJobSelectionSeqRef.current
          || activeAmisRecruitmentIdRef.current !== recruitmentId
        ) {
          return;
        }

        await saveAmisTemplateContextForRecruitment(recruitmentId, templateContext);
        setJobDescriptionStatus('READY');
        setSelectedJobDescription(sourceJobDescription);
        setLockedAmisJobDescriptionId(sourceJobDescription.id);
        setSnapshot(capture.snapshot);
        setExtractionResult(capture);
        setAmisUrl(capture.url);
        setJobDescriptionError(null);
        await loadSelectedJobDescriptionQuestionSet(sourceJobDescription, accessToken, {
          silent: true,
          force: true,
        });
        await clearAmisTemplateContextForTab(sourceTabId ?? activeTab.id);
        return;
      }

      setSnapshot(capture.snapshot);
      setExtractionResult(capture);
      setAmisUrl(capture.url);
      setJobDescriptionError(null);
      return;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      setJobDescriptionError(toErrorMessage(err));
      return;
    }
  }

  async function resolveAmisTemplateJobDescription(
    accessToken: string,
    templateJobDescriptionId: string,
  ) {
    const loadedJobDescription = jobDescriptions.find((item) => item.id === templateJobDescriptionId);
    if (loadedJobDescription) return loadedJobDescription;

    try {
      const context = await getJobDescriptionQuestionSet(accessToken, templateJobDescriptionId);
      return context.jobDescription;
    } catch {
      return null;
    }
  }

  async function applyStoredPostingSnapshotForRecruitment(recruitmentId: string, refreshSeq: number) {
    const latestState = await getLastAutoSyncState().catch(() => null);
    if (
      latestState &&
      getAutoSyncStateRecruitmentId(latestState) === recruitmentId &&
      latestState.capture &&
      isExtractionForRecruitment(latestState.capture, recruitmentId)
    ) {
      if (
        refreshSeq !== postingSnapshotRefreshSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== recruitmentId
      ) {
        return true;
      }

      applyAutoSyncState(latestState, { force: true });
      if (latestState.capture) {
        await selectExistingJobDescriptionForAmisCapture(latestState.capture, tokenRef.current);
      }
      return true;
    }

    const capture = await getLastAmisCapture().catch(() => null);
    if (capture && isExtractionForRecruitment(capture, recruitmentId)) {
      if (
        refreshSeq !== postingSnapshotRefreshSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== recruitmentId
      ) {
        return true;
      }

      applyExtractionResult(capture);
      await selectExistingJobDescriptionForAmisCapture(capture, tokenRef.current);
      setState('READY');
      return true;
    }

    return false;
  }

  async function loadSelectedJobDescriptionQuestionSet(
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
    accessToken = token,
    options: { silent?: boolean; force?: boolean } = {},
  ) {
    if (!accessToken) return;
    if (!jobDescription?.id) {
      lastJobQuestionContextIdRef.current = null;
      setJobDescriptionQuestionContext(null);
      setSelectedJobQuestionIds(new Set());
      setCareerQuestionState('IDLE');
      setCareerQuestionMessage('Select a JD to view its synced question set.');
      return;
    }

    if (!options.force && options.silent && lastJobQuestionContextIdRef.current === jobDescription.id) {
      return;
    }

    if (!options.silent) {
      setCareerQuestionState('LOADING');
      setCareerQuestionMessage(null);
    }

    try {
      const context = await getJobDescriptionQuestionSet(accessToken, jobDescription.id);
      lastJobQuestionContextIdRef.current = jobDescription.id;
      setSelectedJobDescription(context.jobDescription);
      setJobDescriptionQuestionContext(context);
      await selectAllJobQuestions(context);
      setCareerQuestionState('READY');
      setCareerQuestionMessage(context.questionSet
        ? null
        : 'This JD does not have an active synced question set.');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      if (!options.silent) {
        setCareerQuestionState('ERROR');
        setCareerQuestionMessage(toErrorMessage(err));
      }
    }
  }

  function openFrontendQuestionEditor() {
    if (!jobDescriptionQuestionContext?.questions.length) return;

    if (!chrome.tabs?.create) {
      setCareerQuestionState('ERROR');
      setCareerQuestionMessage('Không thể mở trang FE chỉnh sửa bộ câu hỏi.');
      return;
    }

    void chrome.tabs.create({
      url: `${FRONTEND_BASE_URL}/questions`,
      active: true,
    }).then(() => {
      setCareerQuestionState('READY');
      setCareerQuestionMessage('Đã mở trang FE để chỉnh sửa bộ câu hỏi.');
    }).catch(() => {
      setCareerQuestionState('ERROR');
      setCareerQuestionMessage('Không thể mở trang FE chỉnh sửa bộ câu hỏi.');
    });
  }

  async function selectAllJobQuestions(context: JobDescriptionQuestionSetContext) {
    const questionIds = context.questions.map((question) => question.id);
    setSelectedJobQuestionIds(new Set(questionIds));
    await persistSelectedJobQuestions(context.jobDescription.id, questionIds);
    void persistSelectedJobQuestionContextForActiveTab(context, questionIds);
  }

  async function persistSelectedJobQuestionContextForActiveTab(
    context: JobDescriptionQuestionSetContext,
    questionIds: string[],
  ) {
    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) return;

      await saveSelectedJobQuestionContext({
        tabId: activeTab.id,
        pageUrl: activeTab.url,
        jobDescriptionId: context.jobDescription.id,
        jobDescriptionTitle: context.jobDescription.title,
        questionSetId: context.questionSet?.id ?? null,
        questionIds,
      });
    } catch {
      // Background auto-sync can still fall back to backend questionnaire defaults.
    }
  }

  function submitJobDescriptionSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (jobDescriptionSearchDebounceRef.current !== null) {
      window.clearTimeout(jobDescriptionSearchDebounceRef.current);
      jobDescriptionSearchDebounceRef.current = null;
    }
    void loadJobDescriptions(token, 1);
  }

  function clearJobDescriptionSearch() {
    setJobDescriptionSearch('');
    void loadJobDescriptions(token, 1, { search: '' });
  }

  function changeJobDescriptionStatusFilter(status: string) {
    setJobDescriptionStatusFilter(status);
    void loadJobDescriptions(token, 1, { status });
  }

  async function fillJobDescriptionInAmis(jobDescription: JobDescriptionSummary) {
    if (lockedAmisJobDescriptionId && lockedAmisJobDescriptionId !== jobDescription.id) return;

    const nextSnapshot = buildAmisJobSnapshotFromJobDescription(jobDescription);
    setSelectedJobDescription(jobDescription);
    setSnapshot(nextSnapshot);
    setResult(null);
    clearFacebookContent();
    void loadSelectedJobDescriptionQuestionSet(jobDescription, token, { silent: true, force: true });
    void generateFacebookPostContent({
      snapshotOverride: nextSnapshot,
      selectedJobDescriptionOverride: jobDescription,
      forceFacebookChannel: true,
    });
    setJobDescriptionFillState('FILLING');
    setFillingJobDescriptionId(jobDescription.id);
    setJobDescriptionFillMessage(`Đang chọn "${jobDescription.title}" và tải bộ câu hỏi...`);

    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        throw new Error('Mở màn tạo tin tuyển dụng AMIS ở tab hiện tại rồi chọn lại JD.');
      }

      const response = await sendFillAmisFormMessage(activeTab.id, buildAmisFormFillPayload(jobDescription));

      if (!isFillResponse(response) || !response.ok) {
        throw new Error(isFillResponse(response) ? response.error : 'AMIS page did not confirm the form fill.');
      }

      await saveAmisTemplateContext({
        tabId: activeTab.id,
        templateJobDescriptionId: jobDescription.id,
        templateJobDescriptionTitle: jobDescription.title,
        formPageUrl: activeTab.url,
      });

      setJobDescriptionFillState('SUCCESS');
      setJobDescriptionFillMessage(`Filled ${response.filledFields.length} field(s): ${response.filledFields.join(', ')}.`);
    } catch (err) {
      setJobDescriptionFillState('ERROR');
      setJobDescriptionFillMessage(toErrorMessage(err));
    } finally {
      setFillingJobDescriptionId(null);
    }
  }

  function loadMockSnapshot() {
    const mock = createMockAmisSyncRequest();
    setSnapshot(mock.snapshot);
    setAmisRecruitmentId(mock.amisRecruitmentId);
    setAmisUrl(mock.amisUrl);
    setChannels(normalizePostingChannels(mock.channels));
    setExtractionResult(null);
    setResult(null);
    setError(null);
    setState('READY');
  }

  async function loadLatestAmisCapture(
    options: { silent?: boolean } = {},
    accessToken = tokenRef.current,
  ) {
    try {
      const capture = await getLastAmisCapture();
      if (!capture) {
        if (!options.silent) setError('No AMIS SaveRecruitment capture is available yet.');
        return;
      }

      applyExtractionResult(capture);
      await selectExistingJobDescriptionForAmisCapture(capture, accessToken);
      setState('READY');
    } catch (err) {
      if (!options.silent) {
        setError(toErrorMessage(err));
        setState('ERROR');
      }
    }
  }

  async function loadLatestAutoSyncState(options: { silent?: boolean } = {}) {
    try {
      const latestState = await getLastAutoSyncState();
      if (!latestState) return;
      applyAutoSyncState(latestState);
    } catch (err) {
      if (!options.silent) {
        setError(toErrorMessage(err));
        setState('ERROR');
      }
    }
  }

  async function bootstrapAmisTab() {
    await ensureAmisHooksForCurrentTab();
    const capture = await getLastAmisCapture();
    if (!capture) {
      await extractFromCurrentTab({ silent: true });
    }
  }

  async function restoreFacebookProgress() {
    const progress = await getLastFacebookPublishProgress();
    if (progress) setFacebookProgress(progress);
  }

  async function extractFromCurrentTab(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setState('EXTRACTING');
      setError(null);
      setResult(null);
    }

    try {
      if (!chrome.scripting) {
        throw new Error('Chrome scripting permission is unavailable.');
      }

      const activeTab = await getActiveTab();
      const injectionResults = await chrome.scripting.executeScript<[], AmisExtractionResult>({
        target: { tabId: activeTab.id },
        func: extractAmisJobFromPage,
      });
      const extraction = injectionResults[0]?.result;

      if (!extraction) {
        throw new Error(chrome.runtime?.lastError?.message ?? 'Could not read the active tab.');
      }

      applyExtractionResult(extraction);
      if (!options.silent) setState('READY');
    } catch (err) {
      if (!options.silent) {
        setExtractionResult(null);
        setError(toErrorMessage(err));
        setState('ERROR');
      }
    }
  }

  function applyExtractionResult(extraction: AmisExtractionResult) {
    const extractionRecruitmentId = extraction.detected && extraction.snapshot
      ? normalizeOptionalText(extraction.amisRecruitmentId)
      : null;
    setActiveAmisRecruitmentContext(
      extractionRecruitmentId,
      activeAmisRecruitmentIdRef.current === extractionRecruitmentId ? amisRecruitmentRoundId : null,
      { clearPosting: false },
    );
    setExtractionResult(extraction);
    setAmisUrl(extraction.url);
    setResult(null);
    setError(null);
    if (extraction.detected && extraction.snapshot) {
      activeSnapshotRecruitmentIdRef.current = extractionRecruitmentId;
      setSnapshot(extraction.snapshot);
      void applyStoredFacebookContentDraft(extractionRecruitmentId, extraction.snapshot);
    } else {
      activeSnapshotRecruitmentIdRef.current = null;
      setSnapshot(null);
      if (facebookContentSourceRef.current === 'EMPTY' || facebookContentSourceRef.current === 'DEFAULT') {
        clearFacebookPostContentState();
      }
    }
  }

  function applyAutoSyncState(latestState: AmisAutoSyncState, options: { force?: boolean } = {}) {
    const stateRecruitmentId = getAutoSyncStateRecruitmentId(latestState);
    const activeRecruitmentId = activeAmisRecruitmentIdRef.current;
    if (
      !options.force &&
      activeRecruitmentId &&
      stateRecruitmentId &&
      activeRecruitmentId !== stateRecruitmentId
    ) {
      return;
    }

    setAutoSyncState(latestState);
    if (latestState.channels) setChannels(normalizePostingChannels(latestState.channels));
    if (latestState.capture) applyExtractionResult(latestState.capture);
    if (latestState.result) setResult(latestState.result);
    if (latestState.error) setError(`${latestState.error.code}: ${latestState.error.message}`);

    if (latestState.status === 'SYNCING') setState('SYNCING');
    if (latestState.status === 'SUCCESS') setState('SUCCESS');
    if (latestState.status === 'ERROR' || latestState.status === 'SKIPPED') setState('ERROR');
    if (latestState.status === 'AUTH_REQUIRED') setState('AUTH_REQUIRED');
  }

  async function toggleChannel(channel: ExtensionChannel) {
    if (channel === 'FACEBOOK') {
      await toggleFacebookChannel();
      return;
    }

    const next = selectedPostingChannels.includes(channel)
      ? selectedPostingChannels.filter((item) => item !== channel)
      : [...selectedPostingChannels, channel];
    setChannels(next);
    void setSelectedChannels(next);
  }

  async function toggleFacebookChannel() {
    if (isFacebookGroupLoading(facebookGroupLoadState)) return;

    if (selectedPostingChannels.includes('FACEBOOK')) {
      const next = selectedPostingChannels.filter((item) => item !== 'FACEBOOK');
      setChannels(next);
      setFacebookGroupLoadState('IDLE');
      setFacebookAccount(null);
      setFacebookPreviewIdentity(null);
      setFacebookGroupMessage(null);
      setFacebookGroupSyncDetails(null);
      setIsFacebookGroupSyncDetailsOpen(false);
      setFacebookPublishResultsVisible(false);
      resetFacebookImageAttachmentView();
      clearFacebookContent();
      void setSelectedChannels(next);
      return;
    }

    if (!token) {
      setError('Sign in to VCS Recruitment before selecting Facebook.');
      setState('AUTH_REQUIRED');
      return;
    }

    const next: ExtensionChannel[] = [...selectedPostingChannels, 'FACEBOOK'];
    setChannels(next);
    // Account identity is resolved independently from the group list so the
    // post preview can use the real Facebook name/avatar while groups load.
    setFacebookAccount(null);
    setFacebookPreviewIdentity(null);
    setError(null);

    try {
      const result = await loadFacebookGroupsForFacebookChannel(token);
      await restoreFacebookImageAttachments(amisRecruitmentId, snapshot, selectedJobDescription);
      const groups = result.groups;
      const selectedIds = result.selectedIds;
      const discoverySummary = result.discoverySummary;
      if (groups.length > 0) {
        setFacebookGroupMessage(
          buildFacebookGroupSelectionMessage(selectedIds, groups, discoverySummary),
        );
      } else {
        setFacebookGroupMessage('Đã quét được 0 nhóm');
      }
      await setSelectedChannels(next);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      }

      const rollback: ExtensionChannel[] = next.filter((item) => item !== 'FACEBOOK');
      setChannels(rollback);
      void setSelectedChannels(rollback);
      setFacebookAccount(null);
      setFacebookPreviewIdentity(null);
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(toErrorMessage(err));
    }
  }

  async function loadFacebookGroupsForFacebookChannel(accessToken: string): Promise<FacebookGroupsSyncResult> {
    setFacebookGroupSyncDetails(null);
    setFacebookIneligiblePage(1);
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
  }

  async function handleSyncFacebookGroups() {
    if (!token || isFacebookGroupLoading(facebookGroupLoadState)) return;

    try {
      const result = await syncFacebookGroupsFromBrowser(token);
      if (result.groups.length === 0) {
        setFacebookGroupMessage('Đã quét được 0 nhóm');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      }
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(toErrorMessage(err));
    }
  }

  async function syncFacebookGroupsFromBrowser(
    accessToken: string,
  ): Promise<FacebookGroupsSyncResult> {
    setFacebookGroups([]);
    setFacebookGroupSearchInput('');
    setFacebookGroupSearchQuery('');
    setFacebookGroupSyncDetails(null);
    setFacebookIneligiblePage(1);
    setFacebookGroupDiagnostic(null);
    let activeAccount = facebookAccount;
    setFacebookGroupLoadState('LOADING_GROUPS');
    setFacebookGroupMessage('Đang quét danh sách nhóm đã tham gia trên Facebook...');

    const scanResult = await collectJoinedFacebookGroupsFromFacebookPage(
      (message) => {
        if (!message) return;
        if (message.includes('[FB_GQL_')) setFacebookGroupDiagnostic(message);
        setFacebookGroupMessage(message);
      },
      { ensureSession: false, expectedFacebookExternalId: activeAccount?.facebookExternalId },
    );

    if (!activeAccount && scanResult.account) {
      activeAccount = await resolveFacebookAccount(accessToken, scanResult.account);
      setFacebookAccount(activeAccount);
      await setActiveFacebookAccountId(activeAccount.id);
    }

    if (!activeAccount) {
      throw new Error('Facebook account is not resolved. Please complete Facebook login and try again.');
    }

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
      setFacebookIneligiblePage(1);
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
  }

  async function applyStoredFacebookContentDraft(
    recruitmentId: string | null,
    nextSnapshot: AmisJobSnapshot,
    jobDescription: JobDescriptionSummary | null = selectedJobDescription,
  ) {
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
  }

  async function syncFacebookImageStatusesFromHistory(items: FacebookPublishHistoryListItem[]) {
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
  }

  async function syncFacebookImageStatusFromHistoryItem(
    item: FacebookPublishHistoryListItem,
    facebookReviewStatus: FacebookReviewStatus,
  ) {
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
  }

  async function clearFacebookImageViewIfReleased(released: boolean) {
    if (!released) return;
    try {
      const remainingAttachments = await getFacebookImageAttachments(getFacebookImageAttachmentScope());
      if (remainingAttachments.length === 0) resetFacebookImageAttachmentView();
    } catch {
      // A storage read failure must not interrupt history refresh or publish completion.
    }
  }

  async function openFacebookGroupSettings(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!token) {
      setError('Sign in to VCS Recruitment before configuring Facebook groups.');
      setState('AUTH_REQUIRED');
      return;
    }

    setIsFacebookSettingsOpen(true);
    setFacebookGroupModalMode('SETTINGS');
    setFacebookGroupPage(1);
    setFacebookSettingsGroupSearchInput('');
    setFacebookSettingsGroupSearchQuery('');
    setSelectedFacebookGroup(null);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsMessage(null);
    await refreshFacebookGroupsForSettings(token);
  }

  async function collectJoinedFacebookGroupsFromFacebookPage(
    onMessage?: (message: string) => void,
    options: { ensureSession?: boolean; expectedFacebookExternalId?: string } = {},
  ): Promise<FacebookGroupsScanRunResult> {
    if (options.ensureSession !== false) {
      await ensureFacebookSession({
        onStatus: (event) => {
          if (onMessage && event.status !== 'READY') {
            onMessage(event.message);
          }
        },
      });
    }

    const previousTabId = facebookGroupScanTabIdRef.current;
    const previousTab = previousTabId !== null && chrome.tabs?.get
      ? await chrome.tabs.get(previousTabId).catch(() => null)
      : null;
    const tab = previousTab ?? await chrome.tabs?.create({ url: 'about:blank', active: false });
    if (!tab?.id) {
      throw new Error('Không thể mở tab danh sách nhóm Facebook.');
    }
    facebookGroupScanTabIdRef.current = tab.id;

    let closeAfterScan = false;
    try {
      await chrome.tabs?.update(tab.id, {
        url: 'https://www.facebook.com/groups/joins/?nav_source=tab',
        active: false,
      });
      await waitForTabComplete(tab.id);

      const account = await ensureFacebookLoginInTab(tab.id, {
        onStatus: (event) => {
          if (event.status !== 'READY') onMessage?.(event.message);
        },
      });
      const expectedFacebookExternalId = options.expectedFacebookExternalId ?? account?.facebookExternalId;

      const graphqlResult = expectedFacebookExternalId
        ? await collectFacebookGroupsFromGraphql(
          tab.id,
          expectedFacebookExternalId,
          onMessage,
          { activateTab: false },
        )
        : null;
      if (graphqlResult) {
        const scanResult = await collectFacebookGroupsWithGraphqlCrossCheck(
          tab.id,
          graphqlResult,
          account,
          onMessage,
        );
        closeAfterScan = scanResult.scanComplete;
        if (!closeAfterScan) {
          onMessage?.('Quét chưa xác nhận đủ danh sách; tab Facebook được giữ lại để tiếp tục kiểm tra.');
        }
        return scanResult;
      }

      const scanResult = await collectFacebookGroupsFromDomPage(tab.id, account, onMessage);
      closeAfterScan = scanResult.scanComplete;
      return scanResult;
    } finally {
      if (closeAfterScan) {
        await closeTabSafely(tab.id);
        if (facebookGroupScanTabIdRef.current === tab.id) {
          facebookGroupScanTabIdRef.current = null;
        }
      }
    }
  }

  function closeFacebookGroupSettings() {
    setIsFacebookSettingsOpen(false);
    setFacebookGroupModalMode('SETTINGS');
    setFacebookGroupPage(1);
    setFacebookSettingsGroupSearchInput('');
    setFacebookSettingsGroupSearchQuery('');
    setSelectedFacebookGroup(null);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsState('IDLE');
    setFacebookSettingsMessage(null);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setEditFacebookGroupName('');
    setEditFacebookGroupUrl('');
  }

  function openFacebookGroupCreateModal() {
    setIsFacebookGroupFormOpen(true);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setFacebookSettingsMessage(null);
    setFacebookSettingsState('READY');
  }

  function closeFacebookGroupCreateModal() {
    if (facebookSettingsState === 'SAVING') return;

    setIsFacebookGroupFormOpen(false);
    setFacebookGroupName('');
    setFacebookGroupNameError(null);
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setFacebookSettingsMessage(validFacebookGroups.length > 0 ? null : 'Chưa có nhóm Facebook nào.');
    setFacebookSettingsState('READY');
  }

  function openFacebookPostHistory(group: FacebookHistoryGroup) {
    setSelectedFacebookHistoryGroup(group);
    setFacebookHistoryFilter('ALL');
    setFacebookHistoryPage(1);
    setFacebookHistoryData(null);
    setFacebookHistoryLoadState('IDLE');
    setFacebookHistoryMessage(null);
    void loadFacebookPostHistory(group, 'ALL', 1);
  }

  function closeFacebookPostHistory() {
    setSelectedFacebookHistoryGroup(null);
    setFacebookHistoryFilter('ALL');
    setFacebookHistoryPage(1);
    setFacebookHistoryData(null);
    setFacebookHistoryLoadState('IDLE');
    setFacebookHistoryMessage(null);
    setIsRefreshingFacebookHistoryGroup(false);
  }

  async function loadFacebookPostHistory(
    group = selectedFacebookHistoryGroup,
    filter = facebookHistoryFilter,
    page = facebookHistoryPage,
  ) {
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
      setState('AUTH_REQUIRED');
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
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        setFacebookHistoryLoadState('ERROR');
        setFacebookHistoryMessage('Authentication expired. Sign in again before viewing Facebook history.');
        return;
      }

      setFacebookHistoryLoadState('ERROR');
      setFacebookHistoryMessage(toErrorMessage(err));
    }
  }

  async function changeFacebookHistoryFilter(filter: FacebookPostHistoryFilter) {
    setFacebookHistoryFilter(filter);
    setFacebookHistoryPage(1);
    await loadFacebookPostHistory(selectedFacebookHistoryGroup, filter, 1);
  }

  async function changeFacebookHistoryPage(page: number) {
    const pageCount = Math.max(1, facebookHistoryData?.totalPages ?? 1);
    const nextPage = Math.min(pageCount, Math.max(1, page));
    setFacebookHistoryPage(nextPage);
    await loadFacebookPostHistory(selectedFacebookHistoryGroup, facebookHistoryFilter, nextPage);
  }

  async function refreshFacebookHistoryGroupStatuses() {
    const group = selectedFacebookHistoryGroup;
    const accessToken = tokenRef.current;
    if (!group?.id) {
      setFacebookHistoryMessage('Không thể refresh vì nhóm Facebook chưa có mã định danh.');
      return;
    }

    if (!accessToken) {
      setState('AUTH_REQUIRED');
      setFacebookHistoryMessage('Sign in to VCS Recruitment before refreshing Facebook post status.');
      return;
    }

    setIsRefreshingFacebookHistoryGroup(true);
    setFacebookHistoryMessage('Đang lấy danh sách bài cần kiểm tra lại.');

    try {
      const itemsToRefresh = await loadRefreshableFacebookHistoryItems(accessToken, group);
      if (itemsToRefresh.length === 0) {
        const unresolvedCount = (facebookHistoryData?.summary.pendingReview ?? 0) + (facebookHistoryData?.summary.unknown ?? 0);
        setFacebookHistoryMessage(unresolvedCount > 0
          ? 'Có bài chờ duyệt/chưa rõ trạng thái nhưng thiếu cả URL bài viết và URL group hợp lệ để kiểm tra lại.'
          : 'Không có bài chờ duyệt/chưa rõ trạng thái cần kiểm tra lại.');
        return;
      }

      const refreshSummary = await refreshFacebookHistoryItems(
        accessToken,
        itemsToRefresh,
        (message) => setFacebookHistoryMessage(message),
        (item, status) => syncFacebookImageStatusFromHistoryItem(item, status),
      );
      if (refreshSummary.authExpired) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        setFacebookHistoryMessage('Authentication expired. Sign in again before refreshing Facebook history.');
        return;
      }

      await loadFacebookPostHistory(group, facebookHistoryFilter, facebookHistoryPage);
      const issueSuffix = refreshSummary.issueCount
        ? `, ${refreshSummary.issueCount} lỗi`
        : '';
      setFacebookHistoryMessage(
        `Đã kiểm tra ${itemsToRefresh.length} bài. ${refreshSummary.postedCount} đã đăng, ${refreshSummary.rejectedCount} bị từ chối, ${refreshSummary.deletedCount} đã xóa, ${refreshSummary.unresolvedCount} chưa xác định/chờ duyệt${issueSuffix}.`,
      );
    } catch (err) {
      setFacebookHistoryMessage(toErrorMessage(err));
    } finally {
      setIsRefreshingFacebookHistoryGroup(false);
    }
  }

  async function loadRefreshableFacebookHistoryItems(accessToken: string, group: FacebookHistoryGroup) {
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
  }

  function closeFacebookGroupActionModal() {
    setFacebookGroupModalMode('SETTINGS');
    setSelectedFacebookGroup(null);
    setEditFacebookGroupName('');
    setEditFacebookGroupUrl('');
    setFacebookSettingsState('READY');
    setFacebookSettingsMessage(null);
  }

  function changeFacebookGroupPage(page: number) {
    setFacebookGroupPage(Math.min(facebookGroupPageCount, Math.max(1, page)));
  }

  function openEditFacebookGroup(group: FacebookPublishTarget) {
    if (!group.targetId) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Không thể chỉnh sửa nhóm chưa có mã định danh.');
      return;
    }

    setSelectedFacebookGroup(group);
    setEditFacebookGroupName(group.targetName);
    setEditFacebookGroupUrl(group.targetUrl ?? '');
    setFacebookSettingsMessage(null);
    setFacebookSettingsState('READY');
    setFacebookGroupModalMode('EDIT');
  }

  function openDeleteFacebookGroup(group: FacebookPublishTarget) {
    if (!group.targetId) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Không thể xóa nhóm chưa có mã định danh.');
      return;
    }

    setSelectedFacebookGroup(group);
    setFacebookSettingsMessage(null);
    setFacebookSettingsState('READY');
    setFacebookGroupModalMode('DELETE');
  }

  async function refreshFacebookGroupsForSettings(accessToken = token) {
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
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
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
  }

  function checkFacebookGroupEligibility(group: FacebookPublishTarget) {
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
  }

  async function processFacebookGroupVerificationQueue() {
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
          setState('AUTH_REQUIRED');
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
            setToken(null);
            setUser(null);
            setState('AUTH_REQUIRED');
            setFacebookSettingsState('ERROR');
            setFacebookSettingsMessage('Authentication expired. Sign in again before checking Facebook groups.');
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
  }

  async function submitFacebookGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const targetName = facebookGroupName.trim();
    const targetUrl = facebookGroupUrl.trim();
    const nameError = targetName ? null : 'Tên nhóm là bắt buộc, không được để trống.';
    const targetUrlError = getFacebookGroupUrlValidationError(targetUrl, facebookGroups);
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
      await createFacebookGroup(token, {
        targetName,
        targetUrl,
        facebookAccountId: facebookAccount?.id,
      });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      setFacebookGroupPage(1);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
      setFacebookGroupName('');
      setFacebookGroupNameError(null);
      setFacebookGroupUrl('');
      setFacebookGroupUrlError(null);
      setIsFacebookGroupFormOpen(false);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      showExtensionToast('SUCCESS', 'Thành công', 'Đã thêm nhóm thành công');

      if (selectedPostingChannels.includes('FACEBOOK')) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(buildFacebookGroupSelectionMessage(nextSelectedIds, groups));
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
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
  }

  async function submitFacebookGroupEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedFacebookGroup?.targetId) return;

    const targetName = editFacebookGroupName.trim();
    const targetUrl = editFacebookGroupUrl.trim();
    if (!targetName) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Tên nhóm là bắt buộc.');
      return;
    }
    if (!isFacebookGroupUrlCandidate(targetUrl)) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Nhập sai định dạng URL nhóm Facebook. Vui lòng thử lại');
      return;
    }

    setFacebookSettingsState('SAVING');
    setFacebookSettingsMessage(null);

    try {
      const savedGroup = await updateFacebookGroup(token, selectedFacebookGroup.targetId, {
        targetName,
        targetUrl,
        facebookAccountId: facebookAccount?.id,
      });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      setFacebookGroupPage(1);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
      setSelectedFacebookGroup(null);
      setEditFacebookGroupName('');
      setEditFacebookGroupUrl('');
      setFacebookGroupModalMode('SETTINGS');
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(`Saved "${savedGroup.targetName}". Click Check before using it for publishing.`);

      if (selectedPostingChannels.includes('FACEBOOK')) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(buildFacebookGroupSelectionMessage(nextSelectedIds, groups));
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }
      if (isDuplicateFacebookGroupError(err)) {
        setFacebookSettingsState('ERROR');
        setFacebookSettingsMessage('Nhóm Facebook đã tồn tại.');
        return;
      }
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage(toErrorMessage(err));
    }
  }

  async function confirmDeleteFacebookGroup() {
    if (!token || !selectedFacebookGroup?.targetId) return;

    setFacebookSettingsState('SAVING');
    setFacebookSettingsMessage(null);

    try {
      await deleteFacebookGroup(token, selectedFacebookGroup.targetId, facebookAccount?.id);
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      setFacebookGroupPage(1);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups, selectedFacebookGroupIds.filter((targetId) => (
        targetId !== selectedFacebookGroup.targetId
      )));
      setSelectedFacebookGroup(null);
      setFacebookGroupModalMode('SETTINGS');
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      showExtensionToast('SUCCESS', 'Thành công', 'Đã xóa nhóm thành công');

      if (selectedPostingChannels.includes('FACEBOOK')) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(
          groups.length > 0
            ? buildFacebookGroupSelectionMessage(nextSelectedIds, groups)
            : 'Đã quét được 0 nhóm',
        );
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      }
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage(toErrorMessage(err));
    }
  }

  function buildAmisJobPostingPayload(options: {
    includeFacebookContent?: boolean;
    facebookContentOverride?: string | null;
    snapshotOverride?: AmisJobSnapshot;
    selectedJobDescriptionOverride?: JobDescriptionSummary | null;
    forceFacebookChannel?: boolean;
  } = {}) {
    const rawSnapshot = options.snapshotOverride ?? snapshot;
    if (!rawSnapshot || !amisRecruitmentId) return null;
    const sourceSnapshot = sanitizeAmisJobSnapshotForApi(rawSnapshot);

    const channelsForPayload = options.forceFacebookChannel && !selectedPostingChannels.includes('FACEBOOK')
      ? normalizePostingChannels([...selectedPostingChannels, 'FACEBOOK'])
      : selectedPostingChannels;
    const facebookTargetIds = channelsForPayload.includes('FACEBOOK') ? selectedFacebookGroupIds : [];
    const includeFacebookContent = options.includeFacebookContent ?? true;
    const trimmedFacebookContent = (
      options.facebookContentOverride ?? getEffectiveFacebookContent()
    ).trim();
    const jobDescriptionForMetadata = options.selectedJobDescriptionOverride ?? selectedJobDescription;
    const selectedJobDescriptionId = jobDescriptionForMetadata?.id;

    return {
      sourceSystem: 'AMIS',
      amisRecruitmentId,
      amisUrl,
      ...(selectedJobDescriptionId ? { jobDescriptionId: selectedJobDescriptionId } : {}),
      action: 'PUBLISH',
      snapshot: sourceSnapshot,
      channels: channelsForPayload,
      ...(channelsForPayload.includes('FACEBOOK') && facebookTargetIds.length > 0 ? { facebookTargetIds } : {}),
      ...(channelsForPayload.includes('FACEBOOK') && facebookAccount?.id
        ? { facebookAccountId: facebookAccount.id }
        : {}),
      ...(channelsForPayload.includes('FACEBOOK') && includeFacebookContent && trimmedFacebookContent
        ? { facebookContent: trimmedFacebookContent }
        : {}),
      ...(selectedJobQuestionIds.size > 0
        ? { selectedQuestionIds: Array.from(selectedJobQuestionIds) }
        : {}),
      metadata: {
        capturedAt: new Date().toISOString(),
        captureSource: extractionResult?.source ?? 'MOCK',
        captureConfidence: extractionResult?.confidence,
        extractionWarnings: extractionResult?.warnings,
        extractionEvidence: extractionResult?.evidence,
        selectedJobDescriptionId,
        selectedQuestionSetId: jobDescriptionQuestionContext?.questionSet?.id,
        selectedQuestionCount: selectedJobQuestionIds.size,
      },
    } satisfies SyncAmisJobPostingRequest;
  }

  async function resolveFacebookContentBeforeAmisSync(shouldPublishFacebook: boolean) {
    if (!shouldPublishFacebook) return '';
    const effectiveContent = getEffectiveFacebookContent();
    if (effectiveContent) return effectiveContent;

    const generatedContent = await generateFacebookPostContent({ forceFacebookChannel: true });
    if (generatedContent) return generatedContent.trim();

    setError('Facebook post content is required before publishing.');
    setState('ERROR');
    return null;
  }

  async function applyAmisSyncResponse(
    response: Awaited<ReturnType<typeof syncAndPublishAmisJob>>,
    shouldPublishFacebook: boolean,
    facebookContentForPublish: string,
  ) {
    setResult(response);
    const { confirmedFacebookContent } = await resolveAmisSyncFacebookPublishPlan(
      response,
      shouldPublishFacebook,
      facebookContentForPublish,
      startFacebookPublish,
    );
    if (confirmedFacebookContent && shouldPublishFacebook) {
      facebookContentRef.current = confirmedFacebookContent;
      if (snapshot) {
        facebookContentSnapshotKeyRef.current = getFacebookContentSnapshotKey(amisRecruitmentId, snapshot);
        facebookContentSnapshotFingerprintRef.current = buildFacebookDraftSnapshotFingerprint(snapshot);
        facebookContentJobIdentityRef.current = buildFacebookJobIdentity(snapshot);
      }
      setFacebookContent(confirmedFacebookContent);
      setFacebookContentState('READY');
      setFacebookContentMessage('Đã cập nhật nội dung Facebook theo kế hoạch đăng thật.');
    }
    if (response.facebookPublishPlan && shouldPublishFacebook) return;
    setState('SUCCESS');
  }

  async function handleAmisSyncError(error: unknown) {
    if (error instanceof ApiClientError && error.status === 401) {
      await clearAccessToken();
      setToken(null);
      setUser(null);
      setState('AUTH_REQUIRED');
      return;
    }

    setError(toErrorMessage(error));
    setState('ERROR');
  }

  async function sync() {
    const shouldPublishFacebook = selectedPostingChannels.includes('FACEBOOK');
    const preconditionError = getAmisSyncPreconditionResult({
      hasToken: Boolean(token),
      hasSnapshot: Boolean(snapshot),
      hasRecruitmentId: Boolean(amisRecruitmentId),
      missingFieldCount: missingFields.length,
      isFacebookImageReading,
      hasFacebookImageAttachmentError,
      shouldPublishFacebook,
      facebookTargetCount: selectedFacebookGroupIds.length,
    });
    if (preconditionError === 'SKIP') return;
    if (preconditionError) {
      setError(preconditionError);
      setState('ERROR');
      return;
    }

    const accessToken = token;
    if (!accessToken || !snapshot || !amisRecruitmentId) return;

    const facebookContentForPublish = await resolveFacebookContentBeforeAmisSync(shouldPublishFacebook);
    if (facebookContentForPublish === null) return;

    const payload = buildAmisJobPostingPayload({
      facebookContentOverride: facebookContentForPublish || null,
    });
    if (!payload) return;

    setState('SYNCING');
    setError(null);

    try {
      const response = await syncAndPublishAmisJob(accessToken, payload);
      await applyAmisSyncResponse(response, shouldPublishFacebook, facebookContentForPublish);
    } catch (error) {
      await handleAmisSyncError(error);
    }
  }

  async function startFacebookPublish(plan: FacebookPublishPlan, contentOverride?: string | null) {
    if (!token) return null;
    setFacebookPublishResultsVisible(true);
    const trimmedContentOverride = contentOverride?.trim();
    const contentResolvedPlan = trimmedContentOverride
      ? { ...plan, content: hydrateFacebookContentOverride(trimmedContentOverride, plan.content) }
      : await resolveFacebookPublishPlanContent(plan);
    let publishAttachments = facebookImageAttachments;
    if (publishAttachments.length === 0) {
      try {
        publishAttachments = await getFacebookImageAttachments(getFacebookImageAttachmentScope());
      } catch {
        // A missing local image store must not block text-only publishing.
      }
    }
    const planForPublish: FacebookPublishPlan = publishAttachments.length > 0
      ? { ...contentResolvedPlan, attachments: publishAttachments }
      : contentResolvedPlan;
    const planKey = getFacebookPlanKey(planForPublish);
    if (startedFacebookPlanKeys.current.has(planKey)) {
      // The plan was already completed; keep repeated AMIS syncs from leaving the button stuck in SYNCING.
      setState('SUCCESS');
      setError(null);
      return planForPublish;
    }

    if (planForPublish.targets.length === 0) {
      const progress: FacebookPublishProgress = {
        status: 'ERROR',
        currentIndex: 0,
        total: 0,
        message: 'No active Facebook publish targets are configured.',
        results: [],
      };
      setFacebookProgress(progress);
      await saveLastFacebookPublishProgress(progress);
      setState('ERROR');
      return planForPublish;
    }

    if (planForPublish.attachments?.length) {
      const imageScope = getFacebookImageAttachmentScope();
      await saveFacebookImageAttachments(imageScope, planForPublish.attachments);
      await beginFacebookImagePublish(
        imageScope,
        planForPublish.jobPostingId,
        planForPublish.targets,
      );
    }

    startedFacebookPlanKeys.current.add(planKey);
    setFacebookRunning(true);
    setState('SYNCING');
    setError(null);
    let latestProgress: FacebookPublishProgress | null = facebookProgress;

    try {
      const facebookResults = await publishFacebookPlan(token, planForPublish, {
        onProgress: (progress) => {
          latestProgress = progress;
          setFacebookProgress(progress);
          void saveLastFacebookPublishProgress(progress);
        },
        onImageAttachFailed: requestFacebookImageAttachDecision,
      });
      if (planForPublish.attachments?.length) {
        try {
          const released = await syncFacebookImagePublishStatuses(facebookResults.map((publishResult) => {
            const target = planForPublish.targets.find((candidate) => (
              candidate.targetId === publishResult.targetId
              || candidate.targetUrl === publishResult.targetUrl
              || candidate.targetName === publishResult.targetName
            ));
            return {
              jobPostingId: planForPublish.jobPostingId,
              targetId: publishResult.targetId,
              targetExternalId: target?.targetExternalId ?? null,
              targetName: publishResult.targetName,
              targetUrl: publishResult.targetUrl ?? target?.targetUrl ?? null,
              facebookReviewStatus: publishResult.facebookReviewStatus ?? 'UNKNOWN',
            };
          }));
          await clearFacebookImageViewIfReleased(released);
        } catch {
          // Facebook's result is authoritative; a local lifecycle-store failure must not turn a real publish into a false error.
        }
      }
      const summary = summarizeFacebookPublishResults(facebookResults);
      setResult((current) => current ? updateFacebookChannelStatus(current, facebookResults) : current);
      if (summary.successCount > 0) {
        const previousDraftScope = facebookContentDraftScopeRef.current;
        const draftScope = await getFacebookContentDraftScope();
        await clearStoredFacebookContentDraft({
          recruitmentId: amisRecruitmentId,
          tabId: draftScope.tabId ?? previousDraftScope.tabId,
          jobDescriptionId: draftScope.jobDescriptionId ?? previousDraftScope.jobDescriptionId,
          snapshot,
        });
        setState('SUCCESS');
        setError(null);
      } else {
        setError(summary.message);
        setState('ERROR');
      }
    } catch (err) {
      setError(toErrorMessage(err));
      const progress: FacebookPublishProgress = {
        status: 'ERROR',
        currentIndex: latestProgress?.currentIndex ?? 0,
        total: latestProgress?.total ?? planForPublish.targets.length,
        target: latestProgress?.target,
        message: toErrorMessage(err),
        results: latestProgress?.results ?? [],
      };
      setFacebookProgress(progress);
      await saveLastFacebookPublishProgress(progress);
      setState('ERROR');
      startedFacebookPlanKeys.current.delete(planKey);
    } finally {
      setFacebookRunning(false);
    }

    return planForPublish;
  }

  async function resolveFacebookPublishPlanContent(plan: FacebookPublishPlan): Promise<FacebookPublishPlan> {
    const currentFacebookContent = getEffectiveFacebookContent();
    if (currentFacebookContent) {
      return {
        ...plan,
        content: currentFacebookContent,
      };
    }

    if (snapshot) {
      const draftScope = await getFacebookContentDraftScope();
      const draft = await getFacebookContentDraft({
        recruitmentId: amisRecruitmentId,
        tabId: draftScope.tabId,
        jobDescriptionId: draftScope.jobDescriptionId,
        snapshot,
      });
      if (draft?.content.trim()) {
        return {
          ...plan,
          content: draft.content.trim(),
        };
      }
    }

    return plan;
  }

  function selectWorkspaceTab(tab: WorkspaceTab) {
    if (tab !== activeWorkspaceTab && (tab === 'cv' || activeWorkspaceTab === 'cv')) {
      setCvQuestionFilter('ALL');
      setCvSyncFilter('ALL');
      setCvEvaluationFilter('ALL');
      setCvSourceFilter('ALL');
      setCvSortMode('APPLIED_DESC');
      setOpenCvFilter(null);
      setCvApplicationPage(1);
      setSelectedCvApplicationIds(new Set());
    }
    setActiveWorkspaceTab(tab);
  }

  function toggleWorkspacePin(tab: WorkspaceTab) {
    setPinnedWorkspaceTab((current) => (current === tab ? null : tab));
  }

  function getWorkspaceTabLabel(tab: WorkspaceTab) {
    return WORKSPACE_TABS.find((item) => item.id === tab)?.label ?? tab;
  }

  function renderWorkspaceTabContent(tab: WorkspaceTab) {
    if (tab === 'overview') return renderOverviewPanel();
    if (tab === 'posting') return renderPostingPanel();
    if (tab === 'cv') return renderCvPanel();
    if (tab === 'freelancer' && token) {
      return (
        <ReferralManagementPanel
          source="FREELANCER"
          accessToken={token}
          refreshVersion={referralRefreshVersion}
          onNotify={showExtensionToast}
          loadRecruitmentRounds={loadReferralRecruitmentRounds}
        />
      );
    }
    if (tab === 'internal' && token) {
      return <ReferralManagementPanel source="INTERNAL" accessToken={token} refreshVersion={referralRefreshVersion} onNotify={showExtensionToast} />;
    }
    return null;
  }

  function renderWorkspacePanel(tab: WorkspaceTab) {
    const isPinned = pinnedWorkspaceTab === tab;
    const isFlatTab = tab !== 'overview';
    return (
      <section key={tab} className={`workspace-panel workspace-panel-${tab}${isPinned ? ' is-pinned' : ''}${isFlatTab ? ' is-flat' : ''}`}>
        {!isFlatTab ? (
          <div className="workspace-panel-heading">
            <div>
              <p className="workspace-panel-kicker">VCS Recruitment</p>
              <h2>{tab === 'overview' ? 'VCS Recruitment Posting' : getWorkspaceTabLabel(tab)}</h2>
            </div>
            <button
              type="button"
              className={`panel-pin-button${isPinned ? ' is-active' : ''}`}
              title={isPinned ? 'Bỏ ghim màn này' : 'Ghim màn này'}
              aria-label={isPinned ? 'Bỏ ghim màn này' : 'Ghim màn này'}
              aria-pressed={isPinned}
              onClick={() => toggleWorkspacePin(tab)}
            >
              <PinIcon filled={isPinned} />
            </button>
          </div>
        ) : null}
        {renderWorkspaceTabContent(tab)}

      </section>
    );
  }

  function renderFacebookImageAttachPromptModal() {
    if (!facebookImageAttachPrompt) return null;

    return (
      <div className="modal-backdrop">
        <dialog
          open
          className="facebook-group-modal facebook-image-decision-modal"
          aria-modal="true"
          aria-labelledby="facebook-image-attach-title"
        >
          <div className="modal-header">
            <div>
              <h2 id="facebook-image-attach-title">Không attach được ảnh</h2>
              <p>{facebookImageAttachPrompt.target.targetName}</p>
            </div>
          </div>
          <div className="modal-body">
            <div className="facebook-image-preview is-modal">
              <img src={facebookImageAttachPrompt.attachment.dataUrl} alt="" />
              <div>
                <strong>{facebookImageAttachPrompt.attachment.fileName}</strong>
                <span>{formatFileSize(facebookImageAttachPrompt.attachment.size)}</span>
              </div>
            </div>
            <p className="modal-status is-error">{facebookImageAttachPrompt.message}</p>
            <div className="form-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => resolveFacebookImageAttachPrompt('SKIP')}
              >
                Không đăng bài này
              </button>
              <button
                type="button"
                className="primary-button compact-button"
                onClick={() => resolveFacebookImageAttachPrompt('POST_TEXT_ONLY')}
              >
                Vẫn đăng text-only
              </button>
            </div>
          </div>
        </dialog>
      </div>
    );
  }

  function renderFacebookGroupCreateModal() {
    const isSaving = facebookSettingsState === 'SAVING';

    return (
      <FacebookGroupFormModal
        mode="create"
        title="Thêm nhóm Facebook mới"
        name={facebookGroupName}
        url={facebookGroupUrl}
        nameError={facebookGroupNameError}
        urlError={facebookGroupUrlFieldError}
        message={facebookSettingsMessage}
        messageIsError={facebookSettingsState === 'ERROR'}
        isSaving={isSaving}
        onNameChange={(event) => {
          setFacebookGroupName(event.target.value);
          setFacebookGroupNameError(null);
        }}
        onUrlChange={(event) => {
          setFacebookGroupUrl(event.target.value);
          setFacebookGroupUrlError(null);
        }}
        onUrlBlur={(event) => {
          setFacebookGroupUrlError(getFacebookGroupUrlValidationError(event.target.value, facebookGroups));
        }}
        onClearName={() => {
          setFacebookGroupName('');
          setFacebookGroupNameError(null);
        }}
        onClearUrl={() => {
          setFacebookGroupUrl('');
          setFacebookGroupUrlError(null);
        }}
        onSubmit={(event) => void submitFacebookGroup(event)}
        onCancel={closeFacebookGroupCreateModal}
        onClose={closeFacebookGroupCreateModal}
      />

    );
  }

  function renderFacebookPostHistoryRows(
    pageItems: FacebookPublishHistoryListItem[],
    isHistoryBusy: boolean,
    isLoadingHistory: boolean,
    historyLoadState: FacebookPostHistoryLoadState,
    historyMessage: string | null,
  ) {
    if (pageItems.length > 0) {
      return pageItems.map((item) => {
        const postUrl = getValidFacebookGroupPostUrl(item.externalPostUrl);
        return (
          <tr key={item.id}>
            <td>{formatDate(item.submittedAt ?? item.createdAt ?? undefined) ?? '-'}</td>
            <td>
              <span>{item.title}</span>
            </td>
            <td>
              <span className={`post-history-status is-${item.facebookReviewStatus.toLowerCase().replace('_', '-')}`}>
                {getFacebookHistoryStatusLabel(item.facebookReviewStatus)}
              </span>
            </td>
            <td>
              <div className="post-history-actions">
                {postUrl ? (
                  <button
                    type="button"
                    className="post-history-action-button is-post-link"
                    title="Mở bài viết Facebook"
                    aria-label={`Mở bài viết ${item.title}`}
                    disabled={isHistoryBusy}
                    onClick={() => window.open(postUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLinkIcon />
                  </button>
                ) : <span className="post-history-no-action">-</span>}
              </div>
            </td>
          </tr>
        );
      });
    }

    if (isLoadingHistory) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="post-history-empty">
              <strong>Đang tải lịch sử</strong>
              <span>Đang lấy dữ liệu bài đăng Facebook từ backend.</span>
            </div>
          </td>
        </tr>
      );
    }

    const isHistoryError = historyLoadState === 'ERROR';
    const emptyTitle = isHistoryError ? 'Không tải được lịch sử' : 'Chưa có dữ liệu lịch sử';
    const emptyMessage = isHistoryError
      ? (historyMessage ?? 'Vui lòng thử lại sau.')
      : 'Các bài đã auto đăng vào group này sẽ hiển thị tại đây.';
    return (
      <tr>
        <td colSpan={4}>
          <div className="post-history-empty">
            <strong>{emptyTitle}</strong>
            <span>{emptyMessage}</span>
          </div>
        </td>
      </tr>
    );
  }

  function renderFacebookPostHistoryPagination(
    paginationItems: PostHistoryPaginationItem[],
    currentPage: number,
    pageCount: number,
    isHistoryBusy: boolean,
  ) {
    return (
      <div>
        <button
          type="button"
          title="Trang đầu"
          aria-label="Trang đầu"
          disabled={currentPage <= 1 || isHistoryBusy}
          onClick={() => void changeFacebookHistoryPage(1)}
        >
          <DoubleBackIcon />
        </button>
        <button
          type="button"
          title="Trang trước"
          aria-label="Trang trước"
          disabled={currentPage <= 1 || isHistoryBusy}
          onClick={() => void changeFacebookHistoryPage(currentPage - 1)}
        >
          <BackIcon />
        </button>
        {paginationItems.map((item) => (
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              className={item === currentPage ? 'is-active' : ''}
              aria-current={item === currentPage ? 'page' : undefined}
              disabled={isHistoryBusy || item === currentPage}
              onClick={() => void changeFacebookHistoryPage(item)}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="post-history-page-ellipsis">...</span>
          )
        ))}
        <button
          type="button"
          title="Trang sau"
          aria-label="Trang sau"
          disabled={currentPage >= pageCount || isHistoryBusy}
          onClick={() => void changeFacebookHistoryPage(currentPage + 1)}
        >
          <ChevronRightIcon />
        </button>
        <button
          type="button"
          title="Trang cuối"
          aria-label="Trang cuối"
          disabled={currentPage >= pageCount || isHistoryBusy}
          onClick={() => void changeFacebookHistoryPage(pageCount)}
        >
          <DoubleChevronRightIcon />
        </button>
      </div>
    );
  }

  function renderFacebookPostHistoryModal() {
    if (!selectedFacebookHistoryGroup) return null;

    const summary = facebookHistoryData?.summary ?? {
      total: 0,
      posted: 0,
      pendingReview: 0,
      rejected: 0,
      deleted: 0,
      unknown: 0,
    };
    const pageItems = facebookHistoryData?.items ?? [];
    const pageCount = Math.max(1, facebookHistoryData?.totalPages ?? 1);
    const currentPage = Math.min(facebookHistoryPage, pageCount);
    const isLoadingHistory = facebookHistoryLoadState === 'LOADING';
    const isHistoryBusy = isLoadingHistory || isRefreshingFacebookHistoryGroup;
    const paginationItems = buildPostHistoryPaginationItems(currentPage, pageCount);
    const totalItems = facebookHistoryData?.total ?? 0;
    const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * FACEBOOK_HISTORY_PAGE_SIZE) + 1;
    const visibleEnd = totalItems === 0
      ? 0
      : Math.min(totalItems, visibleStart + pageItems.length - 1);

    return (
      <div className="modal-backdrop post-history-backdrop">
        <dialog
          open
          className="post-history-modal"
          aria-modal="true"
          aria-labelledby="facebook-post-history-title"
        >
          <header className="post-history-header">
            <div className="post-history-title">
              <HistoryIcon />
              <h2 id="facebook-post-history-title">Lịch sử đăng bài - {selectedFacebookHistoryGroup.name}</h2>
            </div>
            <div className="post-history-header-actions">
              <button
                type="button"
                className="icon-button post-history-close-button"
                title="Đóng"
                aria-label="Đóng lịch sử đăng bài"
                disabled={isRefreshingFacebookHistoryGroup}
                onClick={closeFacebookPostHistory}
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <div className="post-history-body">
            <div className="post-history-summary-grid">
              <article className="post-history-metric is-total">
                <span>Tổng số bài</span>
                <strong>{summary.total}</strong>
              </article>
              <article className="post-history-metric is-posted">
                <span>Đã đăng</span>
                <strong>{summary.posted}</strong>
              </article>
              <article className="post-history-metric is-pending">
                <span>Chờ duyệt</span>
                <strong>{summary.pendingReview}</strong>
              </article>
              <article className="post-history-metric is-rejected">
                <span>Bị từ chối</span>
                <strong>{summary.rejected}</strong>
              </article>
            </div>

            <div className="post-history-filter-row">
              <SelectFilter
                label="Trạng thái bài đăng"
                ariaLabel="Trạng thái bài đăng"
                value={facebookHistoryFilter}
                options={FACEBOOK_HISTORY_FILTERS}
                disabled={isHistoryBusy}
                onChange={(value) => void changeFacebookHistoryFilter(value as FacebookPostHistoryFilter)}
              />
              <div className="post-history-filter-controls">
                <button
                  type="button"
                  className={`post-history-refresh-all-button${isRefreshingFacebookHistoryGroup ? ' is-loading' : ''}`}
                  title="Refresh trạng thái các bài đang chờ duyệt hoặc chưa rõ"
                  disabled={isHistoryBusy}
                  onClick={() => void refreshFacebookHistoryGroupStatuses()}
                >
                  <RefreshIcon />
                  <span>{isRefreshingFacebookHistoryGroup ? 'Đang kiểm tra' : 'Tải lại'}</span>
                </button>
              </div>
            </div>

            {facebookHistoryMessage ? (
              <div className={`post-history-message ${facebookHistoryLoadState === 'ERROR' ? 'is-error' : ''}`}>
                {facebookHistoryMessage}
              </div>
            ) : null}

            <div className="post-history-table-card">
              <table>
                <colgroup>
                  <col className="post-history-date-column" />
                  <col className="post-history-title-column" />
                  <col className="post-history-status-column" />
                  <col className="post-history-action-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Tiêu đề bài đăng</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {renderFacebookPostHistoryRows(
                    pageItems,
                    isHistoryBusy,
                    isLoadingHistory,
                    facebookHistoryLoadState,
                    facebookHistoryMessage,
                  )}
                </tbody>
              </table>

              <div className="post-history-pagination">
                <span>
                  Hiển thị <strong>{visibleStart}</strong> đến <strong>{visibleEnd}</strong> trong <strong>{totalItems}</strong> kết quả
                </span>
                {renderFacebookPostHistoryPagination(
                  paginationItems,
                  currentPage,
                  pageCount,
                  isHistoryBusy,
                )}
              </div>


            </div>
          </div>

        </dialog>
      </div>
    );
  }

  function renderOverviewPanel() {
    const totalPostings = Math.max(
      jobDescriptionPagination?.total ?? 0,
      jobDescriptions.length,
      snapshot ? 1 : 0,
    );
    const totalPositions = Math.max(jobDescriptions.length, snapshot ? 1 : 0);
    const totalCvs = applicationsContext?.total ?? 0;
    const postingCards = [
      ...(snapshot ? [{
        key: 'snapshot',
        title: snapshot.title,
        company: snapshot.location ?? selectedJobDescription?.title ?? 'AMIS Recruitment',
        deadline: snapshot.deadline,
        statusLabel: 'Đang hoạt động',
        statusTone: 'active',
        badgeLabel: 'Đang tuyển',
        badgeTone: 'active',
        candidateCount: applicationsContext?.total ?? 0,
        examCount: 0,
        interviewCount: 0,
        offerCount: 0,
        hiredCount: 0,
      }] : []),
      ...jobDescriptions.slice(0, snapshot ? 2 : 3).map((jobDescription) => ({
        key: jobDescription.id,
        title: jobDescription.title,
        company: jobDescription.position?.name ?? jobDescription.level?.displayName ?? 'VCS Recruitment',
        deadline: jobDescription.updatedAt ?? jobDescription.createdAt,
        statusLabel: formatStatusText(jobDescription.status),
        statusTone: jobDescription.status.toUpperCase().includes('ACTIVE') ? 'active' : 'muted',
        badgeLabel: jobDescription.status.toUpperCase().includes('DRAFT') ? 'Nội bộ' : 'Đang tuyển',
        badgeTone: jobDescription.status.toUpperCase().includes('DRAFT') ? 'muted' : 'active',
        candidateCount: null,
        examCount: null,
        interviewCount: null,
        offerCount: null,
        hiredCount: null,
      })),
    ];

    return (
      <div className="overview-panel-content">
        <div className="overview-metric-grid">
          <article>
            <strong>{totalPostings}</strong>
            <span>Tổng bài đăng</span>
          </article>
          <article>
            <strong>{totalPositions}</strong>
            <span>Vị trí tuyển</span>
          </article>
          <article>
            <strong>{totalCvs}</strong>
            <span>Tổng số CV</span>
          </article>
        </div>

        <div className="posting-card-list">
          {postingCards.length > 0 ? postingCards.map((posting) => (
            <article key={posting.key} className="posting-card">
              <div className="posting-card-top">
                <label className="posting-select-box">
                  <input type="checkbox" aria-label={`Chọn ${posting.title}`} />
                  <span className={`posting-status-dot is-${posting.statusTone}`} />
                </label>
                <h3>{posting.title}</h3>
                <span className={`posting-badge is-${posting.badgeTone}`}>{posting.badgeLabel}</span>
                <button type="button" className="posting-more-button" aria-label="Thêm tùy chọn">
                  <MoreVerticalIcon />
                </button>
              </div>
              <p className={`posting-status-text is-${posting.statusTone}`}>{posting.statusLabel}</p>
              <p className="posting-company">{posting.company}</p>
              <p className="posting-deadline">
                SL cần tuyển: 1 | Hạn nộp hồ sơ: {posting.deadline ? formatDate(posting.deadline) : '-'}
              </p>
              <div className="posting-funnel-grid">
                <span><strong>{formatMetricValue(posting.candidateCount)}</strong>Ứng tuyển</span>
                <span><strong>{formatMetricValue(posting.examCount)}</strong>Thi tuyển</span>
                <span><strong>{formatMetricValue(posting.interviewCount)}</strong>Phỏng vấn</span>
                <span><strong>{formatMetricValue(posting.offerCount)}</strong>Offer</span>
                <span><strong>{formatMetricValue(posting.hiredCount)}</strong>Đã tuyển</span>
              </div>
              <button
                type="button"
                className="manage-posting-button"
                onClick={() => selectWorkspaceTab('posting')}
              >
                Quản lý
              </button>
            </article>
          )) : (
            <div className="empty-panel-state">
              <strong>Chưa có dữ liệu posting</strong>
              <span>Mở AMIS recruitment hoặc tải mock snapshot để xem dữ liệu.</span>
              <button type="button" className="manage-posting-button" onClick={loadMockSnapshot}>
                Load mock snapshot
              </button>
            </div>
          )}
        </div>

        <div className="overview-footer-actions">
          <button type="button" className="secondary-action-button" onClick={() => void loadLatestAmisCapture()}>
            <DownloadIcon />
            <span>Tải AMIS save</span>
          </button>
          <button type="button" className="secondary-action-button" onClick={() => void loadLatestAutoSyncState()}>
            <InfoExportIcon />
            <span>Tải auto sync</span>
          </button>
        </div>
      </div>
    );
  }

  function renderPostingPanel() {
    let syncButtonLabel = 'ĐỒNG BỘ VÀ ĐĂNG';
    if (facebookRunning) {
      syncButtonLabel = 'ĐANG ĐĂNG FACEBOOK...';
    } else if (state === 'SYNCING') {
      syncButtonLabel = 'ĐANG ĐỒNG BỘ...';
    } else if (isFacebookImageReading) {
      syncButtonLabel = 'ĐANG TẢI ẢNH...';
    }

    return (
      <div className="posting-detail-content">
        {renderJobDescriptionPanel()}
        {renderCareerQuestionPanel()}
        {renderChannelPanel()}

        <button
          type="button"
          className="primary-button sync-button"
          disabled={syncDisabled}
          onClick={sync}
        >
          {syncButtonLabel}
        </button>

        {facebookSelected && facebookPublishResultsVisible ? renderFacebookPublishResultsPanel() : null}

        {state === 'ERROR' && error ? <p className="error-text">{error}</p> : null}

        {!facebookSelected && result ? (
          <section className="result-panel publish-result-panel">
            <div>
              <h2>Kết quả</h2>
            </div>
            <ul className="result-list">
              {result.channelPostings.map((channel) => (
                <li key={channel.channel} className="result-item">
                  <span className="result-channel-name">{formatChannelLabel(channel.channel)}</span>
                  <span className="result-actions">
                    <strong className={`result-status ${getChannelPostingStatusClass(channel)}`}>
                      {channel.status}
                    </strong>
                    {channel.publishedUrl ? (
                      <a className="result-open-link" href={channel.publishedUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {renderRuntimePanels()}
      </div>
    );
  }

  function dismissExtensionToast() {
    if (extensionToastTimerRef.current !== null) {
      window.clearTimeout(extensionToastTimerRef.current);
      extensionToastTimerRef.current = null;
    }
    setExtensionToast(null);
  }

  function showExtensionToast(kind: ExtensionToastKind, title: string, message: string) {
    if (extensionToastTimerRef.current !== null) {
      window.clearTimeout(extensionToastTimerRef.current);
    }

    const id = extensionToastSequenceRef.current + 1;
    extensionToastSequenceRef.current = id;
    setExtensionToast({ id, kind, title, message });
    extensionToastTimerRef.current = window.setTimeout(() => {
      extensionToastTimerRef.current = null;
      setExtensionToast(null);
    }, 5000);
  }

  async function handleManuallyIncludeFacebookGroup(group: FacebookGroupSyncDetailItem) {
    if (!token || !facebookAccount || !group.url) {
      const message = 'Không thể thêm nhóm vì Facebook account hoặc URL group chưa có.';
      setFacebookGroupMessage(message);
      showExtensionToast('ERROR', 'Thất bại', message);
      return;
    }

    const groupKey = getFacebookGroupDetailKey(group);
    setManualIncludingFacebookGroupKeys((keys) => keys.includes(groupKey) ? keys : [...keys, groupKey]);
    try {
      const savedGroup = await manuallyIncludeFacebookGroup(token, {
        targetName: group.name,
        targetUrl: group.url,
        targetExternalId: group.externalId,
        facebookAccountId: facebookAccount.id,
      });
      const groups = replaceFacebookGroup(facebookGroupsRef.current, savedGroup);
      facebookGroupsRef.current = groups;
      setFacebookGroups(groups);
      await reconcileSelectedFacebookGroups(groups, selectedFacebookGroupIdsRef.current, facebookAccount.id);
      setFacebookGroupSyncDetails((current) => current ? {
        ...current,
        filtered: current.filtered.filter((item) => getFacebookGroupDetailKey(item) !== groupKey),
      } : current);
      if (facebookGroupSyncDetails?.filtered.length === 1) {
        setIsFacebookGroupSyncDetailsOpen(false);
      }
      showExtensionToast('SUCCESS', 'Thành công', 'Đã thêm nhóm thành công');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      }
      const message = toErrorMessage(err);
      setFacebookGroupMessage(message);
      showExtensionToast('ERROR', 'Thất bại', message);
    } finally {
      setManualIncludingFacebookGroupKeys((keys) => keys.filter((key) => key !== groupKey));
    }
  }

  function renderFacebookPublishResultsPanel() {
    const progressResults = facebookProgress?.results ?? [];
    const resultTargets = result?.facebookPublishPlan?.targets.map(toFacebookGroupUiItem) ?? [];
    const otherChannelPostings = result?.channelPostings.filter((channel) => channel.channel !== 'FACEBOOK') ?? [];
    const selectedTargets = visibleFacebookGroups.filter((group) => (
      Boolean(group.id) && selectedFacebookGroupIds.includes(group.id as string)
    ));
    const displayTargets = getFacebookPublishDisplayTargets(selectedTargets, resultTargets, progressResults);
    const progressByTarget = new Map(
      progressResults.map((item) => [item.targetId ?? item.targetName, item]),
    );
    const channelStatus = getFacebookPublishChannelStatus(facebookProgress);

    return (
      <section className="facebook-publish-results-panel" aria-label="Kết quả đăng Facebook">
        <div className="facebook-publish-results-heading">
          <h2>Kết quả</h2>
        </div>
        <div className="facebook-publish-results-channel">
          <span className="facebook-publish-results-channel-name">FACEBOOK</span>
          <span className="facebook-publish-results-channel-actions">
            <span className={`facebook-publish-results-state ${channelStatus.className}`}>{channelStatus.label}</span>
            <button
              type="button"
              className="facebook-publish-results-toggle"
              aria-expanded={isFacebookResultsExpanded}
              aria-label={isFacebookResultsExpanded ? 'Thu gọn kết quả Facebook' : 'Mở rộng kết quả Facebook'}
              title={isFacebookResultsExpanded ? 'Thu gọn kết quả' : 'Mở rộng kết quả'}
              onClick={() => setIsFacebookResultsExpanded((current) => !current)}
            >
              {isFacebookResultsExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
            </button>
          </span>
        </div>
        {isFacebookResultsExpanded ? (
          <div className="facebook-publish-results-list">
            {displayTargets.length > 0 ? displayTargets.map((group) => {
              const progress = progressByTarget.get(group.id ?? group.name);
              const resultState = getFacebookPublishResultDisplay(progress?.status, facebookProgress?.status);

              return (
                <div className="facebook-publish-result-row" key={group.key}>
                  <span className="facebook-publish-result-name" title={group.name}>{group.name}</span>
                  <span className={`facebook-publish-result-state ${resultState.className}`}>{resultState.label}</span>
                </div>
              );
            }) : (
              <p className="facebook-publish-results-empty">Chưa có nhóm Facebook được chọn.</p>
            )}

          </div>
        ) : null}
        {otherChannelPostings.map((channel) => renderPublishResultChannel(channel))}
      </section>
    );
  }

  function renderPublishResultChannel(channel: ChannelPostingResult) {
    const channelKey = channel.channel;
    const isExpanded = expandedPublishResultChannels[channelKey] ?? true;

    return (
      <div className="facebook-publish-result-channel-section" key={channelKey}>
        <div className="facebook-publish-results-channel">
          <span className="facebook-publish-results-channel-name">{formatChannelLabel(channel.channel)}</span>
          <span className="facebook-publish-results-channel-actions">
            <strong className={`result-status ${getChannelPostingStatusClass(channel)}`}>
              {channel.status}
            </strong>
            <button
              type="button"
              className="facebook-publish-results-toggle"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Thu gọn kênh ${formatChannelLabel(channel.channel)}` : `Mở rộng kênh ${formatChannelLabel(channel.channel)}`}
              title={isExpanded ? 'Thu gọn kênh' : 'Mở rộng kênh'}
              onClick={() => setExpandedPublishResultChannels((current) => ({
                ...current,
                [channelKey]: !isExpanded,
              }))}
            >
              {isExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
            </button>
          </span>
        </div>
        {isExpanded ? (
          <div className="facebook-publish-result-channel-detail">
            {channel.publishedUrl ? (
              <a href={channel.publishedUrl} target="_blank" rel="noreferrer">
                Open
              </a>
            ) : (
              <span>Chưa có liên kết bài đăng</span>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  function renderFacebookContentPanel() {
    if (!facebookSelected) return null;
    if (!selectedJobDescription) return null;

    const effectiveContent = getEffectiveFacebookContent();
    const canGenerate = Boolean(token && snapshot) && !facebookContentBusy;
    const previewTitle = snapshot?.title ?? selectedJobDescription?.title ?? 'Bài đăng tuyển dụng';
    const previewCopy = effectiveContent
      ? summarizeText(effectiveContent)
      : summarizeText(snapshot?.summary ?? snapshot?.description ?? selectedJobDescription?.summary ?? selectedJobDescription?.description);
    return (
      <div className="facebook-content-panel">
        <p className="channel-subselection-title facebook-preview-title">Xem trước bài đăng</p>
        <div className="facebook-preview-card">
          {facebookImageAttachments.length > 0 ? (
            <div className="facebook-preview-image-grid">
              {facebookImageAttachments.map((attachment, index) => (
                <img key={`${attachment.fileName}-${attachment.size}-${index}`} src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
              ))}
            </div>
          ) : (
            <span className="facebook-preview-thumb" aria-hidden="true">VCS</span>
          )}
          <div className="facebook-preview-copy">
            <strong title={previewTitle}>{previewTitle}</strong>
            <span>{previewCopy || 'Chưa có nội dung preview.'}</span>
          </div>
          <div className="facebook-content-meta is-preview">
            <span>{effectiveContent.length} ký tự</span>
          </div>
          <div className="facebook-preview-actions">
            <button
              type="button"
              className="secondary-button compact-button facebook-generate-button"
              disabled={!canGenerate}
              onClick={() => void generateFacebookPostContent({ mode: 'AI' })}
            >
              <FacebookGenerateIcon />
              {facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}
            </button>
            <button
              type="button"
              className="secondary-button compact-button facebook-full-button"
              disabled={facebookContentBusy || !facebookPreviewIdentity}
              onClick={() => void openFacebookPreviewModal()}
            >
              Xem bản đầy đủ
              <ExternalLinkIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFacebookPreviewModal() {
    if (!facebookPreviewModalMode) return null;

    const content = getEffectiveFacebookContent();
    const previewTitle = snapshot?.title ?? selectedJobDescription?.title ?? 'Bài đăng tuyển dụng';
    const previewImages = facebookImageAttachments;
    const canGenerate = Boolean(token && snapshot) && !facebookContentBusy;
    const imageCount = facebookImageAttachments.length;
    const previewIdentity = facebookPreviewIdentity ?? facebookAccount;
    const facebookPreviewDisplayName = previewIdentity?.displayName?.trim() || 'Facebook';
    const facebookPreviewInitial = facebookPreviewDisplayName.charAt(0).toUpperCase() || 'F';

    if (facebookPreviewModalMode === 'EDIT') {
      return (
        <div className="modal-backdrop facebook-preview-backdrop">
          <dialog
            open
            className="facebook-composer-modal"
            aria-modal="true"
            aria-labelledby="facebook-composer-title"
          >
            <header className="facebook-preview-modal-header">
              <h2 id="facebook-composer-title">Chỉnh sửa bài đăng Facebook</h2>
              <button
                type="button"
                className="icon-button"
                title="Đóng"
                aria-label="Đóng chỉnh sửa bài đăng Facebook"
                onClick={() => setFacebookPreviewModalMode('PREVIEW')}
              >
                <CloseIcon />
              </button>
            </header>
            <div className="facebook-composer-body">
              <div className="facebook-composer-content-heading">
                <div className="facebook-composer-section-title">
                  <MenuLinesIcon />
                  <strong>Nội dung bài viết</strong>
                </div>
                <button
                  type="button"
                  className="primary-button facebook-composer-generate-button"
                  disabled={!canGenerate}
                  onClick={() => void generateFacebookDraftContent()}
                >
                  <SparklesIcon />
                  <span>{facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}</span>
                </button>
              </div>
              <label className="facebook-composer-textarea-wrap">
                <span className="visually-hidden">Nội dung bài đăng Facebook</span>
                <textarea
                  className="facebook-content-textarea facebook-composer-textarea"
                  value={facebookContentDraft}
                  onChange={(event) => setFacebookContentDraft(event.target.value)}
                  placeholder="Sinh bài hoặc nhập nội dung Facebook tại đây."
                  rows={16}
                />
                <span>{facebookContentDraft.trim().length} ký tự</span>
              </label>

              <div className="facebook-composer-image-heading">
                <div className="facebook-composer-section-title">
                  <ImageFrameIcon />
                  <strong>Hình ảnh</strong>
                </div>
                <span>{imageCount}/{FACEBOOK_MAX_IMAGE_ATTACHMENTS} ảnh</span>
              </div>
              <div className="facebook-composer-image-library">
                <div className="facebook-composer-image-grid">
                  {facebookImageAttachments.map((attachment, index) => (
                    <article className="facebook-composer-image-card" key={`${attachment.fileName}-${attachment.size}-${index}`}>
                      <img src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                      <button
                        type="button"
                        className="facebook-composer-image-remove"
                        title="Xóa ảnh"
                        aria-label={`Xóa ảnh ${index + 1}`}
                        disabled={facebookImageUploadDisabled}
                        onClick={() => void clearFacebookImageAttachment(index)}
                      >
                        <svg
                          width="12"
                          height="14"
                          viewBox="0 0 12 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M2.25 13.5C1.8375 13.5 1.48438 13.3531 1.19062 13.0594C0.896875 12.7656 0.75 12.4125 0.75 12V2.25H0V0.75H3.75V0H8.25V0.75H12V2.25H11.25V12C11.25 12.4125 11.1031 12.7656 10.8094 13.0594C10.5156 13.3531 10.1625 13.5 9.75 13.5H2.25ZM9.75 2.25H2.25V12H9.75V2.25ZM3.75 10.5H5.25V3.75H3.75V10.5ZM6.75 10.5H8.25V3.75H6.75V10.5Z"
                            fill="#EF2424"
                          />
                        </svg>
                      </button>
                    </article>
                  ))}
                  <button
                    type="button"
                    className="facebook-composer-add-image-tile"
                    disabled={facebookImageAddDisabled}
                    onClick={openFacebookImageFilePicker}
                    aria-label="Tải lên ảnh bài đăng"
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
                {isFacebookImageReading ? (
                  <p className="channel-subselection-empty">Đang xử lý ảnh...</p>
                ) : null}
                {facebookImageAttachmentError ? (
                  <div className="facebook-image-error-row">
                    <p className="channel-subselection-empty is-error">{facebookImageAttachmentError}</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void clearFacebookImageAttachment()}
                    >
                      Bỏ ảnh
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="facebook-preview-modal-footer">
              <button
                type="button"
                className="secondary-button facebook-modal-cancel-button"
                onClick={() => setFacebookPreviewModalMode('PREVIEW')}
              >
                Hủy
              </button>
              <button
                type="button"
                className="primary-button facebook-modal-primary-button"
                onClick={() => void saveFacebookContentDraft()}
              >
                <CheckCircleIcon />
                <span>Lưu thay đổi</span>
              </button>
            </footer>
          </dialog>
        </div>
      );
    }

    return (
      <div className="modal-backdrop facebook-preview-backdrop">
        <dialog
          open
          className="facebook-preview-modal"
          aria-modal="true"
          aria-labelledby="facebook-preview-modal-title"
        >
          <header className="facebook-preview-modal-header">
            <h2 id="facebook-preview-modal-title">Xem trước bài đăng Facebook</h2>
            <button
              type="button"
              className="icon-button"
              title="Đóng"
              aria-label="Đóng xem trước bài đăng Facebook"
              onClick={() => setFacebookPreviewModalMode(null)}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="facebook-preview-modal-body">
            <article className="facebook-post-preview-frame">
              <header className="facebook-post-preview-header">
                {previewIdentity?.avatarUrl ? (
                  <img
                    className="facebook-post-avatar"
                    src={previewIdentity.avatarUrl}
                    alt={`${facebookPreviewDisplayName} avatar`}
                  />
                ) : (
                  <span className="facebook-post-avatar">{facebookPreviewInitial}</span>
                )}
                <div className="facebook-post-preview-details">
                  <div className="facebook-post-preview-name">{facebookPreviewDisplayName}</div>
                  <small>Vừa xong · Công khai</small>
                </div>
              </header>
              <div className="facebook-post-preview-content">{content || 'Chưa có nội dung bài đăng.'}</div>
              <div className="facebook-post-preview-image">
                {previewImages.length > 0 ? (
                  <div className="facebook-post-preview-image-grid">
                    {previewImages.map((attachment, index) => (
                      <img key={`${attachment.fileName}-${attachment.size}-${index}`} src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                    ))}
                  </div>
                ) : (
                  <div>
                    <strong title={previewTitle}>{previewTitle}</strong>
                    <span>VCS Recruitment</span>
                  </div>
                )}
              </div>
              {/* <footer className="facebook-post-preview-actions">
                <span>Thích</span>
                <span>Bình luận</span>
                <span>Chia sẻ</span>
              </footer> */}
            </article>
            {/* <p className="facebook-preview-note">
              Đây là bản xem trước cách bài đăng sẽ hiển thị trên bảng tin Facebook của ứng viên.
              Nội dung có thể được chỉnh sửa trước khi đồng bộ và đăng.
            </p> */}
          </div>
          <footer className="facebook-preview-modal-footer">
            {/* <button
              type="button"
              className="secondary-button facebook-modal-cancel-button"
              onClick={() => setFacebookPreviewModalMode(null)}
            >
              Đóng
            </button> */}
            <button
              type="button"
              className="primary-button facebook-modal-secondary-button"
              disabled={!canGenerate}
              onClick={() => void generateFacebookPostContent({ mode: 'AI' })}
            >
              <SparklesIcon />
              <span>{facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}</span>
            </button>
            <button
              type="button"
              className="primary-button facebook-modal-primary-button"
              onClick={() => void openFacebookEditModal()}
            >
              <EditIcon />
              <span>Chỉnh sửa</span>
            </button>
          </footer>
        </dialog>
      </div>
    );
  }

  function renderFacebookChannelSubselection(isSelected: boolean, isFacebookLoading: boolean, showFacebookGroups: boolean) {
    if (!showFacebookGroups) return null;

    return (
      <div
        className={`channel-subselection${isFacebookGroupListExpanded ? ' is-expanded' : ' is-collapsed'}`}
        aria-hidden={!isFacebookGroupListExpanded}
      >
        <div className="channel-subselection-content">
          <div className="channel-subselection-title">
            <div className="channel-subselection-heading">
              <span>Nhóm Facebook</span>
            </div>
            <button
              type="button"
              className="channel-subselection-reload-button"
              title="Tải lại danh sách nhóm Facebook"
              aria-label="Tải lại danh sách nhóm Facebook"
              aria-busy={isFacebookLoading}
              disabled={!token || isFacebookLoading}
              onClick={() => void handleSyncFacebookGroups()}
            >
              <span>{isFacebookLoading ? 'Đang tải lại...' : 'Tải lại'}</span>
            </button>
          </div>
          <div className="channel-subselection-list">
            {renderFacebookGroupSummary()}
            {renderFacebookGroupSearchField()}
            <div className="channel-subselection-items">
              {renderFacebookGroupItems()}
            </div>
          </div>
          {isSelected ? renderFacebookImageAttachments() : null}
          {isSelected ? renderFacebookContentPanel() : null}
        </div>
      </div>
    );
  }

  function renderFacebookGroupSummary() {
    if (facebookGroupLoadState !== 'READY' || visibleFacebookGroups.length === 0) return null;

    return (
      <div className="channel-subselection-summary-row">
        <p className="channel-subselection-summary">
          {visibleSelectedFacebookGroupCount}/{visibleFacebookGroups.length} nhóm Facebook đã được chọn
        </p>
        <button
          type="button"
          className="facebook-ineligible-trigger"
          aria-expanded={isFacebookGroupSyncDetailsOpen}
          onClick={() => {
            setFacebookIneligiblePage(1);
            setIsFacebookGroupSyncDetailsOpen(true);
          }}
        >
          <span>Xem nhóm không phù hợp</span>
        </button>
      </div>
    );
  }

  function renderFacebookGroupSearchField() {
    if (visibleFacebookGroups.length === 0) return null;

    return (
      <SearchField
        className="channel-subselection-search"
        inputRef={facebookGroupSearchInputRef}
        value={facebookGroupSearchInput}
        maxLength={255}
        placeholder="Tìm kiếm nhóm Facebook"
        ariaLabel="Tìm kiếm nhóm Facebook"
        onChange={setFacebookGroupSearchInput}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const trimmedSearch = facebookGroupSearchInput.trim();
          setFacebookGroupSearchInput(trimmedSearch);
          setFacebookGroupSearchQuery(trimmedSearch);
        }}
        clearButton={facebookGroupSearchInput.length > 0 ? (
          <button
            type="button"
            className="channel-subselection-search-clear"
            aria-label="Xóa tìm kiếm nhóm Facebook"
            title="Xóa tìm kiếm nhóm Facebook"
            onClick={() => {
              setFacebookGroupSearchInput('');
              setFacebookGroupSearchQuery('');
              facebookGroupSearchInputRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        ) : null}
      />
    );
  }

  function renderFacebookGroupItems() {
    return (
      <>
        {facebookGroupMessage
          && !facebookGroupSearchQuery
          && facebookGroupLoadState !== 'READY' ? (
          <p className={`channel-subselection-empty${facebookGroupLoadState === 'ERROR' ? ' is-error' : ''}`}>
            <span>{facebookGroupMessage}</span>
          </p>
        ) : null}
        {facebookGroupDiagnostic ? (
          <details className="channel-subselection-debug">
            <summary>Chi tiết lỗi GraphQL để báo</summary>
            <code>{facebookGroupDiagnostic}</code>
          </details>
        ) : null}
        {filteredFacebookGroups.length > 0 ? (
          filteredFacebookGroups.map((group, index) => {
            const checkboxId = `facebook-group-checkbox-${group.key}-${index}`;
            return (
            <div
              key={`${group.key}-${index}`}
              className={`channel-subselection-item${!group.selectable ? ' is-disabled' : ''}`}
              title={!group.selectable ? group.disabledReason ?? undefined : undefined}
            >
              <label className="channel-group-select" htmlFor={checkboxId}>
                <input
                  id={checkboxId}
                  aria-labelledby={`${checkboxId}-label`}
                  type="checkbox"
                  checked={Boolean(group.id && selectedFacebookGroupIds.includes(group.id))}
                  disabled={!group.id || !group.selectable}
                  onChange={() => toggleFacebookGroupSelection(group.id)}
                />
                <span className="channel-group-copy">
                  <span id={`${checkboxId}-label`}>{group.name}</span>
                  <span className="channel-group-meta">
                    {getFacebookEligibilityLabel(group.eligibilityStatus)}
                    {` - Hôm nay đã đăng ${group.quotaLabel ?? '0/10'} bài`}
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="channel-group-info-button"
                title="Lịch sử đăng bài"
                aria-label={`Lịch sử đăng bài ${group.name}`}
                onClick={() => openFacebookPostHistory({
                  id: group.id,
                  name: group.name,
                  url: group.url,
                })}
              >
                <HistoryIcon />
              </button>
            </div>
            );
          })
        ) : renderFacebookGroupListEmptyState()}
      </>
    );
  }

  function renderFacebookImageAttachments() {
    return (
      <>
        <input
          ref={facebookImageInputRef}
          type="file"
          accept={FACEBOOK_IMAGE_ACCEPT}
          className="facebook-image-input"
          onChange={(event) => void handleFacebookImageFileChange(event)}
        />
        {facebookImageAttachments.length > 0 || isFacebookImageReading || facebookImageAttachmentError ? (
          <div className="facebook-image-upload">
            {facebookImageAttachments.map((attachment, index) => (
              <div className="facebook-image-preview" key={`${attachment.fileName}-${attachment.size}-${index}`}>
                <img src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                <div>
                  <strong>{attachment.fileName}</strong>
                  <span>{formatFileSize(attachment.size)}</span>
                </div>
                <button
                  type="button"
                  className="channel-action-button"
                  title="Xóa ảnh"
                  aria-label={`Xóa ảnh ${index + 1}`}
                  disabled={facebookImageUploadDisabled}
                  onClick={() => void clearFacebookImageAttachment(index)}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
            {isFacebookImageReading ? (
              <p className="channel-subselection-empty">Đang xử lý ảnh...</p>
            ) : null}
            {facebookImageAttachmentError ? (
              <div className="facebook-image-error-row">
                <p className="channel-subselection-empty is-error">{facebookImageAttachmentError}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void clearFacebookImageAttachment()}
                >
                  Bỏ ảnh
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  function renderFacebookGroupListEmptyState() {
    if (facebookGroupSearchQuery) {
      return <p className="channel-subselection-empty">Không tìm thấy nhóm Facebook phù hợp.</p>;
    }
    if (facebookGroupLoadState === 'READY') {
      return <p className="channel-subselection-empty">Đã quét được 0 nhóm</p>;
    }
    return null;
  }

  function getFacebookPublishResultDisplay(
    progressStatus: FacebookPublishProgress['results'][number]['status'] | undefined,
    batchStatus: FacebookPublishProgress['status'] | undefined,
  ) {
    if (progressStatus === 'SUCCESS') return { className: 'is-posted', label: 'Đã đăng' };
    if (progressStatus === 'FAILED' || progressStatus === 'SKIPPED' || batchStatus === 'PARTIAL_SUCCESS' || batchStatus === 'ERROR') {
      return { className: 'is-failed', label: 'Đăng lỗi' };
    }
    return { className: 'is-posting', label: 'Đang đăng' };
  }

  function renderChannelPanel() {
    return (
      <section className="channel-section">
        <div className="section-heading-row">
          <p className="section-title">Kênh tuyển dụng</p>
        </div>
        <div className="channel-list">
          {POSTING_CHANNELS.map((channel) => {
            const isSelected = selectedPostingChannels.includes(channel);
            const isFacebookChannel = channel === 'FACEBOOK';
            const isFacebookLoading = isFacebookChannel && isFacebookGroupLoading(facebookGroupLoadState);
            const showFacebookGroups = isFacebookChannel
              && (isSelected || facebookGroupLoadState !== 'IDLE' || Boolean(facebookGroupMessage));

            return (
              <div
                key={channel}
                className={`channel-option${isFacebookChannel ? ' is-facebook' : ''}${isSelected ? ' is-selected' : ''}`}
              >
                <div className="channel-option-row">
                  <label className="channel-option-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isFacebookLoading}
                      onChange={() => void toggleChannel(channel)}
                    />
                    <span>{formatChannelLabel(channel)}</span>
                  </label>
                  <span className="channel-actions">
                    {showFacebookGroups ? (
                      <button
                        type="button"
                        className="channel-action-button channel-groups-toggle"
                        title={isFacebookGroupListExpanded ? 'Ẩn danh sách nhóm Facebook' : 'Hiện danh sách nhóm Facebook'}
                        aria-label={isFacebookGroupListExpanded ? 'Ẩn danh sách nhóm Facebook' : 'Hiện danh sách nhóm Facebook'}
                        aria-expanded={isFacebookGroupListExpanded}
                        onClick={() => setIsFacebookGroupListExpanded((expanded) => !expanded)}
                      >
                        {isFacebookGroupListExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      </button>
                    ) : null}
                    {isFacebookChannel ? (
                      <button
                        type="button"
                        className="channel-action-button"
                        title="Cài đặt Group Facebook"
                        aria-label="Cài đặt Group Facebook"
                        onClick={(event) => void openFacebookGroupSettings(event)}
                      >
                        <GearIcon />
                      </button>
                    ) : (
                      <span className="channel-action-icon" title="Settings">
                        <GearIcon />
                      </span>
                    )}
                  </span>
                </div>
                {renderFacebookChannelSubselection(isSelected, isFacebookLoading, showFacebookGroups)}
              </div>
            );
          })}

        </div>
      </section>
    );
  }
  function handleJobDescriptionSearchInput(value: string) {
    setJobDescriptionSearch(value);
    if (jobDescriptionSearchDebounceRef.current !== null) {
      window.clearTimeout(jobDescriptionSearchDebounceRef.current);
      jobDescriptionSearchDebounceRef.current = null;
    }
    if (!value.trim()) {
      void loadJobDescriptions(token, 1, { search: '' });
      return;
    }
    jobDescriptionSearchDebounceRef.current = window.setTimeout(() => {
      jobDescriptionSearchDebounceRef.current = null;
      void loadJobDescriptions(token, 1, { search: value.trim() });
    }, 300);
  }

  function renderJobDescriptionSyncResult() {
    if (!vcsPortalSyncResult) return null;

    return (
      <section className="portal-sync-result" aria-label="VCS Portal sync result">
        <div className="portal-sync-result-header">
          <div>
            <p className="eyebrow">VCS Portal</p>
            <h3>{vcsPortalSyncResult.failedCount > 0 ? 'Sync finished with warnings' : 'Sync complete'}</h3>
          </div>
          <span className="status-badge">{formatDate(vcsPortalSyncResult.lastSyncedAt) ?? '-'}</span>
        </div>
        <div className="portal-sync-metrics">
          <span><strong>{vcsPortalSyncResult.fetchedCount}</strong>Fetched</span>
          <span><strong>{vcsPortalSyncResult.createdCount}</strong>Created</span>
          <span><strong>{vcsPortalSyncResult.updatedCount}</strong>Updated</span>
          <span><strong>{vcsPortalSyncResult.unchangedCount}</strong>Unchanged</span>
          <span><strong>{vcsPortalSyncResult.archivedCount}</strong>Archived</span>
          <span className={vcsPortalSyncResult.failedCount > 0 ? 'is-danger' : undefined}>
            <strong>{vcsPortalSyncResult.failedCount}</strong>Failed
          </span>
          <span><strong>{vcsPortalSyncResult.questionCount}</strong>Questions</span>
          <span><strong>{vcsPortalSyncResult.questionSetCreatedCount}</strong>Question sets</span>
        </div>
        {vcsPortalSyncResult.warnings?.length ? (
          <ul className="portal-sync-warning-list">
            {vcsPortalSyncResult.warnings.slice(0, 3).map((warning, index) => (
              <li key={`${warning.code}-${warning.sourceJobId ?? warning.sourceSlug ?? index}`}>
                <strong>{warning.sourceSlug ?? warning.sourceJobId ?? warning.code}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  function renderJobDescriptionList() {
    if (jobDescriptions.length === 0) return null;

    return (
      <ul className="jd-list">
        {jobDescriptions.map((jobDescription) => {
          const badge = getJobDescriptionStatusBadge(jobDescription);
          const isSelected = selectedJobDescription?.id === jobDescription.id;
          const isLockedByAmis = lockedAmisJobDescriptionId !== null
            && lockedAmisJobDescriptionId !== jobDescription.id;
          const displayDate = formatDate(
            jobDescription.sourceModifiedAt
            ?? jobDescription.lastSyncedAt
            ?? jobDescription.updatedAt
            ?? jobDescription.createdAt,
          );

          return (
            <li key={jobDescription.id} className={isSelected ? 'is-selected' : undefined}>
              <button
                type="button"
                className="jd-card-button"
                disabled={jobDescriptionFillState === 'FILLING' || isLockedByAmis}
                onClick={() => void fillJobDescriptionInAmis(jobDescription)}
              >
                <span className={`status-badge jd-status-badge ${badge.className}`}>{badge.label}</span>
                <h3>{jobDescription.title}</h3>
                <p>{summarizeText(jobDescription.summary ?? jobDescription.description)}</p>
                <small>{displayDate ?? '-'}</small>
                {fillingJobDescriptionId === jobDescription.id ? (
                  <span className="status-badge jd-fill-badge">Đang chọn</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderJobDescriptionPagination(
    totalItems: number,
    currentPage: number,
    visibleStart: number,
    visibleEnd: number,
    paginationPages: CompactPaginationItem[],
  ) {
    if (!jobDescriptionPagination || jobDescriptionPagination.totalPages <= 1) return null;

    return (
      <div className="pagination-row jd-pagination-row">
        <span>Hiển thị từ {visibleStart} - {visibleEnd} của {totalItems} kết quả</span>
        <div className="jd-pagination-actions">
          <button
            type="button"
            className="jd-page-button"
            aria-label="Trang trước"
            disabled={jobDescriptionStatus === 'LOADING' || jobDescriptionPagination.page <= 1}
            onClick={() => void loadJobDescriptions(token, jobDescriptionPagination.page - 1)}
          >
            <BackIcon />
          </button>
          {paginationPages.map((page) => (
            typeof page !== 'number' ? (
              <span key={`${page.type}-${page.key}`} className="jd-pagination-ellipsis" aria-hidden="true">…</span>
            ) : (
              <button
                key={page}
                type="button"
                className={`jd-page-button${page === currentPage ? ' is-active' : ''}`}
                aria-current={page === currentPage ? 'page' : undefined}
                disabled={jobDescriptionStatus === 'LOADING'}
                onClick={() => void loadJobDescriptions(token, page)}
              >
                {page}
              </button>
            )
          ))}
          <button
            type="button"
            className="jd-page-button"
            aria-label="Trang sau"
            disabled={jobDescriptionStatus === 'LOADING' || jobDescriptionPagination.page >= jobDescriptionPagination.totalPages}
            onClick={() => void loadJobDescriptions(token, jobDescriptionPagination.page + 1)}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    );
  }

  function renderJobDescriptionPanel() {
    const totalItems = jobDescriptionPagination?.total ?? jobDescriptions.length;
    const currentPage = jobDescriptionPagination?.page ?? 1;
    const pageLimit = jobDescriptionPagination?.limit ?? 5;
    const totalPages = jobDescriptionPagination?.totalPages ?? 1;
    const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * pageLimit) + 1;
    const visibleEnd = totalItems === 0 ? 0 : Math.min(totalItems, visibleStart + jobDescriptions.length - 1);
    const paginationPages = buildCompactPaginationPages(currentPage, totalPages);

    return (
      <section className="jd-panel compact-workspace-section post-card-section">
        <h2 className="job-description-panel-title">Mô tả công việc</h2>
        <form className="jd-toolbar" onSubmit={submitJobDescriptionSearch}>
          <SearchField
            className="jd-search-field"
            value={jobDescriptionSearch}
            onChange={handleJobDescriptionSearchInput}
            placeholder="Tìm kiếm JD"
            ariaLabel="Tìm kiếm JD"
            type="search"
            maxLength={255}
            clearButton={jobDescriptionSearch ? (
              <button type="button" className="jd-search-clear" aria-label="Xóa tìm kiếm JD" onClick={clearJobDescriptionSearch}>
                <CloseIcon />
              </button>
            ) : null}
          />
          <SelectFilter
            className="jd-status-filter"
            label="Trạng thái JD"
            ariaLabel="Lọc trạng thái JD"
            value={jobDescriptionStatusFilter}
            options={JOB_DESCRIPTION_STATUS_OPTIONS}
            disabled={jobDescriptionStatus === 'LOADING'}
            onChange={changeJobDescriptionStatusFilter}
          />
        </form>

        {/* {vcsPortalSyncMessage ? (
          <p className={vcsPortalSyncState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {vcsPortalSyncMessage}
          </p>
        ) : null} */}

        {renderJobDescriptionSyncResult()}

        {jobDescriptionStatus === 'LOADING' ? (
          <p className="muted-text">Đang tải danh sách JD...</p>
        ) : null}

        {jobDescriptionError ? <p className="error-text">Có lỗi kết nối mạng, vui lòng kiểm tra lại</p> : null}

        {jobDescriptionFillMessage ? (
          <p className={jobDescriptionFillState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {jobDescriptionFillMessage} 
          </p>
        ) : null}

        {jobDescriptionStatus !== 'LOADING' && jobDescriptions.length === 0 ? (
          <p className="question-select-alert">Không tìm thấy JD phù hợp.</p>
        ) : null}

        {renderJobDescriptionList()}
        {renderJobDescriptionPagination(totalItems, currentPage, visibleStart, visibleEnd, paginationPages)}

      </section>
    );
  }

  function renderCareerQuestionPanel() {
    return (
      <section className="question-panel career-question-panel compact-workspace-section post-card-section">
        <div className="question-section-header">
          <h2>Bộ câu hỏi</h2>
          {selectedJobDescription ? (
            <button
              type="button"
              className="question-edit-button"
              onClick={openFrontendQuestionEditor}
              disabled={!jobDescriptionQuestionContext?.questions.length}
            >
              Chỉnh sửa bộ câu hỏi
            </button>
          ) : null}
        </div>

        <div className="career-question-content">
          {!selectedJobDescription ? (
            <p className="question-select-alert">Chọn 1 JD để xem bộ câu hỏi tương ứng</p>
          ) : null}

          {/* {careerQuestionMessage ? (
            <p className={careerQuestionState === 'ERROR' ? 'error-text' : 'muted-text'}>
              {careerQuestionMessage}
            </p>
          ) : null} */}

          {jobDescriptionQuestionContext ? (
            <>
              {jobDescriptionQuestionContext.questions.length > 0 ? (
                <ul className="career-question-list">
                  {jobDescriptionQuestionContext.questions.map((question, index) => (
                    <li key={question.id}>
                      <article className="career-question-card post-question-card">
                        <span className="career-question-card-body">
                          <span className="career-question-title">
                            <strong>{index + 1}.</strong>
                            {question.text}
                          </span>
                        </span>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="career-question-empty">Chưa có dữ liệu bộ câu hỏi</p>
              )}
            </>
          ) : null}
        </div>
      </section>
    );
  }

  function renderCvPanel() {
    return (
      <div className="cv-panel-content">
        {cvWorkspaceView === 'overview' ? renderCvOverviewPanel() : null}
        {cvWorkspaceView === 'list' ? renderCvCandidateListPanel() : null}
      </div>
    );
  }

  function getCvOverviewJobContext() {
    let currentJobPostingId: string | null | undefined = null;
    if (result?.amisRecruitmentId === amisRecruitmentId) {
      currentJobPostingId = result.jobPostingId;
    } else if (applicationsContext?.amisRecruitmentId === amisRecruitmentId) {
      currentJobPostingId = applicationsContext.jobPostingId;
    }
    const currentJobTitle = snapshot?.title
      ?? (amisRecruitmentId ? `AMIS recruitment ${amisRecruitmentId}` : 'Chưa chọn tin tuyển dụng');
    const hasCurrentJobMapping = Boolean(snapshot || currentJobPostingId);
    let publicUrl = '-';
    if (currentJobPostingId) {
      publicUrl = `http://localhost:4000/public/job-postings/${currentJobPostingId}`;
    } else if (snapshot) {
      publicUrl = `https://vcs-portal.vn/jobs/${slugifyForDisplay(snapshot.title)}`;
    }
    return { currentJobTitle, hasCurrentJobMapping, publicUrl };
  }

  function renderCvOverviewPanel() {
    const applications = applicationsContext?.applications ?? [];
    const stats = getCvOverviewStats(applications);
    const { currentJobTitle, hasCurrentJobMapping, publicUrl } = getCvOverviewJobContext();

    return (
      <section className="cv-overview-screen">
        <div className="cv-back-title">
          <button type="button" className="cv-back-button" aria-label="Back">
            <CloseIcon />
          </button>
          <h3>Hồ sơ ứng tuyển</h3>
        </div>

        <section className="cv-current-job-card">
          <p className="cv-card-label">Current job</p>
          <div className="cv-job-title-row">
            <h4>{currentJobTitle}</h4>
            <span className={hasCurrentJobMapping ? 'cv-mini-badge is-success' : 'cv-mini-badge is-muted'}>
              {hasCurrentJobMapping ? 'Mapped' : 'No job'}
            </span>
          </div>
          <dl>
            <div>
              <dt>AMIS ID</dt>
              <dd>{amisRecruitmentId ?? '-'}</dd>
            </div>
            <div>
              <dt>Public URL</dt>
              <dd className="cv-public-url">{publicUrl}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{autoSyncState?.updatedAt ?? '-'}</dd>
            </div>
          </dl>
        </section>

        <section className="cv-overview-block">
          <p className="cv-section-label">Application overview</p>
          <div className="cv-stat-grid">
            <article>
              <strong>{stats.totalApplied}</strong>
              <span>Total applied</span>
              <small>Tổng hồ sơ đã apply</small>
            </article>
            <article className="is-success">
              <strong>{stats.newCount}</strong>
              <span>New</span>
              <small>Chưa được HR xử lý</small>
            </article>
            <article className="is-warning">
              <strong>{stats.processingCount}</strong>
              <span>Processing</span>
              <small>Đang scan / parse CV</small>
            </article>
            <article className="is-danger">
              <strong>{stats.syncErrorCount}</strong>
              <span>Sync error</span>
              <small>Cần retry đồng bộ AMIS</small>
            </article>
          </div>
        </section>

        <section className="cv-overview-block">
          <p className="cv-section-label">Job status</p>
          <div className="cv-job-status-list">
            <span>JD Sync <strong className={hasCurrentJobMapping ? 'is-success' : 'is-warning'}>{hasCurrentJobMapping ? 'Synced' : 'Pending'}</strong></span>
            <span>CV Intake <strong className={stats.totalApplied > 0 ? 'is-success' : 'is-warning'}>{stats.totalApplied > 0 ? 'Active' : 'Waiting'}</strong></span>
            <span>CV Processing <strong className={stats.processingCount > 0 ? 'is-warning' : 'is-success'}>{stats.processingCount > 0 ? `${stats.processingCount} Pending` : 'Ready'}</strong></span>
            <span>AMIS Candidate Sync <strong className={stats.syncErrorCount > 0 ? 'is-danger' : 'is-warning'}>{stats.syncErrorCount > 0 ? `${stats.syncErrorCount} Failed` : 'Not synced'}</strong></span>
          </div>
        </section>

        {applicationsMessage ? (
          <p className={applicationsState === 'ERROR' ? 'error-text' : 'muted-text'}>{applicationsMessage}</p>
        ) : null}

        <div className="cv-overview-actions">
          <button
            type="button"
            className="secondary-action-button"
            disabled={!amisRecruitmentId || applicationsState === 'LOADING'}
            onClick={() => void loadAmisApplications(token, amisRecruitmentId)}
          >
            Refresh
          </button>
          <a className="secondary-action-button" href={publicUrl === '-' ? undefined : publicUrl} target="_blank" rel="noreferrer">
            View public job
          </a>
          <button type="button" className="secondary-action-button" onClick={() => selectWorkspaceTab('posting')}>
            Sync JD
          </button>
          <button
            type="button"
            className="secondary-action-button"
            disabled={!selectedJobDescription}
            onClick={() => void loadSelectedJobDescriptionQuestionSet(selectedJobDescription, token, { force: true })}
          >
            View question set
          </button>
        </div>

        <button type="button" className="cv-primary-action" onClick={() => setCvWorkspaceView('list')}>
          Open applied candidates
        </button>
      </section>
    );
  }

  function renderCvCandidateListPanel() {
    const applications = applicationsContext?.applications ?? [];
    const applicationsForCurrentAmisCandidate = activeAmisCandidateId
      ? applications.filter((application) => application.amisCandidateId === activeAmisCandidateId)
      : applications;
    const filteredApplications = getVisibleCvApplications(
      applicationsForCurrentAmisCandidate,
      cvQuestionFilter,
      cvSyncFilter,
      cvEvaluationFilter,
      cvSourceFilter,
      cvSortMode,
      aiEvaluationUploadedApplicationIds,
    );
    const totalPages = Math.max(1, Math.ceil(filteredApplications.length / CV_APPLICATION_PAGE_SIZE));
    const currentPage = Math.min(cvApplicationPage, totalPages);
    const pageStartIndex = (currentPage - 1) * CV_APPLICATION_PAGE_SIZE;
    const pageApplications = filteredApplications.slice(pageStartIndex, pageStartIndex + CV_APPLICATION_PAGE_SIZE);
    const selectedFilteredApplications = filteredApplications.filter((application) => selectedCvApplicationIds.has(application.applicationId));
    const selectedFilteredUploadableCount = selectedFilteredApplications.filter((application) =>
      canUploadApplicationCv(application)
      && !pendingAmisUploadApplicationIds.has(application.applicationId),
    ).length;
    const allFilteredApplicationsSelected = filteredApplications.length > 0
      && selectedFilteredApplications.length === filteredApplications.length;
    const someFilteredApplicationsSelected = selectedFilteredApplications.length > 0 && !allFilteredApplicationsSelected;
    const visibleStart = filteredApplications.length === 0 ? 0 : pageStartIndex + 1;
    const visibleEnd = Math.min(pageStartIndex + pageApplications.length, filteredApplications.length);
    const paginationPages = getPaginationPages(currentPage, totalPages);

    function getCvCandidateCardViewModel(application: ExtensionApplication) {
      const isAmisUploadPending = pendingAmisUploadApplicationIds.has(application.applicationId);
      const syncStatus = getApplicationAmisSyncStatus(application);
      const questionStatus = getApplicationQuestionStatus(application);
      const isCurrentAmisCandidate = Boolean(
        activeAmisCandidateId
        && application.amisCandidateId === activeAmisCandidateId,
      );
      const isAmisCvUploaded = Boolean(application.attachmentCvId || application.attachmentCvName);
      const aiScreeningDone = normalizeStatus(application.aiScreeningStatus) === 'DONE';
      const aiScreeningRunning = normalizeStatus(application.aiScreeningStatus) === 'REQUESTED'
        || aiScreeningApplicationId === application.applicationId;
      const canRunAiScreening = questionStatus.code === 'ANSWERED';
      const score = aiScreeningDone ? getApplicationMatchScore(application) : null;
      const isSelected = selectedCvApplicationIds.has(application.applicationId);
      const isAiEvaluationUploaded = aiEvaluationUploadedApplicationIds.has(application.applicationId);
      const isAmisSynced = Boolean(application.amisCandidateId);
      const canShowAmisSyncButton = !isAmisSynced && !isAmisCvUploaded;
      const canShowAiScreeningButton = questionStatus.code === 'ANSWERED'
        && isAmisSynced
        && !aiScreeningDone
        && !isAiEvaluationUploaded;
      const canShowAiUploadButton = isAmisSynced
        && isAmisCvUploaded
        && aiScreeningDone
        && isCurrentAmisCandidate
        && !isAiEvaluationUploaded;
      const canSyncToAmis = canShowAmisSyncButton && canUploadApplicationCv(application);
      const aiEvaluationStatus = getApplicationAiEvaluationStatus(application, isAiEvaluationUploaded);
      let syncButtonLabel = 'Đồng bộ';
      if (isAmisUploadPending) {
        syncButtonLabel = 'Chờ AMIS lưu';
      }
      if (cvUploadApplicationId === application.applicationId) {
        syncButtonLabel = 'Đang đồng bộ...';
      }
      const candidateStages = getAmisCandidateStageOptions(amisRecruitmentRounds, application);
      const currentStageIndex = getAmisCandidateStageIndex(
        candidateStages,
        application.amisRecruitmentRoundId,
        application.amisRecruitmentRoundName,
      );

      return {
        syncStatus,
        questionStatus,
        aiScreeningRunning,
        canRunAiScreening,
        score,
        isSelected,
        canShowAmisSyncButton,
        canShowAiScreeningButton,
        canShowAiUploadButton,
        canSyncToAmis,
        syncButtonLabel,
        aiEvaluationStatus,
        candidateStages,
        currentStageIndex,
        currentStageLabel: candidateStages[currentStageIndex]?.name
          ?? application.amisRecruitmentRoundName
          ?? 'Chưa cập nhật',
        isAmisRejected: application.amisStatus === 0,
        rejectionReason: application.amisReasonRemoved?.trim() || null,
        recruiterName: application.attractivePersonnelName ?? '-',
        appliedDate: formatDateTime(application.applyDate ?? application.createdAt ?? undefined) ?? '-',
      };
    }

    return (
      <section className="cv-list-screen">
        <div className="cv-filter-control-grid">
          <FilterDropdown
            label="Trạng thái trả lời câu hỏi"
            value={cvQuestionFilter}
            options={CV_QUESTION_FILTER_OPTIONS}
            isOpen={openCvFilter === 'QUESTION'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'QUESTION' ? null : 'QUESTION')}
            onSelect={(value) => {
              setCvQuestionFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Trạng thái đồng bộ Amis"
            value={cvSyncFilter}
            options={CV_SYNC_FILTER_OPTIONS}
            isOpen={openCvFilter === 'SYNC'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SYNC' ? null : 'SYNC')}
            onSelect={(value) => {
              setCvSyncFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Trạng thái tải file đánh giá"
            value={cvEvaluationFilter}
            options={CV_EVALUATION_FILTER_OPTIONS}
            isOpen={openCvFilter === 'EVALUATION'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'EVALUATION' ? null : 'EVALUATION')}
            onSelect={(value) => {
              setCvEvaluationFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
        </div>
        <div className="cv-filter-control-grid cv-filter-control-grid-secondary">
          <FilterDropdown
            label="Nguồn"
            value={cvSourceFilter}
            options={CV_SOURCE_FILTER_OPTIONS}
            isOpen={openCvFilter === 'SOURCE'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SOURCE' ? null : 'SOURCE')}
            onSelect={(value) => {
              setCvSourceFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Sắp xếp"
            value={cvSortMode}
            options={CV_SORT_OPTIONS}
            isOpen={openCvFilter === 'SORT'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SORT' ? null : 'SORT')}
            onSelect={(value) => {
              setCvSortMode(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
        </div>
        <div className="cv-list-toolbar">
          <div className="cv-list-toolbar-heading">
            <span>Danh sách ứng viên</span>
            <button
              type="button"
              className="cv-bulk-sync-button"
              disabled={selectedFilteredUploadableCount === 0 || Boolean(cvUploadApplicationId)}
              onClick={() => void uploadApplicationCvsToAmisForm(selectedFilteredApplications)}
            >
              <RefreshIcon />
              {cvUploadApplicationId === 'BATCH' ? 'Đang đồng bộ...' : 'Đồng bộ CV đã chọn'}
            </button>
          </div>
          {filteredApplications.length > 0 ? (
            <label className="cv-select-all-control">
              <input
                type="checkbox"
                checked={allFilteredApplicationsSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someFilteredApplicationsSelected;
                }}
                aria-label="Chọn tất cả ứng viên"
                onChange={() => toggleAllCvCandidateSelection(filteredApplications.map((application) => application.applicationId))}
              />
              <span>Chọn tất cả ứng viên</span>
            </label>
          ) : null}
        </div>

        {applicationsMessage ? (
          <p className={applicationsState === 'ERROR' ? 'error-text' : 'muted-text'}>{applicationsMessage}</p>
        ) : null}

        {applicationsState === 'LOADING' && applications.length === 0 ? (
          <p className="muted-text">Loading applications for this AMIS recruitment...</p>
        ) : null}

        {pageApplications.length > 0 ? (
          <ul className="cv-candidate-list">
            {pageApplications.map((application) => {
              const {
                syncStatus,
                questionStatus,
                aiScreeningRunning,
                canRunAiScreening,
                score,
                isSelected,
                canShowAmisSyncButton,
                canShowAiScreeningButton,
                canShowAiUploadButton,
                canSyncToAmis,
                syncButtonLabel,
                aiEvaluationStatus,
                candidateStages,
                currentStageIndex,
                currentStageLabel,
                isAmisRejected,
                rejectionReason,
                recruiterName,
                appliedDate,
              } = getCvCandidateCardViewModel(application);

              return (
                <li key={application.applicationId} className={isSelected ? 'is-selected' : ''}>
                  <div className="cv-candidate-card">
                    <div className="cv-candidate-main">
                      <label className="cv-candidate-select" aria-label={`Chọn ${application.candidateName}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCvCandidateSelection(application.applicationId)}
                        />
                      </label>
                      <CandidateAvatar name={application.candidateName} />
                      <div>
                        <strong title={application.candidateName}>
                          {truncateCandidateName(application.candidateName)}
                        </strong>
                        <span>{[application.email, application.mobile].filter(Boolean).join(' • ') || 'No contact'}</span>
                        <span className="cv-candidate-applied-date">Ngày ứng tuyển: {appliedDate}</span>
                      </div>
                      {score != null ? (
                        <b className={`cv-candidate-score ${getCvScoreTone(score)}`}>{score}</b>
                      ) : null}
                    </div>
                    <div
                      className="cv-candidate-process"
                      style={{ '--cv-stage-count': String(candidateStages.length) } as React.CSSProperties}
                      aria-label={`Vòng hiện tại: ${currentStageLabel}`}
                    >
                      {candidateStages.map((stage, stageIndex) => (
                        <div
                          key={stage.id}
                          className={`cv-candidate-process-step${stageIndex < currentStageIndex ? ' is-complete' : ''}${stageIndex === currentStageIndex && !isAmisRejected ? ' is-current' : ''}${stageIndex === currentStageIndex && isAmisRejected ? ' is-failed' : ''}`}
                        >
                          <span className="cv-candidate-process-marker" aria-hidden="true" />
                          <span>{stage.name}</span>
                        </div>
                      ))}
                    </div>
                    {isAmisRejected && rejectionReason ? (
                      <div className="cv-candidate-rejection-reason">
                        <strong>Lý do bị loại:</strong>
                        <span>{rejectionReason}</span>
                      </div>
                    ) : null}
                    <div className="cv-candidate-info">
                      <div className="cv-candidate-meta">
                        <span className="cv-candidate-source">
                          <SourceIcon />
                          <span>Nguồn</span>
                          <span className="cv-source-chip">{getCvSourceLabel(application)}</span>
                        </span>
                        <span className="cv-candidate-recruiter">
                          Nhân sự khai thác: <strong>{recruiterName}</strong>
                        </span>
                      </div>
                      <div className="cv-candidate-details">
                        <div className={`cv-candidate-detail cv-candidate-detail-status cv-question-status ${questionStatus.tone}`}>
                          <small>CÂU HỎI</small>
                          <strong>{questionStatus.label}</strong>
                        </div>
                        <div className={`cv-candidate-detail cv-candidate-detail-status ${syncStatus.tone}`}>
                          <small>ĐỒNG BỘ AMIS</small>
                          <strong>{syncStatus.label}</strong>
                        </div>
                        <div className={`cv-candidate-detail cv-candidate-detail-status cv-ai-status ${aiEvaluationStatus.tone}`}>
                          <small>FILE ĐÁNH GIÁ BẰNG AI</small>
                          <strong>{aiEvaluationStatus.label}</strong>
                        </div>
                      </div>
                      <div className="cv-candidate-note">
                        <span className="cv-candidate-note-label">Ghi chú của CV</span>
                        <span>{application.cvNote?.trim() || 'CV này không có ghi chú nào.'}</span>
                      </div>
                    </div>
                    <div className="cv-candidate-footer">
                      {canShowAmisSyncButton && isAmisCandidateFormOpen ? (
                        <button
                          type="button"
                          className="cv-sync-amis-button"
                          disabled={!canSyncToAmis || Boolean(cvUploadApplicationId)}
                          onClick={() => void uploadApplicationCvToAmisForm(application)}
                        >
                          {syncButtonLabel}
                        </button>
                      ) : null}
                      {canShowAiScreeningButton ? (
                        <button
                          type="button"
                          className="cv-sync-amis-button"
                          disabled={!canRunAiScreening || aiScreeningRunning || Boolean(aiScreeningApplicationId)}
                          onClick={() => void runAiScreeningForApplication(application)}
                        >
                          {aiScreeningRunning ? 'Đang đánh giá...' : 'Đánh giá bằng AI'}
                        </button>
                      ) : null}
                      {canShowAiUploadButton ? (
                        <button
                          type="button"
                          className="cv-sync-amis-button"
                          disabled={Boolean(aiEvaluationApplicationId)}
                          onClick={() => void uploadAiEvaluationToAmis(application)}
                        >
                          {aiEvaluationApplicationId === application.applicationId
                            ? 'Đang tải lên...'
                            : 'Tải file đánh giá lên AMIS'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}

          </ul>
        ) : (
          <div className="empty-panel-state">
            <strong>Không tìm thấy hồ sơ ứng viên</strong>
          </div>
        )}

        {filteredApplications.length > CV_APPLICATION_PAGE_SIZE && (
          <div className="cv-list-pagination">
            <span>Hiển thị {visibleStart} - {visibleEnd} của {filteredApplications.length} kết quả</span>
            <div>
              <button
                type="button"
                className="cv-page-button"
                disabled={currentPage <= 1}
                aria-label="Trang trước"
                onClick={() => setCvApplicationPage((page) => Math.max(1, page - 1))}
              >
                <BackIcon />
              </button>
              {paginationPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`cv-page-button${page === currentPage ? ' is-active' : ''}`}
                  aria-current={page === currentPage ? 'page' : undefined}
                  onClick={() => setCvApplicationPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="cv-page-button"
                disabled={currentPage >= totalPages}
                aria-label="Trang sau"
                onClick={() => setCvApplicationPage((page) => Math.min(totalPages, page + 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  function toggleCvCandidateSelection(applicationId: string) {
    setSelectedCvApplicationIds((current) => {
      const next = new Set(current);
      if (next.has(applicationId)) {
        next.delete(applicationId);
      } else {
        next.add(applicationId);
      }
      return next;
    });
  }

  function toggleAllCvCandidateSelection(applicationIds: string[]) {
    if (applicationIds.length === 0) return;

    setSelectedCvApplicationIds((current) => {
      const next = new Set(current);
      const shouldSelectAll = applicationIds.some((applicationId) => !next.has(applicationId));

      for (const applicationId of applicationIds) {
        if (shouldSelectAll) next.add(applicationId);
        else next.delete(applicationId);
      }

      return next;
    });
  }

  function renderRuntimePanels() {
    return (
      <>
        {autoSyncState ? (
          <section className="capture-panel">
            <div className="status-row">
              <span>Auto sync</span>
              <strong>{autoSyncState.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Updated</dt>
                <dd>{autoSyncState.updatedAt}</dd>
              </div>
              {autoSyncState.channels ? (
                <div>
                  <dt>Channels</dt>
                  <dd>{autoSyncState.channels.join(', ')}</dd>
                </div>
              ) : null}
            </dl>
            {autoSyncState.error ? (
              <p className="error-text">{autoSyncState.error.code}: {autoSyncState.error.message}</p>
            ) : null}
          </section>
        ) : null}

      </>
    );
  }

  function renderExtensionHeader() {
    const canChangePassword = user?.role === 'FREELANCER' || user?.role === 'INTERNAL';
    let passwordAction: React.ReactNode = null;
    if (canChangePassword && isFreelancerPasswordFormOpen) {
      passwordAction = (
        <button
          type="button"
          className="text-button freelancer-change-password-back-button"
          onClick={() => setIsFreelancerPasswordFormOpen(false)}
        >
          Quay lại
        </button>
      );
    } else if (canChangePassword) {
      passwordAction = (
        <button
          type="button"
          className="text-button freelancer-change-password-button"
          onClick={() => setIsFreelancerPasswordFormOpen((current) => !current)}
        >
          Đổi mật khẩu
        </button>
      );
    }

    return (
      <header className="extension-header">
          <div>
            <div className='extension-header-logo'>Tuyển dụng VCS</div>
          </div>
          <div className="extension-header-actions">
            {user ? (
              <>
                {passwordAction}
                {!isFreelancerPasswordFormOpen ? (
                  <button type="button" className="text-button" onClick={logout}>
                    Đăng xuất
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </header>
    );
  }

  function renderExtensionWorkspace() {
    const isFreelancerWorkspace = (user?.role === 'FREELANCER' || user?.role === 'INTERNAL') && Boolean(token);

    return (
      <>
{state === 'AUTH_LOADING' ? <p className="muted-text extension-loading">Checking session...</p> : null}

        {state === 'AUTH_REQUIRED' ? (
          <LoginForm
            login={email}
            password={password}
            rememberMe={rememberMe}
            error={error}
            internalMode={isInternalPasswordRequestOpen}
            forgotPasswordMode={isForgotPasswordOpen}
            internalEmail={internalEmail}
            internalMessage={internalPasswordMessage}
            internalSubmitting={internalPasswordSubmitting}
            onLoginChange={(event) => setEmail(event.target.value)}
            onPasswordChange={(event) => setPassword(event.target.value)}
            onInternalEmailChange={(event) => setInternalEmail(event.target.value)}
            onRememberMeChange={(event) => setRememberMe(event.target.checked)}
            onForgotPassword={openForgotPassword}
            onForgotPasswordCancel={cancelForgotPassword}
            onInternalModeChange={openInternalPasswordRequest}
            onInternalCancel={cancelInternalPasswordRequest}
            onInternalSubmit={submitInternalPasswordRequest}
            onSubmit={submitLogin}
          />
        ) : null}

        {isFreelancerWorkspace ? (
          <section className="freelancer-extension-shell">
            {!isFreelancerPasswordFormOpen ? (
              <nav className="extension-tabs freelancer-extension-tabs" aria-label="Freelancer sections">
                <button type="button" className="extension-tab is-active" aria-current="page">
                  <CvIcon />
                  <span>CV của tôi</span>
                </button>
              </nav>
            ) : null}
            <FreelancerCvPanel
              accessToken={token ?? ''}
              onNotify={showExtensionToast}
              isChangePasswordFormOpen={isFreelancerPasswordFormOpen}
              onCloseChangePassword={() => setIsFreelancerPasswordFormOpen(false)}
            />
          </section>
        ) : null}

        {user && !isFreelancerWorkspace ? (
          <>
            <nav className="extension-tabs" aria-label="VCS Recruitment sections">
              {WORKSPACE_TABS.map((tab) => {
                const isActive = activeWorkspaceTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`extension-tab${isActive ? ' is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => selectWorkspaceTab(tab.id)}
                  >
                    {tab.id === 'overview' ? <HomeIcon /> : null}
                    {tab.id === 'posting' ? <PostingIcon /> : null}
                    {tab.id === 'cv' ? <CvIcon /> : null}
                    {tab.id === 'freelancer' ? <PeopleIcon /> : null}
                    {tab.id === 'internal' ? <PeopleIcon /> : null}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <section className={`workspace-grid is-${visibleWorkspaceTabs.length}-panel`}>
              {visibleWorkspaceTabs.map((tab) => renderWorkspacePanel(tab))}
            </section>
          </>
        ) : null}
      </>
    );
  }

  function renderExtensionToast() {
    return (
      <>
{extensionToast ? (
        <aside
          key={extensionToast.id}
          className={`extension-toast is-${extensionToast.kind.toLowerCase()}`}
          role="status"
          aria-live="polite"
        >
          <div className="extension-toast-icon" aria-hidden="true">
            {extensionToast.kind === 'SUCCESS' ? <CheckCircleIcon /> : <WarningIcon />}
          </div>
          <div className="extension-toast-copy">
            <strong>{extensionToast.title}</strong>
            <span>{extensionToast.message}</span>
          </div>
          <button
            type="button"
            className="extension-toast-close"
            title="Đóng thông báo"
            aria-label="Đóng thông báo"
            onClick={dismissExtensionToast}
          >
            <CloseIcon />
          </button>
          <span className="extension-toast-progress" aria-hidden="true" />
        </aside>
      ) : null}
      </>
    );
  }

  function renderFacebookGroupSettingsList() {
    if (facebookGroupPageItems.length > 0) {
      return facebookGroupPageItems.map((group) => {
        const isGroupChecking = Boolean(group.targetId && verifyingFacebookGroupIds.includes(group.targetId));
        const isGroupQueued = Boolean(group.targetId && queuedFacebookGroupIds.includes(group.targetId));

        return (
          <article
            key={group.targetId ?? group.targetExternalId ?? group.targetUrl ?? group.targetName}
            className={`facebook-group-item${!isSelectableFacebookGroup(group) ? ' is-disabled' : ''}`}
          >
            <div className="facebook-group-info">
              <div className="facebook-group-title-row"><strong>{group.targetName}</strong></div>
            </div>
            <div className="facebook-group-item-actions">
              {group.targetUrl ? (
                <a className="facebook-group-open-link" href={group.targetUrl} target="_blank" rel="noreferrer">
                  Mở trong tab mới
                  <ExternalLinkIcon />
                </a>
              ) : null}
              <div className="group-icon-button-wrapper">
                <button
                  type="button"
                  className={`group-icon-button${isGroupChecking ? ' is-loading' : ''}`}
                  title={isGroupQueued ? 'Đang chờ kiểm tra' : 'Kiểm tra khả năng đăng bài'}
                  aria-label={`${isGroupQueued ? 'Đang chờ kiểm tra' : 'Kiểm tra khả năng đăng bài'} ${group.targetName}`}
                  disabled={facebookSettingsState === 'SAVING' || isGroupChecking || isGroupQueued || !group.targetId}
                  onClick={() => checkFacebookGroupEligibility(group)}
                >
                  <RefreshIcon />
                </button>
                <button
                  type="button"
                  className="group-icon-button"
                  title="Chỉnh sửa nhóm"
                  aria-label={`Chỉnh sửa nhóm ${group.targetName}`}
                  onClick={() => openEditFacebookGroup(group)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="group-icon-button is-danger"
                  title="Xóa nhóm"
                  aria-label={`Xóa nhóm ${group.targetName}`}
                  onClick={() => openDeleteFacebookGroup(group)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="facebook-group-status-row">
              <span className={`facebook-group-badge ${getFacebookGroupBadgeClass(group.eligibilityStatus)}`}>
                {getFacebookEligibilityLabel(group.eligibilityStatus)}
              </span>
              <span className={`facebook-group-badge${group.quotaExceeded ? ' is-danger' : ' is-neutral'}`}>
                Hôm nay đã đăng {group.quotaLabel ?? `${group.todayPublishCount ?? 0}/${group.dailyPublishLimit ?? 10}`}
              </span>
            </div>
            {isGroupChecking ? <p className="facebook-group-reason">Đang kiểm tra...</p> : null}
          </article>
        );
      });
    }

    if (facebookSettingsGroupSearchQuery) {
      return <div className="facebook-group-empty"><strong>Không tìm thấy nhóm Facebook phù hợp</strong></div>;
    }

    return (
      <div className="facebook-group-empty">
        <strong>Chưa có nhóm Facebook</strong>
        <p>Danh sách sẽ được nạp sau lần đồng bộ đầu tiên.</p>
        {!isFacebookGroupFormOpen ? (
          <button type="button" className="primary-button compact-button" onClick={openFacebookGroupCreateModal}>
            Thêm nhóm mới
          </button>
        ) : null}
      </div>
    );
  }

  function renderFacebookGroupSettingsModal() {
    return (
      <dialog
        open
        className="facebook-group-modal facebook-group-settings-modal"
        aria-modal="true"
        aria-labelledby="facebook-group-settings-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="facebook-group-settings-title">Cài đặt nhóm Facebook</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng"
            onClick={closeFacebookGroupSettings}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body">
          <div className="modal-toolbar">
            <p className="section-title">Danh sách nhóm</p>
            {!isFacebookGroupFormOpen ? (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={openFacebookGroupCreateModal}
              >
                Thêm nhóm mới
              </button>
            ) : null}
          </div>

          <SearchField
            className="facebook-settings-search"
            inputRef={facebookSettingsGroupSearchInputRef}
            value={facebookSettingsGroupSearchInput}
            maxLength={255}
            placeholder="Tìm kiếm nhóm Facebook"
            ariaLabel="Tìm kiếm nhóm Facebook"
            onChange={setFacebookSettingsGroupSearchInput}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const trimmedSearch = facebookSettingsGroupSearchInput.trim();
              setFacebookSettingsGroupSearchInput(trimmedSearch);
              setFacebookSettingsGroupSearchQuery(trimmedSearch);
              setFacebookGroupPage(1);
            }}
            clearButton={facebookSettingsGroupSearchInput.length > 0 ? (
              <button
                type="button"
                className="facebook-settings-search-clear"
                title="Xóa tìm kiếm nhóm Facebook"
                aria-label="Xóa tìm kiếm nhóm Facebook"
                onClick={() => {
                  setFacebookSettingsGroupSearchInput('');
                  setFacebookSettingsGroupSearchQuery('');
                  setFacebookGroupPage(1);
                  facebookSettingsGroupSearchInputRef.current?.focus();
                }}
              >
                <CloseIcon />
              </button>
            ) : null}
          />

          {facebookSettingsMessage ? (
            <p className={`modal-status${facebookSettingsState === 'ERROR' ? ' is-error' : ''}`}>
              {facebookSettingsMessage}
            </p>
          ) : null}

          {facebookSettingsState === 'LOADING' ? (
            <p className="muted-text">Đang tải danh sách nhóm từ backend...</p>
          ) : (
            <div className="facebook-group-list">
              {renderFacebookGroupSettingsList()}
            </div>
          )}

          {facebookGroupTotalItems > FACEBOOK_GROUP_PAGE_SIZE ? (
            <div className="facebook-group-pagination">
              <span>
                Hiển thị <strong>{facebookGroupVisibleStart}</strong> đến <strong>{facebookGroupVisibleEnd}</strong> trong <strong>{facebookGroupTotalItems}</strong> nhóm
              </span>
              <div>
                <button
                  type="button"
                  title="Trang trước"
                  aria-label="Trang trước danh sách nhóm Facebook"
                  disabled={currentFacebookGroupPage <= 1 || facebookSettingsState === 'SAVING'}
                  onClick={() => changeFacebookGroupPage(currentFacebookGroupPage - 1)}
                >
                  <BackIcon />
                </button>
                {facebookGroupPaginationItems.map((page) => (
                  typeof page === 'number' ? (
                    <button
                      key={page}
                      type="button"
                      className={page === currentFacebookGroupPage ? 'is-active' : undefined}
                      aria-current={page === currentFacebookGroupPage ? 'page' : undefined}
                      disabled={facebookSettingsState === 'SAVING'}
                      onClick={() => changeFacebookGroupPage(page)}
                    >
                      {page}
                    </button>
                  ) : (
                    <span
                      key={`facebook-group-ellipsis-${page.type}-${page.key}`}
                      className="facebook-group-pagination-ellipsis"
                      aria-hidden="true"
                    >
                      ...
                    </span>
                  )
                ))}
                <button
                  type="button"
                  title="Trang sau"
                  aria-label="Trang sau danh sách nhóm Facebook"
                  disabled={currentFacebookGroupPage >= facebookGroupPageCount || facebookSettingsState === 'SAVING'}
                  onClick={() => changeFacebookGroupPage(currentFacebookGroupPage + 1)}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </dialog>
    );
  }

  function renderFacebookGroupEditModal() {
    if (!selectedFacebookGroup) return null;

    return (
      <dialog
        className="facebook-group-modal facebook-group-edit-modal"
        open
        aria-modal="true"
        aria-labelledby="facebook-group-edit-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="facebook-group-edit-title">Chỉnh sửa thông tin nhóm Facebook</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng"
            disabled={facebookSettingsState === 'SAVING'}
            onClick={closeFacebookGroupActionModal}
          >
            <CloseIcon />
          </button>
        </header>
        <form className="modal-body facebook-group-form is-standalone" onSubmit={(event) => void submitFacebookGroupEdit(event)}>
          {facebookSettingsMessage ? (
            <p className={`modal-status${facebookSettingsState === 'ERROR' ? ' is-error' : ''}`}>
              {facebookSettingsMessage}
            </p>
          ) : null}
          <label>
            <span className="facebook-group-field-label">
              Tên nhóm <span className="facebook-group-required-mark" aria-hidden="true">*</span>
            </span>
            <input
              value={editFacebookGroupName}
              maxLength={255}
              placeholder="Hội Dev Java VN"
              required
              disabled={facebookSettingsState === 'SAVING'}
              onChange={(event) => setEditFacebookGroupName(event.target.value)}
            />
          </label>
          <label>
            <span className="facebook-group-field-label">Link URL</span>
            {editFacebookGroupUrl ? (
              <a className="facebook-group-edit-url" href={editFacebookGroupUrl} target="_blank" rel="noreferrer">
                {editFacebookGroupUrl}
              </a>
            ) : (
              <span className="facebook-group-edit-url is-empty">Chưa có URL</span>
            )}
          </label>
          <div className="form-actions">
            <button type="button" className="text-button" disabled={facebookSettingsState === 'SAVING'} onClick={closeFacebookGroupActionModal}>
              HỦY
            </button>
            <button type="submit" className="facebook-group-edit-save-button" disabled={facebookSettingsState === 'SAVING'}>
              <SaveIcon />
              <span>{facebookSettingsState === 'SAVING' ? 'Đang lưu...' : 'LƯU'}</span>
            </button>
          </div>
        </form>
      </dialog>
    );
  }

  function renderFacebookGroupDeleteModal() {
    if (!selectedFacebookGroup) return null;

    return (
      <dialog
        className="facebook-group-modal delete-group-modal"
        open
        aria-modal="true"
        aria-labelledby="facebook-group-delete-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="facebook-group-delete-title">Xác nhận xóa nhóm</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng"
            disabled={facebookSettingsState === 'SAVING'}
            onClick={closeFacebookGroupActionModal}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body delete-confirm-body">
          <div className="warning-icon"><WarningIcon /></div>
          <div className="delete-copy">
            <h3>Bạn có chắc chắn muốn xóa nhóm này không?</h3>
            <p>Hành động này không thể hoàn tác và dữ liệu liên quan sẽ bị mất.</p>
          </div>
          <div className="delete-target-preview">
            <span>Nhóm sẽ bị xóa:</span>
            <strong>{selectedFacebookGroup.targetName}</strong>
          </div>
          {facebookSettingsMessage ? (
            <p className={`modal-status${facebookSettingsState === 'ERROR' ? ' is-error' : ''}`}>
              {facebookSettingsMessage}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="text-button" disabled={facebookSettingsState === 'SAVING'} onClick={closeFacebookGroupActionModal}>
              Hủy
            </button>
            <button type="button" className="danger-button compact-button" disabled={facebookSettingsState === 'SAVING'} onClick={() => void confirmDeleteFacebookGroup()}>
              {facebookSettingsState === 'SAVING' ? 'Đang xóa...' : 'Xác nhận'}
            </button>
          </div>
        </div>
      </dialog>
    );
  }

  function renderFacebookSettingsOverlay() {
    if (!isFacebookSettingsOpen || isFacebookGroupFormOpen) return null;

    return (
      <div className="modal-backdrop">
        {facebookGroupModalMode === 'SETTINGS' ? renderFacebookGroupSettingsModal() : null}
        {facebookGroupModalMode === 'EDIT' ? renderFacebookGroupEditModal() : null}
        {facebookGroupModalMode === 'DELETE' ? renderFacebookGroupDeleteModal() : null}
      </div>
    );
  }

  function renderFacebookIneligibleOverlay() {
    if (!isFacebookGroupSyncDetailsOpen) return null;

    return (
      <div className="modal-backdrop">
        <dialog
          open
          className="facebook-group-modal facebook-ineligible-modal"
          aria-modal="true"
          aria-labelledby="facebook-group-sync-details-title"
        >
          <header className="modal-header facebook-ineligible-modal-header">
            <div className="facebook-ineligible-modal-heading">
              <h2 id="facebook-group-sync-details-title">DANH SÁCH NHÓM KHÔNG PHÙ HỢP</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Đóng"
              aria-label="Đóng danh sách nhóm không phù hợp"
              onClick={() => setIsFacebookGroupSyncDetailsOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="modal-body facebook-ineligible-modal-body">
            <div className="facebook-ineligible-modal-total">
              <span>{`${facebookIneligibleTotalItems} nhóm không phù hợp / ${facebookIneligibleTotalGroupCount} nhóm`}</span>
            </div>
            <div className="facebook-ineligible-modal-list">
              {facebookIneligiblePageItems.length > 0 ? (
                facebookIneligiblePageItems.map((group) => {
                  const groupKey = getFacebookGroupDetailKey(group);
                  const isAdding = manualIncludingFacebookGroupKeys.includes(groupKey);
                  return (
                    <div className="facebook-ineligible-modal-item" key={groupKey}>
                      <div className="facebook-ineligible-modal-copy">
                        <strong>{group.name}</strong>
                        {group.reason ? <span>{group.reason}</span> : null}
                      </div>
                      <div className="facebook-ineligible-modal-actions">
                        <button
                          type="button"
                          className="facebook-ineligible-open-link"
                          disabled={!group.url}
                          onClick={() => {
                            if (group.url) window.open(group.url, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          Mở trong tab mới
                        </button>
                        <button
                          type="button"
                          className="facebook-ineligible-add-button"
                          disabled={isAdding || !group.url}
                          onClick={() => void handleManuallyIncludeFacebookGroup(group)}
                        >
                          {isAdding ? 'Đang thêm...' : 'Thêm nhóm'}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="channel-subselection-empty">Không có nhóm không phù hợp.</p>
              )}
              {facebookIneligibleTotalItems > 0 ? (
                <div className="facebook-ineligible-modal-pagination">
                  <div className="facebook-ineligible-modal-pagination-summary">
                    <span>{`Hiển thị từ ${facebookIneligibleVisibleStart} - ${facebookIneligibleVisibleEnd} của ${facebookIneligibleTotalItems} kết quả`}</span>
                  </div>
                  <div className="facebook-ineligible-modal-pagination-actions">
                    <div className="facebook-ineligible-modal-pagination-buttons">
                      <button
                        type="button"
                        title="Trang trước"
                        aria-label="Trang trước danh sách nhóm không phù hợp"
                        disabled={currentFacebookIneligiblePage <= 1}
                        onClick={() => setFacebookIneligiblePage((page) => Math.max(1, page - 1))}
                      >
                        <BackIcon />
                      </button>
                      {facebookIneligiblePaginationItems.map((page) => (
                        typeof page === 'number' ? (
                          <button
                            key={page}
                            type="button"
                            className={page === currentFacebookIneligiblePage ? 'is-active' : undefined}
                            aria-current={page === currentFacebookIneligiblePage ? 'page' : undefined}
                            onClick={() => setFacebookIneligiblePage(page)}
                          >
                            {page}
                          </button>
                        ) : (
                          <span key={page} className="facebook-ineligible-modal-pagination-ellipsis">...</span>
                        )
                      ))}
                      <button
                        type="button"
                        title="Trang sau"
                        aria-label="Trang sau danh sách nhóm không phù hợp"
                        disabled={currentFacebookIneligiblePage >= facebookIneligiblePageCount}
                        onClick={() => setFacebookIneligiblePage((page) => Math.min(facebookIneligiblePageCount, page + 1))}
                      >
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </dialog>
      </div>
    );
  }
  function renderExtensionOverlays() {
    return (
      <>
        {renderExtensionToast()}
        {facebookPreviewModalMode ? renderFacebookPreviewModal() : null}
        {renderFacebookSettingsOverlay()}
        {isFacebookSettingsOpen && isFacebookGroupFormOpen ? renderFacebookGroupCreateModal() : null}
        {facebookImageAttachPrompt ? renderFacebookImageAttachPromptModal() : null}
        {renderFacebookIneligibleOverlay()}
        {selectedFacebookHistoryGroup ? renderFacebookPostHistoryModal() : null}
      </>
    );
  }

  return (
    <main className="extension-shell" style={{ '--extension-ui-zoom': extensionUiZoom } as React.CSSProperties}>
      <section className="extension-window">
        {renderExtensionHeader()}
        {renderExtensionWorkspace()}
      </section>
      {renderExtensionOverlays()}
    </main>
  );
}
function getChannelPostingStatusClass(channel: ChannelPostingResult) {
  const status = channel.status.toUpperCase();
  if (['CREATED', 'PUBLISHED', 'UPDATED', 'SUCCESS'].includes(status)) return 'is-success';
  if (['NOT_CONFIGURED', 'MANUAL_REQUIRED', 'SKIPPED', 'PENDING'].includes(status)) return 'is-muted';
  if (status.includes('FAIL') || status.includes('ERROR')) return 'is-error';
  return 'is-warning';
}

type PostHistoryPaginationItem = number | 'ellipsis-left' | 'ellipsis-right';
type CompactPaginationItem = number | { type: 'ellipsis'; key: 'leading' | 'trailing' };

function getPostHistoryPaginationWindow(currentPage: number, pageCount: number) {
  if (currentPage <= 4) return { start: 2, end: 5 };
  if (currentPage >= pageCount - 3) return { start: pageCount - 4, end: pageCount - 1 };
  return { start: currentPage - 1, end: currentPage + 1 };
}

function appendPostHistoryPageRange(items: PostHistoryPaginationItem[], start: number, end: number) {
  for (let page = start; page <= end; page += 1) items.push(page);
}

function appendPostHistoryLeadingGap(items: PostHistoryPaginationItem[], start: number) {
  if (start > 2) {
    items.push('ellipsis-left');
    return;
  }
  appendPostHistoryPageRange(items, 2, start - 1);
}

function appendPostHistoryTrailingGap(items: PostHistoryPaginationItem[], end: number, pageCount: number) {
  if (end < pageCount - 1) {
    items.push('ellipsis-right');
    return;
  }
  appendPostHistoryPageRange(items, end + 1, pageCount - 1);
}

function buildPostHistoryPaginationItems(currentPage: number, pageCount: number): PostHistoryPaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: PostHistoryPaginationItem[] = [1];
  const { start, end } = getPostHistoryPaginationWindow(currentPage, pageCount);
  appendPostHistoryLeadingGap(items, start);
  appendPostHistoryPageRange(items, start, end);
  appendPostHistoryTrailingGap(items, end, pageCount);

  items.push(pageCount);
  return items;
}

function buildFacebookIneligiblePaginationItems(
  currentPage: number,
  pageCount: number,
): PostHistoryPaginationItem[] {
  if (pageCount <= 6) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), pageCount);
  const items: PostHistoryPaginationItem[] = [];
  const appendPage = (page: number) => {
    if (page >= 1 && page <= pageCount && !items.includes(page)) {
      items.push(page);
    }
  };

  if (safeCurrentPage <= 2) {
    appendPage(1);
    appendPage(2);
    appendPage(3);
  } else if (safeCurrentPage === 3) {
    appendPage(1);
    appendPage(2);
    appendPage(3);
    appendPage(4);
  } else if (safeCurrentPage >= pageCount - 2) {
    appendPage(1);
    if (pageCount > 6) items.push('ellipsis-left');
    for (let page = pageCount - 3; page <= pageCount; page += 1) {
      appendPage(page);
    }
    return items;
  } else {
    for (let page = safeCurrentPage - 1; page <= safeCurrentPage + 2; page += 1) {
      appendPage(page);
    }
  }

  if (!items.includes(pageCount - 1) && !items.includes(pageCount)) {
    items.push('ellipsis-right');
  }
  appendPage(pageCount - 1);
  appendPage(pageCount);
  return items;
}

function isRefreshableFacebookHistoryItem(item: FacebookPublishHistoryListItem) {
  return (
    (item.facebookReviewStatus === 'PENDING_REVIEW' || item.facebookReviewStatus === 'UNKNOWN')
    && Boolean(getValidFacebookGroupPostUrl(item.externalPostUrl) || item.targetUrl?.trim())
  );
}

function withFacebookHistoryGroupFallback(
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

function normalizePostingChannels(channels: ExtensionChannel[]) {
  const seen = new Set<ExtensionChannel>();
  const normalized = channels.filter((channel) => {
    if (!POSTING_CHANNEL_SET.has(channel) || seen.has(channel)) return false;
    seen.add(channel);
    return true;
  });

  return normalized.length > 0
    ? normalized
    : [...DEFAULT_POSTING_CHANNELS];
}

function formatChannelLabel(channel: ExtensionChannel) {
  switch (channel) {
    case 'FACEBOOK':
      return 'FACEBOOK';
    case 'TOPCV':
      return 'TOPCV';
    case 'LINKEDIN':
      return 'LINKEDIN';
    case 'VCS_PORTAL':
      return 'VCS_PORTAL';
    case 'ITVIEC':
      return 'ITVIEC';
    case 'VIETNAMWORKS':
      return 'VIETNAMWORKS';
    default:
      return channel;
  }
}

function buildCompactPaginationPages(currentPage: number, totalPages: number): CompactPaginationItem[] {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }

  if (safeCurrent <= 2) {
    return [1, 2, 3, { type: 'ellipsis', key: 'trailing' }, safeTotal - 1, safeTotal];
  }

  if (safeCurrent === 3) {
    return [2, 3, 4, { type: 'ellipsis', key: 'trailing' }, safeTotal - 1, safeTotal];
  }

  if (safeCurrent >= safeTotal - 2) {
    return [1, 2, { type: 'ellipsis', key: 'leading' }, safeTotal - 2, safeTotal - 1, safeTotal];
  }

  return [
    1,
    2,
    { type: 'ellipsis', key: 'leading' },
    safeCurrent - 1,
    safeCurrent,
    safeCurrent + 1,
    { type: 'ellipsis', key: 'trailing' },
    safeTotal - 1,
    safeTotal,
  ];
}

function getJobDescriptionStatusBadge(jobDescription: JobDescriptionSummary) {
  const status = normalizeStatus(jobDescription.status);
  if (status.includes('ARCHIVED') || status.includes('STOP') || status.includes('INACTIVE')) {
    return { label: 'Ngừng tuyển', className: 'status-badge-danger' };
  }
  if (status.includes('CLOSED') || status.includes('CLOSE')) {
    return { label: 'Đóng', className: 'status-badge-muted' };
  }
  if (status.includes('DRAFT') || status.includes('PRIVATE') || status.includes('INTERNAL')) {
    return { label: 'Nội bộ', className: 'status-badge-info' };
  }
  return { label: 'Công khai', className: 'status-badge-success' };
}

function toFacebookGroupUiItem(group: FacebookPublishTarget): FacebookGroupUiItem {
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

function replaceFacebookGroup(groups: FacebookPublishTarget[], updatedGroup: FacebookPublishTarget) {
  const updatedId = updatedGroup.targetId;
  const index = updatedId ? groups.findIndex((group) => group.targetId === updatedId) : -1;
  if (index < 0) return sortFacebookGroupsByDiscovery([...groups, updatedGroup]);

  return sortFacebookGroupsByDiscovery(groups.map((group, groupIndex) => (groupIndex === index ? updatedGroup : group)));
}

function getFacebookHistoryStatusLabel(status: Exclude<FacebookPostHistoryFilter, 'ALL'>) {
  if (status === 'PENDING_REVIEW') return 'Chờ duyệt';
  if (status === 'REJECTED') return 'Bị từ chối';
  if (status === 'DELETED') return 'Đã xóa';
  if (status === 'UNKNOWN') return 'Không rõ';
  return 'Đã đăng';
}

function getFacebookImageFileValidationError(file: File) {
  if (!FACEBOOK_IMAGE_ALLOWED_TYPES.has(file.type)) {
    return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.';
  }

  if (file.size > FACEBOOK_IMAGE_MAX_SIZE_BYTES) {
    return `Ảnh phải nhỏ hơn ${formatFileSize(FACEBOOK_IMAGE_MAX_SIZE_BYTES)}.`;
  }

  return null;
}

function getFacebookImageContentKey(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(',');
  return (separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl).trim();
}

function deduplicateFacebookImageAttachments(attachments: FacebookPublishAttachment[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const contentKey = getFacebookImageContentKey(attachment.dataUrl);
    if (!contentKey || seen.has(contentKey)) return false;
    seen.add(contentKey);
    return true;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${size} B`;
}

function isSelectableFacebookGroup(group: FacebookPublishTarget) {
  return Boolean(
    group.targetId
    && group.selectable
    && group.eligibilityStatus === 'CAN_POST'
    && !group.quotaExceeded,
  );
}

function isPublishableFacebookGroup(group: FacebookPublishTarget) {
  return isSelectableFacebookGroup(group);
}

function countItRecruitmentFacebookGroups(groups: FacebookPublishTarget[]) {
  return groups.length;
}

function buildFacebookGroupSelectionMessage(
  selectedIds: string[],
  groups: FacebookPublishTarget[],
  prefix?: string | null,
) {
  const validCount = countItRecruitmentFacebookGroups(groups);
  const validGroupIds = new Set(groups.map((group) => group.targetId).filter(isString));
  const selectedValidCount = uniqueStrings(selectedIds).filter((targetId) => validGroupIds.has(targetId)).length;
  const message = validCount > 0
    ? `${selectedValidCount}/${validCount} nhóm Facebook đã được chọn`
    : 'Không có nhóm Facebook nào.';

  return prefix ? `${prefix}. ${message}` : message;
}

function getFacebookEligibilityLabel(status?: FacebookPublishTargetEligibilityStatus | null) {
  return status === 'CAN_POST' ? 'Có thể đăng' : 'Không thể đăng';
}

function getFacebookGroupBadgeClass(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'is-success';
  return 'is-danger';
}

function getFacebookGroupDisabledReason(group: FacebookPublishTarget) {
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

function isAmbiguousFacebookComposerVerificationReason(reason: string) {
  const normalizedReason = reason.toLowerCase();
  return normalizedReason.includes('composermatches=')
    || normalizedReason.includes('hidden and visible verification could not prove posting eligibility')
    || normalizedReason.includes('could not open facebook group post composer automatically')
    || normalizedReason.includes('could not verify facebook group composer automatically');
}

function toErrorMessage(error: unknown) {
  return toVietnameseErrorMessage(error);
}

function isDuplicateFacebookGroupError(error: unknown) {
  return error instanceof ApiClientError && error.code === 'FACEBOOK_GROUP_ALREADY_EXISTS';
}

function getFacebookGroupUrlValidationError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  if (!isFacebookGroupUrlCandidate(value)) {
    return 'Nhập sai định dạng URL nhóm Facebook. Vui lòng thử lại';
  }

  return getDuplicateFacebookGroupUrlError(value, groups, currentTargetId);
}

function sortFacebookGroupsByDiscovery(groups: FacebookPublishTarget[]) {
  return [...groups].sort((left, right) => {
    const leftTime = left.lastDiscoveredAt ? Date.parse(left.lastDiscoveredAt) : Number.NaN;
    const rightTime = right.lastDiscoveredAt ? Date.parse(right.lastDiscoveredAt) : Number.NaN;

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

function getDuplicateFacebookGroupUrlError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  const externalId = readFacebookGroupExternalId(value);
  if (!externalId) return null;

  const existingGroup = groups.find((group) => (
    normalizeFacebookGroupExternalId(group.targetExternalId) === externalId
    && group.targetId !== currentTargetId
  ));

  return existingGroup ? 'Link URL không được trùng với nhóm đã tồn tại trong hệ thống.' : null;
}

function isFacebookGroupUrlCandidate(value: string) {
  return Boolean(readFacebookGroupExternalId(value));
}

function readFacebookGroupExternalId(value: string) {
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

function normalizeFacebookGroupExternalId(value: string | null | undefined) {
  if (!value) return null;

  try {
    return decodeURIComponent(value).trim().toLowerCase() || null;
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

function uniqueStrings(value: string[]) {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function uniqueDiscoveredGroups(groups: DiscoveredFacebookGroupItem[]) {
  const grouped = new Map<string, DiscoveredFacebookGroupItem>();
  for (const group of groups) {
    const key = normalizeFacebookGroupExternalId(group.targetExternalId);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, group);
  }
  return Array.from(grouped.values());
}

function buildFacebookGroupDiscoverMessage(result: DiscoverFacebookGroupsResponse) {
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

function getFacebookGroupDetailKey(group: FacebookGroupSyncDetailItem) {
  return group.externalId ?? group.url ?? group.name;
}

function buildFacebookGroupSyncDetails(result: DiscoverFacebookGroupsResponse): FacebookGroupSyncDetails | null {
  const accepted = result.items
    .filter((item) => item.action === 'created' || item.action === 'updated' || item.action === 'reused')
    .map((item) => {
      let reason = 'Đã có sẵn trong hệ thống.';
      if (item.action === 'created') {
        reason = 'Đã thêm mới.';
      } else if (item.action === 'updated') {
        reason = 'Đã cập nhật.';
      }
      return {
        name: item.targetName,
        externalId: item.targetExternalId,
        reason,
      };
    });
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
  ) return null;
  return {
    requested: result.requested,
    accepted,
    removed,
    reactivated,
    filtered,
    skipped,
    errors,
  };
}

const FACEBOOK_GROUP_ACTIVITY_MARKERS = [
  'lần hoạt động gần nhất',
  'đã tham gia gần đây',
  'đã tham gia',
];
const FACEBOOK_GROUP_NAME_SEPARATORS = ['-', '–', '—', '|', '·', ':'];

function trimFacebookGroupActivitySuffix(value: string): string | null {
  const lower = value.toLowerCase();
  for (const marker of FACEBOOK_GROUP_ACTIVITY_MARKERS) {
    const markerIndex = lower.indexOf(marker);
    if (markerIndex < 0) continue;
    const openingParenthesis = lower.lastIndexOf('(', markerIndex);
    const closingParenthesis = lower.lastIndexOf(')', markerIndex);
    const cutIndex = openingParenthesis > closingParenthesis ? openingParenthesis : markerIndex;
    let normalized = value.slice(0, cutIndex).trim();
    while (FACEBOOK_GROUP_NAME_SEPARATORS.includes(normalized.at(-1) ?? '')) {
      normalized = normalized.slice(0, -1).trimEnd();
    }
    return normalized;
  }
  return null;
}

function stripFacebookGroupYearSuffix(value: string) {
  const yearMarker = 'năm trước';
  const yearMarkerIndex = value.toLowerCase().indexOf(yearMarker);
  if (yearMarkerIndex < 0) return value;

  const beforeYearMarker = value.slice(0, yearMarkerIndex).trim();
  const separatorIndex = FACEBOOK_GROUP_NAME_SEPARATORS.reduce(
    (lastIndex, separator) => Math.max(lastIndex, beforeYearMarker.lastIndexOf(separator)),
    -1,
  );
  if (separatorIndex < 0) return value;

  const numberText = beforeYearMarker.slice(separatorIndex + 1).trim();
  const isNumber = numberText.length > 0
    && [...numberText].every((character) => character >= '0' && character <= '9');
  return isNumber ? beforeYearMarker.slice(0, separatorIndex).trim() : value;
}

function stripFacebookGroupNameNoise(value: string) {
  let normalized = value.replace(/\s+/g, ' ').trim();
  while (true) {
    const trimmedValue = trimFacebookGroupActivitySuffix(normalized);
    if (trimmedValue === null) break;
    normalized = trimmedValue;
  }

  const allGroupsSuffix = ' xem tất cả';
  if (normalized.toLowerCase().endsWith(allGroupsSuffix)) {
    normalized = normalized.slice(0, -allGroupsSuffix.length).trim();
  }
  return stripFacebookGroupYearSuffix(normalized);
}

type FacebookGroupScanCandidate = {
  targetName: string;
  targetUrl: string;
  targetExternalId: string;
  order: number;
};

type FacebookGroupScrollPassOptions = {
  collected: Map<string, FacebookGroupScanCandidate>;
  revealRoot: ParentNode;
  collect: () => Map<string, FacebookGroupScanCandidate>;
  revealHiddenListItems: (root: ParentNode) => number;
  discoverScrollHosts: () => void;
  mergeCurrentGroups: () => void;
  scrollAllHosts: () => Promise<{ moved: boolean; heightChanged: boolean }>;
  sleepMs: (ms: number) => Promise<void>;
};

async function runFacebookGroupScrollPasses({
  collected,
  revealRoot,
  collect,
  revealHiddenListItems,
  discoverScrollHosts,
  mergeCurrentGroups,
  scrollAllHosts,
  sleepMs,
}: FacebookGroupScrollPassOptions) {
  let stablePasses = 0;
  let attempts = 0;
  const maxAttempts = 40;

  while (attempts < maxAttempts && stablePasses < 5) {
    const beforeSize = collected.size;
    mergeCurrentGroups();

    const revealClicks = revealHiddenListItems(revealRoot);
    if (revealClicks > 0) await sleepMs(1000);
    discoverScrollHosts();

    const afterSize = collected.size;
    const sizeChanged = afterSize > beforeSize || revealClicks > 0;
    attempts += 1;
    const { moved, heightChanged } = await scrollAllHosts();

    const afterScrollSize = collect().size;
    const groupsLoadedAfterScroll = afterScrollSize > afterSize;
    if (sizeChanged || groupsLoadedAfterScroll || moved || heightChanged) stablePasses = 0;
    else stablePasses += 1;
  }

  return stablePasses;
}

async function collectFacebookGroupsFromPage(): Promise<FacebookGroupsScanRunResult> {
  const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const normalizeText = (value: string | null | undefined) => {
    if (!value) return null;
    return value.replace(/\s+/g, ' ').trim();
  };

  const normalizeForMatch = (value: string | null | undefined) => {
    const normalized = normalizeText(value)?.toLowerCase();
    if (!normalized) return null;
    return normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  const decodePathSegment = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const headingKeywords = [
    'nhóm bạn đã tham gia',
    'nhóm đã tham gia',
    'tất cả các nhóm bạn đã tham gia',
    'tất cả nhóm bạn đã tham gia',
    'các nhóm của bạn',
    'your joined groups',
    'groups you joined',
    'groups youve joined',
    'all groups you joined',
    "all groups you've joined",
    'joined groups',
    'your groups',
  ];

  const ignoreNameTokens = new Set([
    'bảng feed của bạn',
    'nhóm của bạn',
    'nhóm của tôi',
    'nhóm của chúng tôi',
    'news feed',
    'feed của bạn',
    'your groups',
    'your joined groups',
    'joined groups',
    'groups you joined',
    'groups youve joined',
    'xem tất cả',
    'xem nhóm',
    'see more',
    'view group',
    'open group',
    'visit group',
    'go to group',
    'xem thêm',
    'more',
  ]);

  const ignoredGroupPathSegments = new Set([
    'help',
    'create',
    'discover',
    'directory',
    'news',
    'saved',
    'settings',
    'feed',
    'group',
    'groups',
    'join',
    'join_group',
    'your_groups',
    'joined_groups',
  ]);

  const revealGroupListButtonPatterns = [
    /\bxem tất cả\b/i,
    /\bxem thêm\b/i,
    /\bsee more\b/i,
    /\bview more\b/i,
    /\bshow more\b/i,
    /\bmore\b/i,
    /\bxem toàn bộ\b/i,
    /\ball groups\b/i,
  ];

  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  const queryAnchors = (root: ParentNode) => Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[];

  const countAllGroupAnchors = (root: ParentNode) => {
    let total = 0;
    const anchors = queryAnchors(root);
    for (const anchor of anchors) {
      if (parseGroupFromUrl(anchor.href)) total += 1;
    }
    return total;
  };

  const readElementText = (element: Element | null) => {
    if (!element) return null;
    return (element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
      || ''
    ).trim();
  };

  const getNormalizedLabel = (element: Element | null) => {
    if (!element) return '';
    return normalizeForMatch(readElementText(element) || '');
  };

  const isRevealButton = (element: Element) => {
    const normalizedLabel = getNormalizedLabel(element);
    if (!normalizedLabel) return false;
    return revealGroupListButtonPatterns.some((pattern) => pattern.test(normalizedLabel));
  };

  const clickIfReveal = (element: Element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (!isVisible(element)) return false;
    if (element.getAttribute('aria-disabled') === 'true' || element.getAttribute('disabled') !== null) return false;

    try {
      element.click();
      return true;
    } catch {
      try {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      } catch {
        return false;
      }
    }
  };

  const revealHiddenListItems = (root: ParentNode) => {
    const candidates = Array.from(root.querySelectorAll('a,button,[role="button"]')) as Element[];
    let clicked = 0;
    const clickedKeys = new Set<string>();

    for (const candidate of candidates) {
      if (!isRevealButton(candidate)) continue;

      const candidateKey = getNormalizedLabel(candidate);
      if (!candidateKey || clickedKeys.has(candidateKey)) continue;
      clickedKeys.add(candidateKey);

      if (clickIfReveal(candidate)) {
        clicked += 1;
      }
    }

    return clicked;
  };

  const isSectionHeading = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return false;
    return headingKeywords.some((keyword) => {
      const normalizedKeyword = normalizeForMatch(keyword);
      if (!normalizedKeyword) return false;
      return normalized === normalizedKeyword
        || normalized.startsWith(`${normalizedKeyword} `)
        || normalized.includes(` ${normalizedKeyword} `)
        || normalized.endsWith(` ${normalizedKeyword}`);
    });
  };

  const isNoiseGroupName = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return true;
    return Array.from(ignoreNameTokens).some((token) => {
      const normalizedToken = normalizeForMatch(token);
      if (!normalizedToken) return false;
      return normalized === normalizedToken
        || normalized.startsWith(`${normalizedToken} `)
        || normalized.endsWith(` ${normalizedToken}`)
        || normalized.includes(` ${normalizedToken} `);
    });
  };

  const normalizeGroupId = (value: string | null | undefined) => {
    if (!value) return null;
    const decoded = decodePathSegment(value).trim().toLowerCase();
    if (!decoded.length) return null;
    return ignoredGroupPathSegments.has(decoded) ? null : decoded;
  };

  const parseGroupFromUrl = (rawHref: string) => {
    try {
      const parsed = new URL(rawHref, window.location.href);
      const isFacebookHost = parsed.hostname === 'facebook.com' || parsed.hostname.endsWith('.facebook.com');
      if (!isFacebookHost) return null;

      const match = parsed.pathname.match(/^\/groups\/([^/?#]+)/i);
      if (!match) return null;

      const targetExternalId = normalizeGroupId(match[1]);
      if (!targetExternalId) return null;

      return {
        targetUrl: `https://www.facebook.com/groups/${encodeURIComponent(targetExternalId)}`,
        targetExternalId,
      };
    } catch {
      return null;
    }
  };

  const sanitizeName = (rawName: string) => {
    return stripFacebookGroupNameNoise(rawName);
  };

  const getNameFromAnchor = (anchor: HTMLAnchorElement, fallbackTargetExternalId?: string) => {
    const rawName = (
      anchor.getAttribute('aria-label')
      || anchor.getAttribute('title')
      || anchor.textContent
      || ''
    );
    const sanitized = sanitizeName(rawName || fallbackTargetExternalId || '');
    if (!sanitized || isNoiseGroupName(sanitized)) return null;
    return sanitized.slice(0, 240);
  };

  const collectFromScope = (scope: ParentNode) => {
    const results = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string; order: number }>();
    const anchors = queryAnchors(scope);

    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      if (!isVisible(anchor)) continue;

      const parsed = parseGroupFromUrl(anchor.href);
      if (!parsed) continue;
      const targetName = getNameFromAnchor(anchor, parsed.targetExternalId);
      if (!targetName) continue;

      if (!results.has(parsed.targetExternalId)) {
        results.set(parsed.targetExternalId, {
          targetName,
          targetUrl: parsed.targetUrl,
          targetExternalId: parsed.targetExternalId,
          order: index,
        });
      }
    }

    return results;
  };

  const evaluateScope = (node: Element | null) => {
    if (!node || !isVisible(node)) return -Infinity;
    const anchors = queryAnchors(node);
    let matched = 0;
    let unmatched = 0;
    let candidateDepthPenalty = 0;

    let depthNode: Element | null = node;
    while (depthNode && depthNode.parentElement) {
      candidateDepthPenalty += 1;
      depthNode = depthNode.parentElement;
    }

    for (const anchor of anchors) {
      if (!isVisible(anchor)) continue;
      const parsed = parseGroupFromUrl(anchor.href);
      if (!parsed) continue;
      matched += 1;
      const rawName = getNameFromAnchor(anchor);
      if (!rawName) unmatched += 1;
    }

    return matched * 10 - unmatched * 2 - Math.min(candidateDepthPenalty, 20);
  };

  const findJoinedSectionRoot = () => {
    const headingCandidates = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p, a, [role="heading"]'),
    ).filter((node) => isSectionHeading(readElementText(node) || node.textContent || ''));

    let best: Element | null = null;
    let bestScore = -Infinity;

    for (const heading of headingCandidates) {
      if (!isVisible(heading)) continue;
      let node: Element | null = heading;
      for (let depth = 0; depth < 16 && node; depth += 1) {
        const score = evaluateScope(node);
        if (score > bestScore) {
          bestScore = score;
          best = node;
        }
        node = node.parentElement;
      }
    }

    if (best) {
      return best;
    }

    // Fallback: prefer a right-side navigation block with many group links.
    const navCandidates = Array.from(
      document.querySelectorAll('nav, [role="navigation"], [role="complementary"]'),
    );
    let fallback: Element | null = null;
    let fallbackScore = -Infinity;
    for (const candidate of navCandidates) {
      const score = evaluateScope(candidate);
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = candidate;
      }
    }
    return fallback;
  };

  const findJoinedSectionRootByDensity = () => {
    const candidates = Array.from(document.querySelectorAll('div, section, aside, nav, ul, ol'));
    let best: Element | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;

      const rect = candidate.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;

      const groupAnchors = countAllGroupAnchors(candidate);
      if (groupAnchors < 5) continue;

      const score = groupAnchors * 10 - Math.abs(rect.width - 360) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  };

  const readExpectedJoinedGroupCount = () => {
    const headingText = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'),
    )
      .map((node) => normalizeText(node.textContent))
      .find((text) => text && /(?:tất cả các nhóm bạn đã tham gia|all groups you joined)/i.test(text));
    const sourceText = headingText || normalizeText(document.body?.innerText) || '';
    const match = sourceText.match(/(?:tất cả các nhóm bạn đã tham gia|all groups you joined)[^\d]{0,32}(\d{1,4})/i);
    return match ? Number(match[1]) : null;
  };

  const pickScrollableHost = (scope: Element | null) => {
    if (!scope) return null;
    let current: Element | null = scope;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      if (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && current.scrollHeight > current.clientHeight + 80
        && countAllGroupAnchors(current) > 0
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return document.documentElement;
  };

  const normalizeCanonicalTitle = (raw: string | null | undefined) => {
    const normalized = normalizeText(raw);
    if (!normalized) return null;
    for (const separator of ['|', '-']) {
      const separatorIndex = normalized.lastIndexOf(separator);
      if (separatorIndex < 0) continue;
      const suffix = normalized.slice(separatorIndex + 1).trim().toLowerCase();
      if (suffix.startsWith('facebook') || suffix.startsWith('meta')) {
        return normalized.slice(0, separatorIndex).trim();
      }
    }
    return normalized;
  };

  const parseGroupPageCanonicalName = async (groupUrl: string, fallback: string) => {
    try {
      const response = await fetch(groupUrl, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) return fallback;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rawTitle = (
        doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
        || doc.querySelector('title')?.textContent
        || doc.querySelector('h1')?.textContent
        || ''
      );
      const normalized = normalizeCanonicalTitle(rawTitle);
      if (!normalized || isNoiseGroupName(normalized)) return fallback;
      return normalized.slice(0, 240);
    } catch {
      return fallback;
    }
  };

  const shouldResolveCanonicalName = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return true;
    if (normalizeForMatch('xem tất cả') === normalized) return true;
    if (/^[0-9]+$/.test(normalized)) return true;
    return false;
  };

  const sectionRoot = findJoinedSectionRoot();
  const fallbackSectionRoot = sectionRoot ? null : findJoinedSectionRootByDensity();
  const scanScope: ParentNode = sectionRoot ?? fallbackSectionRoot ?? document;
  const expectedCount = readExpectedJoinedGroupCount();

  const collect = () => {
    const output = collectFromScope(scanScope);
    const pageWide = collectFromScope(document);

    pageWide.forEach((group, key) => {
      if (!output.has(key)) output.set(key, group);
    });

    return output;
  };

  const collected = new Map<string, FacebookGroupScanCandidate>(collect());
  const scrollScope = sectionRoot ?? fallbackSectionRoot;
  const scrollHost = pickScrollableHost(scrollScope instanceof Element ? scrollScope : document.documentElement);
  const scrollHosts: Element[] = [];
  const addScrollHost = (candidate: Element | null) => {
    if (!candidate || scrollHosts.includes(candidate)) return;
    scrollHosts.push(candidate);
  };

  const discoverScrollHosts = () => {
    // Facebook can render the joined-group sidebar and the all-groups grid in
    // separate scroll containers. Scanning only the heading's ancestor misses
    // the virtualized cards that are loaded while the main page scrolls.
    addScrollHost(scrollHost);
    const documentHost = document.documentElement;
    if (documentHost.scrollHeight > documentHost.clientHeight + 80) {
      addScrollHost(documentHost);
    }

    for (const anchor of queryAnchors(document)) {
      if (!parseGroupFromUrl(anchor.href)) continue;

      let ancestor = anchor.parentElement;
      for (let depth = 0; depth < 12 && ancestor; depth += 1) {
        const style = window.getComputedStyle(ancestor);
        const overflowY = style.overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
          && ancestor.scrollHeight > ancestor.clientHeight + 80
        ) {
          addScrollHost(ancestor);
        }
        ancestor = ancestor.parentElement;
      }
    }
  };

  discoverScrollHosts();

  const previousScrollHeights = new Map<Element, number>();
  const mergeCurrentGroups = () => {
    const now = collect();
    now.forEach((group, key) => {
      if (!collected.has(key)) collected.set(key, group);
    });
  };

  const scrollAllHosts = async () => {
    let moved = false;
    let heightChanged = false;

    for (const host of scrollHosts) {
      const isDocumentHost = host === document.documentElement || host === document.body;
      const beforeScrollTop = isDocumentHost ? window.scrollY : host.scrollTop;
      const beforeScrollHeight = isDocumentHost ? document.documentElement.scrollHeight : host.scrollHeight;

      if (isDocumentHost) window.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      else if (host instanceof HTMLElement) host.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      await sleepMs(1_100);

      const afterScrollTop = isDocumentHost ? window.scrollY : host.scrollTop;
      const afterScrollHeight = isDocumentHost ? document.documentElement.scrollHeight : host.scrollHeight;
      const hostMoved = afterScrollTop !== beforeScrollTop || afterScrollHeight !== beforeScrollHeight;
      const previousScrollHeight = previousScrollHeights.get(host);
      const hostHeightChanged = previousScrollHeight !== undefined && afterScrollHeight !== previousScrollHeight;
      previousScrollHeights.set(host, afterScrollHeight);

      moved = moved || hostMoved;
      heightChanged = heightChanged || hostHeightChanged;
    }

    return { moved, heightChanged };
  };

  const stablePasses = await runFacebookGroupScrollPasses({
    collected,
    revealRoot: sectionRoot || document,
    collect,
    revealHiddenListItems,
    discoverScrollHosts,
    mergeCurrentGroups,
    scrollAllHosts,
    sleepMs,
  });

  const uniqueGroups = Array.from(collected.values())
    .sort((left, right) => left.order - right.order);

  const canonicalized: Array<{ targetName: string; targetUrl: string; targetExternalId: string }> = [];
  const batchSize = 3;
  for (let index = 0; index < uniqueGroups.length; index += batchSize) {
    const batch = uniqueGroups.slice(index, index + batchSize);
    const resolvedBatch = await Promise.all(
      batch.map(async (group) => {
        const canonical = shouldResolveCanonicalName(group.targetName)
          ? await parseGroupPageCanonicalName(group.targetUrl, group.targetName)
          : group.targetName;
        return {
          targetName: canonical,
          targetUrl: group.targetUrl,
          targetExternalId: group.targetExternalId,
        };
      }),
    );
    canonicalized.push(...resolvedBatch);
    await sleepMs(180);
  }

  const finalGroups = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string }>();
  for (const group of canonicalized) {
    if (!finalGroups.has(group.targetExternalId)) {
      finalGroups.set(group.targetExternalId, group);
    }
  }

  return {
    groups: Array.from(finalGroups.values()),
    scanComplete: stablePasses >= 5
      && Boolean(scrollScope)
      && scrollHosts.length > 0
      && (expectedCount === null || finalGroups.size >= expectedCount),
    expectedCount,
  };
}

function mapGraphqlScanResult(
  result: FacebookGraphqlCollectionResult,
  account?: FacebookAccountIdentity | null,
): FacebookGroupsScanRunResult {
  return {
    groups: result.groups,
    scanComplete: result.scanComplete,
    account,
  };
}

async function runScriptInTab<Result>(tabId: number, script: () => Result | Promise<Result>) {
  const results = await chrome.scripting?.executeScript({
    target: { tabId },
    func: script,
  });
  if (!results?.length) {
    throw new Error('Không thể chạy script quét nhóm trong tab Facebook.');
  }

  return results[0].result as Result;
}

async function closeTabSafely(tabId: number) {
  try {
    await chrome.tabs?.remove(tabId);
  } catch {
    // Intentionally ignore when tab already closed.
  }
}

async function waitForTabComplete(tabId: number, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs?.get(tabId).catch(() => null);
    if (!tab) break;
    if (tab.status === 'complete') return;
    await sleep(350);
  }

  throw new Error('Timeout khi chờ trang Facebook tải xong.');
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeAmisSourceChannel(value?: string | null) {
  return normalizeOptionalText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    ?? null;
}

function getAmisSourceName(sourceChannel?: string | null) {
  const normalizedChannel = normalizeAmisSourceChannel(sourceChannel);
  return normalizedChannel ? AMIS_SOURCE_NAME_BY_CHANNEL[normalizedChannel] ?? null : null;
}

function getAmisCandidateStageOptions(
  rounds: AmisRecruitmentRound[],
  application: ExtensionApplication,
) {
  if (rounds.length > 0) return rounds;

  const currentName = normalizeOptionalText(application.amisRecruitmentRoundName);
  if (!currentName) return [];

  return [{
    id: application.amisRecruitmentRoundId ?? `current:${currentName}`,
    name: currentName,
    sortOrder: 1,
    roundType: null,
    roundTypeId: null,
    color: null,
  } satisfies AmisRecruitmentRound];
}

function getAmisCandidateStageIndex(
  rounds: AmisRecruitmentRound[],
  roundId?: string | null,
  roundName?: string | null,
) {
  const normalizedRoundId = normalizeOptionalText(roundId);
  if (normalizedRoundId) {
    const idIndex = rounds.findIndex((round) => round.id === normalizedRoundId);
    if (idIndex >= 0) return idIndex;
  }

  const normalizedName = normalizeAmisStageName(roundName);
  if (!normalizedName) return -1;

  return rounds.findIndex((round) => normalizeAmisStageName(round.name) === normalizedName);
}

function normalizeAmisStageName(value?: string | null) {
  return normalizeOptionalText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('Đ', 'D')
    .replaceAll('đ', 'd')
    .toUpperCase()
    .trim() ?? null;
}

function formatStatusText(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCvOverviewStats(applications: ExtensionApplication[]) {
  const totalApplied = applications.length;
  const newCount = applications.filter((application) =>
    normalizeStatus(application.status).includes('NEW')
    || normalizeStatus(application.status).includes('APPLIED')
    || normalizeStatus(application.status).includes('RECEIVED'),
  ).length;
  const processingCount = applications.filter((application) => {
    const statuses = [
      application.status,
      application.cvScanStatus,
      application.cvSanitizeStatus,
      application.cvParseStatus,
    ].map(normalizeStatus);
    return statuses.some((status) =>
      status.includes('PENDING')
      || status.includes('PROCESS')
      || status.includes('PARSING')
      || status.includes('SCANNING')
      || status.includes('SANITIZING'),
    );
  }).length;
  const readyCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'PASSED').length;
  const reviewCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'REVIEW').length;
  const failedCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'FAILED').length;
  const syncErrorCount = applications.filter((application) => getCvSyncFilterBucket(application) === 'ERROR').length;

  return {
    totalApplied,
    newCount,
    processingCount,
    syncErrorCount,
    readyCount,
    reviewCount,
    failedCount,
    noAnswerCount: applications.filter((application) => getApplicationQuestionStatus(application).code !== 'ANSWERED').length,
  };
}

function getApplicationCvDisplayStatus(application: ExtensionApplication) {
  const parseStatus = normalizeStatus(application.cvParseStatus);
  const sanitizeStatus = normalizeStatus(application.cvSanitizeStatus);
  const scanStatus = normalizeStatus(application.cvScanStatus);

  if (parseStatus.includes('PARSED') || sanitizeStatus.includes('SANITIZED')) {
    return { label: 'Đạt', tone: 'is-success' };
  }
  if (
    scanStatus.includes('FAILED')
    || sanitizeStatus.includes('FAILED')
    || parseStatus.includes('FAILED')
    || scanStatus.includes('ERROR')
    || sanitizeStatus.includes('ERROR')
    || parseStatus.includes('ERROR')
  ) {
    return { label: 'Không đạt', tone: 'is-danger' };
  }
  if (
    scanStatus.includes('PENDING')
    || sanitizeStatus.includes('PENDING')
    || parseStatus.includes('PARSING')
    || scanStatus.includes('SCANNING')
    || sanitizeStatus.includes('SANITIZING')
    || normalizeStatus(application.status).includes('PROCESS')
    || application.attachmentCvName
  ) {
    return { label: 'Đang quét', tone: 'is-warning' };
  }

  return { label: 'Chưa có CV', tone: 'is-danger' };
}

function getApplicationAmisSyncStatus(application: ExtensionApplication) {
  if (application.amisCandidateId) return { label: 'Đã đồng bộ', tone: 'is-success' };
  return { label: 'Chưa đồng bộ', tone: 'is-warning' };
}

function getApplicationAiEvaluationStatus(
  application: ExtensionApplication,
  isEvaluationUploaded: boolean,
) {
  if (isEvaluationUploaded) return { label: 'Đã tải lên file đánh giá AI', tone: 'is-success' };
  if (normalizeStatus(application.aiScreeningStatus) === 'DONE') {
    return { label: 'Chưa tải lên file đánh giá AI', tone: 'is-warning' };
  }
  return { label: 'Chưa đánh giá bằng AI', tone: 'is-danger' };
}

function getApplicationQuestionStatus(application: ExtensionApplication) {
  const status = normalizeStatus(application.latestForm?.status ?? application.formStatus);
  if (status === 'SUBMITTED') {
    return { code: 'ANSWERED', label: 'Đã trả lời', tone: 'is-success' } satisfies ApplicationQuestionStatus;
  }
  return { code: 'NOT_ANSWERED', label: 'Chưa trả lời', tone: 'is-warning' } satisfies ApplicationQuestionStatus;
}

function getApplicationMatchScore(application: ExtensionApplication) {
  const score = application.aiScreeningScore ?? application.mappingScore;
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(score);
}

function getCvScoreTone(score: number) {
  if (score >= 80) return 'is-success';
  if (score >= 50) return 'is-warning';
  return 'is-danger';
}

function getCvApplicationFilterBucket(application: ExtensionApplication): CvStatusFilter {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (cvStatus.tone === 'is-success') return 'PASSED';
  if (cvStatus.tone === 'is-danger') return 'FAILED';
  return 'REVIEW';
}

function getCvSyncFilterBucket(application: ExtensionApplication): CvSyncStatusBucket {
  const syncStatus = getApplicationAmisSyncStatus(application);
  if (syncStatus.tone === 'is-success') return 'SYNCED';
  if (syncStatus.tone === 'is-danger') return 'ERROR';
  return 'NOT_SYNCED';
}

function matchesCvQuestionFilter(application: ExtensionApplication, filter: CvQuestionFilter) {
  if (filter === 'ALL') return true;
  return getApplicationQuestionStatus(application).code === filter;
}

function matchesCvSyncFilter(application: ExtensionApplication, filter: CvSyncFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'AMIS_SYNCED') return Boolean(application.amisCandidateId);
  if (filter === 'AMIS_NOT_SYNCED') return !application.amisCandidateId;
  return true;
}

function matchesCvEvaluationFilter(
  application: ExtensionApplication,
  filter: CvEvaluationFilter,
  uploadedApplicationIds: Set<string>,
) {
  if (filter === 'ALL') return true;
  if (filter === 'EVALUATION_UPLOADED') return uploadedApplicationIds.has(application.applicationId);
  if (filter === 'EVALUATION_NOT_UPLOADED') {
    return normalizeStatus(application.aiScreeningStatus) === 'DONE'
      && !uploadedApplicationIds.has(application.applicationId);
  }
  return normalizeStatus(application.aiScreeningStatus) !== 'DONE'
    && !uploadedApplicationIds.has(application.applicationId);
}

function getCvSourceFilterBucket(application: ExtensionApplication): Exclude<CvSourceFilter, 'ALL'> | null {
  const normalizedSource = normalizeAmisSourceChannel(application.sourceChannel);
  if (!normalizedSource) return null;
  if (normalizedSource.includes('FACEBOOK')) return 'FACEBOOK';
  if (normalizedSource.includes('VCS') || normalizedSource.includes('PORTAL')) return 'VCS_PORTAL';
  if (normalizedSource.includes('FREELANCER') || normalizedSource === 'OTHER') return 'FREELANCER';
  if (
    normalizedSource.includes('MANUAL')
    || normalizedSource.includes('INTERNAL')
    || normalizedSource.includes('NOIBO')
  ) return 'INTERNAL';
  return null;
}

function getCvSourceLabel(application: ExtensionApplication) {
  const sourceFilter = getCvSourceFilterBucket(application);
  if (sourceFilter === 'FACEBOOK') return 'Facebook';
  if (sourceFilter === 'VCS_PORTAL') return 'VCS Portal';
  if (sourceFilter === 'FREELANCER') return 'Freelancer';
  if (sourceFilter === 'INTERNAL') return 'Nội bộ';
  return application.sourceChannel ?? 'Chưa xác định';
}

function getVisibleCvApplications(
  applications: ExtensionApplication[],
  questionFilter: CvQuestionFilter,
  syncFilter: CvSyncFilter,
  evaluationFilter: CvEvaluationFilter,
  sourceFilter: CvSourceFilter,
  sortMode: CvSortMode,
  aiEvaluationUploadedApplicationIds: Set<string>,
) {
  return applications
    .filter((application) => matchesCvQuestionFilter(application, questionFilter))
    .filter((application) => matchesCvSyncFilter(application, syncFilter))
    .filter((application) => matchesCvEvaluationFilter(
      application,
      evaluationFilter,
      aiEvaluationUploadedApplicationIds,
    ))
    .filter((application) => sourceFilter === 'ALL' || getCvSourceFilterBucket(application) === sourceFilter)
    .slice()
    .sort((first, second) => {
      if (sortMode === 'SCORE_ASC' || sortMode === 'SCORE_DESC') {
        const scoreDelta = (getApplicationMatchScore(first) ?? -1)
          - (getApplicationMatchScore(second) ?? -1);
        return sortMode === 'SCORE_ASC' ? scoreDelta : -scoreDelta;
      }

      const firstAppliedTime = getTimeValue(first.applyDate);
      const secondAppliedTime = getTimeValue(second.applyDate);
      const firstTime = firstAppliedTime || getTimeValue(first.createdAt);
      const secondTime = secondAppliedTime || getTimeValue(second.createdAt);
      const appliedTimeDelta = firstTime - secondTime;
      if (appliedTimeDelta !== 0) {
        return sortMode === 'APPLIED_ASC' ? appliedTimeDelta : -appliedTimeDelta;
      }

      // AMIS may only provide the application date, so use the persisted
      // creation timestamp to keep candidates from the same day ordered.
      const createdTimeDelta = getTimeValue(first.createdAt) - getTimeValue(second.createdAt);
      return sortMode === 'APPLIED_ASC' ? createdTimeDelta : -createdTimeDelta;
    });
}

function getPaginationPages(currentPage: number, totalPages: number) {
  const pageCount = Math.min(3, totalPages);
  const firstPage = Math.min(Math.max(1, currentPage - 1), Math.max(1, totalPages - pageCount + 1));
  return Array.from({ length: pageCount }, (_, index) => firstPage + index);
}

function getTimeValue(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeStatus(value?: string | null) {
  return value?.toUpperCase().trim() ?? '';
}

function trimHyphenBoundaries(value: string) {
  let normalized = value;
  while (normalized.startsWith('-')) normalized = normalized.slice(1);
  while (normalized.endsWith('-')) normalized = normalized.slice(0, -1);
  return normalized;
}

function slugifyForDisplay(value: string) {
  return trimHyphenBoundaries(value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-'))
    || 'job-posting';
}

function getFacebookContentSnapshotKey(recruitmentId: string | null, snapshot: AmisJobSnapshot) {
  return [
    recruitmentId ?? 'snapshot',
    snapshot.title,
    snapshot.description,
    snapshot.requirements.rawText,
    snapshot.deadline ?? '',
  ].join('|');
}

function buildFacebookJobIdentity(snapshot: AmisJobSnapshot) {
  return (snapshot.title || snapshot.description || snapshot.requirements.rawText)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatMetricValue(value: number | null) {
  return value === null ? '-' : String(value);
}

function canUploadApplicationCv(application: AmisApplicationsForRecruitment['applications'][number]) {
  return Boolean(application.currentCvDocumentId)
    && application.cvSanitizeStatus?.toUpperCase() === 'SANITIZED'
    && !application.attachmentCvId
    && !application.attachmentCvName;
}

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function buildAmisUploadCvFileName(
  application: AmisApplicationsForRecruitment['applications'][number],
  fallbackFileName: string,
) {
  const extension = fallbackFileName.match(/\.[a-z0-9]{2,8}$/i)?.[0] ?? '.pdf';
  const identity = application.email
    || application.candidateName
    || application.candidateId
    || 'candidate';
  const safeIdentity = trimHyphenBoundaries(identity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-'))
    .slice(0, 48)
    .toLowerCase() || 'candidate';
  const shortApplicationId = application.applicationId.replaceAll('-', '').slice(0, 8);

  return `${safeIdentity}-${shortApplicationId}${extension.toLowerCase()}`;
}

function isAutoSyncUpdateMessage(value: unknown): value is {
  type: 'AMIS_AUTO_SYNC_STATE_UPDATED';
  payload: AmisAutoSyncState;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'AMIS_AUTO_SYNC_STATE_UPDATED'
    && typeof (value as { payload?: { status?: unknown } }).payload?.status === 'string';
}

function isAmisCaptureUpdatedMessage(value: unknown): value is {
  type: 'AMIS_RECRUITMENT_CAPTURE_UPDATED';
  payload: AmisExtractionResult;
  sourceTabId?: number;
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== 'AMIS_RECRUITMENT_CAPTURE_UPDATED') return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;

  return typeof (payload as { status?: unknown }).status === 'string'
    && typeof (payload as { detected?: unknown }).detected === 'boolean'
    && typeof (payload as { url?: unknown }).url === 'string'
    && Array.isArray((payload as { missingFields?: unknown }).missingFields)
    && ((value as { sourceTabId?: unknown }).sourceTabId === undefined
      || typeof (value as { sourceTabId?: unknown }).sourceTabId === 'number');
}

function isRecruitmentContextChangedMessage(value: unknown): value is {
  type: typeof RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE;
  payload: {
    ok: boolean;
    pageUrl: string;
    pageKind?: string;
    amisRecruitmentId?: string;
    amisRecruitmentRoundId?: string;
    sourceUrl?: string;
    timestamp: string;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { ok?: unknown }).ok === 'boolean'
    && typeof (payload as { pageUrl?: unknown }).pageUrl === 'string';
}

function isFacebookPublishProgressUpdateMessage(value: unknown): value is {
  type: 'FACEBOOK_PUBLISH_PROGRESS_UPDATED';
  payload: FacebookPublishProgress;
} {
  const payload = (value as { payload?: Partial<FacebookPublishProgress> } | null)?.payload;
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'FACEBOOK_PUBLISH_PROGRESS_UPDATED'
    && typeof payload?.status === 'string'
    && typeof payload.currentIndex === 'number'
    && typeof payload.total === 'number'
    && typeof payload.message === 'string'
    && Array.isArray(payload.results);
}

function isApplicationsSyncedMessage(value: unknown): value is {
  type: typeof AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
    jobPostingId: string;
    syncedCount: number;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { amisRecruitmentId?: unknown }).amisRecruitmentId === 'string';
}

function isAmisCandidateStageChangedMessage(value: unknown): value is {
  type: typeof AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE;
  payload: AmisCandidateStageChangedPayload;
  sourceTabId?: number;
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE) return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;

  const stage = payload as Partial<AmisCandidateStageChangedPayload>;
  return typeof stage.amisRecruitmentId === 'string'
    && typeof stage.amisCandidateId === 'string'
    && typeof stage.amisRecruitmentRoundId === 'string'
    && (stage.amisRecruitmentRoundName === null || typeof stage.amisRecruitmentRoundName === 'string')
    && (stage.amisStatus === null || typeof stage.amisStatus === 'number')
    && (stage.reasonRemoved === undefined || stage.reasonRemoved === null || typeof stage.reasonRemoved === 'string')
    && typeof stage.sourceUrl === 'string'
    && typeof stage.pageUrl === 'string'
    && typeof stage.changedAt === 'string'
    && (typeof (value as { sourceTabId?: unknown }).sourceTabId === 'undefined'
      || typeof (value as { sourceTabId?: unknown }).sourceTabId === 'number');
}

function isAmisRecruitmentRoundsChangedMessage(value: unknown): value is {
  type: typeof AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
    rounds: AmisRecruitmentRound[];
    sourceUrl: string;
    pageUrl: string;
    capturedAt: string;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE) return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;
  const roundsPayload = payload as {
    amisRecruitmentId?: unknown;
    rounds?: unknown;
    sourceUrl?: unknown;
    pageUrl?: unknown;
    capturedAt?: unknown;
  };

  return typeof roundsPayload.amisRecruitmentId === 'string'
    && typeof roundsPayload.sourceUrl === 'string'
    && typeof roundsPayload.pageUrl === 'string'
    && typeof roundsPayload.capturedAt === 'string'
    && Array.isArray(roundsPayload.rounds)
    && roundsPayload.rounds.every(isAmisRecruitmentRound);
}

function isExtractionForRecruitment(extraction: AmisExtractionResult, recruitmentId: string) {
  return extraction.detected
    && Boolean(extraction.snapshot)
    && normalizeOptionalText(extraction.amisRecruitmentId) === recruitmentId;
}

function getAutoSyncStateRecruitmentId(state: AmisAutoSyncState) {
  return normalizeOptionalText(state.capture?.amisRecruitmentId)
    ?? normalizeOptionalText(state.result?.amisRecruitmentId);
}

function isAmisRecruitmentContextResponse(value: unknown): value is {
  ok: boolean;
  pageUrl: string;
  pageKind?: string;
  amisRecruitmentId?: string;
  amisRecruitmentRoundId?: string;
  sourceUrl?: string;
} {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string';
}

function isAmisRecruitmentRoundsResponse(value: unknown): value is {
  ok: boolean;
  amisRecruitmentId: string | null;
  rounds: AmisRecruitmentRound[];
  sourceUrl: string;
  error?: string;
} {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && (typeof (value as { amisRecruitmentId?: unknown }).amisRecruitmentId === 'string'
      || (value as { amisRecruitmentId?: unknown }).amisRecruitmentId === null)
    && typeof (value as { sourceUrl?: unknown }).sourceUrl === 'string'
    && Array.isArray((value as { rounds?: unknown }).rounds)
    && (value as { rounds: unknown[] }).rounds.every(isAmisRecruitmentRound);
}

function isAmisRecruitmentRound(value: unknown): value is AmisRecruitmentRound {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
    && typeof (value as { sortOrder?: unknown }).sortOrder === 'number'
    && ((value as { roundType?: unknown }).roundType === null || typeof (value as { roundType?: unknown }).roundType === 'number')
    && ((value as { roundTypeId?: unknown }).roundTypeId === null || typeof (value as { roundTypeId?: unknown }).roundTypeId === 'string')
    && ((value as { color?: unknown }).color === null || typeof (value as { color?: unknown }).color === 'string');
}

function isAmisApplicationsFetchResponse(value: unknown): value is {
  ok: boolean;
  sourceUrl: string;
  items: AmisApplicationItem[];
  rawCount: number;
  error?: string;
} {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && typeof (value as { sourceUrl?: unknown }).sourceUrl === 'string'
    && Array.isArray((value as { items?: unknown }).items);
}

type AmisUploadCvFileResponse = {
  ok: boolean;
  fileName?: string;
  fileNames?: string[];
  fileCount?: number;
  target?: string;
  error?: string;
};

function isAmisResponseWithOk<T extends { ok: boolean }>(value: unknown): value is T {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean';
}

function isConfirmedAmisCandidateSourceSelection(value: unknown, expectedSourceName: string) {
  if (!isAmisResponseWithOk<AmisCandidateSourceSelectionResponse>(value) || !value.ok) return false;
  const expectedKey = normalizeAmisSourceChannel(expectedSourceName);
  return normalizeAmisSourceChannel(value.sourceName) === expectedKey
    && normalizeAmisSourceChannel(value.diagnostics?.confirmedFieldValue) === expectedKey
    && value.diagnostics?.sourceOptionFound === true
    && value.diagnostics?.sourceOptionClicked === true;
}

function formatAmisCandidateSourceSelectionFailure(value: unknown) {
  if (!isAmisResponseWithOk<AmisCandidateSourceSelectionResponse>(value)) {
    return ' AMIS không trả về kết quả chọn nguồn hợp lệ.';
  }

  const code = value.code ? ` [${value.code}]` : '';
  const diagnostics = value.diagnostics;
  const visibleSources = diagnostics?.visibleOptionLabels.slice(-6).join(', ') ?? '';
  let searchDetails = 'fallback-option-scan';
  if (diagnostics?.searchInputFound) {
    searchDetails = `${diagnostics.searchInputLocation ?? 'unknown'}:${diagnostics.searchQuery}`;
  }
  let details = '';
  if (diagnostics) {
    details = ` Bước: field=${diagnostics.fieldFound ? 'ok' : 'missing'}, control=${diagnostics.controlFound ? 'ok' : 'missing'}, popup=${diagnostics.popupFound ? 'ok' : 'missing'}, search=${searchDetails}, scroll=${diagnostics.optionScrollPasses}.`;
  }
  const sources = visibleSources ? ` Nguồn đã thấy: ${visibleSources}.` : '';
  return `${code} ${value.error ?? 'Hãy chọn nguồn này trên AMIS trước khi lưu.'}${details}${sources}`;
}

function summarizeText(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return 'No description.';
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}

function formatDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDateTime(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateLabel = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${dateLabel} ${timeLabel}`;
}

function truncateCandidateName(value: string) {
  const maxLength = 24;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildAmisFormFillPayload(jobDescription: JobDescriptionSummary) {
  const description = stringifyStructuredContent(jobDescription.description);

  return {
    positionName: stringifyStructuredContent(jobDescription.position?.name),
    summary: truncateForMaxLength(
      stringifyStructuredContent(jobDescription.summary)
      || stringifyStructuredContent(jobDescription.overview)
      || description,
      500,
    ),
    responsibilities: stringifyStructuredContent(jobDescription.responsibilities) || description,
    requirements: stringifyStructuredContent(jobDescription.requirements),
    benefits: stringifyStructuredContent(jobDescription.benefits),
  };
}

function buildAmisJobSnapshotFromJobDescription(jobDescription: JobDescriptionSummary): AmisJobSnapshot {
  const requirements = stringifyStructuredContent(jobDescription.requirements);
  const description = stringifyStructuredContent(jobDescription.description)
    || stringifyStructuredContent(jobDescription.responsibilities)
    || stringifyStructuredContent(jobDescription.overview)
    || jobDescription.title;
  const summary = truncateForMaxLength(
    stringifyStructuredContent(jobDescription.summary)
    || stringifyStructuredContent(jobDescription.overview)
    || description,
    500,
  );
  const location = stringifyStructuredContent(jobDescription.department);
  const deadline = normalizeAmisSnapshotDeadline(jobDescription.applicationDeadline);

  return {
    title: jobDescription.title.trim(),
    ...(summary ? { summary } : {}),
    description,
    requirements: {
      rawText: requirements || description,
    },
    benefits: jobDescription.benefits ?? undefined,
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

function sanitizeAmisJobSnapshotForApi(snapshot: AmisJobSnapshot): AmisJobSnapshot {
  const title = stringifyStructuredContent(snapshot.title);
  const description = stringifyStructuredContent(snapshot.description) || title;
  const summary = snapshot.summary
    ? truncateForMaxLength(stringifyStructuredContent(snapshot.summary), 500)
    : undefined;
  const rawText = stringifyStructuredContent(snapshot.requirements.rawText) || description;
  const location = stringifyStructuredContent(snapshot.location);
  const deadline = normalizeAmisSnapshotDeadline(snapshot.deadline);
  const benefits = normalizeOptionalSnapshotBenefits(snapshot.benefits);

  return {
    title,
    description,
    ...(summary ? { summary } : {}),
    requirements: {
      ...snapshot.requirements,
      rawText,
    },
    ...(benefits !== undefined ? { benefits } : {}),
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

function normalizeOptionalSnapshotBenefits(value: AmisJobSnapshot['benefits']) {
  if (typeof value === 'string') {
    const normalized = stringifyStructuredContent(value);
    return normalized || undefined;
  }
  return value ?? undefined;
}

function normalizeAmisSnapshotDeadline(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  const vietnameseDateMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (vietnameseDateMatch) {
    const [, day, month, year] = vietnameseDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
}

function stringifyStructuredContent(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredContent(item))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const textValue = getPlainTextRecordValue(record);
    if (textValue !== null) return textValue;

    return Object.entries(value)
      .map(([key, item]) => {
        const content = stringifyStructuredContent(item);
        if (!content) return '';
        if (key === 'text' || key === 'rawText') return content;
        return `${formatFieldLabel(key)}:\n${content}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

function getPlainTextRecordValue(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;

  const [key] = keys;
  if (key !== 'text' && key !== 'rawText') return null;

  const content = stringifyStructuredContent(value[key]);
  return content || null;
}

function formatFieldLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function truncateForMaxLength(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function isFillResponse(value: unknown): value is {
  ok: boolean;
  filledFields: string[];
  missingFields: string[];
  error?: string;
} {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && Array.isArray((value as { filledFields?: unknown }).filledFields)
    && Array.isArray((value as { missingFields?: unknown }).missingFields);
}

function isLikelyAmisRecruitmentPage(url: string) {
  try {
    const parsedUrl = new URL(url);
    const target = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.toLowerCase();
    return target.includes('recruitment')
      || target.includes('candidate')
      || target.includes('ung-vien')
      || target.includes('tin-tuyen-dung')
      || target.includes('tuyen-dung');
  } catch {
    return false;
  }
}

function isAmisJobInitiationPage(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.toLowerCase() === 'amisapp.misa.vn'
      && parsedUrl.pathname.toLowerCase().includes('/job/initiation');
  } catch {
    return false;
  }
}

function normalizeAmisJobInitiationUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function parseAmisRecruitmentContextFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    const candidatePathMatch = path.match(/\/paging_candidate\/([^/?#]+)/i);
    const jobDetailPathMatch = path.match(/\/recruit\/job\/detail\/(\d{3,})(?:\/|$)/i);
    const genericRecruitmentMatch = path.match(/\/(?:recruitment|tin-tuyen-dung|job)[^/]*(?:\/|%2F)(\d{3,})/i);
    const queryRecruitmentId = parsedUrl.searchParams.get('recruitmentID')
      ?? parsedUrl.searchParams.get('RecruitmentID')
      ?? parsedUrl.searchParams.get('recruitmentId')
      ?? parsedUrl.searchParams.get('id');
    const queryRoundId = parsedUrl.searchParams.get('recruitmentRoundID')
      ?? parsedUrl.searchParams.get('RecruitmentRoundID')
      ?? parsedUrl.searchParams.get('recruitmentRoundId')
      ?? parsedUrl.searchParams.get('roundID')
      ?? parsedUrl.searchParams.get('RoundID')
      ?? parsedUrl.searchParams.get('roundId');

    return {
      amisRecruitmentId: candidatePathMatch?.[1]
        ?? jobDetailPathMatch?.[1]
        ?? queryRecruitmentId
        ?? genericRecruitmentMatch?.[1]
        ?? null,
      amisRecruitmentRoundId: queryRoundId,
      amisCandidateId: jobDetailPathMatch
        ? parsedUrl.searchParams.get('id')
        : null,
      sourceUrl: candidatePathMatch?.[1] ? url : null,
    };
  } catch {
    return {
      amisRecruitmentId: null,
      amisRecruitmentRoundId: null,
      amisCandidateId: null,
      sourceUrl: null,
    };
  }
}

async function getActiveTab() {
  const [activeTab] = await chrome.tabs?.query({ active: true, currentWindow: true }) ?? [];

  if (!activeTab?.id) {
    throw new Error('No active tab found. Open the AMIS recruitment tab and retry.');
  }

  return {
    id: activeTab.id,
    url: activeTab.url,
  };
}

async function sendMessageToAmisTab(tabId: number, message: unknown, frameId?: number) {
  if (!chrome.tabs?.sendMessage) {
    throw new Error('Chrome tabs messaging is unavailable.');
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message, frameId === undefined ? undefined : { frameId });
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;
    await injectAmisBridge(tabId);
    await wait(250);
    return chrome.tabs.sendMessage(tabId, message, frameId === undefined ? undefined : { frameId });
  }
}

async function sendFillAmisFormMessage(tabId: number, payload: ReturnType<typeof buildAmisFormFillPayload>) {
  const message = {
    type: FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE,
    payload,
  };
  const response = await sendMessageToAmisTab(tabId, message);

  if (response !== undefined) return response;

  // A bridge from an earlier extension version can remain on an already-open AMIS tab.
  // Reinstall it only when the fill request received no response, so other message flows
  // keep their existing lifecycle and retry behavior.
  await injectAmisBridge(tabId);
  await wait(250);
  if (!chrome.tabs?.sendMessage) {
    throw new Error('Chrome tabs messaging is unavailable.');
  }

  return chrome.tabs.sendMessage(tabId, message);
}

async function injectAmisBridge(tabId: number) {
  if (!chrome.scripting?.executeScript) {
    throw new Error('Cannot inject AMIS bridge because chrome.scripting is unavailable.');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['assets/amis-bridge.js'],
  });
}

function isMissingContentScriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /receiving end does not exist|could not establish connection/i.test(message);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getFacebookPlanKey(plan: FacebookPublishPlan) {
  return [
    plan.jobPostingId,
    plan.content.length,
    hashText(plan.content),
    plan.targets.map((target) => target.targetId ?? target.targetUrl ?? target.targetName).join('|'),
    plan.attachments?.map((attachment) => [
      attachment.type,
      attachment.source,
      attachment.fileName,
      attachment.size,
    ].join('/')).join('|') ?? '',
  ].join(':');
}

function hydrateFacebookContentOverride(content: string, planContent: string) {
  const applyUrl = extractFacebookApplyUrl(planContent);
  if (!applyUrl) return content.trim();

  return content
    .replace(/\{\{\s*APPLY_URL\s*\}\}/gi, applyUrl)
    .replace(/\[\s*APPLY_URL\s*\]/gi, applyUrl)
    .trim();
}

function extractFacebookApplyUrl(content: string) {
  const match = content.match(/(?:https?:\/\/|\/jobs\/)[^\s)]+/i);
  return match?.[0] ?? null;
}

function isFacebookGroupLoading(state: FacebookGroupLoadState) {
  return state === 'CHECKING_LOGIN'
    || state === 'WAITING_LOGIN'
    || state === 'LOADING_SAVED_GROUPS'
    || state === 'LOADING_GROUPS';
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
