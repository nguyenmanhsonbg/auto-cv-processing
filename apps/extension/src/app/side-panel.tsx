import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractAmisJobFromDetailApi } from '@/integrations/amis/amis-detail-api-extractor';
import { extractAmisJobFromPage } from '@/integrations/amis/amis-page-extractor';
import { getLastAutoSyncState } from '@/stores/amis-auto-sync-store';
import { getLastAmisCapture } from '@/stores/amis-capture-store';
import { ensureAmisHooksInActiveTab } from '@/integrations/amis/amis-hook-installer';
import {
  clearAmisTemplateContextForTab,
  getAmisTemplateContextForRecruitment,
  getAmisTemplateContextForTab,
  saveAmisTemplateContext,
  saveAmisTemplateContextForRecruitment,
} from '@/integrations/amis/amis-template-context-store';
import {
  ApiClientError,
  downloadCleanCvFile,
  ensureRegisteredExtensionInstance,
  getApplicationDetail,
  getApplicationParsedProfile,
  getAmisApplicationsForRecruitment,
  listAssignedInterviewEvaluations,
  getAmisRecruitmentJobDescription,
  getAmisRecruitmentRounds,
  getFreelancerRecruitmentRounds,
  getCurrentUser,
  getJobDescriptionQuestionSet,
  listJobDescriptions,
  heartbeatExtensionInstance,
  logoutAuthSession,
  refreshAccessToken,
  runApplicationAiScreening,
  syncAmisApplications,
  syncAmisRecruitmentRounds,
  syncAmisRecruitmentBoardMembers,
  syncAndPublishAmisJob,
  syncVcsPortalJobDescriptions,
  syncInterviewEvaluationContext,
  createInterviewEvaluationCase,
  updateAmisApplicationStage,
  changePassword,
} from '@/lib/api-client';
import { createAiMatchPreviewPdfBase64 } from '@/features/recruitment/ai-match-preview-pdf-export';
import {
  clearAccessToken,
  getAccessToken,
  getRefreshToken,
  subscribeAuthTokenChanges,
} from '@/features/auth/auth-store';
import { getSelectedChannels, setSelectedChannels } from '@/stores/channel-preferences';
import { Toast, type ExtensionToastKind, type ExtensionToastState } from '@/components/toast';
import {
  DEFAULT_POSTING_CHANNELS,
  FRONTEND_BASE_URL,
  POSTING_CHANNELS,
} from '@/lib/config';
import { createMockAmisSyncRequest } from '@/lib/mock-amis';
import { ReferralManagementPanel } from '@/features/referrals/referral-management';
import { FreelancerCvPanel } from '@/features/freelancer/freelancer-cv-panel';
import { LoginForm } from '@/features/auth/LoginForm';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { checkTopCvAuth, type TopCvAuthState } from '@/features/topcv/services/topcv-auth.service';
import { logoutTopCv } from '@/features/topcv/topcv-login.service';
import { DEFAULT_TOPCV_FORM, hasTopCvRichTextContent, type TopCvFormData } from '@/features/topcv/topcv-form.types';
import { type TopCvOptionsResponse } from '@/features/topcv/services/topcv-options.service';

import { prepareChannelForm } from '@/lib/api-client';
import { publishTopCvJob } from '@/features/topcv/services/topcv-api.service';
import { transformTopCvPayload } from '@/features/topcv/utils/topcv-payload';
import {
  CvIcon,
  HomeIcon,
  PeopleIcon,
  PinIcon,
  PostingIcon,
} from '@/components/icons';
import { getApplicationQuestionStatus } from '@/components/candidates';
import { OverviewPanel } from '@/features/overview/OverviewPanel';
import { CvManagementPanel } from '@/features/candidates/CvManagementPanel';
import { JobPostingPanel } from '@/features/posting/JobPostingPanel';
import { FacebookModals } from '@/components/facebook';
import { useFacebookManager } from '@/features/facebook/use-facebook-manager';
import { isFacebookPublishProgressUpdateMessage } from '@/features/facebook/facebook-group-utils';
import { clearSelectedJobQuestionContextForTab, saveSelectedJobQuestionContext } from '@/stores/selected-job-question-store';
import {
  arrayBufferToBase64,
  normalizeOptionalText,
  normalizeStatus,
  sleep,
  toErrorMessage,
} from '@/lib/utils';
import {
  FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE,
  FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE,
  GET_AMIS_CANDIDATE_FORM_STATE_MESSAGE_TYPE,
  GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE,
  GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE,
  GET_AMIS_RECRUITMENT_BOARD_MEMBERS_MESSAGE_TYPE,
  SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE,
  UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE,
  buildAmisFormFillPayload,
  buildAmisJobSnapshotFromJobDescription,
  buildAmisUploadCvFileName,
  canUploadApplicationCv,
  formatAmisCandidateSourceSelectionFailure,
  getActiveTab,
  getAnyAmisTab,
  getAmisSourceName,
  getAutoSyncStateRecruitmentId,
  isAmisApplicationsFetchResponse,
  isAmisCandidateStageChangedMessage,
  isAmisCaptureUpdatedMessage,
  isAmisJobInitiationPage,
  isAmisRecruitmentContextResponse,
  isAmisRecruitmentRoundsChangedMessage,
  isAmisRecruitmentRoundsResponse,
  isAmisRecruitmentBoardMembersResponse,
  isApplicationsSyncedMessage,
  isAutoSyncUpdateMessage,
  isConfirmedAmisCandidateSourceSelection,
  isExtractionForRecruitment,
  isFillResponse,
  isLikelyAmisRecruitmentPage,
  isRecruitmentContextChangedMessage,
  isUploadAmisCvFileResponse,
  normalizeAmisJobInitiationUrl,
  normalizeAmisSourceChannel,
  parseAmisRecruitmentContextFromUrl,
  sanitizeAmisJobSnapshotForApi,
  sendMessageToAmisTab,
} from '@/integrations/amis/amis-helpers';
import type {
  AmisAutoSyncState,
  AmisApplicationsForRecruitment,
  AmisCandidateStageChangedPayload,
  AmisExtractionResult,
  AmisJobSnapshot,
  AmisRecruitmentRound,
  AmisRecruitmentBoardMember,
  InterviewEvaluationAssignment,
  ApiPagination,
  ExtensionChannel,
  ExtensionSyncResponse,
  ExtensionUser,
  JobDescriptionQuestionSetContext,
  JobDescriptionSummary,
  SyncAmisJobPostingRequest,
  SyncVcsPortalJdsResponse,
} from '@/types/types';
import {
  EXTENSION_TOAST_EVENT,
  type ExtensionToastPayload,
} from '@interview-assistant/shared';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'PASSWORD_CHANGE_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
type WorkspaceTab = 'overview' | 'posting' | 'cv' | 'freelancer' | 'internal';
type ApplicationsState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type VcsPortalSyncState = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';

function isExtensionToastEvent(value: unknown): value is {
  type: typeof EXTENSION_TOAST_EVENT;
  payload: ExtensionToastPayload;
} {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return candidate.type === EXTENSION_TOAST_EVENT
    && isExtensionToastPayload(candidate.payload);
}

function isExtensionToastPayload(value: unknown): value is ExtensionToastPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as { kind?: unknown; title?: unknown; message?: unknown };
  return (payload.kind === 'SUCCESS'
    || payload.kind === 'ERROR'
    || payload.kind === 'WARNING'
    || payload.kind === 'INFO')
    && typeof payload.message === 'string'
    && payload.message.trim().length > 0
    && (payload.title === undefined || typeof payload.title === 'string');
}

const MAX_POSTING_SNAPSHOT_REFRESH_ATTEMPTS = 3;

function hasAmisRoundTypeMetadata(rounds: AmisRecruitmentRound[]) {
  return rounds.some((round) => round.roundType !== null);
}

async function findAmisInterviewRound(
  accessToken: string,
  payload: AmisCandidateStageChangedPayload,
  fallbackRounds: AmisRecruitmentRound[],
) {
  try {
    const rounds = await getAmisRecruitmentRounds(accessToken, payload.amisRecruitmentId);
    const round = rounds.find((candidateRound) => candidateRound.id === payload.amisRecruitmentRoundId);
    if (round?.roundType === 3) return round;

    return fallbackRounds.find((candidateRound) => candidateRound.id === payload.amisRecruitmentRoundId
      && candidateRound.roundType === 3) ?? null;
  } catch {
    return fallbackRounds.find((round) => round.id === payload.amisRecruitmentRoundId
      && round.roundType === 3) ?? null;
  }
}

function enrichAmisCandidateStagePayload(
  payload: AmisCandidateStageChangedPayload,
  rounds: AmisRecruitmentRound[],
  previousRound?: AmisRecruitmentRound,
) {
  const round = rounds.find((candidateRound) => candidateRound.id === payload.amisRecruitmentRoundId);
  return {
    ...payload,
    amisRecruitmentRoundType: payload.amisRecruitmentRoundType ?? round?.roundType ?? null,
    amisRecruitmentRoundSortOrder: payload.amisRecruitmentRoundSortOrder ?? round?.sortOrder ?? null,
    previousAmisRecruitmentRoundId: payload.previousAmisRecruitmentRoundId
      ?? previousRound?.id
      ?? null,
    previousAmisRecruitmentRoundName: payload.previousAmisRecruitmentRoundName
      ?? previousRound?.name
      ?? null,
    previousAmisRecruitmentRoundType: payload.previousAmisRecruitmentRoundType
      ?? previousRound?.roundType
      ?? null,
    previousAmisRecruitmentRoundSortOrder: payload.previousAmisRecruitmentRoundSortOrder
      ?? previousRound?.sortOrder
      ?? null,
  } satisfies AmisCandidateStageChangedPayload;
}

function mergeAmisRecruitmentRounds(
  currentRounds: AmisRecruitmentRound[],
  incomingRounds: AmisRecruitmentRound[],
) {
  const currentById = new Map(currentRounds.map((round) => [round.id, round]));
  return incomingRounds.map((round) => {
    const currentRound = currentById.get(round.id);
    if (!currentRound) return round;

    return {
      ...round,
      roundType: round.roundType ?? currentRound.roundType,
      roundTypeId: round.roundTypeId ?? currentRound.roundTypeId,
      color: round.color ?? currentRound.color,
    };
  });
}

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'posting', label: 'Đăng bài' },
  { id: 'cv', label: 'CV' },
  { id: 'freelancer', label: 'Freelancer' },
  { id: 'internal', label: 'Nội bộ' },
];
const POSTING_CHANNEL_SET = new Set<ExtensionChannel>(POSTING_CHANNELS);

function filterApplicationsForCommittee(
  context: AmisApplicationsForRecruitment,
  assignments: InterviewEvaluationAssignment[],
) {
  const assignedApplicationIds = new Set(
    assignments
      .filter((assignment) => assignment.job.id === context.jobPostingId)
      .map((assignment) => assignment.applicationId),
  );
  const applications = context.applications.filter((application) =>
    assignedApplicationIds.has(application.applicationId),
  );

  return {
    ...context,
    total: applications.length,
    applications,
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

type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

const AMIS_CV_UPLOAD_CONFIRMATION_TIMEOUT_MS = 60_000;

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

function SidePanel() {
  const [state, setState] = useState<PanelState>('AUTH_LOADING');
  const [extensionUiZoom, setExtensionUiZoom] = useState<ExtensionUiZoomLevel>(readExtensionUiZoom);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('posting');
  const [pinnedWorkspaceTab, setPinnedWorkspaceTab] = useState<WorkspaceTab | null>(null);
  const [referralRefreshVersion, setReferralRefreshVersion] = useState(0);
  const [user, setUser] = useState<ExtensionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isFreelancerPasswordFormOpen, setIsFreelancerPasswordFormOpen] = useState(false);
  const [initialPasswordError, setInitialPasswordError] = useState<string | null>(null);
  const [isChangingInitialPassword, setIsChangingInitialPassword] = useState(false);
  const loadReferralRecruitmentRounds = useCallback(async (
    targets: Array<{ jobPostingId: string; amisRecruitmentId: string }>,
  ) => {
    if (targets.length === 0) return [];
    const isSelfServiceRoundsRole = user?.role === 'FREELANCER' || user?.role === 'INTERNAL';

    const loadRoundsFromAmis = async (
      activeTab: Awaited<ReturnType<typeof getActiveTab>>,
      target: { jobPostingId: string; amisRecruitmentId: string },
    ) => {
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
          if (token && response.rounds.length > 0) {
            try {
              await syncAmisRecruitmentRounds(token, target.amisRecruitmentId, {
                rounds: response.rounds,
                sourceUrl: response.sourceUrl,
              });
            } catch {
              // Persisting the catalog must not block the existing AMIS fallback.
            }
          }
          return { ...target, rounds: response.rounds };
        }
      } catch {
        // The referral filter falls back to rounds already present on applications.
      }
      return { ...target, rounds: [] as AmisRecruitmentRound[] };
    };

    const persistedResults = await Promise.all(targets.map(async (target) => {
      if (!token) return null;
      try {
        const rounds = user?.role === 'FREELANCER' || user?.role === 'INTERNAL'
          ? await getFreelancerRecruitmentRounds(token, target.amisRecruitmentId)
          : await getAmisRecruitmentRounds(token, target.amisRecruitmentId);
        if (rounds.length > 0 && hasAmisRoundTypeMetadata(rounds)) return { ...target, rounds };
      } catch {
        // An unavailable catalog falls through to the AMIS-tab loader below.
      }
      return null;
    }));
    const persistedByRecruitmentId = new Map(
      persistedResults
        .filter((result): result is NonNullable<typeof result> => Boolean(result))
        .map((result) => [result.amisRecruitmentId, result]),
    );
    const missingTargets = targets.filter((target) => !persistedByRecruitmentId.has(target.amisRecruitmentId));
    if (missingTargets.length === 0) {
      return targets.map((target) => persistedByRecruitmentId.get(target.amisRecruitmentId)!);
    }

    let activeTab: Awaited<ReturnType<typeof getActiveTab>>;
    try {
      activeTab = await (isSelfServiceRoundsRole ? getAnyAmisTab() : getActiveTab());
    } catch {
      return targets.map((target) => persistedByRecruitmentId.get(target.amisRecruitmentId) ?? {
        ...target,
        rounds: [] as AmisRecruitmentRound[],
      });
    }

    if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
      return targets.map((target) => persistedByRecruitmentId.get(target.amisRecruitmentId) ?? {
        ...target,
        rounds: [] as AmisRecruitmentRound[],
      });
    }

    const fetchedResults = await Promise.all(missingTargets.map((target) => loadRoundsFromAmis(activeTab, target)));
    const fetchedByRecruitmentId = new Map(fetchedResults.map((result) => [result.amisRecruitmentId, result]));
    return targets.map((target) => (
      persistedByRecruitmentId.get(target.amisRecruitmentId)
      ?? fetchedByRecruitmentId.get(target.amisRecruitmentId)
      ?? { ...target, rounds: [] as AmisRecruitmentRound[] }
    ));
  }, [token, user?.role]);

  const [snapshot, setSnapshot] = useState<AmisJobSnapshot | null>(null);
  const [amisRecruitmentId, setAmisRecruitmentId] = useState<string | null>(null);
  const [amisRecruitmentRoundId, setAmisRecruitmentRoundId] = useState<string | null>(null);
  const [amisUrl, setAmisUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<ExtensionChannel[]>([...DEFAULT_POSTING_CHANNELS]);
  const [result, setResult] = useState<ExtensionSyncResponse | null>(null);
  const [extractionResult, setExtractionResult] = useState<AmisExtractionResult | null>(null);
  const [autoSyncState, setAutoSyncState] = useState<AmisAutoSyncState | null>(null);
  const [extensionToast, setExtensionToast] = useState<ExtensionToastState | null>(null);
  const [topCvFormData, setTopCvFormData] = useState<TopCvFormData>(DEFAULT_TOPCV_FORM);
  const [topCvAuth, setTopCvAuth] = useState<TopCvAuthState | null>(null);
  const [isCheckingTopCvAuth, setIsCheckingTopCvAuth] = useState(false);
  const [topCvModalMode, setTopCvModalMode] = useState<'EDIT' | 'PREVIEW' | null>(null);
  const [foreignLanguageOptions, setForeignLanguageOptions] = useState<TopCvOptionsResponse['data']['certificate_foreign_languages']>([]);
  const [topCvLoadingFromBe, setTopCvLoadingFromBe] = useState(false);
  const [topCvPublishing, setTopCvPublishing] = useState(false);


  const [error, setError] = useState<string | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescriptionSummary[]>([]);
  const [jobDescriptionPagination, setJobDescriptionPagination] = useState<ApiPagination | null>(null);
  const [jobDescriptionStatus, setJobDescriptionStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [jobDescriptionError, setJobDescriptionError] = useState<string | null>(null);
  const [jobDescriptionFillState, setJobDescriptionFillState] = useState<JobDescriptionFillState>('IDLE');
  const [jobDescriptionFillMessage, setJobDescriptionFillMessage] = useState<string | null>(null);
  const [fillingJobDescriptionId, setFillingJobDescriptionId] = useState<string | null>(null);
  const [vcsPortalSyncState, setVcsPortalSyncState] = useState<VcsPortalSyncState>('IDLE');
  const [, setVcsPortalSyncMessage] = useState<string | null>(null);
  const [vcsPortalSyncResult, setVcsPortalSyncResult] = useState<SyncVcsPortalJdsResponse | null>(null);
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
  const amisCandidateStageChangeHandlerRef = useRef<
    (payload: AmisCandidateStageChangedPayload) => Promise<void>
  >(async () => undefined);
  const pendingAmisUploadApplicationIdsRef = useRef(new Set<string>());
  const pendingAmisUploadTimeoutsRef = useRef(new Map<string, number>());
  const postingSnapshotRefreshSeqRef = useRef(0);
  const amisJobSelectionSeqRef = useRef(0);
  const postingSnapshotRefreshAttemptsRef = useRef(new Map<string, number>());
  const missedRecruitmentContextCountRef = useRef(0);
  const lastAmisJobInitiationResetKeyRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const channelsRef = useRef<ExtensionChannel[]>(channels);
  const extensionToastSequenceRef = useRef(0);
  const extensionToastTimerRef = useRef<number | null>(null);
  const lastCtrlWheelZoomAtRef = useRef(0);

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
    }, 3000);
  }

  const selectedPostingChannels = useMemo(() => normalizePostingChannels(channels), [channels]);

  const facebook = useFacebookManager({
    token,
    snapshot,
    amisRecruitmentId,
    selectedPostingChannels,
    selectedJobDescription,
    syncResult: result,
    onToggleChannel: toggleChannel,
    showToast: showExtensionToast,
    onAuthRequired: (message) => {
      if (message) setError(message);
      setState('AUTH_REQUIRED');
    },
    setSyncResult: setResult,
  });

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

  useEffect(() => subscribeAuthTokenChanges(({ accessToken }) => {
    setToken(accessToken);
    if (!accessToken) {
      setUser(null);
      setTopCvFormData(DEFAULT_TOPCV_FORM);
      setTopCvAuth(null);
      setTopCvModalMode(null);
      setForeignLanguageOptions([]);
      setState('AUTH_REQUIRED');
    }
  }), []);

  useEffect(() => {
    void restoreAuth();
    void restoreSelectedChannels();
    void facebook.restoreSelectedFacebookGroups();
    void loadLatestAmisCapture({ silent: true });
    void facebook.restoreFacebookProgress();
    void bootstrapAmisTab();
  }, []);

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown, sender: ChromeMessageSender) => {
      if (isExtensionToastEvent(message)) {
        showExtensionToast(
          message.payload.kind,
          message.payload.title ?? '',
          message.payload.message,
        );
        return;
      }

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
        void amisCandidateStageChangeHandlerRef.current(message.payload);
        return;
      }

      if (isAmisRecruitmentRoundsChangedMessage(message)) {
        if (
          activeAmisRecruitmentIdRef.current
          && activeAmisRecruitmentIdRef.current !== message.payload.amisRecruitmentId
        ) {
          return;
        }
        setAmisRecruitmentRounds((currentRounds) => mergeAmisRecruitmentRounds(
          currentRounds,
          message.payload.rounds,
        ));
        void persistAmisRecruitmentRoundsSnapshot(
          message.payload.amisRecruitmentId,
          message.payload.rounds,
          message.payload.sourceUrl,
        );
        return;
      }

      if (isFacebookPublishProgressUpdateMessage(message)) {
        facebook.setFacebookPublishResultsVisible(true);
        facebook.setFacebookProgress(message.payload);
        facebook.setFacebookRunning(
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
    };

    chrome.runtime?.onMessage.addListener(handleRuntimeMessage);
    return () => chrome.runtime?.onMessage.removeListener?.(handleRuntimeMessage);
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
      return;
    }

    void loadAmisApplications(token, amisRecruitmentId, { silent: true });
    const intervalId = window.setInterval(() => {
      void loadAmisApplications(token, amisRecruitmentId, { silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [token, amisRecruitmentId, user?.role]);

  useEffect(() => {
    let cancelled = false;
    const nextSnapshot = snapshot;
    const nextRecruitmentId = amisRecruitmentId;

    async function prepareFacebookContent() {
      if (user?.role === 'COMMITTEE') return;
      facebook.clearFacebookContent();
      await facebook.restoreFacebookImageAttachments(nextRecruitmentId, nextSnapshot, selectedJobDescription);
      if (!token || !nextRecruitmentId || !nextSnapshot) return;

      const restored = await facebook.applyStoredFacebookContentDraft(
        nextRecruitmentId,
        nextSnapshot,
        selectedJobDescription,
      );
      if (cancelled || restored) return;

      await facebook.generateFacebookPostContent({
        snapshotOverride: nextSnapshot,
        forceFacebookChannel: true,
      });
    }

    void prepareFacebookContent();
    return () => {
      cancelled = true;
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
    user?.role,
  ]);
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!amisRecruitmentId) missing.push('AMIS recruitment id');
    if (!snapshot?.title.trim()) missing.push('title');
    if (!snapshot?.description.trim()) missing.push('description');
    if (!snapshot?.requirements.rawText.trim()) missing.push('requirements');
    if (!selectedJobDescription?.id) missing.push('selected JD');
    if (selectedPostingChannels.includes('FACEBOOK') && facebook.selectedFacebookGroupIds.length === 0) missing.push('facebook group');
    return missing;
  }, [amisRecruitmentId, facebook.selectedFacebookGroupIds.length, selectedJobDescription?.id, selectedPostingChannels, snapshot]);

  const visibleWorkspaceTabs = useMemo<WorkspaceTab[]>(() => {
    if (user?.role === 'COMMITTEE') return ['cv'];
    if (pinnedWorkspaceTab && pinnedWorkspaceTab !== activeWorkspaceTab) {
      return [pinnedWorkspaceTab, activeWorkspaceTab];
    }

    return [activeWorkspaceTab];
  }, [activeWorkspaceTab, pinnedWorkspaceTab, user?.role]);

  const workspaceTabsForUser = useMemo(
    () => user?.role === 'COMMITTEE'
      ? WORKSPACE_TABS.filter((tab) => tab.id === 'cv')
      : WORKSPACE_TABS,
    [user?.role],
  );

  const syncDisabled = state === 'EXTRACTING'
    || state === 'SYNCING'
    || facebook.facebookRunning
    || topCvPublishing
    || facebook.facebookConfig.facebookContentBusy
    || facebook.isFacebookImageReading
    || facebook.hasFacebookImageAttachmentError
    || missingFields.length > 0;

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
      if (currentUser.mustChangePassword) {
        setToken(storedToken);
        setUser(currentUser);
        setState('PASSWORD_CHANGE_REQUIRED');
        return;
      }
      if (currentUser.role === 'FREELANCER' || currentUser.role === 'INTERNAL') {
        setToken(storedToken);
        setUser(currentUser);
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      if (currentUser.role === 'COMMITTEE') {
        setToken(storedToken);
        setUser(currentUser);
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      if (currentUser.role !== 'ADMIN' && currentUser.role !== 'HR' && currentUser.role !== 'INTERVIEWER') {
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

  async function handleLoginSuccess(authenticatedUser: ExtensionUser, accessToken: string, mustChangePassword: boolean) {
    setToken(accessToken);
    setUser(authenticatedUser);
    if (mustChangePassword) {
      setInitialPasswordError(null);
      setState('PASSWORD_CHANGE_REQUIRED');
      return;
    }
    if (authenticatedUser.role === 'FREELANCER' || authenticatedUser.role === 'INTERNAL') {
      setActiveWorkspaceTab('cv');
      setState('READY');
      return;
    }
    if (authenticatedUser.role === 'COMMITTEE') {
      setActiveWorkspaceTab('cv');
      setState('READY');
      return;
    }
    await ensureRegisteredExtensionInstance(accessToken);
    setActiveWorkspaceTab('posting');
    setState('READY');
    await loadJobDescriptions(accessToken);
    await loadLatestAmisCapture({ silent: true }, accessToken);
  }

  async function submitInitialPasswordChange(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    if (!token) return;
    setIsChangingInitialPassword(true);
    setInitialPasswordError(null);
    try {
      const response = await changePassword(token, input);
      showExtensionToast('SUCCESS', 'Đổi mật khẩu', response?.message || 'Đổi mật khẩu thành công.');
      setUser((current) => current ? { ...current, mustChangePassword: false } : current);
      if (user?.role === 'FREELANCER' || user?.role === 'INTERNAL') {
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      if (user?.role === 'COMMITTEE') {
        setActiveWorkspaceTab('cv');
        setState('READY');
        return;
      }
      await ensureRegisteredExtensionInstance(token);
      setActiveWorkspaceTab('posting');
      setState('READY');
      await loadJobDescriptions(token);
      await loadLatestAmisCapture({ silent: true }, token);
    } catch (err) {
      setInitialPasswordError(err instanceof ApiClientError ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setIsChangingInitialPassword(false);
    }
  }

  async function logout() {
    try {
      const refreshToken = await getRefreshToken();
      await logoutAuthSession(refreshToken);
    } catch {
      // Logout remains local even when the API is unavailable.
    } finally {
      await clearAccessToken();
      setToken(null);
      setUser(null);
      setIsFreelancerPasswordFormOpen(false);
      setJobDescriptions([]);
      setJobDescriptionPagination(null);
      setJobDescriptionStatus('IDLE');
      setTopCvFormData(DEFAULT_TOPCV_FORM);
      setTopCvAuth(null);
      setTopCvModalMode(null);
      setForeignLanguageOptions([]);
      setState('AUTH_REQUIRED');
    }
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
        search: filters.search ?? '',
        status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
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

  async function ensureJobDescriptionVisible(
    jobDescriptionId: string,
    accessToken = tokenRef.current,
    selectionSeq?: number,
  ) {
    if (!accessToken || !jobDescriptionId) return;
    if (jobDescriptions.some((jobDescription) => jobDescription.id === jobDescriptionId)) return;

    const lookupLimit = 100;
    const visiblePageSize = jobDescriptionPagination?.limit ?? 5;
    let lookupPage = 1;
    let visibleItemOffset = 0;
    let totalLookupPages = 1;

    while (lookupPage <= totalLookupPages) {
      const response = await listJobDescriptions(accessToken, {
        page: lookupPage,
        limit: lookupLimit,
      });

      if (selectionSeq !== undefined && selectionSeq !== amisJobSelectionSeqRef.current) return;

      const matchedIndex = response.data.findIndex((jobDescription) => jobDescription.id === jobDescriptionId);
      if (matchedIndex >= 0) {
        const targetPage = Math.floor((visibleItemOffset + matchedIndex) / visiblePageSize) + 1;
        if (jobDescriptionPagination?.page !== targetPage) {
          await loadJobDescriptions(accessToken, targetPage);
        }
        return;
      }

      if (response.data.length === 0) return;
      visibleItemOffset += response.data.length;
      totalLookupPages = response.pagination?.totalPages ?? lookupPage;
      lookupPage += 1;
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
      const [context, assignedEvaluations] = await Promise.all([
        getAmisApplicationsForRecruitment(accessToken, recruitmentId),
        user?.role === 'COMMITTEE'
          ? listAssignedInterviewEvaluations(accessToken)
          : Promise.resolve(null),
      ]);
      const visibleContext = user?.role === 'COMMITTEE'
        ? filterApplicationsForCommittee(context, assignedEvaluations ?? [])
        : context;
      if (
        requestSeq !== applicationsRequestSeqRef.current ||
        activeAmisRecruitmentIdRef.current !== recruitmentId
      ) {
        return;
      }

      setApplicationsContext(mergeAmisCandidateStageOverrides(visibleContext));
      const hasNewAmisUploadConfirmation = reconcilePendingAmisUploads(visibleContext);
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
    rawPayload: AmisCandidateStageChangedPayload,
  ) {
    const recruitmentRoundId = rawPayload.amisRecruitmentRoundId;
    if (!recruitmentRoundId) return;
    if (activeAmisRecruitmentIdRef.current !== rawPayload.amisRecruitmentId) return;

    const currentApplication = applicationsContext?.applications.find((application) =>
      application.amisCandidateId === rawPayload.amisCandidateId,
    );
    const previousRound = currentApplication?.amisRecruitmentRoundId
      ? amisRecruitmentRounds.find((round) => round.id === currentApplication.amisRecruitmentRoundId)
      : undefined;
    const payload = {
      ...enrichAmisCandidateStagePayload(rawPayload, amisRecruitmentRounds, previousRound),
      amisRecruitmentRoundId: recruitmentRoundId,
    } satisfies AmisCandidateStageChangedPayload;

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
      try {
        const activeTab = await getActiveTab();
        await syncAmisRecruitmentBoardMembersFromTab(activeTab.id, payload.amisRecruitmentId);
      } catch {
        // The last persisted board snapshot remains authoritative when AMIS is temporarily unavailable.
      }

      const stageUpdate = await updateAmisApplicationStage(accessToken, payload);
      const interviewRound = await findAmisInterviewRound(accessToken, payload, amisRecruitmentRounds);
      if (interviewRound && stageUpdate.applicationId) {
        try {
          await createInterviewEvaluationCase(accessToken, stageUpdate.applicationId, {
            roundName: interviewRound.name,
            amisRoundId: interviewRound.id,
            amisRoundType: interviewRound.roundType ?? 3,
            amisSortOrder: interviewRound.sortOrder,
            template: 'BM04.1_KNL',
          });
        } catch {
          setApplicationsMessage('Đã cập nhật vòng AMIS nhưng chưa khởi tạo được phiếu đánh giá.');
        }
        try {
          await syncInterviewEvaluationContext(accessToken, stageUpdate.applicationId, {
            amisRoundId: interviewRound.id,
            amisRoundName: interviewRound.name,
            amisRoundType: interviewRound.roundType ?? 3,
            amisSortOrder: interviewRound.sortOrder,
          });
        } catch {
          setApplicationsMessage('Đã cập nhật vòng AMIS nhưng chưa đồng bộ được ngữ cảnh phiếu đánh giá.');
        }
      }
      if (stageUpdate.applicationId && stageUpdate.interviewEvaluationStartedAt) {
        setApplicationsContext((current) => {
          if (!current || current.amisRecruitmentId !== payload.amisRecruitmentId) return current;

          return {
            ...current,
            applications: current.applications.map((application) => application.applicationId === stageUpdate.applicationId
              ? {
                ...application,
                interviewEvaluationStartedAt: stageUpdate.interviewEvaluationStartedAt ?? null,
                interviewEvaluationRoundId: stageUpdate.interviewEvaluationRoundId ?? null,
                interviewEvaluationRoundName: stageUpdate.interviewEvaluationRoundName ?? null,
                interviewEvaluationRoundType: stageUpdate.interviewEvaluationRoundType ?? null,
                interviewEvaluationRoundSortOrder: stageUpdate.interviewEvaluationRoundSortOrder ?? null,
              }
              : application),
          };
        });
      }
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

  // The runtime listener is intentionally installed once. Keep its handler
  // pointed at the latest render so stage changes use current applications,
  // rounds, and API callbacks while the AMIS popup remains open.
  amisCandidateStageChangeHandlerRef.current = applyAmisCandidateStageChangedMessage;

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
      if (tokenRef.current && (contextChanged || !lockedAmisJobDescriptionId)) {
        await selectExistingJobDescriptionForAmisCapture(
          null,
          tokenRef.current,
          activeTab.id,
          context.amisRecruitmentId,
        );
      }

      const roundsResponse = await sendMessageToAmisTab(activeTab.id, {
        type: GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE,
        payload: { amisRecruitmentId: context.amisRecruitmentId },
      });
      if (
        isAmisRecruitmentRoundsResponse(roundsResponse)
        && roundsResponse.ok
        && roundsResponse.amisRecruitmentId === context.amisRecruitmentId
      ) {
        setAmisRecruitmentRounds((currentRounds) => mergeAmisRecruitmentRounds(
          currentRounds,
          roundsResponse.rounds,
        ));
        await persistAmisRecruitmentRoundsSnapshot(
          roundsResponse.amisRecruitmentId,
          roundsResponse.rounds,
          roundsResponse.sourceUrl,
        );
      }

      await syncAmisRecruitmentBoardMembersFromTab(activeTab.id, context.amisRecruitmentId);
    } catch {
      // The passive AMIS response capture may arrive shortly after route hydration.
    }

    await refreshPostingSnapshotForActiveContext(context.amisRecruitmentId, activeTab, {
      force: contextChanged,
      silent: true,
      sourceUrl: context.sourceUrl ?? activeTab.url,
    });

    if (
      user?.role !== 'COMMITTEE'
      && tokenRef.current
      && context.sourceUrl
      && lastApplicationsFallbackSyncUrlRef.current !== context.sourceUrl
    ) {
      await syncAmisApplicationsFromAmisTab(tokenRef.current, activeTab.id, context.sourceUrl);
    }
  }

  async function persistAmisRecruitmentRoundsSnapshot(
    recruitmentId: string,
    rounds: AmisRecruitmentRound[],
    sourceUrl?: string,
  ) {
    const accessToken = tokenRef.current;
    if (!accessToken || !recruitmentId.trim() || rounds.length === 0) return;

    try {
      await syncAmisRecruitmentRounds(accessToken, recruitmentId, { rounds, sourceUrl });
    } catch {
      // Catalog persistence is best-effort and must not block CV or posting flows.
    }
  }

  async function persistAmisRecruitmentBoardMembersSnapshot(
    recruitmentId: string,
    members: AmisRecruitmentBoardMember[],
    sourceUrl?: string,
  ) {
    const accessToken = tokenRef.current;
    if (!accessToken || !recruitmentId.trim()) return;

    try {
      await syncAmisRecruitmentBoardMembers(accessToken, recruitmentId, { members, sourceUrl });
    } catch {
      // A stale board snapshot must not block existing AMIS application flows.
    }
  }

  async function syncAmisRecruitmentBoardMembersFromTab(tabId: number, recruitmentId: string) {
    const response = await sendMessageToAmisTab(tabId, {
      type: GET_AMIS_RECRUITMENT_BOARD_MEMBERS_MESSAGE_TYPE,
      payload: { amisRecruitmentId: recruitmentId, force: true },
    });
    if (
      !isAmisRecruitmentBoardMembersResponse(response)
      || !response.ok
      || response.amisRecruitmentId !== recruitmentId
    ) {
      return;
    }

    await persistAmisRecruitmentBoardMembersSnapshot(
      response.amisRecruitmentId,
      response.members,
      response.sourceUrl,
    );
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
    facebook.clearFacebookContent();
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
      if (tokenRef.current) {
        try {
          await syncAmisRecruitmentBoardMembersFromTab(activeTab.id, capture.amisRecruitmentId);
        } catch {
          // The context refresh will retry the board snapshot after AMIS finishes saving the JD.
        }
      }
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
      if (!isUploadAmisCvFileResponse(response) || !response.ok) {
        throw new Error(isUploadAmisCvFileResponse(response)
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

      if (!isUploadAmisCvFileResponse(response) || !response.ok) {
        throw new Error(isUploadAmisCvFileResponse(response)
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
      if (previousRecruitmentId !== normalizedRecruitmentId) {
        facebook.clearFacebookContent();
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
      facebook.clearFacebookContent();
    }
    setState((current) => (
      current === 'AUTH_LOADING' || current === 'AUTH_REQUIRED' ? current : 'READY'
    ));
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
    capture: AmisExtractionResult | null,
    accessToken = tokenRef.current,
    sourceTabId?: number,
    recruitmentIdOverride?: string,
  ): Promise<void> {
    const recruitmentId = normalizeOptionalText(capture?.amisRecruitmentId ?? recruitmentIdOverride);
    if (!accessToken || !recruitmentId) return;
    if (capture && (!capture.snapshot || capture.missingFields.length > 0)) return;

    const selectionSeq = amisJobSelectionSeqRef.current + 1;
    amisJobSelectionSeqRef.current = selectionSeq;

    try {
      const activeTab = await getActiveTab();
      if (sourceTabId !== undefined && activeTab.id !== sourceTabId) return;
      const tabTemplateContext = await getAmisTemplateContextForTab(sourceTabId ?? activeTab.id);
      let templateContext = tabTemplateContext
        ?? await getAmisTemplateContextForRecruitment(recruitmentId);

      if (!templateContext) {
        const mapping = await getAmisRecruitmentJobDescription(accessToken, recruitmentId);
        if (mapping?.jobDescriptionId) {
          templateContext = {
            tabId: sourceTabId ?? activeTab.id,
            templateJobDescriptionId: mapping.jobDescriptionId,
            templateJobDescriptionTitle: mapping.jobDescriptionTitle ?? 'AMIS job description',
            formPageUrl: capture?.url ?? activeTab.url,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      if (templateContext?.templateJobDescriptionId) {
        const questionContext = await getJobDescriptionQuestionSet(
          accessToken,
          templateContext.templateJobDescriptionId,
        );
        const sourceJobDescription = questionContext.jobDescription;
        if (
          selectionSeq !== amisJobSelectionSeqRef.current
          || activeAmisRecruitmentIdRef.current !== recruitmentId
        ) {
          return;
        }

        await saveAmisTemplateContextForRecruitment(recruitmentId, templateContext);
        setJobDescriptionStatus('READY');
        setSelectedJobDescription(sourceJobDescription);
        setLockedAmisJobDescriptionId(sourceJobDescription.id);
        await ensureJobDescriptionVisible(sourceJobDescription.id, accessToken, selectionSeq);
        activeSnapshotRecruitmentIdRef.current = recruitmentId;
        const nextSnapshot = capture?.snapshot
          ?? buildAmisJobSnapshotFromJobDescription(sourceJobDescription);
        setSnapshot(nextSnapshot);
        if (capture) {
          setExtractionResult(capture);
          setAmisUrl(capture.url);
        } else {
          setAmisUrl(templateContext.formPageUrl ?? activeTab.url);
        }
        setJobDescriptionError(null);
        lastJobQuestionContextIdRef.current = sourceJobDescription.id;
        setJobDescriptionQuestionContext(questionContext);
        await selectAllJobQuestions(questionContext);
        setCareerQuestionState('READY');
        setCareerQuestionMessage(questionContext.questionSet
          ? null
          : 'This JD does not have an active synced question set.');
        await clearAmisTemplateContextForTab(sourceTabId ?? activeTab.id);
        return;
      }

      if (capture) {
        setSnapshot(capture.snapshot ?? null);
        setExtractionResult(capture);
        setAmisUrl(capture.url);
        setJobDescriptionError(null);
      }
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
    await persistSelectedJobQuestionContextForActiveTab(context, questionIds);
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



  async function fillJobDescriptionInAmis(jobDescription: JobDescriptionSummary) {
    if (lockedAmisJobDescriptionId && lockedAmisJobDescriptionId !== jobDescription.id) return;

    const nextSnapshot = buildAmisJobSnapshotFromJobDescription(jobDescription);
    setSelectedJobDescription(jobDescription);
    setTopCvFormData((prev) => ({
      ...prev,
      title: jobDescription.title || prev.title,
      jobDescription: jobDescription.description || prev.jobDescription,
      jobRequirement: jobDescription.requirements || prev.jobRequirement,
    }));
    setSnapshot(nextSnapshot);
    setResult(null);
    facebook.clearFacebookContent();
    void loadSelectedJobDescriptionQuestionSet(jobDescription, token, { silent: true, force: true });
    void facebook.generateFacebookPostContent({
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

      const response = await sendMessageToAmisTab(activeTab.id, {
        type: FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE,
        payload: buildAmisFormFillPayload(jobDescription),
      });

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

  async function ensureAmisHooksForCurrentTab() {
    const result = await ensureAmisHooksInActiveTab().catch(() => null);
    if (result?.status === 'INJECTED') {
      await sleep(250);
    }
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
      void facebook.applyStoredFacebookContentDraft(extractionRecruitmentId, extraction.snapshot);
    } else {
      activeSnapshotRecruitmentIdRef.current = null;
      setSnapshot(null);
      facebook.clearFacebookContent();
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

    if (channel === 'TOPCV') {
      await toggleTopCvChannel();
      return;
    }

    const next = selectedPostingChannels.includes(channel)
      ? selectedPostingChannels.filter((item) => item !== channel)
      : [...selectedPostingChannels, channel];
    setChannels(next);
    void setSelectedChannels(next);
  }

  async function toggleTopCvChannel() {
    if (selectedPostingChannels.includes('TOPCV')) {
      const next = selectedPostingChannels.filter((item) => item !== 'TOPCV');
      setChannels(next);
      void setSelectedChannels(next);
      setError(null);
      return;
    }

    const next: ExtensionChannel[] = [...selectedPostingChannels, 'TOPCV'];
    setChannels(next);
    setError(null);
    void setSelectedChannels(next);
    void fetchTopCvFromBackend();

    try {
      setIsCheckingTopCvAuth(true);
      const auth = await checkTopCvAuth();
      setTopCvAuth(auth);
    } catch {
      // Ignore background check
    } finally {
      setIsCheckingTopCvAuth(false);
    }

  }

  async function fetchTopCvFromBackend() {
    // Resolve the jobPostingId (not jobDescriptionId) for the prepare API
    const jobPostingId = result?.amisRecruitmentId === amisRecruitmentId
      ? result.jobPostingId
      : applicationsContext?.amisRecruitmentId === amisRecruitmentId
        ? applicationsContext.jobPostingId
        : null;
    if (!token || !jobPostingId) {
      // No jobPosting mapping yet — pre-fill from snapshot/JD as fallback
      if (snapshot || selectedJobDescription) {
        setTopCvFormData((prev) => ({
          ...prev,
          title: selectedJobDescription?.title || snapshot?.title || prev.title,
          jobDescription: selectedJobDescription?.description || snapshot?.description || prev.jobDescription,
          jobRequirement: selectedJobDescription?.requirements || prev.jobRequirement,
        }));
      }
      return;
    }
    try {
      setTopCvLoadingFromBe(true);
      const result = await prepareChannelForm(token, jobPostingId, 'TOPCV');
      if (result && result.form) {
        const f = result.form as Record<string, { value: unknown }>;
        setTopCvFormData((prev) => ({
          ...prev,
          title: (f.title?.value as string) || prev.title || selectedJobDescription?.title || snapshot?.title || '',
          jobDescription: (f.jobDescription?.value as string) || prev.jobDescription || selectedJobDescription?.description || snapshot?.description || '',
          jobRequirement: (f.jobRequirement?.value as string) || prev.jobRequirement || selectedJobDescription?.requirements || '',
          jobBenefit: (f.jobBenefit?.value as string) || prev.jobBenefit || '',
          salaryFrom: typeof f.salaryFrom?.value === 'number' ? f.salaryFrom.value : prev.salaryFrom,
          salaryTo: typeof f.salaryTo?.value === 'number' ? f.salaryTo.value : prev.salaryTo,
          deadline: (f.deadline?.value as string) || prev.deadline,
          quantity: typeof f.quantity?.value === 'number' ? f.quantity.value : prev.quantity,
          contactPhone: (f.contactPhone?.value as string) || prev.contactPhone,
          contactEmails: Array.isArray(f.contactEmail?.value)
            ? (f.contactEmail.value as string[])
            : (typeof f.contactEmail?.value === 'string' ? [f.contactEmail.value] : prev.contactEmails),
        }));
      }
    } catch (err) {
      console.error('Failed to prepare TopCV form from backend:', err);
    } finally {
      setTopCvLoadingFromBe(false);
    }
  }

  async function toggleFacebookChannel() {
    if (selectedPostingChannels.includes('FACEBOOK')) {
      const next = selectedPostingChannels.filter((item) => item !== 'FACEBOOK');
      setChannels(next);
      void setSelectedChannels(next);
      facebook.setFacebookGroupLoadState('IDLE');
      facebook.setFacebookAccount(null);
      facebook.setFacebookPreviewIdentity(null);
      facebook.setFacebookGroupMessage(null);
      facebook.resetFacebookImageAttachmentView();
      facebook.clearFacebookContent();
      return;
    }

    if (!token) {
      setError('Sign in to VCS Recruitment before selecting Facebook.');
      setState('AUTH_REQUIRED');
      return;
    }

    const next: ExtensionChannel[] = [...selectedPostingChannels, 'FACEBOOK'];
    setChannels(next);
    facebook.setFacebookAccount(null);
    facebook.setFacebookPreviewIdentity(null);
    setError(null);

    try {
      const result = await facebook.loadFacebookGroupsForFacebookChannel(token);
      await facebook.restoreFacebookImageAttachments(amisRecruitmentId, snapshot, selectedJobDescription);
      const groups = result.groups;
      if (groups.length === 0) {
        facebook.setFacebookGroupMessage('Đã quét được 0 nhóm');
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
      facebook.setFacebookAccount(null);
      facebook.setFacebookPreviewIdentity(null);
      facebook.setFacebookGroupLoadState('ERROR');
      facebook.setFacebookGroupMessage(toErrorMessage(err));
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
    const facebookTargetIds = channelsForPayload.includes('FACEBOOK') ? facebook.selectedFacebookGroupIds : [];
    const includeFacebookContent = options.includeFacebookContent ?? true;
    const trimmedFacebookContent = (
      options.facebookContentOverride ?? facebook.getEffectiveFacebookContent()
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
      ...(channelsForPayload.includes('FACEBOOK') && facebook.facebookAccount?.id
        ? { facebookAccountId: facebook.facebookAccount.id }
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

  async function sync() {
    if (!token || !snapshot || !amisRecruitmentId || missingFields.length > 0) return;
    if (facebook.isFacebookImageReading) {
      setError('Vui lòng chờ ảnh upload được xử lý xong trước khi đăng bài.');
      setState('ERROR');
      return;
    }
    if (facebook.hasFacebookImageAttachmentError) {
      setError('Vui lòng bỏ ảnh lỗi hoặc chọn ảnh hợp lệ trước khi đăng bài.');
      setState('ERROR');
      return;
    }
    const facebookTargetIds = selectedPostingChannels.includes('FACEBOOK') ? facebook.selectedFacebookGroupIds : [];
    if (selectedPostingChannels.includes('FACEBOOK') && facebookTargetIds.length === 0) {
      setError('Select at least one Facebook group before publishing.');
      setState('ERROR');
      return;
    }
    const shouldPublishFacebook = selectedPostingChannels.includes('FACEBOOK');
    const shouldPublishTopCv = selectedPostingChannels.includes('TOPCV');

    if (shouldPublishTopCv) {
      if (!topCvFormData.title?.trim()) {
        setError('TopCV: Vui lòng nhập tiêu đề bài đăng (chọn "Chỉnh sửa" ở mục TopCV).');
        setState('ERROR');
        return;
      }
      if (!topCvFormData.position?.trim() || !String(topCvFormData.employeeLevel).trim()) {
        setError('TopCV: Vui lòng chọn vị trí chuyên môn và cấp bậc (chọn "Chỉnh sửa" ở mục TopCV).');
        setState('ERROR');
        return;
      }
      if (!hasTopCvRichTextContent(topCvFormData.jobDescription)
        || !hasTopCvRichTextContent(topCvFormData.jobRequirement)
        || !hasTopCvRichTextContent(topCvFormData.jobBenefit)) {
        setError('TopCV: Vui lòng nhập đầy đủ mô tả, yêu cầu và quyền lợi (chọn "Chỉnh sửa" ở mục TopCV).');
        setState('ERROR');
        return;
      }
      if (!topCvFormData.deadline?.trim()) {
        setError('TopCV: Vui lòng chọn hạn nộp hồ sơ (chọn "Chỉnh sửa" ở mục TopCV).');
        setState('ERROR');
        return;
      }
      if (!topCvFormData.contactPhone?.trim() || topCvFormData.contactEmails.length === 0) {
        setError('TopCV: Vui lòng nhập thông tin liên hệ SĐT và Email nhận hồ sơ (chọn "Chỉnh sửa" ở mục TopCV).');
        setState('ERROR');
        return;
      }
    }

    let facebookContentForPublish = shouldPublishFacebook
      ? facebook.getEffectiveFacebookContent()
      : '';
    if (shouldPublishFacebook && !facebookContentForPublish) {
      const generatedContent = await facebook.generateFacebookPostContent({ forceFacebookChannel: true });
      if (!generatedContent) {
        setError('Facebook post content is required before publishing.');
        setState('ERROR');
        return;
      }
      facebookContentForPublish = generatedContent.trim();
    }

    const payload = buildAmisJobPostingPayload({
      includeFacebookContent: shouldPublishFacebook,
      facebookContentOverride: facebookContentForPublish || null,
    });
    if (!payload) {
      setError('Không thể tạo payload đồng bộ bài đăng.');
      setState('ERROR');
      return;
    }

    setState('SYNCING');
    setError(null);

    try {
      const response = await syncAndPublishAmisJob(token, payload);
      setResult(response);

      if (shouldPublishTopCv) {
        setTopCvPublishing(true);
        try {
          const topCvPayload = transformTopCvPayload(topCvFormData);
          await publishTopCvJob(topCvPayload);
        } catch (topCvErr) {
          const errMsg = topCvErr instanceof Error ? topCvErr.message : 'Lỗi khi đăng bài lên TopCV';
          setError(errMsg);
          setState('ERROR');
          return;
        } finally {
          setTopCvPublishing(false);
        }
      }

      if (response.facebookPublishPlan && shouldPublishFacebook) {
        const publishResult = await facebook.executeFacebookPublish(response.facebookPublishPlan);
        if (publishResult && publishResult.summary.successCount === 0) {
          setError(null);
          setState('ERROR');
          return;
        }
        setState('SUCCESS');
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
        {tab === 'overview' ? (
          <OverviewPanel
            jobDescriptionPagination={jobDescriptionPagination}
            jobDescriptions={jobDescriptions}
            snapshot={snapshot}
            selectedJobDescription={selectedJobDescription}
            applicationsContext={applicationsContext}
            onSelectWorkspaceTab={selectWorkspaceTab}
            onLoadMockSnapshot={loadMockSnapshot}
            onLoadLatestAmisCapture={loadLatestAmisCapture}
            onLoadLatestAutoSyncState={loadLatestAutoSyncState}
          />
        ) : null}
        {tab === 'posting' ? (
          <JobPostingPanel
            token={token}
            syncConfig={{
              state: state === 'PASSWORD_CHANGE_REQUIRED' ? 'AUTH_REQUIRED' : state,
              error,
              result,
              syncDisabled,
              onSync: sync,
              autoSyncState,
            }}
            jdConfig={{
              jobDescriptions,
              selectedJobDescription,
              fillingJobDescriptionId,
              jobDescriptionFillState,
              lockedAmisJobDescriptionId,
              jobDescriptionStatus,
              jobDescriptionError,
              jobDescriptionFillMessage,
              vcsPortalSyncResult,
              onSyncVcsPortalJobDescriptions: syncPortalJobDescriptions,
              jobDescriptionPagination,
              onLoadJobDescriptions: loadJobDescriptions,
              onFillJobDescriptionInAmis: fillJobDescriptionInAmis,
              jobDescriptionQuestionContext,
              onOpenFrontendQuestionEditor: openFrontendQuestionEditor,
            }}
            facebookConfig={facebook.facebookConfig}
            topCvConfig={{
              topCvAuth,
              isCheckingTopCvAuth,
              topCvLoadingFromBe,
              setTopCvAuth,
              topCvFormData,
              setTopCvFormData,
              topCvPublishing,
              topCvModalMode,
              setTopCvModalMode,
              foreignLanguageOptions,
              setForeignLanguageOptions,
              onShowExtensionToast: showExtensionToast,
              onLogoutTopCv: logoutTopCv,
              onFetchTopCvFromBackend: fetchTopCvFromBackend,
            }}
          />
        ) : null}
        {tab === 'cv' ? (
          <CvManagementPanel
            token={token}
            isCommittee={user?.role === 'COMMITTEE'}
            amisRecruitmentId={amisRecruitmentId}
            applicationsContext={applicationsContext}
            applicationsState={applicationsState}
            applicationsMessage={applicationsMessage}
            result={result}
            snapshot={snapshot}
            autoSyncState={autoSyncState}
            selectedJobDescription={selectedJobDescription}
            activeAmisCandidateId={activeAmisCandidateId}
            isAmisCandidateFormOpen={isAmisCandidateFormOpen}
            amisRecruitmentRounds={amisRecruitmentRounds}
            pendingAmisUploadApplicationIds={pendingAmisUploadApplicationIds}
            aiEvaluationUploadedApplicationIds={aiEvaluationUploadedApplicationIds}
            cvUploadApplicationId={cvUploadApplicationId}
            aiScreeningApplicationId={aiScreeningApplicationId}
            aiEvaluationApplicationId={aiEvaluationApplicationId}
            onSelectWorkspaceTab={selectWorkspaceTab}
            onLoadAmisApplications={loadAmisApplications}
            onLoadSelectedJobDescriptionQuestionSet={loadSelectedJobDescriptionQuestionSet}
            onUploadApplicationCvToAmisForm={uploadApplicationCvToAmisForm}
            onUploadApplicationCvsToAmisForm={uploadApplicationCvsToAmisForm}
            onRunAiScreeningForApplication={runAiScreeningForApplication}
            onUploadAiEvaluationToAmis={uploadAiEvaluationToAmis}
          />
        ) : null}
        {tab === 'freelancer' && token ? (
          <ReferralManagementPanel
            source="FREELANCER"
            accessToken={token}
            refreshVersion={referralRefreshVersion}
            onNotify={showExtensionToast}
            loadRecruitmentRounds={loadReferralRecruitmentRounds}
          />
        ) : null}
        {tab === 'internal' && token ? (
          <ReferralManagementPanel
            source="INTERNAL"
            accessToken={token}
            refreshVersion={referralRefreshVersion}
            onNotify={showExtensionToast}
            loadRecruitmentRounds={loadReferralRecruitmentRounds}
          />
        ) : null}
      </section>
    );
  }






  function renderExtensionHeader() {
    const canChangePassword = user?.role === 'FREELANCER' || user?.role === 'INTERNAL';
    let passwordAction: React.ReactNode = null;
    if (canChangePassword && !isFreelancerPasswordFormOpen) {
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
            <div className="extension-header-logo">Tuyển dụng VCS</div>
          </div>
          <div className="extension-header-actions">
            {user && state === 'READY' ? (
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
    const showAuthenticatedWorkspace = Boolean(user && token)
      && state !== 'AUTH_LOADING'
      && state !== 'AUTH_REQUIRED'
      && state !== 'PASSWORD_CHANGE_REQUIRED';

    return (
      <>
{state === 'AUTH_LOADING' ? <p className="muted-text extension-loading">Checking session...</p> : null}

        {state === 'AUTH_REQUIRED' ? (
          <LoginForm
            onLoginSuccess={handleLoginSuccess}
            onError={(msg) => showExtensionToast('ERROR', 'Đăng nhập', msg)}
          />
        ) : null}

        {state === 'PASSWORD_CHANGE_REQUIRED' ? (
          <section className="extension-login-shell">
            <ChangePasswordForm
              error={initialPasswordError}
              isSaving={isChangingInitialPassword}
              onCancel={() => void logout()}
              onSubmit={submitInitialPasswordChange}
            />
          </section>
        ) : null}

        {showAuthenticatedWorkspace && (user?.role === 'FREELANCER' || user?.role === 'INTERNAL') && token ? (
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
              loadRecruitmentRounds={loadReferralRecruitmentRounds}
              isChangePasswordFormOpen={isFreelancerPasswordFormOpen}
              onCloseChangePassword={() => setIsFreelancerPasswordFormOpen(false)}
              onPasswordChanged={logout}
            />
          </section>
        ) : showAuthenticatedWorkspace && user ? (
          <>
            <nav className="extension-tabs" aria-label="VCS Recruitment sections">
              {workspaceTabsForUser.map((tab) => {
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
    return extensionToast ? (
      <Toast
        key={extensionToast.id}
        kind={extensionToast.kind}
        title={extensionToast.title}
        message={extensionToast.message}
        onClose={dismissExtensionToast}
      />
    ) : null;
  }

  function renderExtensionOverlays() {
    return (
      <>
        {renderExtensionToast()}
        <FacebookModals manager={facebook} />
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

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
