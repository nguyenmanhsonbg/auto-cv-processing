import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractAmisJobFromPage } from './amis-page-extractor';
import { getLastAutoSyncState } from './amis-auto-sync-store';
import { getLastAmisCapture } from './amis-capture-store';
import { getAmisDiagnostics } from './amis-diagnostics-store';
import { ensureAmisHooksInActiveTab } from './amis-hook-installer';
import {
  ApiClientError,
  createFacebookGroup,
  deleteFacebookGroup,
  downloadCleanCvFile,
  getApplicationParsedProfile,
  getApplicationAiMatchPreview,
  ensureRegisteredExtensionInstance,
  getAmisApplicationsForRecruitment,
  getCurrentUser,
  getFacebookGroups,
  getJobDescriptionQuestionSet,
  generateFacebookPreviewContent,
  listFacebookGroupPublishHistories,
  listJobDescriptions,
  heartbeatExtensionInstance,
  login,
  resolveFacebookAccount,
  previewAmisJobPublishPlan,
  syncAmisApplications,
  syncAndPublishAmisJob,
  syncFacebookGroups,
  syncVcsPortalJobDescriptions,
  updateFacebookGroup,
  updateFacebookPublishHistoryStatusCheck,
  verifyFacebookGroup,
} from './api-client';
import { clearAccessToken, getAccessToken, setAuthTokens, subscribeAuthTokenChanges } from './auth-store';
import { createAiMatchPreviewPdf } from './ai-match-preview-pdf';
import { getSelectedChannels, setSelectedChannels } from './channel-preferences';
import {
  DEFAULT_POSTING_CHANNELS,
  FACEBOOK_MAX_IMAGE_ATTACHMENTS,
  POSTING_CHANNELS,
} from './config';
import { summarizeFacebookPublishResults, updateFacebookChannelStatus } from './facebook-channel-status';
import {
  buildFacebookDraftSnapshotFingerprint,
  clearFacebookContentDraft as clearStoredFacebookContentDraft,
  getFacebookContentDraft,
  saveFacebookContentDraft as persistFacebookContentDraft,
} from './facebook-content-draft-store';
import { getSelectedFacebookGroupIds, setSelectedFacebookGroupIds } from './facebook-group-preferences';
import { setActiveFacebookAccountId } from './facebook-account-store';
import {
  beginFacebookImagePublish,
  getFacebookImageAttachments,
  removeFacebookImageAttachments,
  saveFacebookImageAttachments,
  syncFacebookImagePublishStatuses,
  updateFacebookImagePublishTargetStatus,
  type FacebookImageAttachmentScope,
} from './facebook-image-attachment-store';
import { getValidFacebookGroupPostUrl } from './facebook-post-url';
import {
  ensureFacebookSession,
  publishFacebookPlan,
  refreshFacebookPostReviewStatus,
  verifyFacebookGroupPostingEligibility,
} from './facebook-publish-orchestrator';
import { getLastFacebookPublishProgress, saveLastFacebookPublishProgress } from './facebook-publish-store';
import { createMockAmisSyncRequest } from './mock-amis';
import { clearSelectedJobQuestionContextForTab, saveSelectedJobQuestionContext } from './selected-job-question-store';
import type {
  AmisDiagnosticEvent,
  AmisAutoSyncState,
  AmisApplicationsForRecruitment,
  AmisApplicationItem,
  AmisExtractionResult,
  AmisJobSnapshot,
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
} from './types';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
type CareerQuestionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type WorkspaceTab = 'overview' | 'posting' | 'cv';
type CvWorkspaceView = 'overview' | 'list';
type CvStatusFilter = 'ALL' | 'PASSED' | 'REVIEW' | 'FAILED';
type CvSyncFilter = 'ALL' | 'SYNCED' | 'NOT_SYNCED' | 'ERROR';
type CvSortMode = 'SCORE_DESC' | 'SCORE_ASC' | 'APPLIED_DESC' | 'APPLIED_ASC';
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
type VcsPortalSyncState = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';

interface FacebookHistoryGroup {
  id: string | null;
  name: string;
  url?: string | null;
  externalId?: string | null;
}

interface FacebookImageAttachDecisionPrompt extends FacebookImageAttachFailureContext {}

interface DiscoveredFacebookGroupItem {
  targetName: string;
  targetUrl: string;
  targetExternalId: string;
}

interface FacebookGroupsScanRunResult {
  groups: DiscoveredFacebookGroupItem[];
  scanComplete: boolean;
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
  externalId: string | null;
  reason?: string | null;
}

interface FacebookGroupSyncDetails {
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
const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
const JOB_DESCRIPTION_QUESTION_SELECTION_PREFIX = 'vcs:selected-jd-questions:';
const MAX_POSTING_SNAPSHOT_REFRESH_ATTEMPTS = 3;
const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'posting', label: 'Đăng bài' },
  { id: 'cv', label: 'CV' },
];
const CV_APPLICATION_PAGE_SIZE = 5;
const CV_STATUS_FILTER_OPTIONS: Array<{ value: CvStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PASSED', label: 'Đạt yêu cầu' },
  { value: 'REVIEW', label: 'Cần xem xét' },
  { value: 'FAILED', label: 'Không đạt' },
];
const CV_SYNC_FILTER_OPTIONS: Array<{ value: CvSyncFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'SYNCED', label: 'Đã đồng bộ' },
  { value: 'NOT_SYNCED', label: 'Chưa đồng bộ' },
  { value: 'ERROR', label: 'Lỗi đồng bộ' },
];
const CV_SORT_OPTIONS: Array<{ value: CvSortMode; label: string }> = [
  { value: 'SCORE_DESC', label: 'Điểm tham chiếu cao' },
  { value: 'SCORE_ASC', label: 'Điểm tham chiếu thấp' },
  { value: 'APPLIED_DESC', label: 'Mới ứng tuyển' },
  { value: 'APPLIED_ASC', label: 'Ứng tuyển cũ nhất' },
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
const FACEBOOK_HISTORY_FILTERS: Array<{ value: FacebookPostHistoryFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'POSTED', label: 'Đã đăng' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
  { value: 'DELETED', label: 'Đã xóa' },
];
const POSTING_CHANNEL_SET = new Set<ExtensionChannel>(POSTING_CHANNELS);
type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

const AMIS_CV_UPLOAD_CONFIRMATION_TIMEOUT_MS = 60_000;
type ApplicationQuestionStatusCode = 'ANSWERED' | 'SENT' | 'OPENED' | 'EXPIRED' | 'NOT_SENT';
type ApplicationQuestionStatus = {
  code: ApplicationQuestionStatusCode;
  label: string;
  tone: 'is-success' | 'is-warning' | 'is-danger' | 'is-muted';
};

function getJobDescriptionQuestionSelectionStorageKey(jobDescriptionId: string) {
  return `${JOB_DESCRIPTION_QUESTION_SELECTION_PREFIX}${jobDescriptionId}`;
}

function SidePanel() {
  const [state, setState] = useState<PanelState>('AUTH_LOADING');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('cv');
  const [pinnedWorkspaceTab, setPinnedWorkspaceTab] = useState<WorkspaceTab | null>(null);
  const [cvWorkspaceView, setCvWorkspaceView] = useState<CvWorkspaceView>('list');
  const [user, setUser] = useState<ExtensionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [snapshot, setSnapshot] = useState<AmisJobSnapshot | null>(null);
  const [amisRecruitmentId, setAmisRecruitmentId] = useState<string | null>(null);
  const [amisRecruitmentRoundId, setAmisRecruitmentRoundId] = useState<string | null>(null);
  const [amisUrl, setAmisUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<ExtensionChannel[]>([...DEFAULT_POSTING_CHANNELS]);
  const [result, setResult] = useState<ExtensionSyncResponse | null>(null);
  const [extractionResult, setExtractionResult] = useState<AmisExtractionResult | null>(null);
  const [autoSyncState, setAutoSyncState] = useState<AmisAutoSyncState | null>(null);
  const [diagnostics, setDiagnostics] = useState<AmisDiagnosticEvent[]>([]);
  const [facebookProgress, setFacebookProgress] = useState<FacebookPublishProgress | null>(null);
  const [facebookRunning, setFacebookRunning] = useState(false);
  const [facebookGroups, setFacebookGroups] = useState<FacebookPublishTarget[]>([]);
  const [facebookAccount, setFacebookAccount] = useState<FacebookAccount | null>(null);
  const [selectedFacebookGroupIds, setSelectedFacebookGroupIdsState] = useState<string[]>([]);
  const [facebookContent, setFacebookContent] = useState('');
  const [facebookContentState, setFacebookContentState] = useState<FacebookContentState>('IDLE');
  const [facebookContentMessage, setFacebookContentMessage] = useState<string | null>(null);
  const [facebookPreviewModalMode, setFacebookPreviewModalMode] = useState<FacebookPreviewModalMode | null>(null);
  const [facebookContentDraft, setFacebookContentDraft] = useState('');
  const [facebookImageAttachments, setFacebookImageAttachments] = useState<FacebookPublishAttachment[]>([]);
  const [facebookImageAttachmentState, setFacebookImageAttachmentState] = useState<FacebookImageAttachmentState>('IDLE');
  const [facebookImageAttachmentError, setFacebookImageAttachmentError] = useState<string | null>(null);
  const [facebookImageAttachPrompt, setFacebookImageAttachPrompt] = useState<FacebookImageAttachDecisionPrompt | null>(null);
  const [facebookGroupLoadState, setFacebookGroupLoadState] = useState<FacebookGroupLoadState>('IDLE');
  const [facebookGroupMessage, setFacebookGroupMessage] = useState<string | null>(null);
  const [facebookGroupSyncDetails, setFacebookGroupSyncDetails] = useState<FacebookGroupSyncDetails | null>(null);
  const [isFacebookGroupSyncDetailsOpen, setIsFacebookGroupSyncDetailsOpen] = useState(false);
  const [isFacebookSettingsOpen, setIsFacebookSettingsOpen] = useState(false);
  const [facebookSettingsState, setFacebookSettingsState] = useState<
    'IDLE' | 'LOADING' | 'READY' | 'SAVING' | 'VERIFYING' | 'ERROR' | 'DISCOVERING'
  >('IDLE');
  const [facebookSettingsMessage, setFacebookSettingsMessage] = useState<string | null>(null);
  const [verifyingFacebookGroupIds, setVerifyingFacebookGroupIds] = useState<string[]>([]);
  const [queuedFacebookGroupIds, setQueuedFacebookGroupIds] = useState<string[]>([]);
  const [facebookGroupModalMode, setFacebookGroupModalMode] = useState<FacebookGroupModalMode>('SETTINGS');
  const [selectedFacebookGroup, setSelectedFacebookGroup] = useState<FacebookPublishTarget | null>(null);
  const [selectedFacebookHistoryGroup, setSelectedFacebookHistoryGroup] = useState<FacebookHistoryGroup | null>(null);
  const [facebookHistoryFilter, setFacebookHistoryFilter] = useState<FacebookPostHistoryFilter>('ALL');
  const [facebookHistoryPage, setFacebookHistoryPage] = useState(1);
  const [facebookHistoryData, setFacebookHistoryData] = useState<FacebookPublishHistoriesResponse | null>(null);
  const [facebookHistoryLoadState, setFacebookHistoryLoadState] = useState<FacebookPostHistoryLoadState>('IDLE');
  const [facebookHistoryMessage, setFacebookHistoryMessage] = useState<string | null>(null);
  const [refreshingFacebookHistoryIds, setRefreshingFacebookHistoryIds] = useState<string[]>([]);
  const [isRefreshingFacebookHistoryGroup, setIsRefreshingFacebookHistoryGroup] = useState(false);
  const [isFacebookGroupFormOpen, setIsFacebookGroupFormOpen] = useState(false);
  const [facebookGroupName, setFacebookGroupName] = useState('');
  const [facebookGroupUrl, setFacebookGroupUrl] = useState('');
  const [facebookGroupUrlError, setFacebookGroupUrlError] = useState<string | null>(null);
  const [editFacebookGroupName, setEditFacebookGroupName] = useState('');
  const [editFacebookGroupUrl, setEditFacebookGroupUrl] = useState('');
  const [editFacebookGroupUrlError, setEditFacebookGroupUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescriptionSummary[]>([]);
  const [jobDescriptionPagination, setJobDescriptionPagination] = useState<ApiPagination | null>(null);
  const [jobDescriptionSearch, setJobDescriptionSearch] = useState('');
  const [jobDescriptionStatusFilter, setJobDescriptionStatusFilter] = useState('ACTIVE');
  const [jobDescriptionStatus, setJobDescriptionStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [jobDescriptionError, setJobDescriptionError] = useState<string | null>(null);
  const [jobDescriptionFillState, setJobDescriptionFillState] = useState<JobDescriptionFillState>('IDLE');
  const [jobDescriptionFillMessage, setJobDescriptionFillMessage] = useState<string | null>(null);
  const [fillingJobDescriptionId, setFillingJobDescriptionId] = useState<string | null>(null);
  const [vcsPortalSyncState, setVcsPortalSyncState] = useState<VcsPortalSyncState>('IDLE');
  const [vcsPortalSyncResult, setVcsPortalSyncResult] = useState<SyncVcsPortalJdsResponse | null>(null);
  const [vcsPortalSyncMessage, setVcsPortalSyncMessage] = useState<string | null>(null);
  const [selectedJobDescription, setSelectedJobDescription] = useState<JobDescriptionSummary | null>(null);
  const [careerQuestionState, setCareerQuestionState] = useState<CareerQuestionState>('IDLE');
  const [careerQuestionMessage, setCareerQuestionMessage] = useState<string | null>(null);
  const [jobDescriptionQuestionContext, setJobDescriptionQuestionContext] = useState<JobDescriptionQuestionSetContext | null>(null);
  const [selectedJobQuestionIds, setSelectedJobQuestionIds] = useState<Set<string>>(new Set());
  const [applicationsState, setApplicationsState] = useState<ApplicationsState>('IDLE');
  const [applicationsContext, setApplicationsContext] = useState<AmisApplicationsForRecruitment | null>(null);
  const [activeAmisCandidateId, setActiveAmisCandidateId] = useState<string | null>(null);
  const [applicationsMessage, setApplicationsMessage] = useState<string | null>(null);
  const [cvUploadApplicationId, setCvUploadApplicationId] = useState<string | null>(null);
  const [pendingAmisUploadApplicationIds, setPendingAmisUploadApplicationIds] = useState<Set<string>>(new Set());
  const [aiEvaluationApplicationId, setAiEvaluationApplicationId] = useState<string | null>(null);
  const [selectedCvApplicationIds, setSelectedCvApplicationIds] = useState<Set<string>>(new Set());
  const [cvStatusFilter, setCvStatusFilter] = useState<CvStatusFilter>('ALL');
  const [cvSyncFilter, setCvSyncFilter] = useState<CvSyncFilter>('ALL');
  const [cvSortMode, setCvSortMode] = useState<CvSortMode>('SCORE_DESC');
  const [cvApplicationPage, setCvApplicationPage] = useState(1);
  const lastJobQuestionContextIdRef = useRef<string | null>(null);
  const lastApplicationsFallbackSyncUrlRef = useRef<string | null>(null);
  const activeAmisRecruitmentIdRef = useRef<string | null>(null);
  const activeSnapshotRecruitmentIdRef = useRef<string | null>(null);
  const applicationsRequestSeqRef = useRef(0);
  const pendingAmisUploadApplicationIdsRef = useRef(new Set<string>());
  const pendingAmisUploadTimeoutsRef = useRef(new Map<string, number>());
  const postingSnapshotRefreshSeqRef = useRef(0);
  const postingSnapshotRefreshAttemptsRef = useRef(new Map<string, number>());
  const missedRecruitmentContextCountRef = useRef(0);
  const lastAmisJobInitiationResetKeyRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const channelsRef = useRef<ExtensionChannel[]>(channels);
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
  const startedFacebookPlanKeys = useRef(new Set<string>());

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

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
    activeAmisRecruitmentIdRef.current = amisRecruitmentId;
  }, [amisRecruitmentId]);

  useEffect(() => () => {
    for (const timeoutId of pendingAmisUploadTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    pendingAmisUploadTimeoutsRef.current.clear();
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
      if (isAutoSyncUpdateMessage(message)) {
        void applyAutoSyncUpdateMessage(message.payload);
        return;
      }

      if (isDiagnosticUpdateMessage(message)) {
        setDiagnostics(message.payload);
        return;
      }

      if (isRecruitmentContextChangedMessage(message)) {
        void refreshAmisRecruitmentContextFromActiveTab({
          silent: true,
          sourceTabId: sender.tab?.id,
        });
        return;
      }

      if (isFacebookPublishProgressUpdateMessage(message)) {
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

      const restored = await applyStoredFacebookContentDraft(nextRecruitmentId, nextSnapshot);
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
    if (selectedPostingChannels.length === 0) missing.push('channel');
    if (selectedPostingChannels.includes('FACEBOOK') && selectedFacebookGroupIds.length === 0) missing.push('facebook group');
    return missing;
  }, [amisRecruitmentId, selectedFacebookGroupIds.length, selectedPostingChannels, snapshot]);

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
  const visibleFacebookGroups = useMemo(() => {
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
  }, [facebookGroups.length, facebookProgress, result, validFacebookGroups]);
  const visibleSelectedFacebookGroupCount = useMemo(() => {
    const visibleGroupIds = new Set(visibleFacebookGroups.map((group) => group.id).filter(isString));
    return selectedFacebookGroupIds.filter((targetId) => visibleGroupIds.has(targetId)).length;
  }, [selectedFacebookGroupIds, visibleFacebookGroups]);
  const facebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(facebookGroupUrl, facebookGroups);
  const facebookGroupUrlFieldError = facebookGroupDuplicateUrlError ?? facebookGroupUrlError;
  const editFacebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(
    editFacebookGroupUrl,
    facebookGroups,
    selectedFacebookGroup?.targetId ?? null,
  );
  const editFacebookGroupUrlFieldError = editFacebookGroupDuplicateUrlError ?? editFacebookGroupUrlError;

  async function restoreAuth() {
    const storedToken = await getAccessToken();
    if (!storedToken) {
      setState('AUTH_REQUIRED');
      return;
    }

    try {
      const currentUser = await getCurrentUser(storedToken);
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
      setState('READY');
      await loadJobDescriptions(latestToken);
      await loadLatestAutoSyncState({ silent: true });
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
      setFacebookImageAttachments(attachments.slice(0, FACEBOOK_MAX_IMAGE_ATTACHMENTS));
      setFacebookImageAttachmentState(attachments.length > 0 ? 'READY' : 'IDLE');
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
      let content = '';
      let generatedFromPublishPlan = false;
      let contentMode: 'AI' | 'TEMPLATE' = 'AI';

      if (amisRecruitmentId) {
        const payload = buildAmisJobPostingPayload({
          includeFacebookContent: false,
          snapshotOverride: sourceSnapshot,
          selectedJobDescriptionOverride: options.selectedJobDescriptionOverride,
          forceFacebookChannel: options.forceFacebookChannel ?? true,
        });
        if (payload) {
          try {
            const response = await previewAmisJobPublishPlan(token, payload);
            if (facebookContentGenerationSeqRef.current !== generationSeq) return null;
            content = response.facebookPublishPlan?.content?.trim() ?? '';
            generatedFromPublishPlan = Boolean(content);
          } catch (err) {
            if (err instanceof ApiClientError && err.status === 401) throw err;
          }
        }
      }

      if (!content) {
        const response = await generateFacebookPreviewContent(token, {
          snapshot: sourceSnapshot,
          mode: 'AI',
        });
        if (facebookContentGenerationSeqRef.current !== generationSeq) return null;
        content = response.content.trim();
        contentMode = response.mode === 'AI' ? 'AI' : 'TEMPLATE';
      }

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
      setFacebookContentMessage(
        generatedFromPublishPlan
          ? 'Facebook content generated from the same publish plan used for posting.'
          : 'Đã sinh nội dung Facebook từ JD hiện tại.',
      );
      const draftScope = await getFacebookContentDraftScope(
        options.selectedJobDescriptionOverride ?? selectedJobDescription,
      );
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
      setFacebookContent(publishPlanContent);
      setFacebookContentState('READY');
      setFacebookContentMessage('Đang dùng nội dung Facebook mặc định từ kế hoạch đăng hiện tại.');
      return publishPlanContent;
    }

    if (!snapshot || !token) return '';
    return (await generateFacebookPostContent())?.trim() ?? '';
  }

  async function generateFacebookDraftContent() {
    const content = await generateFacebookPostContent();
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
    const draftContent = options.includeDraft ? facebookContentDraft.trim() : '';
    return draftContent || facebookContentRef.current.trim() || facebookContent.trim();
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
      if (auth.user.role !== 'ADMIN' && auth.user.role !== 'HR') {
        throw new ApiClientError('FORBIDDEN', 'Only ADMIN and HR can sync postings.', 403);
      }
      await setAuthTokens({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });
      await ensureRegisteredExtensionInstance(auth.accessToken);
      setToken(auth.accessToken);
      setUser(auth.user);
      setState('READY');
      await loadJobDescriptions(auth.accessToken);
      await loadLatestAutoSyncState({ silent: true });
    } catch (err) {
      setError(toErrorMessage(err));
      setState('AUTH_REQUIRED');
    }
  }

  async function logout() {
    await clearAccessToken();
    setToken(null);
    setUser(null);
    setJobDescriptions([]);
    setJobDescriptionPagination(null);
    setJobDescriptionStatus('IDLE');
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

  async function syncPortalJobDescriptions() {
    if (!token || vcsPortalSyncState === 'SYNCING') return;

    setVcsPortalSyncState('SYNCING');
    setVcsPortalSyncMessage(null);
    setVcsPortalSyncResult(null);

    try {
      const response = await syncVcsPortalJobDescriptions(token);
      setVcsPortalSyncResult(response);
      setVcsPortalSyncState(response.failedCount > 0 ? 'ERROR' : 'SUCCESS');
      setVcsPortalSyncMessage(
        response.failedCount > 0
          ? `${response.failedCount} Portal item(s) failed. Synced ${response.createdCount + response.updatedCount + response.unchangedCount} item(s).`
          : `Portal sync complete. Synced ${response.fetchedCount} item(s).`,
      );
      await loadJobDescriptions(token, 1);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        return;
      }

      setVcsPortalSyncState('ERROR');
      setVcsPortalSyncMessage(toErrorMessage(err));
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

      setApplicationsContext(context);
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

  async function refreshAmisRecruitmentContextFromActiveTab(options: { silent?: boolean; sourceTabId?: number } = {}) {
    try {
      const activeTab = await getActiveTab();
      if (options.sourceTabId !== undefined && activeTab.id !== options.sourceTabId) return;

      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        lastAmisJobInitiationResetKeyRef.current = null;
        missedRecruitmentContextCountRef.current = 0;
        setActiveAmisCandidateId(null);
        setActiveAmisRecruitmentContext(null, null);
        return;
      }

      if (isAmisJobInitiationPage(activeTab.url)) {
        missedRecruitmentContextCountRef.current = 0;
        await resetSelectedJobDescriptionForAmisJobInitiation(activeTab);
        setActiveAmisCandidateId(null);
        setActiveAmisRecruitmentContext(null, null);
        return;
      }

      lastAmisJobInitiationResetKeyRef.current = null;
      const context = parseAmisRecruitmentContextFromUrl(activeTab.url);
      setActiveAmisCandidateId(context.amisCandidateId);
      let pageKind: string | null = null;
      if (!context.amisRecruitmentId) {
        const pageContext = await sendMessageToAmisTab(activeTab.id, {
          type: GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE,
        });
        if (isAmisRecruitmentContextResponse(pageContext)) {
          pageKind = pageContext.pageKind ?? null;
        }
        if (isAmisRecruitmentContextResponse(pageContext) && pageContext.ok) {
          context.amisRecruitmentId = pageContext.amisRecruitmentId ?? null;
          context.amisRecruitmentRoundId = pageContext.amisRecruitmentRoundId ?? null;
          context.sourceUrl = pageContext.sourceUrl ?? null;
        }
      }

      if (!context.amisRecruitmentId) {
        missedRecruitmentContextCountRef.current += 1;
        if (
          activeAmisRecruitmentIdRef.current
          && activeTab.url?.startsWith('https://amisapp.misa.vn/')
          && pageKind !== 'LIST'
        ) {
          return;
        }

        if (pageKind === 'LIST' || !isLikelyAmisRecruitmentPage(activeTab.url) || missedRecruitmentContextCountRef.current >= 2) {
          setActiveAmisRecruitmentContext(null, null);
        }
        return;
      }

      missedRecruitmentContextCountRef.current = 0;
      const contextChanged = setActiveAmisRecruitmentContext(context.amisRecruitmentId, context.amisRecruitmentRoundId ?? null);
      await refreshPostingSnapshotForActiveContext(context.amisRecruitmentId, activeTab, {
        force: contextChanged,
        silent: true,
        sourceUrl: context.sourceUrl ?? activeTab.url,
      });

      if (tokenRef.current && context.sourceUrl && lastApplicationsFallbackSyncUrlRef.current !== context.sourceUrl) {
        await syncAmisApplicationsFromAmisTab(tokenRef.current, activeTab.id, context.sourceUrl);
      }
    } catch (err) {
      if (!options.silent) setApplicationsMessage(toErrorMessage(err));
    }
  }

  async function resetSelectedJobDescriptionForAmisJobInitiation(activeTab: ChromeTab) {
    const resetKey = `${activeTab.id}:${normalizeAmisJobInitiationUrl(activeTab.url ?? '')}`;
    if (lastAmisJobInitiationResetKeyRef.current === resetKey) return;
    lastAmisJobInitiationResetKeyRef.current = resetKey;

    setSelectedJobDescription(null);
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
    if (tokenRef.current) {
      void loadAmisApplications(tokenRef.current, message.payload.amisRecruitmentId, { silent: true });
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

  async function uploadAiEvaluationToAmis(application: AmisApplicationsForRecruitment['applications'][number]) {
    if (!token) return;
    setAiEvaluationApplicationId(application.applicationId);
    setApplicationsMessage(null);
    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        throw new Error('Open the AMIS candidate documents tab first.');
      }
      const [detail, parsedProfile] = await Promise.all([
        getApplicationAiMatchPreview(token, application.applicationId),
        getApplicationParsedProfile(token, application.applicationId),
      ]);
      const previewPdf = await createAiMatchPreviewPdf(detail, parsedProfile);
      if (previewPdf.length < 1000) {
        throw new Error('PDF đánh giá AI được tạo ra không hợp lệ hoặc đang rỗng.');
      }
      const response = await sendMessageToAmisTab(activeTab.id, {
        type: UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE,
        payload: {
          files: [{
            fileName: `ai-match-preview-${application.candidateName || 'candidate'}.pdf`,
            mimeType: 'application/pdf',
            dataBase64: previewPdf,
          }],
        },
      });
      if (!isUploadAmisCvFileResponse(response) || !response.ok) {
        throw new Error(isUploadAmisCvFileResponse(response)
          ? response.error ?? 'AMIS did not accept the AI evaluation PDF.'
          : 'AMIS tab did not confirm AI evaluation upload.');
      }
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

      if (!isUploadAmisCvFileResponse(response) || !response.ok) {
        throw new Error(isUploadAmisCvFileResponse(response)
          ? response.error ?? 'AMIS did not accept the CV file.'
          : `AMIS tab did not confirm CV upload. Response: ${JSON.stringify(response ?? null).slice(0, 160)}`);
      }

      registerPendingAmisUploads(uploadableApplications);
      const sourceChannels = new Set(uploadableApplications.map((application) =>
        normalizeAmisSourceChannel(application.sourceChannel),
      ));
      const uniqueSourceChannel = sourceChannels.size === 1
        ? [...sourceChannels][0]
        : null;
      const amisSourceName = getAmisSourceName(uniqueSourceChannel);
      const hasVcsPortalSource = sourceChannels.has('VCSPORTAL');
      let sourceSelectionMessage = '';

      if (amisSourceName && (uploadableApplications.length === 1 || uniqueSourceChannel === 'VCSPORTAL')) {
        try {
          const sourceResponse = await sendMessageToAmisTab(activeTab.id, {
            type: SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE,
            payload: { sourceName: amisSourceName },
          }, 0);
          sourceSelectionMessage = isConfirmedAmisCandidateSourceSelection(
            sourceResponse,
            amisSourceName,
          )
            ? ` Đã chọn nguồn ứng viên ${amisSourceName} trên AMIS.`
            : ` CV đã được đưa vào form, nhưng chưa thể tự chọn nguồn ${amisSourceName}.${formatAmisCandidateSourceSelectionFailure(sourceResponse)}`;
        } catch (error) {
          sourceSelectionMessage = ` CV đã được đưa vào form, nhưng chưa thể tự chọn nguồn ${amisSourceName}. ${toErrorMessage(error)}`;
        }
      } else if (uploadableApplications.length === 1 && uniqueSourceChannel) {
        sourceSelectionMessage = ` Không tìm thấy mapping nguồn AMIS cho "${uploadableApplications[0].sourceChannel ?? uniqueSourceChannel}"; extension không tự gán nguồn.`;
      } else if (hasVcsPortalSource) {
        sourceSelectionMessage = ' CV đã được đưa vào form, nhưng không tự chọn nguồn VCS Portal vì lượt đồng bộ có nhiều nguồn khác nhau.';
      }

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
      clearPendingAmisUploads();
      setApplicationsContext(null);
      setApplicationsMessage(null);
      setApplicationsState(normalizedRecruitmentId ? 'LOADING' : 'IDLE');
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
      const injectionResults = await chrome.scripting.executeScript<[], AmisExtractionResult>({
        target: { tabId: activeTab.id },
        func: extractAmisJobFromPage,
      });
      const extraction = injectionResults[0]?.result;
      if (
        !extraction ||
        refreshSeq !== postingSnapshotRefreshSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== normalizedRecruitmentId
      ) {
        return;
      }

      if (isExtractionForRecruitment(extraction, normalizedRecruitmentId)) {
        postingSnapshotRefreshAttemptsRef.current.delete(attemptKey);
        applyExtractionResult(extraction);
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

  async function persistSelectedJobQuestions(jobDescriptionId: string, questionIds: string[]) {
    try {
      await chrome.storage?.session?.set({
        [getJobDescriptionQuestionSelectionStorageKey(jobDescriptionId)]: questionIds,
      });
    } catch {
      // Selection is a panel convenience state; failing to persist must not block AMIS work.
    }
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
    void loadJobDescriptions(token, 1);
  }

  function changeJobDescriptionStatusFilter(status: string) {
    setJobDescriptionStatusFilter(status);
    void loadJobDescriptions(token, 1, { status });
  }

  async function fillJobDescriptionInAmis(jobDescription: JobDescriptionSummary) {
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

      if (!chrome.tabs?.sendMessage) {
        throw new Error('Chrome tabs messaging is unavailable.');
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE,
        payload: buildAmisFormFillPayload(jobDescription),
      });

      if (!isFillResponse(response) || !response.ok) {
        throw new Error(isFillResponse(response) ? response.error : 'AMIS page did not confirm the form fill.');
      }

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

  async function loadLatestAmisCapture(options: { silent?: boolean } = {}) {
    try {
      const capture = await getLastAmisCapture();
      if (!capture) {
        if (!options.silent) setError('No AMIS SaveRecruitment capture is available yet.');
        return;
      }

      applyExtractionResult(capture);
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
    await loadDiagnostics();
    const capture = await getLastAmisCapture();
    if (!capture) {
      await extractFromCurrentTab({ silent: true });
    }
  }

  async function loadDiagnostics(options: { ensureHooks?: boolean } = {}) {
    if (options.ensureHooks !== false) {
      const result = await ensureAmisHooksInActiveTab().catch(() => null);
      if (result?.status === 'INJECTED') {
        await sleep(250);
      }
    }
    setDiagnostics(await getAmisDiagnostics());
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
      setFacebookGroupMessage(null);
      setFacebookGroupSyncDetails(null);
      setIsFacebookGroupSyncDetailsOpen(false);
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
        setFacebookGroupMessage('Không có group nào');
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
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(toErrorMessage(err));
    }
  }

  async function loadFacebookGroupsForFacebookChannel(accessToken: string): Promise<FacebookGroupsSyncResult> {
    setFacebookGroupSyncDetails(null);
    setFacebookGroupLoadState('CHECKING_LOGIN');
    setFacebookGroupMessage('Checking Facebook login in this browser.');

    const session = await ensureFacebookSession({
      onStatus: (event) => {
        setFacebookGroupLoadState(event.status === 'READY' ? 'LOADING_SAVED_GROUPS' : event.status);
        setFacebookGroupMessage(event.message);
      },
    });

    if (!session.account) {
      throw new Error('Could not identify the logged-in Facebook account. Please refresh Facebook and try again.');
    }
    const resolvedAccount = await resolveFacebookAccount(accessToken, session.account);
    setFacebookAccount(resolvedAccount);
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
        : 'Không có group nào',
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
        setFacebookGroupMessage('Không có group nào');
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
    options: { sessionReady?: boolean } = {},
  ): Promise<FacebookGroupsSyncResult> {
    setFacebookGroupSyncDetails(null);
    let activeAccount = facebookAccount;
    if (!options.sessionReady) {
      setFacebookGroupLoadState('CHECKING_LOGIN');
      setFacebookGroupMessage('Checking Facebook login in this browser.');

      const session = await ensureFacebookSession({
        onStatus: (event) => {
          setFacebookGroupLoadState(event.status === 'READY' ? 'LOADING_GROUPS' : event.status);
          setFacebookGroupMessage(event.message);
        },
      });
      if (!session.account) {
        throw new Error('Could not identify the logged-in Facebook account. Please refresh Facebook and try again.');
      }
      activeAccount = await resolveFacebookAccount(accessToken, session.account);
      setFacebookAccount(activeAccount);
      await setActiveFacebookAccountId(activeAccount.id);
    }

    if (!activeAccount) {
      throw new Error('Facebook account is not resolved. Please check Facebook login again.');
    }

    setFacebookGroupLoadState('LOADING_GROUPS');
    setFacebookGroupMessage('Đang quét danh sách nhóm đã tham gia trên Facebook...');

    const scanResult = await collectJoinedFacebookGroupsFromFacebookPage(
      (message) => {
        if (message) setFacebookGroupMessage(message);
      },
      { ensureSession: false },
    );
    const discoveredGroups = scanResult.groups;

    let discoverySummary: string | null = null;
    let details: FacebookGroupSyncDetails | null = null;
    if (!scanResult.scanComplete) {
      discoverySummary = 'Quét chưa hoàn tất nên chưa thay đổi dữ liệu nhóm.';
      setFacebookGroupMessage(discoverySummary);
    } else {
      setFacebookGroupMessage(`Đã quét được ${discoveredGroups.length} nhóm, đang đồng bộ lên VCS...`);
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
        : 'Không có group nào',
    );

    return { groups, selectedIds, discoverySummary, details, scanComplete: scanResult.scanComplete };
  }

  async function applyStoredFacebookContentDraft(
    recruitmentId: string | null,
    nextSnapshot: AmisJobSnapshot,
  ) {
    const draftScope = await getFacebookContentDraftScope();
    const draft = await getFacebookContentDraft({
      recruitmentId,
      tabId: draftScope.tabId,
      jobDescriptionId: draftScope.jobDescriptionId,
      snapshot: nextSnapshot,
    });
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
    setSelectedFacebookGroup(null);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsMessage(null);
    await refreshFacebookGroupsForSettings(token);
  }

  async function collectJoinedFacebookGroupsFromFacebookPage(
    onMessage?: (message: string) => void,
    options: { ensureSession?: boolean } = {},
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

    const tab = await chrome.tabs?.create({
      url: 'https://www.facebook.com/groups/joins/',
      active: false,
    });
    if (!tab?.id) {
      throw new Error('Không thể mở tab danh sách nhóm Facebook.');
    }

    try {
      await waitForTabComplete(tab.id);
      await sleep(1_000);

      const scanResult = await runScriptInTab<FacebookGroupsScanRunResult>(tab.id, collectFacebookGroupsFromPage);
      return {
        groups: uniqueDiscoveredGroups(scanResult.groups ?? []),
        scanComplete: scanResult.scanComplete === true,
      };
    } finally {
      await closeTabSafely(tab.id);
    }
  }

  function closeFacebookGroupSettings() {
    setIsFacebookSettingsOpen(false);
    setFacebookGroupModalMode('SETTINGS');
    setSelectedFacebookGroup(null);
    setIsFacebookGroupFormOpen(false);
    setFacebookSettingsState('IDLE');
    setFacebookSettingsMessage(null);
    setFacebookGroupName('');
    setFacebookGroupUrl('');
    setFacebookGroupUrlError(null);
    setEditFacebookGroupName('');
    setEditFacebookGroupUrl('');
    setEditFacebookGroupUrlError(null);
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
    setRefreshingFacebookHistoryIds([]);
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

  async function refreshFacebookHistoryItem(item: FacebookPublishHistoryListItem) {
    const accessToken = tokenRef.current;
    if (!accessToken) {
      setState('AUTH_REQUIRED');
      setFacebookHistoryMessage('Sign in to VCS Recruitment before refreshing Facebook post status.');
      return;
    }

    const refreshItem = withFacebookHistoryGroupFallback(item, selectedFacebookHistoryGroup);
    if (!isRefreshableFacebookHistoryItem(refreshItem)) {
      setFacebookHistoryMessage('Bài này cần URL bài viết hoặc URL group Facebook hợp lệ để refresh trạng thái.');
      return;
    }

    setRefreshingFacebookHistoryIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]);
    setFacebookHistoryMessage(`Đang refresh trạng thái bài "${item.title}".`);

    try {
      const statusCheck = await refreshFacebookPostReviewStatus(refreshItem);
      await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
      await syncFacebookImageStatusFromHistoryItem(refreshItem, statusCheck.facebookReviewStatus);
      await loadFacebookPostHistory(selectedFacebookHistoryGroup, facebookHistoryFilter, facebookHistoryPage);
      setFacebookHistoryMessage(statusCheck.message ?? 'Đã refresh trạng thái bài đăng.');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
        setFacebookHistoryMessage('Authentication expired. Sign in again before refreshing Facebook history.');
        return;
      }

      setFacebookHistoryMessage(toErrorMessage(err));
    } finally {
      setRefreshingFacebookHistoryIds((ids) => ids.filter((id) => id !== item.id));
    }
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

      let postedCount = 0;
      let rejectedCount = 0;
      let deletedCount = 0;
      let unresolvedCount = 0;
      let issueCount = 0;

      for (let index = 0; index < itemsToRefresh.length; index += 1) {
        const item = itemsToRefresh[index];
        setRefreshingFacebookHistoryIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]);
        setFacebookHistoryMessage(`Đang kiểm tra ${index + 1}/${itemsToRefresh.length}: ${item.title}`);

        try {
          const statusCheck = await refreshFacebookPostReviewStatus(item);
          await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
          await syncFacebookImageStatusFromHistoryItem(item, statusCheck.facebookReviewStatus);
          if (statusCheck.facebookReviewStatus === 'POSTED') postedCount += 1;
          else if (statusCheck.facebookReviewStatus === 'REJECTED') rejectedCount += 1;
          else if (statusCheck.facebookReviewStatus === 'DELETED') deletedCount += 1;
          else unresolvedCount += 1;
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 401) {
            await clearAccessToken();
            setToken(null);
            setUser(null);
            setState('AUTH_REQUIRED');
            setFacebookHistoryMessage('Authentication expired. Sign in again before refreshing Facebook history.');
            return;
          }

          issueCount += 1;
        } finally {
          setRefreshingFacebookHistoryIds((ids) => ids.filter((id) => id !== item.id));
        }
      }

      await loadFacebookPostHistory(group, facebookHistoryFilter, facebookHistoryPage);
      setFacebookHistoryMessage(
        `Đã kiểm tra ${itemsToRefresh.length} bài. ${postedCount} đã đăng, ${rejectedCount} bị từ chối, ${deletedCount} đã xóa, ${unresolvedCount} chưa xác định/chờ duyệt${issueCount ? `, ${issueCount} lỗi` : ''}.`,
      );
    } catch (err) {
      setFacebookHistoryMessage(toErrorMessage(err));
    } finally {
      setIsRefreshingFacebookHistoryGroup(false);
      setRefreshingFacebookHistoryIds([]);
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
    setEditFacebookGroupUrlError(null);
    setFacebookSettingsState('READY');
    setFacebookSettingsMessage(null);
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
    setEditFacebookGroupUrlError(null);
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
        setFacebookSettingsMessage(null);
        setEditFacebookGroupUrlError('Group đã tồn tại.');
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
      setFacebookSettingsMessage(`"${group.targetName}" is already queued for checking.`);
      return;
    }

    facebookGroupVerificationQueueRef.current = [...facebookGroupVerificationQueueRef.current, group];
    setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));
    setFacebookSettingsState('READY');
    setFacebookSettingsMessage(`Queued "${group.targetName}" for checking.`);
    void processFacebookGroupVerificationQueue();
  }

  async function processFacebookGroupVerificationQueue() {
    if (facebookGroupVerificationRunningRef.current) return;
    facebookGroupVerificationRunningRef.current = true;

    let checkedCount = 0;
    let issueCount = 0;
    const queuedAtStart = facebookGroupVerificationQueueRef.current.length;

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
        setFacebookSettingsMessage(`Checking "${group.targetName}" (${checkedCount + 1}/${Math.max(queuedAtStart, checkedCount + 1)}) with the current Facebook browser session.`);

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
          checkedCount += 1;
          if (!savedGroup.selectable) issueCount += 1;
          setFacebookSettingsMessage(
            savedGroup.selectable
              ? `"${savedGroup.targetName}" can be used for publishing (${savedGroup.quotaLabel} today).`
              : getFacebookGroupVerificationMessage(savedGroup),
          );

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

          checkedCount += 1;
          issueCount += 1;
          setFacebookSettingsState('READY');
          setFacebookSettingsMessage(`Could not check "${group.targetName}": ${toErrorMessage(err)}`);
        } finally {
          activeFacebookGroupVerificationIdRef.current = null;
          setVerifyingFacebookGroupIds([]);
        }
      }

      if (checkedCount > 0) {
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage(
          issueCount > 0
            ? `Checked ${checkedCount} Facebook group(s). ${issueCount} group(s) need attention.`
            : `Checked ${checkedCount} Facebook group(s). All checked groups can be used if quota allows.`,
        );
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
    const targetUrlError = getFacebookGroupUrlValidationError(targetUrl, facebookGroups);
    if (targetUrlError) {
      setFacebookGroupUrlError(targetUrlError);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      return;
    }
    setFacebookGroupUrlError(null);
    if (!targetName) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Tên nhóm là bắt buộc.');
      return;
    }
    if (!isFacebookGroupUrlCandidate(targetUrl)) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Link URL phải có dạng https://www.facebook.com/groups/{groupId}.');
      return;
    }

    setFacebookSettingsState('SAVING');
    setFacebookSettingsMessage(null);

    try {
      const savedGroup = await createFacebookGroup(token, {
        targetName,
        targetUrl,
        facebookAccountId: facebookAccount?.id,
      });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
      setFacebookGroupName('');
      setFacebookGroupUrl('');
      setFacebookGroupUrlError(null);
      setIsFacebookGroupFormOpen(false);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(`Added "${savedGroup.targetName}". Click Check before using it for publishing.`);

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
        setFacebookGroupUrlError('Group đã tồn tại.');
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
    const targetUrlError = getFacebookGroupUrlValidationError(
      targetUrl,
      facebookGroups,
      selectedFacebookGroup.targetId,
    );
    if (targetUrlError) {
      setEditFacebookGroupUrlError(targetUrlError);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(null);
      return;
    }
    setEditFacebookGroupUrlError(null);
    if (!targetName) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Tên nhóm là bắt buộc.');
      return;
    }
    if (!isFacebookGroupUrlCandidate(targetUrl)) {
      setFacebookSettingsState('ERROR');
      setFacebookSettingsMessage('Link URL phải có dạng https://www.facebook.com/groups/{groupId}.');
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
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
      setSelectedFacebookGroup(null);
      setEditFacebookGroupName('');
      setEditFacebookGroupUrl('');
      setEditFacebookGroupUrlError(null);
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
        setFacebookSettingsState('READY');
        setFacebookSettingsMessage(null);
        setEditFacebookGroupUrlError('Group đã tồn tại.');
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
      const deletedGroup = await deleteFacebookGroup(token, selectedFacebookGroup.targetId, facebookAccount?.id);
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token, facebookAccount?.id));
      setFacebookGroups(groups);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups, selectedFacebookGroupIds.filter((targetId) => (
        targetId !== selectedFacebookGroup.targetId
      )));
      setSelectedFacebookGroup(null);
      setFacebookGroupModalMode('SETTINGS');
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(`Đã xóa nhóm "${deletedGroup.targetName}".`);

      if (selectedPostingChannels.includes('FACEBOOK')) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(
          groups.length > 0
            ? buildFacebookGroupSelectionMessage(nextSelectedIds, groups)
            : 'Không có group nào',
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

    return {
      sourceSystem: 'AMIS',
      amisRecruitmentId,
      amisUrl,
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
        selectedJobDescriptionId: jobDescriptionForMetadata?.id,
        selectedQuestionSetId: jobDescriptionQuestionContext?.questionSet?.id,
        selectedQuestionCount: selectedJobQuestionIds.size,
      },
    } satisfies SyncAmisJobPostingRequest;
  }

  async function sync() {
    if (!token || !snapshot || !amisRecruitmentId || missingFields.length > 0) return;
    if (isFacebookImageReading) {
      setError('Vui lòng chờ ảnh upload được xử lý xong trước khi đăng bài.');
      setState('ERROR');
      return;
    }
    if (hasFacebookImageAttachmentError) {
      setError('Vui lòng bỏ ảnh lỗi hoặc chọn ảnh hợp lệ trước khi đăng bài.');
      setState('ERROR');
      return;
    }
    const facebookTargetIds = selectedPostingChannels.includes('FACEBOOK') ? selectedFacebookGroupIds : [];
    if (selectedPostingChannels.includes('FACEBOOK') && facebookTargetIds.length === 0) {
      setError('Select at least one Facebook group before publishing.');
      setState('ERROR');
      return;
    }
    const shouldPublishFacebook = selectedPostingChannels.includes('FACEBOOK');
    let facebookContentForPublish = shouldPublishFacebook
      ? getEffectiveFacebookContent()
      : '';
    if (shouldPublishFacebook && !facebookContentForPublish) {
      const generatedContent = await generateFacebookPostContent({ forceFacebookChannel: true });
      if (!generatedContent) {
        setError('Facebook post content is required before publishing.');
        setState('ERROR');
        return;
      }
      facebookContentForPublish = generatedContent.trim();
    }

    const payload = buildAmisJobPostingPayload({
      facebookContentOverride: facebookContentForPublish || null,
    });
    if (!payload) return;

    setState('SYNCING');
    setError(null);

    try {
      const response = await syncAndPublishAmisJob(token, payload);
      setResult(response);
      let publishedFacebookPlan: FacebookPublishPlan | null = null;
      if (response.facebookPublishPlan && shouldPublishFacebook) {
        publishedFacebookPlan = await startFacebookPublish(response.facebookPublishPlan, facebookContentForPublish);
      }
      const confirmedFacebookContent = publishedFacebookPlan?.content
        ?? response.facebookPublishPlan?.content;
      if (confirmedFacebookContent && shouldPublishFacebook) {
        facebookContentRef.current = confirmedFacebookContent;
        setFacebookContent(confirmedFacebookContent);
        setFacebookContentState('READY');
        setFacebookContentMessage('Đã cập nhật nội dung Facebook theo kế hoạch đăng thật.');
      }
      if (response.facebookPublishPlan && shouldPublishFacebook) {
        return;
      }
      setState('SUCCESS');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearAccessToken();
        setToken(null);
        setUser(null);
        setState('AUTH_REQUIRED');
      } else {
        setError(toErrorMessage(err));
        setState('ERROR');
      }
    }
  }

  async function startFacebookPublish(plan: FacebookPublishPlan, contentOverride?: string | null) {
    if (!token) return null;
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
    if (startedFacebookPlanKeys.current.has(planKey)) return planForPublish;

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
    setActiveWorkspaceTab(tab);
  }

  function toggleWorkspacePin(tab: WorkspaceTab) {
    setPinnedWorkspaceTab((current) => (current === tab ? null : tab));
  }

  function getWorkspaceTabLabel(tab: WorkspaceTab) {
    return WORKSPACE_TABS.find((item) => item.id === tab)?.label ?? tab;
  }

  function renderWorkspacePanel(tab: WorkspaceTab) {
    const isPinned = pinnedWorkspaceTab === tab;
    const isFlatTab = tab === 'posting' || tab === 'cv';

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
        {tab === 'overview' ? renderOverviewPanel() : null}
        {tab === 'posting' ? renderPostingPanel() : null}
        {tab === 'cv' ? renderCvPanel() : null}
      </section>
    );
  }

  function renderFacebookImageAttachPromptModal() {
    if (!facebookImageAttachPrompt) return null;

    return (
      <div className="modal-backdrop" role="presentation">
        <section
          className="facebook-group-modal facebook-image-decision-modal"
          role="dialog"
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
        </section>
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
    const totalItems = facebookHistoryData?.total ?? 0;
    const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * FACEBOOK_HISTORY_PAGE_SIZE) + 1;
    const visibleEnd = Math.min(visibleStart + pageItems.length - 1, totalItems);
    const isLoadingHistory = facebookHistoryLoadState === 'LOADING';
    const isHistoryBusy = isLoadingHistory || isRefreshingFacebookHistoryGroup;
    const refreshableCount = summary.pendingReview + summary.unknown;
    const paginationItems = buildPostHistoryPaginationItems(currentPage, pageCount);

    return (
      <div className="modal-backdrop post-history-backdrop" role="presentation">
        <section
          className="post-history-modal"
          role="dialog"
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
                className={`post-history-refresh-all-button${isRefreshingFacebookHistoryGroup ? ' is-loading' : ''}`}
                title="Refresh trạng thái các bài đang chờ duyệt hoặc chưa rõ"
                disabled={isHistoryBusy || refreshableCount === 0}
                onClick={() => void refreshFacebookHistoryGroupStatuses()}
              >
                <RefreshIcon />
                <span>{isRefreshingFacebookHistoryGroup ? 'Đang kiểm tra' : 'Refresh trạng thái'}</span>
              </button>
              <button
                type="button"
                className="icon-button"
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
              <article className="post-history-metric is-deleted">
                <span>Đã xóa</span>
                <strong>{summary.deleted}</strong>
              </article>
            </div>

            <div className="post-history-filter-row">
              <span>Lọc theo:</span>
              <div>
                {FACEBOOK_HISTORY_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={facebookHistoryFilter === filter.value ? 'is-active' : ''}
                    disabled={isHistoryBusy}
                    onClick={() => void changeFacebookHistoryFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
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
                  {pageItems.length > 0 ? pageItems.map((item) => {
                    const isRefreshing = refreshingFacebookHistoryIds.includes(item.id);
                    const postUrl = getValidFacebookGroupPostUrl(item.externalPostUrl);
                    const refreshItem = withFacebookHistoryGroupFallback(item, selectedFacebookHistoryGroup);
                    const canRefreshItem = isRefreshableFacebookHistoryItem(refreshItem);
                    return (
                    <tr key={item.id}>
                      <td>{formatDate(item.submittedAt ?? item.createdAt ?? undefined) ?? '-'}</td>
                      <td>
                        <span>{item.title}</span>
                        {item.message ? <small>{item.message}</small> : null}
                        {!item.message && item.contentPreview ? <small>{item.contentPreview}</small> : null}
                        {item.lastStatusCheckedAt ? (
                          <small>Đã kiểm tra: {formatFacebookHistoryDateTime(item.lastStatusCheckedAt) ?? item.lastStatusCheckedAt}</small>
                        ) : null}
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
                          ) : null}
                          {canRefreshItem ? (
                          <button
                            type="button"
                            className={`post-history-action-button is-refresh${isRefreshing ? ' is-loading' : ''}`}
                            title="Refresh trạng thái bài đăng"
                            aria-label={`Refresh trạng thái bài đăng ${item.title}`}
                            disabled={isHistoryBusy}
                            onClick={() => void refreshFacebookHistoryItem(item)}
                          >
                            <RefreshIcon />
                          </button>
                        ) : (
                          !postUrl ? <span className="post-history-no-action">-</span> : null
                        )}
                        </div>
                      </td>
                    </tr>
                    );
                  }) : isLoadingHistory ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="post-history-empty">
                          <strong>Đang tải lịch sử</strong>
                          <span>Đang lấy dữ liệu bài đăng Facebook từ backend.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        <div className="post-history-empty">
                          <strong>{facebookHistoryLoadState === 'ERROR' ? 'Không tải được lịch sử' : 'Chưa có dữ liệu lịch sử'}</strong>
                          <span>{facebookHistoryLoadState === 'ERROR' ? (facebookHistoryMessage ?? 'Vui lòng thử lại sau.') : 'Các bài đã auto đăng vào group này sẽ hiển thị tại đây.'}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="post-history-pagination">
                <span>
                  Hiển thị <strong>{visibleStart}</strong> đến <strong>{visibleEnd}</strong> trong <strong>{totalItems}</strong> kết quả
                </span>
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
              </div>
            </div>
          </div>

          <footer className="post-history-footer">
            <button type="button" className="secondary-button compact-button" onClick={closeFacebookPostHistory}>
              Đóng
            </button>
          </footer>
        </section>
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
    return (
      <div className="posting-detail-content">
        {renderJobDescriptionPanel()}
        {renderCareerQuestionPanel()}
        {renderChannelPanel()}

        {missingFields.length > 0 ? <p className="warning-text">Missing: {missingFields.join(', ')}</p> : null}

        <button
          type="button"
          className="primary-button sync-button"
          disabled={syncDisabled}
          onClick={sync}
        >
          {facebookRunning ? 'ĐANG ĐĂNG FACEBOOK...' : state === 'SYNCING' ? 'ĐANG ĐỒNG BỘ...' : isFacebookImageReading ? 'ĐANG TẢI ẢNH...' : 'ĐỒNG BỘ VÀ ĐĂNG'}
        </button>

        {state === 'ERROR' && error ? <p className="error-text">{error}</p> : null}

        {result ? (
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

  function renderFacebookContentPanel() {
    if (!facebookSelected) return null;
    if (!selectedJobDescription) return null;

    const effectiveContent = getEffectiveFacebookContent();
    const canGenerate = Boolean(token && snapshot) && !facebookContentBusy;
    const previewTitle = snapshot?.title ?? selectedJobDescription?.title ?? 'Bài đăng tuyển dụng';
    const previewCopy = effectiveContent
      ? summarizeText(effectiveContent)
      : summarizeText(snapshot?.summary ?? snapshot?.description ?? selectedJobDescription?.summary ?? selectedJobDescription?.description);
    const helperText = effectiveContent
      ? '{{APPLY_URL}} sẽ được thay bằng link tuyển dụng thật sau khi đồng bộ.'
      : 'Sinh bài từ JD/AMIS snapshot hiện tại trước khi đăng.';

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
            <strong>{previewTitle}</strong>
            <span>{previewCopy || 'Chưa có nội dung preview.'}</span>
          </div>
          <div className="facebook-preview-actions">
            <button
              type="button"
              className="secondary-button compact-button facebook-generate-button"
              disabled={!canGenerate}
              onClick={() => void generateFacebookPostContent()}
            >
              {facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}
            </button>
            <button
              type="button"
              className="secondary-button compact-button facebook-full-button"
              disabled={facebookContentBusy}
              onClick={() => void openFacebookPreviewModal()}
            >
              Xem bản đầy đủ
              <ExternalLinkIcon />
            </button>
          </div>
        </div>

        <div className="facebook-content-meta is-preview">
          <span>{effectiveContent.length} ký tự</span>
          <span>{helperText}</span>
        </div>

        {facebookContentMessage ? (
          <p className={facebookContentState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {facebookContentMessage}
          </p>
        ) : null}
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

    if (facebookPreviewModalMode === 'EDIT') {
      return (
        <div className="modal-backdrop facebook-preview-backdrop" role="presentation">
          <section
            className="facebook-composer-modal"
            role="dialog"
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
                <div className="facebook-composer-library-header">
                  <div>
                    <GridIcon />
                    <strong>Thư viện ảnh</strong>
                  </div>
                  <button
                    type="button"
                    className="text-button facebook-composer-upload-button"
                    disabled={facebookImageAddDisabled}
                    onClick={openFacebookImageFilePicker}
                  >
                    <UploadIcon />
                    <span>Tải lên</span>
                  </button>
                </div>
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
                        <CloseIcon />
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
          </section>
        </div>
      );
    }

    return (
      <div className="modal-backdrop facebook-preview-backdrop" role="presentation">
        <section
          className="facebook-preview-modal"
          role="dialog"
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
                <span className="facebook-post-avatar">V</span>
                <span>
                  <strong>VCS Recruitment</strong>
                  <small>Vừa xong · Công khai</small>
                </span>
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
                    <strong>{previewTitle}</strong>
                    <span>VCS Recruitment</span>
                  </div>
                )}
              </div>
              <footer className="facebook-post-preview-actions">
                <span>Thích</span>
                <span>Bình luận</span>
                <span>Chia sẻ</span>
              </footer>
            </article>
            <p className="facebook-preview-note">
              Đây là bản xem trước cách bài đăng sẽ hiển thị trên bảng tin Facebook của ứng viên.
              Nội dung có thể được chỉnh sửa trước khi đồng bộ và đăng.
            </p>
          </div>
          <footer className="facebook-preview-modal-footer">
            <button
              type="button"
              className="secondary-button facebook-modal-cancel-button"
              onClick={() => setFacebookPreviewModalMode(null)}
            >
              Đóng
            </button>
            <button
              type="button"
              className="primary-button facebook-modal-secondary-button"
              disabled={!canGenerate}
              onClick={() => void generateFacebookPostContent()}
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
        </section>
      </div>
    );
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
                        <span className="channel-action-icon" title="Select groups">
                          <ChevronUpIcon />
                        </span>
                      ) : null}
                      {isFacebookChannel ? (
                        <button
                          type="button"
                          className="secondary-button compact-button channel-sync-button"
                          title="Đồng bộ danh sách nhóm Facebook"
                          aria-label="Đồng bộ danh sách nhóm Facebook"
                          aria-busy={isFacebookLoading}
                          disabled={!token || isFacebookLoading}
                          onClick={() => void handleSyncFacebookGroups()}
                        >
                          {facebookGroupLoadState === 'LOADING_SAVED_GROUPS'
                            ? 'Loading...'
                            : isFacebookLoading
                              ? 'Syncing...'
                              : 'Sync'}
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
                  {showFacebookGroups ? (
                    <div className="channel-subselection">
                      <div className="channel-subselection-title">
                        <span>Nhóm Facebook</span>
                        {facebookAccount ? (
                          <span
                            className="channel-subselection-account"
                            title={facebookAccount.facebookExternalId}
                          >
                            {facebookAccount.displayName || 'Facebook account'}
                          </span>
                        ) : null}
                      </div>
                      <div className="channel-subselection-list">
                        {visibleFacebookGroups.length > 0 ? (
                          <p className="channel-subselection-summary">
                            {visibleSelectedFacebookGroupCount}/{visibleFacebookGroups.length} nhóm Facebook hợp lệ đã được chọn
                          </p>
                        ) : null}
                        {facebookGroupMessage
                          && !(facebookGroupLoadState === 'READY' && visibleFacebookGroups.length === 0) ? (
                          <p className={`channel-subselection-empty${facebookGroupLoadState === 'ERROR' ? ' is-error' : ''}`}>
                            <span>{facebookGroupMessage}</span>
                            {facebookGroupSyncDetails && (
                              facebookGroupSyncDetails.accepted.length > 0
                              || facebookGroupSyncDetails.removed.length > 0
                              || facebookGroupSyncDetails.reactivated.length > 0
                              || facebookGroupSyncDetails.filtered.length > 0
                              || facebookGroupSyncDetails.skipped.length > 0
                              || facebookGroupSyncDetails.errors.length > 0
                            ) ? (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setIsFacebookGroupSyncDetailsOpen(true)}
                              >
                                Xem chi tiết
                              </button>
                            ) : null}
                          </p>
                        ) : null}
                        {visibleFacebookGroups.length > 0 ? (
                          visibleFacebookGroups.map((group, index) => (
                            <div
                              key={`${group.key}-${index}`}
                              className={`channel-subselection-item${!group.selectable ? ' is-disabled' : ''}`}
                              title={!group.selectable ? group.disabledReason ?? undefined : undefined}
                            >
                              <label className="channel-group-select">
                                <input
                                  type="checkbox"
                                  checked={Boolean(group.id && selectedFacebookGroupIds.includes(group.id))}
                                  disabled={!group.id || !group.selectable}
                                  onChange={() => toggleFacebookGroupSelection(group.id)}
                                />
                                <span className="channel-group-copy">
                                  <span>{group.name}</span>
                                  <span className="channel-group-meta">
                                    {getFacebookEligibilityLabel(group.eligibilityStatus)}
                                    {group.quotaLabel ? ` · ${group.quotaLabel} today` : ''}
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                className="channel-group-history-button"
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
                          ))
                        ) : (
                          facebookGroupLoadState === 'READY'
                            ? <p className="channel-subselection-empty">Không có group nào</p>
                            : null
                        )}
                      </div>
                      {isSelected ? (
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
                      ) : null}
                      {isSelected ? renderFacebookContentPanel() : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
      </section>
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
        <h2>Mô tả công việc</h2>

        <form className="jd-toolbar" onSubmit={submitJobDescriptionSearch}>
          <input
            value={jobDescriptionSearch}
            onChange={(event) => setJobDescriptionSearch(event.target.value)}
            placeholder="Tìm kiếm JD"
            aria-label="Tìm kiếm JD"
          />
          <select
            value={jobDescriptionStatusFilter}
            aria-label="Lọc trạng thái JD"
            disabled={jobDescriptionStatus === 'LOADING'}
            onChange={(event) => changeJobDescriptionStatusFilter(event.target.value)}
          >
            {JOB_DESCRIPTION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="primary-button portal-sync-button"
            disabled={vcsPortalSyncState === 'SYNCING' || jobDescriptionStatus === 'LOADING'}
            onClick={() => void syncPortalJobDescriptions()}
          >
            {vcsPortalSyncState === 'SYNCING' ? 'Đang đồng bộ...' : 'Đồng bộ VCS Portal'}
          </button>
        </form>

        {vcsPortalSyncMessage ? (
          <p className={vcsPortalSyncState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {vcsPortalSyncMessage}
          </p>
        ) : null}

        {vcsPortalSyncResult ? (
          <section className="portal-sync-result" aria-label="VCS Portal sync result">
            <div className="portal-sync-result-header">
              <div>
                <p className="eyebrow">VCS Portal</p>
                <h3>{vcsPortalSyncResult.failedCount > 0 ? 'Sync finished with warnings' : 'Sync complete'}</h3>
              </div>
              <span className="status-badge">
                {formatDate(vcsPortalSyncResult.lastSyncedAt) ?? '-'}
              </span>
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
        ) : null}

        {jobDescriptionStatus === 'LOADING' ? (
          <p className="muted-text">Đang tải danh sách JD...</p>
        ) : null}

        {jobDescriptionError ? <p className="error-text">{jobDescriptionError}</p> : null}

        {jobDescriptionFillMessage ? (
          <p className={jobDescriptionFillState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {jobDescriptionFillMessage}
          </p>
        ) : null}

        {jobDescriptionStatus !== 'LOADING' && jobDescriptions.length === 0 ? (
          <p className="muted-text">Không tìm thấy JD phù hợp.</p>
        ) : null}

        {jobDescriptions.length > 0 ? (
          <ul className="jd-list">
            {jobDescriptions.map((jobDescription) => {
              const badge = getJobDescriptionStatusBadge(jobDescription);
              const isSelected = selectedJobDescription?.id === jobDescription.id;
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
                    disabled={jobDescriptionFillState === 'FILLING'}
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
        ) : null}

        {jobDescriptionPagination && jobDescriptionPagination.totalPages > 1 ? (
          <div className="pagination-row jd-pagination-row">
            <span>
              Hiển thị {visibleStart} - {visibleEnd} của {totalItems} kết quả
            </span>
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
              <button
                key={page}
                type="button"
                className={`jd-page-button${page === currentPage ? ' is-active' : ''}`}
                disabled={jobDescriptionStatus === 'LOADING'}
                onClick={() => void loadJobDescriptions(token, page)}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              className="jd-page-button"
              aria-label="Trang sau"
              disabled={
                jobDescriptionStatus === 'LOADING'
                || jobDescriptionPagination.page >= jobDescriptionPagination.totalPages
              }
              onClick={() => void loadJobDescriptions(token, jobDescriptionPagination.page + 1)}
            >
              <ChevronRightIcon />
            </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderCareerQuestionPanel() {
    return (
      <section className="question-panel career-question-panel compact-workspace-section post-card-section">
        <div className="question-section-header">
          <h2>Bộ câu hỏi</h2>
          {selectedJobDescription ? (
            <span className="question-auto-selected-badge">Tự động chọn tất cả</span>
          ) : null}
        </div>

        <div className="career-question-content">
          {!selectedJobDescription ? (
            <p className="question-select-alert">Chọn 1 JD để xem bộ câu hỏi tương ứng</p>
          ) : null}

          {careerQuestionMessage ? (
            <p className={careerQuestionState === 'ERROR' ? 'error-text' : 'muted-text'}>
              {careerQuestionMessage}
            </p>
          ) : null}

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
                <p className="career-question-empty">JD này chưa có bộ câu hỏi đang hoạt động.</p>
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

  function renderCvOverviewPanel() {
    const applications = applicationsContext?.applications ?? [];
    const stats = getCvOverviewStats(applications);
    const currentJobPostingId = result?.amisRecruitmentId === amisRecruitmentId
      ? result.jobPostingId
      : applicationsContext?.amisRecruitmentId === amisRecruitmentId
        ? applicationsContext.jobPostingId
        : null;
    const currentJobTitle = snapshot?.title
      ?? (amisRecruitmentId ? `AMIS recruitment ${amisRecruitmentId}` : 'Chưa chọn tin tuyển dụng');
    const hasCurrentJobMapping = Boolean(snapshot || currentJobPostingId);
    const publicUrl = currentJobPostingId
      ? `http://localhost:4000/public/job-postings/${currentJobPostingId}`
      : snapshot
        ? `https://vcs-portal.vn/jobs/${slugifyForDisplay(snapshot.title)}`
        : '-';

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
    const stats = getCvOverviewStats(applications);
    const applicationsForCurrentAmisCandidate = activeAmisCandidateId
      ? applications.filter((application) => application.amisCandidateId === activeAmisCandidateId)
      : applications;
    const filteredApplications = getVisibleCvApplications(applicationsForCurrentAmisCandidate, cvStatusFilter, cvSyncFilter, cvSortMode);
    const totalPages = Math.max(1, Math.ceil(filteredApplications.length / CV_APPLICATION_PAGE_SIZE));
    const currentPage = Math.min(cvApplicationPage, totalPages);
    const pageStartIndex = (currentPage - 1) * CV_APPLICATION_PAGE_SIZE;
    const pageApplications = filteredApplications.slice(pageStartIndex, pageStartIndex + CV_APPLICATION_PAGE_SIZE);
    const selectedPageApplications = pageApplications.filter((application) => selectedCvApplicationIds.has(application.applicationId));
    const selectedPageUploadableCount = selectedPageApplications.filter((application) =>
      canUploadApplicationCv(application)
      && !pendingAmisUploadApplicationIds.has(application.applicationId),
    ).length;
    const visibleStart = filteredApplications.length === 0 ? 0 : pageStartIndex + 1;
    const visibleEnd = Math.min(pageStartIndex + pageApplications.length, filteredApplications.length);
    const paginationPages = getPaginationPages(currentPage, totalPages);

    return (
      <section className="cv-list-screen">
        <div className="cv-total-card">
          <span>Tổng</span>
          <strong>{stats.totalApplied}</strong>
        </div>

        <div className="cv-filter-grid">
          <article className="is-success"><span>Đạt yêu cầu</span><strong>{stats.readyCount}</strong></article>
          <article className="is-warning"><span>Cần xem xét</span><strong>{stats.reviewCount}</strong></article>
          <article className="is-danger"><span>Không đạt</span><strong>{stats.failedCount}</strong></article>
          <article className="is-muted"><span>Chưa trả lời</span><strong>{stats.noAnswerCount}</strong></article>
        </div>

        <div className="cv-list-toolbar">
          <span>Danh sách ứng viên</span>
          <button
            type="button"
            className="cv-bulk-sync-button"
            disabled={selectedPageUploadableCount === 0 || Boolean(cvUploadApplicationId)}
            onClick={() => void uploadApplicationCvsToAmisForm(selectedPageApplications)}
          >
            <RefreshIcon />
            {cvUploadApplicationId === 'BATCH' ? 'Đang đồng bộ...' : 'Đồng bộ hàng loạt'}
          </button>
        </div>

        <div className="cv-filter-control-grid">
          <label>
            <span>Trạng thái CV</span>
            <select
              value={cvStatusFilter}
              onChange={(event) => {
                setCvStatusFilter(event.target.value as CvStatusFilter);
                setCvApplicationPage(1);
              }}
            >
              {CV_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Trạng thái đồng bộ</span>
            <select
              value={cvSyncFilter}
              onChange={(event) => {
                setCvSyncFilter(event.target.value as CvSyncFilter);
                setCvApplicationPage(1);
              }}
            >
              {CV_SYNC_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Sắp xếp</span>
            <select
              value={cvSortMode}
              onChange={(event) => {
                setCvSortMode(event.target.value as CvSortMode);
                setCvApplicationPage(1);
              }}
            >
              {CV_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
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
              const cvStatus = getApplicationCvDisplayStatus(application);
              const isAmisUploadPending = pendingAmisUploadApplicationIds.has(application.applicationId);
              const syncStatus = getApplicationAmisSyncStatus(application, isAmisUploadPending);
              const questionStatus = getApplicationQuestionStatus(application);
              const score = getApplicationMatchScore(application);
              const scoreTone = getApplicationScoreTone(score);
              const isSelected = selectedCvApplicationIds.has(application.applicationId);
              const canSyncToAmis = canUploadApplicationCv(application) && !isAmisUploadPending;

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
                      <span className="cv-avatar">{getCandidateInitials(application.candidateName)}</span>
                      <div>
                        <strong>{application.candidateName}</strong>
                        <span>{[application.email, application.mobile].filter(Boolean).join(' • ') || 'No contact'}</span>
                      </div>
                    </div>
                    <div className="cv-candidate-meta">
                      <span>Source: {application.sourceChannel ?? 'Chưa xác định'}</span>
                      <span>Applied: {formatDateTime(application.applyDate ?? application.createdAt ?? undefined) ?? '-'}</span>
                    </div>
                    <div className="cv-candidate-status-grid">
                      <span className={`cv-status-cell cv-status-with-score ${cvStatus.tone}`}>
                        <small>Quét CV</small>
                        <strong>{cvStatus.label}</strong>
                        <b className={`cv-score-pill ${scoreTone}`}>{score}</b>
                      </span>
                      <span className={`cv-status-cell ${questionStatus.tone}`}>
                        <small>Câu hỏi</small>
                        <strong>{questionStatus.label}</strong>
                      </span>
                      <span className={`cv-status-cell cv-sync-status-cell ${syncStatus.tone}`}>
                        <small>Đồng bộ AMIS</small>
                        <strong>{syncStatus.label}</strong>
                      </span>
                    </div>
                    <div className="cv-candidate-footer">
                      <button
                        type="button"
                        className="cv-sync-amis-button"
                        disabled={Boolean(aiEvaluationApplicationId)}
                        onClick={() => void uploadAiEvaluationToAmis(application)}
                      >
                        {aiEvaluationApplicationId === application.applicationId ? 'Đang tạo PDF...' : 'Tải đánh giá AI'}
                      </button>
                      <button
                        type="button"
                        className="cv-sync-amis-button"
                        disabled={!canSyncToAmis || Boolean(cvUploadApplicationId)}
                        onClick={() => void uploadApplicationCvToAmisForm(application)}
                      >
                        {cvUploadApplicationId === application.applicationId
                          ? 'Đang đồng bộ...'
                          : isAmisUploadPending
                            ? 'Chờ AMIS lưu'
                            : 'Đồng bộ AMIS'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-panel-state">
            <strong>Chưa có hồ sơ ứng viên</strong>
            <span>Mở AMIS recruitment có ứng viên hoặc refresh sau khi autosync chạy.</span>
          </div>
        )}

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

  function renderRuntimePanels() {
    return (
      <>
        <section className="capture-panel">
          <div className="status-row">
            <span>AMIS diagnostics</span>
            <strong>{diagnostics.length > 0 ? diagnostics[diagnostics.length - 1]?.type : 'NO_EVENTS'}</strong>
          </div>
          {diagnostics.length > 0 ? (
            <ul className="diagnostic-list">
              {diagnostics.slice(-6).reverse().map((event, index) => (
                <li key={`${event.timestamp}-${event.type}-${index}`}>
                  <strong>{event.type}</strong>
                  <span>{formatDiagnosticTime(event.timestamp)}</span>
                  {event.requestUrl ? <small>{event.requestUrl}</small> : null}
                  {event.details ? <small>{formatDiagnosticDetails(event.details)}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">
              No content-script event from AMIS yet. Reload the AMIS tab after reloading the extension.
            </p>
          )}
        </section>

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

        {facebookProgress ? (
          <section className="capture-panel">
            <div className="status-row">
              <span>Facebook publish</span>
              <strong>{facebookProgress.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Progress</dt>
                <dd>{facebookProgress.currentIndex}/{facebookProgress.total}</dd>
              </div>
              {facebookProgress.target ? (
                <div>
                  <dt>Target</dt>
                  <dd>{facebookProgress.target.targetName}</dd>
                </div>
              ) : null}
              <div>
                <dt>Status</dt>
                <dd>{facebookProgress.message}</dd>
              </div>
            </dl>
            {facebookProgress.results.length > 0 ? (
              <ul className="diagnostic-list">
                {facebookProgress.results.map((item) => (
                  <li key={`${item.targetName}-${item.status}`}>
                    <strong>{item.targetName}</strong>
                    <span>{item.status}</span>
                    <small>{item.message}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {extractionResult ? (
          <section className="capture-panel">
            <div className="status-row">
              <span>{extractionResult.status}</span>
              <strong>{extractionResult.confidence}</strong>
            </div>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{extractionResult.source}</dd>
              </div>
              <div>
                <dt>URL</dt>
                <dd>{extractionResult.url}</dd>
              </div>
              <div>
                <dt>Markers</dt>
                <dd>{extractionResult.evidence.markers.join(', ') || 'None'}</dd>
              </div>
            </dl>
            {extractionResult.warnings.length > 0 ? (
              <ul className="warning-list">
                {extractionResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <main className="extension-shell">
      <section className="extension-window">
        <header className="extension-header">
          <div>
            <h1>Tuyển dụng VCS</h1>
          </div>
          <div className="extension-header-actions">
            {user ? (
              <button type="button" className="text-button" onClick={logout}>
                Đăng xuất
              </button>
            ) : null}
          </div>
        </header>

        {state === 'AUTH_LOADING' ? <p className="muted-text extension-loading">Checking session...</p> : null}

        {state === 'AUTH_REQUIRED' ? (
          <form className="auth-form extension-auth-form" onSubmit={submitLogin}>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </label>
            <button type="submit" className="primary-button">Sign in</button>
            {error ? <p className="error-text">{error}</p> : null}
          </form>
        ) : null}

        {user ? (
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
      </section>

      {facebookPreviewModalMode ? renderFacebookPreviewModal() : null}

      {isFacebookSettingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          {facebookGroupModalMode === 'SETTINGS' ? (
            <section
              className="facebook-group-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="facebook-group-settings-title"
            >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Facebook</p>
                <h2 id="facebook-group-settings-title">Cài đặt Group Facebook</h2>
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
                    onClick={() => {
                      setIsFacebookGroupFormOpen(true);
                      setFacebookGroupUrlError(null);
                      setFacebookSettingsMessage(null);
                      setFacebookSettingsState('READY');
                    }}
                  >
                    Thêm nhóm mới
                  </button>
                ) : null}
              </div>

              {facebookSettingsMessage ? (
                <p className={`modal-status${facebookSettingsState === 'ERROR' ? ' is-error' : ''}`}>
                  {facebookSettingsMessage}
                </p>
              ) : null}

              {facebookSettingsState === 'LOADING' ? (
                <p className="muted-text">Đang tải danh sách nhóm từ backend...</p>
              ) : (
                <div className="facebook-group-list">
                  {validFacebookGroups.length > 0 ? (
                    validFacebookGroups.map((group) => {
                      const isGroupChecking = Boolean(group.targetId && verifyingFacebookGroupIds.includes(group.targetId));
                      const isGroupQueued = Boolean(group.targetId && queuedFacebookGroupIds.includes(group.targetId));
                      const groupStatusMessage = isGroupChecking
                        ? 'Checking with the current Facebook browser session...'
                        : isGroupQueued
                          ? 'Queued for checking.'
                          : getFacebookGroupDisabledReason(group);

                      return (
                      <article
                        key={group.targetId ?? group.targetExternalId ?? group.targetUrl ?? group.targetName}
                        className={`facebook-group-item${!isSelectableFacebookGroup(group) ? ' is-disabled' : ''}`}
                      >
                        <div className="facebook-group-info">
                          <div className="facebook-group-title-row">
                            <strong>{group.targetName}</strong>
                            <span className={`facebook-group-badge ${getFacebookGroupBadgeClass(group.eligibilityStatus)}`}>
                              {getFacebookEligibilityLabel(group.eligibilityStatus)}
                            </span>
                            <span className={`facebook-group-badge${group.quotaExceeded ? ' is-danger' : ' is-neutral'}`}>
                              {group.quotaLabel ?? `${group.todayPublishCount ?? 0}/${group.dailyPublishLimit ?? 10}`} today
                            </span>
                          </div>
                          <span>{group.targetExternalId ?? 'GROUP'}</span>
                        </div>
                        <div className="facebook-group-item-actions">
                          {group.targetUrl ? (
                            <a href={group.targetUrl} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="group-icon-button"
                            title="Lịch sử đăng bài"
                            aria-label={`Lịch sử đăng bài ${group.targetName}`}
                            onClick={() => openFacebookPostHistory({
                              id: group.targetId ?? null,
                              name: group.targetName,
                              url: group.targetUrl,
                              externalId: group.targetExternalId,
                            })}
                          >
                            <HistoryIcon />
                          </button>
                          <button
                            type="button"
                            className={`group-icon-button${isGroupChecking ? ' is-loading' : ''}`}
                            title={isGroupQueued ? 'Queued for posting eligibility check' : 'Check posting eligibility'}
                            aria-label={`Check posting eligibility for ${group.targetName}`}
                            disabled={facebookSettingsState === 'SAVING' || isGroupChecking || isGroupQueued || !group.targetId}
                            onClick={() => void checkFacebookGroupEligibility(group)}
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
                        {groupStatusMessage ? (
                          <p className="facebook-group-reason">{groupStatusMessage}</p>
                        ) : null}
                      </article>
                      );
                    })
                  ) : (
                    <div className="facebook-group-empty">
                      <strong>Chưa có nhóm Facebook</strong>
                      <p>Danh sách sẽ được nạp sau lần đồng bộ đầu tiên.</p>
                      {!isFacebookGroupFormOpen ? (
                        <button
                          type="button"
                          className="primary-button compact-button"
                          onClick={() => {
                            setIsFacebookGroupFormOpen(true);
                            setFacebookGroupUrlError(null);
                            setFacebookSettingsMessage(null);
                            setFacebookSettingsState('READY');
                          }}
                        >
                          Thêm nhóm mới
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {isFacebookGroupFormOpen ? (
                <form className="facebook-group-form" onSubmit={(event) => void submitFacebookGroup(event)}>
                  <label>
                    Tên nhóm
                    <input
                      value={facebookGroupName}
                      maxLength={255}
                      placeholder="Ví dụ: Việc làm IT Đà Nẵng"
                      onChange={(event) => setFacebookGroupName(event.target.value)}
                    />
                  </label>
                  <label>
                    Link URL
                    <input
                      value={facebookGroupUrl}
                      maxLength={2048}
                      placeholder="https://www.facebook.com/groups/..."
                      aria-invalid={Boolean(facebookGroupUrlFieldError)}
                      onChange={(event) => {
                        setFacebookGroupUrl(event.target.value);
                        setFacebookGroupUrlError(null);
                      }}
                    />
                    {facebookGroupUrlFieldError ? (
                      <span className="field-error">{facebookGroupUrlFieldError}</span>
                    ) : null}
                    <small>Link trực tiếp đến trang chủ của nhóm Facebook.</small>
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={facebookSettingsState === 'SAVING'}
                      onClick={() => {
                        setIsFacebookGroupFormOpen(false);
                        setFacebookGroupUrlError(null);
                        setFacebookSettingsMessage(validFacebookGroups.length > 0
                          ? null
                          : 'Chưa có nhóm Facebook nào.');
                        setFacebookSettingsState('READY');
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="primary-button compact-button"
                      disabled={facebookSettingsState === 'SAVING' || Boolean(facebookGroupUrlFieldError)}
                    >
                      <SaveIcon />
                      <span>{facebookSettingsState === 'SAVING' ? 'Đang thêm...' : 'Thêm mới'}</span>
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
            </section>
          ) : null}
          {facebookGroupModalMode === 'EDIT' && selectedFacebookGroup ? (
            <section
              className="facebook-group-modal"
              role="dialog"
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
                  Tên nhóm
                  <input
                    value={editFacebookGroupName}
                    maxLength={255}
                    placeholder="Hội Dev Java VN"
                    disabled={facebookSettingsState === 'SAVING'}
                    onChange={(event) => setEditFacebookGroupName(event.target.value)}
                  />
                </label>
                <label>
                  Link URL
                  <input
                    value={editFacebookGroupUrl}
                    maxLength={2048}
                    placeholder="https://facebook.com/groups/..."
                    disabled={facebookSettingsState === 'SAVING'}
                    aria-invalid={Boolean(editFacebookGroupUrlFieldError)}
                    onChange={(event) => {
                      setEditFacebookGroupUrl(event.target.value);
                      setEditFacebookGroupUrlError(null);
                    }}
                  />
                  {editFacebookGroupUrlFieldError ? (
                    <span className="field-error">{editFacebookGroupUrlFieldError}</span>
                  ) : null}
                  <small>Link trực tiếp đến trang chủ của nhóm Facebook.</small>
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={facebookSettingsState === 'SAVING'}
                    onClick={closeFacebookGroupActionModal}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="primary-button compact-button"
                    disabled={facebookSettingsState === 'SAVING' || Boolean(editFacebookGroupUrlFieldError)}
                  >
                    <SaveIcon />
                    <span>{facebookSettingsState === 'SAVING' ? 'Đang lưu...' : 'Lưu'}</span>
                  </button>
                </div>
              </form>
            </section>
          ) : null}
          {facebookGroupModalMode === 'DELETE' && selectedFacebookGroup ? (
            <section
              className="facebook-group-modal delete-group-modal"
              role="dialog"
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
                <div className="warning-icon">
                  <WarningIcon />
                </div>
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
                  <button
                    type="button"
                    className="text-button"
                    disabled={facebookSettingsState === 'SAVING'}
                    onClick={closeFacebookGroupActionModal}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="danger-button compact-button"
                    disabled={facebookSettingsState === 'SAVING'}
                    onClick={() => void confirmDeleteFacebookGroup()}
                  >
                    {facebookSettingsState === 'SAVING' ? 'Đang xóa...' : 'Xác nhận'}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
              {facebookImageAttachPrompt ? renderFacebookImageAttachPromptModal() : null}
      {isFacebookGroupSyncDetailsOpen && facebookGroupSyncDetails ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="facebook-group-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="facebook-group-sync-details-title"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Facebook</p>
                <h2 id="facebook-group-sync-details-title">Chi tiết đồng bộ nhóm</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                title="Đóng"
                aria-label="Đóng chi tiết đồng bộ nhóm"
                onClick={() => setIsFacebookGroupSyncDetailsOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>
            <div className="modal-body facebook-group-sync-details-body">
              <div className="facebook-group-sync-details-list">
                {facebookGroupSyncDetails.accepted.length > 0 ? (
                  <div className="facebook-group-sync-detail-section">
                    <strong>Nhóm hợp lệ/đã đồng bộ ({facebookGroupSyncDetails.accepted.length})</strong>
                    {facebookGroupSyncDetails.accepted.map((group, index) => (
                      <div className="facebook-group-sync-detail-item" key={`accepted-${group.externalId ?? group.name}-${index}`}>
                        <p>{group.name}</p>
                        {group.reason ? <span>{group.reason}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {facebookGroupSyncDetails.reactivated.length > 0 ? (
                  <div className="facebook-group-sync-detail-section">
                    <strong>Nhóm quay lại ({facebookGroupSyncDetails.reactivated.length})</strong>
                    {facebookGroupSyncDetails.reactivated.map((group, index) => (
                      <p key={`reactivated-${group.externalId ?? group.name}-${index}`}>{group.name}</p>
                    ))}
                  </div>
                ) : null}
                {facebookGroupSyncDetails.removed.length > 0 ? (
                  <div className="facebook-group-sync-detail-section">
                    <strong>Nhóm đã rời ({facebookGroupSyncDetails.removed.length})</strong>
                    {facebookGroupSyncDetails.removed.map((group, index) => (
                      <p key={`removed-${group.externalId ?? group.name}-${index}`}>{group.name}</p>
                    ))}
                  </div>
                ) : null}
                {facebookGroupSyncDetails.filtered.length > 0 ? (
                  <div className="facebook-group-sync-detail-section">
                    <strong>Nhóm không phù hợp bộ lọc tuyển dụng ({facebookGroupSyncDetails.filtered.length})</strong>
                    {facebookGroupSyncDetails.filtered.map((group, index) => (
                      <div className="facebook-group-sync-detail-item" key={`filtered-${group.externalId ?? group.name}-${index}`}>
                        <p>{group.name}</p>
                        {group.reason ? <span>{group.reason}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {facebookGroupSyncDetails.skipped.length > 0 ? (
                  <div className="facebook-group-sync-detail-section">
                    <strong>Mục bị bỏ qua ({facebookGroupSyncDetails.skipped.length})</strong>
                    {facebookGroupSyncDetails.skipped.map((group, index) => (
                      <div className="facebook-group-sync-detail-item" key={`skipped-${group.externalId ?? group.name}-${index}`}>
                        <p>{group.name}</p>
                        {group.reason ? <span>{group.reason}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {facebookGroupSyncDetails.errors.length > 0 ? (
                  <div className="facebook-group-sync-detail-section is-error">
                    <strong>Lỗi cần kiểm tra ({facebookGroupSyncDetails.errors.length})</strong>
                    {facebookGroupSyncDetails.errors.map((error, index) => (
                      <p key={`error-${index}`}>{error}</p>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button compact-button"
                  onClick={() => setIsFacebookGroupSyncDetailsOpen(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {selectedFacebookHistoryGroup ? renderFacebookPostHistoryModal() : null}
    </main>
  );
}

type IconProps = {
  className?: string;
};

function getChannelPostingStatusClass(channel: ChannelPostingResult) {
  const status = channel.status.toUpperCase();
  if (['CREATED', 'PUBLISHED', 'UPDATED', 'SUCCESS'].includes(status)) return 'is-success';
  if (['NOT_CONFIGURED', 'MANUAL_REQUIRED', 'SKIPPED', 'PENDING'].includes(status)) return 'is-muted';
  if (status.includes('FAIL') || status.includes('ERROR')) return 'is-error';
  return 'is-warning';
}

type PostHistoryPaginationItem = number | 'ellipsis-left' | 'ellipsis-right';

function buildPostHistoryPaginationItems(currentPage: number, pageCount: number): PostHistoryPaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: PostHistoryPaginationItem[] = [1];
  const start = currentPage <= 4
    ? 2
    : currentPage >= pageCount - 3
      ? pageCount - 4
      : currentPage - 1;
  const end = currentPage <= 4
    ? 5
    : currentPage >= pageCount - 3
      ? pageCount - 1
      : currentPage + 1;

  if (start > 2) {
    items.push('ellipsis-left');
  } else {
    for (let page = 2; page < start; page += 1) items.push(page);
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < pageCount - 1) {
    items.push('ellipsis-right');
  } else {
    for (let page = end + 1; page < pageCount; page += 1) items.push(page);
  }

  items.push(pageCount);
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

function buildCompactPaginationPages(currentPage: number, totalPages: number) {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);
  const start = Math.max(1, Math.min(safeCurrent - 1, safeTotal - 2));
  const end = Math.min(safeTotal, start + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
    ? `${selectedValidCount}/${validCount} Facebook group(s) selected.`
    : 'No Facebook groups are available.';

  return prefix ? `${prefix}. ${message}` : message;
}

function getFacebookEligibilityLabel(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'Can post';
  if (status === 'CANNOT_POST') return 'Cannot post';
  return 'Needs check';
}

function getFacebookGroupBadgeClass(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'is-success';
  if (status === 'CANNOT_POST') return 'is-danger';
  return 'is-warning';
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

function getFacebookGroupVerificationMessage(group: FacebookPublishTarget) {
  const reason = getFacebookGroupDisabledReason(group);
  if (group.eligibilityStatus === 'UNKNOWN') {
    return `"${group.targetName}" needs another check before publishing: ${reason}`;
  }

  return `"${group.targetName}" cannot be used: ${reason}`;
}

function isAmbiguousFacebookComposerVerificationReason(reason: string) {
  const normalizedReason = reason.toLowerCase();
  return normalizedReason.includes('composermatches=')
    || normalizedReason.includes('hidden and visible verification could not prove posting eligibility')
    || normalizedReason.includes('could not open facebook group post composer automatically')
    || normalizedReason.includes('could not verify facebook group composer automatically');
}

function RefreshIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M13 7.2A5 5 0 0 0 4.6 4L3.5 5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 2.4v2.8h2.8M3 8.8A5 5 0 0 0 11.4 12l1.1-1.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 13.6v-2.8H9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3.2 4.3A5.4 5.4 0 1 1 2.7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 2.5v2.3h2.3M8 4.8v3.3l2.2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 4.5h10M6.5 2.8h3L10 4.5H6l.5-1.7ZM5 6v6.3c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuLinesIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 4.2h10M3 8h10M3 11.8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ImageFrameIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 3.5h10v9H3v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m3.8 11 2.5-2.5 1.8 1.8 1.8-2 2.3 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.8" cy="5.8" r="1" fill="currentColor" />
    </svg>
  );
}

function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h4v4H3V3ZM9 3h4v4H9V3ZM3 9h4v4H3V9ZM9 9h4v4H9V9Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function UploadIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8 11V3.5m0 0L5.3 6.2M8 3.5l2.7 2.7M3.5 10.5v2h9v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5.2 8 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparklesIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M6.8 2.4 8 5.3l2.8 1.1L8 7.6l-1.2 3-1.1-3-2.9-1.2 2.9-1.1 1.1-2.9Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m12.2 9.2.5 1.4 1.3.5-1.3.6-.5 1.3-.6-1.3-1.3-.6 1.3-.5.6-1.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 2.8 19h18.4L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 8.5v5M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 7.2 8 2.8l5.5 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.2 6.8v6h2.6V9.3h2.4v3.5h2.6v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoubleBackIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8.5 3.5 4 8l4.5 4.5M12 3.5 7.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoubleChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M4 3.5 8.5 8 4 12.5M7.5 3.5 12 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PostingIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M5 2.8h5.2L13 5.6v7.6H5V2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 2.8v3h3M3 5.2h2M3 8h2M3 10.8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CvIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M5.2 2.5h5.6l1.7 1.8v9.2h-9v-11h1.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.7 2.7v1.8h1.8M5.7 7h4.6M5.7 9.5h4.6M5.7 12h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}>
      <path d="m9.7 1.8 4.5 4.5-2.6.8-2.2 3.5 1.2 1.2-1.1 1.1-2.8-2.8-3.5 3.5-1-1 3.5-3.5-2.8-2.8L4 5.2l1.2 1.2 3.5-2.2.9-2.4Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreVerticalIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3.5" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v6.2m0 0 2.5-2.5M8 8.7 5.5 6.2M3.2 10.5v1.7c0 .7.5 1.2 1.2 1.2h7.2c.7 0 1.2-.5 1.2-1.2v-1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoExportIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 2.8h6.2l2.8 2.8v7.6h-9V2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.6 2.9v2.8h2.8M5.7 8h4.6M5.7 10.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M6.2 4H3.8c-.7 0-1.2.5-1.2 1.2v7c0 .7.5 1.2 1.2 1.2h7c.7 0 1.2-.5 1.2-1.2V9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 2.8h5v5M7.6 8.4l5.2-5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'Request failed.';
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
    return 'Link URL phải có dạng https://www.facebook.com/groups/{groupId}.';
  }

  return getDuplicateFacebookGroupUrlError(value, groups, currentTargetId);
}

function sortFacebookGroupsByDiscovery(groups: FacebookPublishTarget[]) {
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

  return existingGroup ? 'Group đã tồn tại.' : null;
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

function buildFacebookGroupSyncDetails(result: DiscoverFacebookGroupsResponse): FacebookGroupSyncDetails | null {
  const accepted = result.items
    .filter((item) => item.action === 'created' || item.action === 'updated' || item.action === 'reused')
    .map((item) => ({
      name: item.targetName,
      externalId: item.targetExternalId,
      reason: item.action === 'created'
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
      externalId: item.targetExternalId,
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
  return { accepted, removed, reactivated, filtered, skipped, errors };
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

  const nameNoiseSuffixes: RegExp[] = [
    /\s*(?:[-–—|·:•]?\s*)?lần hoạt động gần nhất:?.*/i,
    /\s*(?:[-–—|·:•]?\s*)?đã tham gia gần đây.*$/i,
    /\s*(?:[-–—|·:•]?\s*)?đã tham gia.*$/i,
    /\s*xem tất cả$/i,
    /\s*-?\s*đã tham gia gần đây.*$/i,
    /\s*\(.*lần hoạt động gần nhất.*\)/i,
    /\s*[-–—|·:•]?\s*LẦN HOẠT ĐỘNG GẦN NHẤT.*$/i,
    /\s*[-–—|·:•]?\s*ĐÃ THAM GIA GẦN ĐÂY.*$/i,
    /\s*[-–—|·:•]?\s*[\w.-]+\s*-\s*\d+\s*năm trước.*$/i,
  ];

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
    let normalized = normalizeText(rawName) ?? '';
    for (const suffix of nameNoiseSuffixes) {
      normalized = normalized.replace(suffix, '').trim();
    }
    return normalized;
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
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p, a, [role=\"heading\"]'),
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
      document.querySelectorAll('nav, [role=\"navigation\"], [role=\"complementary\"]'),
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
    return normalized
      .replace(/\s*[|-]\s*(facebook|meta).*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
        doc.querySelector('meta[property=\"og:title\"]')?.getAttribute('content')
        || doc.querySelector('meta[name=\"twitter:title\"]')?.getAttribute('content')
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

  const collect = () => {
    const output = collectFromScope(scanScope);
    const pageWide = collectFromScope(document);

    pageWide.forEach((group, key) => {
      if (!output.has(key)) output.set(key, group);
    });

    return output;
  };

  const collected = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string; order: number }>(collect());
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

  let stablePasses = 0;
  let attempts = 0;
  const previousScrollHeights = new Map<Element, number>();
  const maxAttempts = 40;

  while (attempts < maxAttempts && stablePasses < 5) {
    const beforeSize = collected.size;
    const now = collect();
    now.forEach((group, key) => {
      if (!collected.has(key)) {
        collected.set(key, group);
      }
    });

    const revealClicks = revealHiddenListItems(sectionRoot || document);
    if (revealClicks > 0) {
      await sleepMs(1000);
    }
    discoverScrollHosts();

    const afterSize = collected.size;
    const sizeChanged = afterSize > beforeSize || revealClicks > 0;
    let moved = false;
    let heightChanged = false;

    attempts += 1;

    for (const host of scrollHosts) {
      const isDocumentHost = host === document.documentElement || host === document.body;
      const beforeScrollTop = isDocumentHost ? window.scrollY : host.scrollTop;
      const beforeScrollHeight = isDocumentHost ? document.documentElement.scrollHeight : host.scrollHeight;

      if (isDocumentHost) {
        window.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      } else if (host instanceof HTMLElement) {
        host.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      }
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

    const afterScrollSize = collect().size;
    const groupsLoadedAfterScroll = afterScrollSize > afterSize;

    if (sizeChanged || groupsLoadedAfterScroll || moved || heightChanged) stablePasses = 0;
    else stablePasses += 1;
  }

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
    scanComplete: stablePasses >= 5 && Boolean(scrollScope) && scrollHosts.length > 0,
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
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    ?? null;
}

function getAmisSourceName(sourceChannel?: string | null) {
  const normalizedChannel = normalizeAmisSourceChannel(sourceChannel);
  return normalizedChannel ? AMIS_SOURCE_NAME_BY_CHANNEL[normalizedChannel] ?? null : null;
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

function getApplicationAmisSyncStatus(application: ExtensionApplication, isUploadPending = false) {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (application.attachmentCvId || application.attachmentCvName) return { label: 'Đã đồng bộ', tone: 'is-success' };
  if (isUploadPending) return { label: 'Chờ AMIS lưu', tone: 'is-warning' };
  if (cvStatus.tone === 'is-danger') return { label: 'Lỗi đồng bộ', tone: 'is-danger' };
  if (canUploadApplicationCv(application)) return { label: 'Chưa đồng bộ', tone: 'is-warning' };
  return { label: 'Chưa đồng bộ', tone: 'is-warning' };
}

function getApplicationQuestionStatus(application: ExtensionApplication) {
  const status = normalizeStatus(application.latestForm?.status ?? application.formStatus);
  if (status === 'SUBMITTED') {
    return { code: 'ANSWERED', label: 'Đã trả lời', tone: 'is-success' } satisfies ApplicationQuestionStatus;
  }
  if (status === 'EXPIRED') {
    return { code: 'EXPIRED', label: 'Hết hạn', tone: 'is-danger' } satisfies ApplicationQuestionStatus;
  }
  if (status === 'SENT') {
    return { code: 'SENT', label: 'Chưa trả lời', tone: 'is-warning' } satisfies ApplicationQuestionStatus;
  }
  if (status === 'OPENED') {
    return { code: 'OPENED', label: 'Chưa trả lời', tone: 'is-warning' } satisfies ApplicationQuestionStatus;
  }
  return { code: 'NOT_SENT', label: 'Chưa trả lời', tone: 'is-warning' } satisfies ApplicationQuestionStatus;
}

function getApplicationMatchScore(application: ExtensionApplication) {
  const seed = `${application.applicationId}${application.candidateName}${application.email ?? ''}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return 45 + (hash % 51);
}

function getApplicationScoreTone(score: number) {
  if (score >= 80) return 'is-success';
  if (score >= 60) return 'is-warning';
  return 'is-danger';
}

function getCvApplicationFilterBucket(application: ExtensionApplication): CvStatusFilter {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (cvStatus.tone === 'is-success') return 'PASSED';
  if (cvStatus.tone === 'is-danger') return 'FAILED';
  return 'REVIEW';
}

function getCvSyncFilterBucket(application: ExtensionApplication): CvSyncFilter {
  const syncStatus = getApplicationAmisSyncStatus(application);
  if (syncStatus.tone === 'is-success') return 'SYNCED';
  if (syncStatus.tone === 'is-danger') return 'ERROR';
  return 'NOT_SYNCED';
}

function getVisibleCvApplications(
  applications: ExtensionApplication[],
  statusFilter: CvStatusFilter,
  syncFilter: CvSyncFilter,
  sortMode: CvSortMode,
) {
  return applications
    .filter((application) => statusFilter === 'ALL' || getCvApplicationFilterBucket(application) === statusFilter)
    .filter((application) => syncFilter === 'ALL' || getCvSyncFilterBucket(application) === syncFilter)
    .slice()
    .sort((first, second) => {
      if (sortMode === 'SCORE_ASC' || sortMode === 'SCORE_DESC') {
        const scoreDelta = getApplicationMatchScore(first) - getApplicationMatchScore(second);
        return sortMode === 'SCORE_ASC' ? scoreDelta : -scoreDelta;
      }

      const firstTime = getTimeValue(first.applyDate ?? first.createdAt);
      const secondTime = getTimeValue(second.applyDate ?? second.createdAt);
      return sortMode === 'APPLIED_ASC' ? firstTime - secondTime : secondTime - firstTime;
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

function getCandidateInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function normalizeStatus(value?: string | null) {
  return value?.toUpperCase().trim() ?? '';
}

function slugifyForDisplay(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
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
  const safeIdentity = identity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'candidate';
  const shortApplicationId = application.applicationId.replace(/-/g, '').slice(0, 8);

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

function isDiagnosticUpdateMessage(value: unknown): value is {
  type: 'AMIS_DIAGNOSTIC_UPDATED';
  payload: AmisDiagnosticEvent[];
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'AMIS_DIAGNOSTIC_UPDATED'
    && Array.isArray((value as { payload?: unknown }).payload);
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

function isUploadAmisCvFileResponse(value: unknown): value is {
  ok: boolean;
  fileName?: string;
  fileNames?: string[];
  fileCount?: number;
  target?: string;
  error?: string;
} {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean';
}

function isSelectAmisCandidateSourceResponse(value: unknown): value is AmisCandidateSourceSelectionResponse {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean';
}

function isConfirmedAmisCandidateSourceSelection(value: unknown, expectedSourceName: string) {
  if (!isSelectAmisCandidateSourceResponse(value) || !value.ok) return false;
  const expectedKey = normalizeAmisSourceChannel(expectedSourceName);
  return normalizeAmisSourceChannel(value.sourceName) === expectedKey
    && normalizeAmisSourceChannel(value.diagnostics?.confirmedFieldValue) === expectedKey
    && value.diagnostics?.sourceOptionFound === true
    && value.diagnostics?.sourceOptionClicked === true;
}

function formatAmisCandidateSourceSelectionFailure(value: unknown) {
  if (!isSelectAmisCandidateSourceResponse(value)) {
    return ' AMIS không trả về kết quả chọn nguồn hợp lệ.';
  }

  const code = value.code ? ` [${value.code}]` : '';
  const diagnostics = value.diagnostics;
  const visibleSources = diagnostics?.visibleOptionLabels.slice(-6).join(', ') ?? '';
  const details = diagnostics
    ? ` Bước: field=${diagnostics.fieldFound ? 'ok' : 'missing'}, control=${diagnostics.controlFound ? 'ok' : 'missing'}, popup=${diagnostics.popupFound ? 'ok' : 'missing'}, search=${diagnostics.searchInputFound ? `${diagnostics.searchInputLocation ?? 'unknown'}:${diagnostics.searchQuery}` : 'fallback-option-scan'}, scroll=${diagnostics.optionScrollPasses}.`
    : '';
  const sources = visibleSources ? ` Nguồn đã thấy: ${visibleSources}.` : '';
  return `${code} ${value.error ?? 'Hãy chọn nguồn này trên AMIS trước khi lưu.'}${details}${sources}`;
}

function formatDiagnosticTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function formatDiagnosticDetails(details: Record<string, unknown>) {
  return JSON.stringify(details).slice(0, 240);
}

function summarizeText(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return 'No description.';
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}

function formatDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function formatDateTime(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFacebookHistoryDateTime(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildAmisFormFillPayload(jobDescription: JobDescriptionSummary) {
  return {
    title: jobDescription.title,
    positionName: jobDescription.position?.name ?? '',
    summary: truncateForMaxLength(
      jobDescription.summary ?? jobDescription.overview ?? jobDescription.description,
      500,
    ),
    responsibilities: jobDescription.responsibilities ?? jobDescription.description,
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

async function injectAmisBridge(tabId: number) {
  if (!chrome.scripting?.executeScript) {
    throw new Error('Cannot inject AMIS bridge because chrome.scripting is unavailable.');
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
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

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
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

function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
