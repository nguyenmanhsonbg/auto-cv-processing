import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractAmisJobFromPage } from './amis-page-extractor';
import { getLastAutoSyncState } from './amis-auto-sync-store';
import { getLastAmisCapture } from './amis-capture-store';
import { getAmisDiagnostics } from './amis-diagnostics-store';
import { ensureAmisHooksInActiveTab } from './amis-hook-installer';
import {
  ApiClientError,
  createAmisCareerQuestion,
  createFacebookGroup,
  discoverFacebookGroups,
  deleteFacebookGroup,
  downloadCleanCvFile,
  getAmisApplicationsForRecruitment,
  getAmisCareerQuestionContext,
  getCurrentUser,
  getFacebookGroups,
  listFacebookGroupPublishHistories,
  listJobDescriptions,
  listAmisCareers,
  login,
  syncAmisApplications,
  syncAndPublishAmisJob,
  updateFacebookGroup,
  updateFacebookPublishHistoryStatusCheck,
  verifyFacebookGroup,
} from './api-client';
import { clearAccessToken, getAccessToken, setAuthTokens, subscribeAuthTokenChanges } from './auth-store';
import { getSelectedChannels, setSelectedChannels } from './channel-preferences';
import { DEFAULT_POSTING_CHANNELS, POSTING_CHANNELS } from './config';
import { summarizeFacebookPublishResults, updateFacebookChannelStatus } from './facebook-channel-status';
import { getSelectedFacebookGroupIds, setSelectedFacebookGroupIds } from './facebook-group-preferences';
import { getValidFacebookGroupPostUrl } from './facebook-post-url';
import {
  ensureFacebookSession,
  publishFacebookPlan,
  refreshFacebookPostReviewStatus,
  verifyFacebookGroupPostingEligibility,
} from './facebook-publish-orchestrator';
import { getLastFacebookPublishProgress, saveLastFacebookPublishProgress } from './facebook-publish-store';
import { createMockAmisSyncRequest } from './mock-amis';
import { saveSelectedJobQuestionContext } from './selected-job-question-store';
import type {
  AmisDiagnosticEvent,
  AmisAutoSyncState,
  AmisCareerQuestionContext,
  AmisApplicationsForRecruitment,
  AmisApplicationItem,
  AmisSelectedCareerResult,
  AmisExtractionResult,
  AmisJobSnapshot,
  ApiPagination,
  ChannelPostingResult,
  ExtensionQuestion,
  ExtensionChannel,
  ExtensionSyncResponse,
  DiscoverFacebookGroupsResponse,
  ExtensionUser,
  FacebookPublishHistoriesResponse,
  FacebookPublishHistoryListItem,
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishTarget,
  FacebookPublishTargetEligibilityStatus,
  FacebookReviewStatus,
  JobDescriptionSummary,
  SyncAmisJobPostingRequest,
} from './types';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
type CareerQuestionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type WorkspaceTab = 'overview' | 'posting' | 'cv';
type CvWorkspaceView = 'overview' | 'list';
type FacebookPostHistoryFilter = 'ALL' | FacebookReviewStatus;
type FacebookPostHistoryLoadState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type FacebookGroupLoadState =
  | 'IDLE'
  | 'CHECKING_LOGIN'
  | 'WAITING_LOGIN'
  | 'LOADING_GROUPS'
  | 'READY'
  | 'ERROR';
type FacebookGroupModalMode = 'SETTINGS' | 'EDIT' | 'DELETE';
type ApplicationsState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

interface FacebookHistoryGroup {
  id: string | null;
  name: string;
  url?: string | null;
  externalId?: string | null;
}

interface DiscoveredFacebookGroupItem {
  targetName: string;
  targetUrl: string;
  targetExternalId: string;
}

interface FacebookGroupsScanRunResult {
  groups: DiscoveredFacebookGroupItem[];
}

interface FacebookGroupsSyncResult {
  groups: FacebookPublishTarget[];
  selectedIds: string[];
  discoverySummary: string | null;
}

const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_APPLICATIONS';
const UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE = 'VCS_UPLOAD_AMIS_CV_FILE';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_CONTEXT';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
const CAREER_QUESTION_SELECTION_PREFIX = 'vcs:selected-career-questions:';
const MAX_POSTING_SNAPSHOT_REFRESH_ATTEMPTS = 3;
const TARGET_LEVEL_OPTIONS = [
  { value: 'ENTRY', label: 'Entry Level' },
  { value: 'EXPERIENCED', label: 'Experienced' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'SPECIALIST', label: 'Specialist / Expert' },
];
const DIFFICULTY_OPTIONS = [
  { value: '1', label: '1 - Basic' },
  { value: '2', label: '2 - Easy' },
  { value: '3', label: '3 - Intermediate' },
  { value: '4', label: '4 - Advanced' },
  { value: '5', label: '5 - Expert' },
];
const COMPETENCY_TYPE_OPTIONS = [
  { value: 'INHERIT', label: 'Inherit from subcategory' },
  { value: 'KNOWLEDGE', label: 'Knowledge' },
  { value: 'SKILL', label: 'Skill' },
  { value: 'PERSONALITY', label: 'Personality' },
];
const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Tổng Quan' },
  { id: 'posting', label: 'Posting' },
  { id: 'cv', label: 'CV' },
];
const FACEBOOK_HISTORY_PAGE_SIZE = 5;
const FACEBOOK_HISTORY_REFRESH_BATCH_SIZE = 50;
const FACEBOOK_HISTORY_FILTERS: Array<{ value: FacebookPostHistoryFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'POSTED', label: 'Đã đăng' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];
const POSTING_CHANNEL_SET = new Set<ExtensionChannel>(POSTING_CHANNELS);
type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

function getCareerQuestionSelectionStorageKey(amisCareerId: string) {
  return `${CAREER_QUESTION_SELECTION_PREFIX}${amisCareerId}`;
}

function SidePanel() {
  const [state, setState] = useState<PanelState>('AUTH_LOADING');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [pinnedWorkspaceTab, setPinnedWorkspaceTab] = useState<WorkspaceTab | null>('overview');
  const [cvWorkspaceView, setCvWorkspaceView] = useState<CvWorkspaceView>('overview');
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
  const [selectedFacebookGroupIds, setSelectedFacebookGroupIdsState] = useState<string[]>([]);
  const [facebookGroupLoadState, setFacebookGroupLoadState] = useState<FacebookGroupLoadState>('IDLE');
  const [facebookGroupMessage, setFacebookGroupMessage] = useState<string | null>(null);
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
  const [jobDescriptionStatus, setJobDescriptionStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [jobDescriptionError, setJobDescriptionError] = useState<string | null>(null);
  const [jobDescriptionFillState, setJobDescriptionFillState] = useState<JobDescriptionFillState>('IDLE');
  const [jobDescriptionFillMessage, setJobDescriptionFillMessage] = useState<string | null>(null);
  const [fillingJobDescriptionId, setFillingJobDescriptionId] = useState<string | null>(null);
  const [selectedCareerName, setSelectedCareerName] = useState<string | null>(null);
  const [careerQuestionState, setCareerQuestionState] = useState<CareerQuestionState>('IDLE');
  const [careerQuestionMessage, setCareerQuestionMessage] = useState<string | null>(null);
  const [careerQuestionContext, setCareerQuestionContext] = useState<AmisCareerQuestionContext | null>(null);
  const [newQuestionCategory, setNewQuestionCategory] = useState('');
  const [newQuestionSubcategory, setNewQuestionSubcategory] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionExpectedAnswer, setNewQuestionExpectedAnswer] = useState('');
  const [newQuestionDrawerOpen, setNewQuestionDrawerOpen] = useState(false);
  const [newQuestionCompetencyType, setNewQuestionCompetencyType] = useState('INHERIT');
  const [newQuestionDifficulty, setNewQuestionDifficulty] = useState('3');
  const [newQuestionTargetLevels, setNewQuestionTargetLevels] = useState<string[]>(['SENIOR']);
  const [newQuestionSaving, setNewQuestionSaving] = useState(false);
  const [selectedCareerQuestionIds, setSelectedCareerQuestionIds] = useState<Set<string>>(new Set());
  const [applicationsState, setApplicationsState] = useState<ApplicationsState>('IDLE');
  const [applicationsContext, setApplicationsContext] = useState<AmisApplicationsForRecruitment | null>(null);
  const [applicationsMessage, setApplicationsMessage] = useState<string | null>(null);
  const [cvUploadApplicationId, setCvUploadApplicationId] = useState<string | null>(null);
  const [selectedApplicationCvIds, setSelectedApplicationCvIds] = useState<Set<string>>(new Set());
  const [selectedCvApplicationIds, setSelectedCvApplicationIds] = useState<Set<string>>(new Set());
  const [isCvSyncReviewOpen, setIsCvSyncReviewOpen] = useState(false);
  const lastCareerContextIdRef = useRef<string | null>(null);
  const lastApplicationsFallbackSyncUrlRef = useRef<string | null>(null);
  const activeAmisRecruitmentIdRef = useRef<string | null>(null);
  const activeSnapshotRecruitmentIdRef = useRef<string | null>(null);
  const applicationsRequestSeqRef = useRef(0);
  const postingSnapshotRefreshSeqRef = useRef(0);
  const postingSnapshotRefreshAttemptsRef = useRef(new Map<string, number>());
  const missedRecruitmentContextCountRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const channelsRef = useRef<ExtensionChannel[]>(channels);
  const facebookGroupsRef = useRef<FacebookPublishTarget[]>(facebookGroups);
  const selectedFacebookGroupIdsRef = useRef<string[]>(selectedFacebookGroupIds);
  const facebookGroupVerificationQueueRef = useRef<FacebookPublishTarget[]>([]);
  const facebookGroupVerificationRunningRef = useRef(false);
  const activeFacebookGroupVerificationIdRef = useRef<string | null>(null);
  const startedFacebookPlanKeys = useRef(new Set<string>());

  useEffect(() => {
    tokenRef.current = token;
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

      if (isSelectedCareerChangedMessage(message)) {
        setSelectedCareerName(message.payload.careerName || null);
        if (tokenRef.current) {
          void refreshSelectedCareerContext(tokenRef.current, { silent: true });
        }
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
    if (!token) return;

    void refreshSelectedCareerContext(token, { silent: true });
    const intervalId = window.setInterval(() => {
      void refreshSelectedCareerContext(token, { silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (!token || !amisRecruitmentId) {
      setApplicationsContext(null);
      setApplicationsState('IDLE');
      setApplicationsMessage(null);
      setSelectedApplicationCvIds(new Set());
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
    setSelectedApplicationCvIds((current) =>
      new Set(Array.from(current).filter((applicationId) => currentIds.has(applicationId))),
    );
    setSelectedCvApplicationIds((current) =>
      new Set(Array.from(current).filter((applicationId) => currentIds.has(applicationId))),
    );
  }, [applicationsContext]);

  useEffect(() => {
    const firstCategory = careerQuestionContext?.categories[0];
    if (!firstCategory) {
      setNewQuestionCategory('');
      setNewQuestionSubcategory('');
      return;
    }

    setNewQuestionCategory((current) => current || firstCategory.name);
    setNewQuestionSubcategory((current) => current || firstCategory.subcategories[0]?.name || '');
  }, [careerQuestionContext]);

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

  const selectedPostingChannelCount = selectedPostingChannels.length;
  const allChannelsSelected = selectedPostingChannelCount === POSTING_CHANNELS.length;
  const selectedNewQuestionCategory = useMemo(
    () => careerQuestionContext?.categories.find((category) => category.name === newQuestionCategory) ?? null,
    [careerQuestionContext, newQuestionCategory],
  );
  const selectedNewQuestionSubcategory = useMemo(
    () => selectedNewQuestionCategory?.subcategories.find((subcategory) => subcategory.name === newQuestionSubcategory) ?? null,
    [newQuestionSubcategory, selectedNewQuestionCategory],
  );
  const selectedCareerQuestionCount = useMemo(() => {
    if (!careerQuestionContext) return 0;

    const visibleQuestionIds = new Set(careerQuestionContext.questions.map((question) => question.id));
    return Array.from(selectedCareerQuestionIds).filter((questionId) => visibleQuestionIds.has(questionId)).length;
  }, [careerQuestionContext, selectedCareerQuestionIds]);
  const allCareerQuestionsSelected = Boolean(careerQuestionContext?.questions.length)
    && selectedCareerQuestionCount === careerQuestionContext?.questions.length;

  const visibleFacebookGroups = useMemo(() => {
    if (facebookGroups.length > 0) {
      return facebookGroups.map(toFacebookGroupUiItem);
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
  }, [facebookGroups, facebookProgress, result]);
  const facebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(facebookGroupUrl, facebookGroups);
  const facebookGroupUrlFieldError = facebookGroupDuplicateUrlError ?? facebookGroupUrlError;
  const editFacebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(
    editFacebookGroupUrl,
    facebookGroups,
    selectedFacebookGroup?.targetId ?? null,
  );
  const editFacebookGroupUrlFieldError = editFacebookGroupDuplicateUrlError ?? editFacebookGroupUrlError;

  const uploadableApplications = useMemo(
    () => applicationsContext?.applications.filter(canUploadApplicationCv) ?? [],
    [applicationsContext],
  );
  const selectedUploadableApplicationCount = useMemo(() => {
    const uploadableIds = new Set(uploadableApplications.map((application) => application.applicationId));
    return Array.from(selectedApplicationCvIds).filter((applicationId) => uploadableIds.has(applicationId)).length;
  }, [selectedApplicationCvIds, uploadableApplications]);

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

      setToken(latestToken);
      setUser(currentUser);
      setState('READY');
      await loadJobDescriptions(latestToken);
      await loadLatestAutoSyncState({ silent: true });
      void syncFacebookGroupsFromBrowser(latestToken, { silent: true });
    } catch {
      await clearAccessToken();
      setState('AUTH_REQUIRED');
    }
  }

  async function restoreSelectedChannels() {
    setChannels(normalizePostingChannels(await getSelectedChannels()));
  }

  async function restoreSelectedFacebookGroups() {
    setSelectedFacebookGroupIdsState(await getSelectedFacebookGroupIds());
  }

  async function updateSelectedFacebookGroupIds(targetIds: string[]) {
    const uniqueTargetIds = uniqueStrings(targetIds);
    selectedFacebookGroupIdsRef.current = uniqueTargetIds;
    setSelectedFacebookGroupIdsState(uniqueTargetIds);
    await setSelectedFacebookGroupIds(uniqueTargetIds);
  }

  async function reconcileSelectedFacebookGroups(groups: FacebookPublishTarget[], targetIds = selectedFacebookGroupIds) {
    const selectableGroupIds = new Set(groups.filter(isSelectableFacebookGroup).map((group) => group.targetId).filter(isString));
    const nextTargetIds = uniqueStrings(targetIds).filter((targetId) => selectableGroupIds.has(targetId));
    await updateSelectedFacebookGroupIds(nextTargetIds);
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
      const selectableCount = countSelectableFacebookGroups(facebookGroups);
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(`${uniqueStrings(nextTargetIds).length}/${selectableCount} eligible Facebook group(s) selected.`);
    }
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
      setToken(auth.accessToken);
      setUser(auth.user);
      setState('READY');
      await loadJobDescriptions(auth.accessToken);
      await loadLatestAutoSyncState({ silent: true });
      void syncFacebookGroupsFromBrowser(auth.accessToken, { silent: true });
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

  async function loadJobDescriptions(accessToken = token, page = 1) {
    if (!accessToken) return;

    setJobDescriptionStatus('LOADING');
    setJobDescriptionError(null);

    try {
      const response = await listJobDescriptions(accessToken, {
        page,
        limit: 20,
        search: jobDescriptionSearch,
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

      setApplicationsContext(context);
      setApplicationsState('READY');
      setApplicationsMessage(null);
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
        missedRecruitmentContextCountRef.current = 0;
        setActiveAmisRecruitmentContext(null, null);
        return;
      }

      const context = parseAmisRecruitmentContextFromUrl(activeTab.url);
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

  async function uploadSelectedApplicationCvsToAmisForm() {
    if (!applicationsContext) return;
    const selectedCvIds = selectedApplicationCvIds.size > 0
      ? selectedApplicationCvIds
      : selectedCvApplicationIds;
    const selectedApplications = applicationsContext.applications.filter((application) =>
      selectedCvIds.has(application.applicationId),
    );
    await uploadApplicationCvsToAmisForm(selectedApplications);
  }

  async function uploadApplicationCvsToAmisForm(applications: AmisApplicationsForRecruitment['applications']) {
    if (!token) return;
    const uploadableApplications = applications.filter(canUploadApplicationCv);
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

      setApplicationsMessage(`Loaded ${response.fileCount ?? cleanCvs.length} CV file(s) into AMIS upload form.`);
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

  function toggleApplicationCvSelection(applicationId: string) {
    const next = new Set(selectedApplicationCvIds);
    if (next.has(applicationId)) {
      next.delete(applicationId);
    } else {
      next.add(applicationId);
    }

    setSelectedApplicationCvIds(next);
  }

  function selectAllUploadableApplicationCvs() {
    if (!applicationsContext) return;
    setSelectedApplicationCvIds(new Set(
      applicationsContext.applications.filter(canUploadApplicationCv).map((application) => application.applicationId),
    ));
  }

  function clearSelectedApplicationCvs() {
    setSelectedApplicationCvIds(new Set());
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
      setApplicationsContext(null);
      setApplicationsMessage(null);
      setApplicationsState(normalizedRecruitmentId ? 'LOADING' : 'IDLE');
      if (options.clearPosting === false) {
        postingSnapshotRefreshSeqRef.current += 1;
        activeSnapshotRecruitmentIdRef.current = null;
      } else {
        clearPostingStateForRecruitmentChange();
      }
    }

    return previousRecruitmentId !== normalizedRecruitmentId;
  }

  function clearPostingStateForRecruitmentChange() {
    postingSnapshotRefreshSeqRef.current += 1;
    activeSnapshotRecruitmentIdRef.current = null;
    setSnapshot(null);
    setExtractionResult(null);
    setResult(null);
    setAutoSyncState(null);
    setAmisUrl(undefined);
    setError(null);
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

  async function refreshSelectedCareerContext(
    accessToken = token,
    options: { silent?: boolean } = {},
  ) {
    if (!accessToken) return;
    if (!options.silent) {
      setCareerQuestionState('LOADING');
      setCareerQuestionMessage(null);
    }

    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        if (!options.silent) {
          setCareerQuestionState('IDLE');
          setCareerQuestionMessage('Open the AMIS recruitment form tab to detect the selected career.');
        }
        return;
      }

      if (!chrome.tabs?.sendMessage) {
        throw new Error('Chrome tabs messaging is unavailable.');
      }

      const selected = await sendMessageToAmisTab(activeTab.id, {
        type: GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE,
      });

      if (!isSelectedCareerResponse(selected) || !selected.ok) {
        throw new Error(isSelectedCareerResponse(selected) ? selected.error ?? 'Could not read AMIS career.' : 'AMIS tab did not return career selection.');
      }

      const careerName = sanitizeDetectedCareerName(selected.careerName);
      setSelectedCareerName(careerName || null);
      if (!careerName) {
        lastCareerContextIdRef.current = null;
        setCareerQuestionContext(null);
        setSelectedCareerQuestionIds(new Set());
        setCareerQuestionState('IDLE');
        setCareerQuestionMessage('No AMIS career is selected on the form.');
        return;
      }

      const careers = await listAmisCareers(accessToken);
      const matchedCareer = careers.find((career) => normalizeMatchText(career.name) === normalizeMatchText(careerName))
        ?? careers.find((career) => normalizeMatchText(career.name).includes(normalizeMatchText(careerName))
          || normalizeMatchText(careerName).includes(normalizeMatchText(career.name)));

      if (!matchedCareer) {
        setCareerQuestionContext(null);
        setSelectedCareerQuestionIds(new Set());
        setCareerQuestionState('ERROR');
        setCareerQuestionMessage(`"${careerName}" has not been synced into AMIS Careers yet.`);
        return;
      }

      if (lastCareerContextIdRef.current === matchedCareer.amisCareerId && options.silent) {
        return;
      }

      const context = await getAmisCareerQuestionContext(accessToken, matchedCareer.amisCareerId);
      lastCareerContextIdRef.current = matchedCareer.amisCareerId;
      setCareerQuestionContext(context);
      await restoreSelectedCareerQuestions(context);
      setCareerQuestionState('READY');
      setCareerQuestionMessage(null);
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

  async function restoreSelectedCareerQuestions(context: AmisCareerQuestionContext) {
    const storageKey = getCareerQuestionSelectionStorageKey(context.career.amisCareerId);
    const validQuestionIds = new Set(context.questions.map((question) => question.id));

    try {
      const stored = await chrome.storage?.session?.get(storageKey);
      const storedQuestionIds = Array.isArray(stored?.[storageKey]) ? stored[storageKey] : [];
      const selectedQuestionIds = storedQuestionIds.filter(
        (questionId): questionId is string => typeof questionId === 'string' && validQuestionIds.has(questionId),
      );

      setSelectedCareerQuestionIds(new Set(selectedQuestionIds));
      void persistSelectedJobQuestionContextForActiveTab(context, selectedQuestionIds);
    } catch {
      setSelectedCareerQuestionIds(new Set());
      void persistSelectedJobQuestionContextForActiveTab(context, []);
    }
  }

  async function persistSelectedCareerQuestions(amisCareerId: string, questionIds: string[]) {
    try {
      await chrome.storage?.session?.set({
        [getCareerQuestionSelectionStorageKey(amisCareerId)]: questionIds,
      });
    } catch {
      // Selection is a panel convenience state; failing to persist must not block AMIS work.
    }
  }

  function updateSelectedCareerQuestions(nextQuestionIds: Set<string>) {
    setSelectedCareerQuestionIds(nextQuestionIds);
    const questionIds = Array.from(nextQuestionIds);
    if (careerQuestionContext) {
      void persistSelectedCareerQuestions(careerQuestionContext.career.amisCareerId, questionIds);
      void persistSelectedJobQuestionContextForActiveTab(careerQuestionContext, questionIds);
    }
  }

  async function persistSelectedJobQuestionContextForActiveTab(
    context: AmisCareerQuestionContext,
    questionIds: string[],
  ) {
    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) return;

      await saveSelectedJobQuestionContext({
        tabId: activeTab.id,
        pageUrl: activeTab.url,
        amisCareerId: context.career.amisCareerId,
        careerName: context.career.name,
        questionIds,
      });
    } catch {
      // Background auto-sync can still fall back to category-based question generation.
    }
  }

  function toggleCareerQuestion(questionId: string) {
    const nextQuestionIds = new Set(selectedCareerQuestionIds);
    if (nextQuestionIds.has(questionId)) {
      nextQuestionIds.delete(questionId);
    } else {
      nextQuestionIds.add(questionId);
    }

    updateSelectedCareerQuestions(nextQuestionIds);
  }

  function selectAllCareerQuestions() {
    if (!careerQuestionContext) return;
    updateSelectedCareerQuestions(new Set(careerQuestionContext.questions.map((question) => question.id)));
  }

  function clearSelectedCareerQuestions() {
    updateSelectedCareerQuestions(new Set());
  }

  function handleNewQuestionCategoryChange(categoryName: string) {
    setNewQuestionCategory(categoryName);
    const category = careerQuestionContext?.categories.find((item) => item.name === categoryName);
    setNewQuestionSubcategory(category?.subcategories[0]?.name ?? '');
    setNewQuestionCompetencyType('INHERIT');
  }

  function openNewQuestionDrawer() {
    setNewQuestionDrawerOpen(true);
  }

  function closeNewQuestionDrawer() {
    setNewQuestionDrawerOpen(false);
  }

  function resetNewQuestionDraft() {
    setNewQuestionText('');
    setNewQuestionExpectedAnswer('');
    setNewQuestionCompetencyType('INHERIT');
    setNewQuestionDifficulty('3');
    setNewQuestionTargetLevels(['SENIOR']);
  }

  function toggleNewQuestionTargetLevel(level: string) {
    setNewQuestionTargetLevels((current) => (
      current.includes(level)
        ? current.filter((item) => item !== level)
        : [...current, level]
    ));
  }

  async function submitNewCareerQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !careerQuestionContext) return;
    if (!newQuestionCategory || !newQuestionSubcategory || !newQuestionText.trim()) {
      setCareerQuestionMessage('Category, subcategory, and question text are required.');
      setCareerQuestionState('ERROR');
      return;
    }

    setNewQuestionSaving(true);
    setCareerQuestionMessage(null);
    try {
      const question = await createAmisCareerQuestion(token, careerQuestionContext.career.amisCareerId, {
        category: newQuestionCategory,
        subcategory: newQuestionSubcategory,
        text: newQuestionText,
        expectedAnswer: newQuestionExpectedAnswer || undefined,
      });
      setCareerQuestionContext({
        ...careerQuestionContext,
        questions: [...careerQuestionContext.questions, question],
      });
      const nextSelectedQuestionIds = new Set(selectedCareerQuestionIds);
      nextSelectedQuestionIds.add(question.id);
      updateSelectedCareerQuestions(nextSelectedQuestionIds);
      resetNewQuestionDraft();
      closeNewQuestionDrawer();
      setCareerQuestionState('READY');
      setCareerQuestionMessage('Question added to the selected AMIS career mapping.');
    } catch (err) {
      setCareerQuestionState('ERROR');
      setCareerQuestionMessage(toErrorMessage(err));
    } finally {
      setNewQuestionSaving(false);
    }
  }

  function submitJobDescriptionSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadJobDescriptions(token, 1);
  }

  async function fillJobDescriptionInAmis(jobDescription: JobDescriptionSummary) {
    setJobDescriptionFillState('FILLING');
    setFillingJobDescriptionId(jobDescription.id);
    setJobDescriptionFillMessage(`Filling "${jobDescription.title}" into the active AMIS tab...`);

    try {
      const activeTab = await getActiveTab();
      if (!activeTab.url?.startsWith('https://amisapp.misa.vn/')) {
        throw new Error('Open the AMIS recruitment creation screen in the active tab, then click the JD again.');
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
    } else {
      activeSnapshotRecruitmentIdRef.current = null;
      setSnapshot(null);
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
      const result = await syncFacebookGroupsFromBrowser(token);
      const groups = result.groups;
      const selectedIds = result.selectedIds;
      const discoverySummary = result.discoverySummary;
      if (groups.length > 0) {
        setFacebookGroupMessage(
          discoverySummary ? `${discoverySummary}. ${selectedIds.length}/${countSelectableFacebookGroups(groups)} eligible Facebook group(s) selected.`
            : `${selectedIds.length}/${countSelectableFacebookGroups(groups)} eligible Facebook group(s) selected.`,
        );
      } else {
        setFacebookGroupMessage('No Facebook groups are configured for this account yet.');
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

  async function syncFacebookGroupsFromBrowser(
    accessToken: string,
    options: { silent?: boolean } = {},
  ): Promise<FacebookGroupsSyncResult> {
    const shouldReport = options.silent !== true;
    if (shouldReport) {
      setFacebookGroupLoadState('CHECKING_LOGIN');
      setFacebookGroupMessage('Checking Facebook login in this browser.');
    }

    await ensureFacebookSession({
      onStatus: (event) => {
        if (!shouldReport) return;
        setFacebookGroupLoadState(event.status === 'READY' ? 'LOADING_GROUPS' : event.status);
        setFacebookGroupMessage(event.message);
      },
    });

    if (shouldReport) {
      setFacebookGroupLoadState('LOADING_GROUPS');
      setFacebookGroupMessage('Đang quét danh sách nhóm đã tham gia trên Facebook...');
    }

    const discoveredGroups = await collectJoinedFacebookGroupsFromFacebookPage(
      (message) => {
        if (shouldReport && message) setFacebookGroupMessage(message);
      },
      { ensureSession: false },
    );

    let discoverySummary: string | null = null;
    if (discoveredGroups.length > 0) {
      if (shouldReport) {
        setFacebookGroupMessage(`Đã quét được ${discoveredGroups.length} nhóm, đang đồng bộ lên VCS...`);
      }
      const discoverResult = await discoverFacebookGroups(accessToken, {
        groups: discoveredGroups.map((item) => ({
          targetName: item.targetName,
          targetUrl: item.targetUrl,
          targetExternalId: item.targetExternalId,
        })),
      });
      discoverySummary = buildFacebookGroupDiscoverMessage(discoverResult);
    } else if (shouldReport) {
      setFacebookGroupMessage('Không đọc được nhóm nào từ danh sách nhóm đã tham gia, sẽ lấy danh sách đã cấu hình hiện có.');
    }

    if (shouldReport) {
      setFacebookGroupMessage('Đang tải danh sách nhóm Facebook đã đồng bộ...');
    }
    const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(accessToken));
    setFacebookGroups(groups);
    const selectedIds = await reconcileSelectedFacebookGroups(groups, await getSelectedFacebookGroupIds());
    const selectableCount = countSelectableFacebookGroups(groups);

    if (shouldReport) {
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(
        groups.length > 0
          ? `${discoverySummary ? `${discoverySummary}. ` : ''}${selectedIds.length}/${selectableCount} eligible Facebook group(s) selected.`
          : 'No Facebook groups are configured for this account yet.',
      );
    }

    return { groups, selectedIds, discoverySummary };
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
  ): Promise<DiscoveredFacebookGroupItem[]> {
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
      return uniqueDiscoveredGroups(scanResult.groups ?? []);
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
      let unresolvedCount = 0;
      let issueCount = 0;

      for (let index = 0; index < itemsToRefresh.length; index += 1) {
        const item = itemsToRefresh[index];
        setRefreshingFacebookHistoryIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]);
        setFacebookHistoryMessage(`Đang kiểm tra ${index + 1}/${itemsToRefresh.length}: ${item.title}`);

        try {
          const statusCheck = await refreshFacebookPostReviewStatus(item);
          await updateFacebookPublishHistoryStatusCheck(accessToken, item.id, statusCheck);
          if (statusCheck.facebookReviewStatus === 'POSTED') postedCount += 1;
          else if (statusCheck.facebookReviewStatus === 'REJECTED') rejectedCount += 1;
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
        `Đã kiểm tra ${itemsToRefresh.length} bài. ${postedCount} đã đăng, ${rejectedCount} bị từ chối, ${unresolvedCount} chưa xác định/chờ duyệt${issueCount ? `, ${issueCount} lỗi` : ''}.`,
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
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(accessToken));
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
            setFacebookGroupMessage(`${nextSelectedIds.length}/${countSelectableFacebookGroups(groups)} eligible Facebook group(s) selected.`);
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
      const savedGroup = await createFacebookGroup(token, { targetName, targetUrl });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token));
      setFacebookGroups(groups);
      const nextSelectedIds = await reconcileSelectedFacebookGroups(groups);
      setFacebookGroupName('');
      setFacebookGroupUrl('');
      setFacebookGroupUrlError(null);
      setIsFacebookGroupFormOpen(false);
      setFacebookSettingsState('READY');
      setFacebookSettingsMessage(`Added "${savedGroup.targetName}". Click Check before using it for publishing.`);

      if (selectedPostingChannels.includes('FACEBOOK')) {
        const selectableCount = countSelectableFacebookGroups(groups);
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(`${nextSelectedIds.length}/${selectableCount} eligible Facebook group(s) selected.`);
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
      const savedGroup = await updateFacebookGroup(token, selectedFacebookGroup.targetId, { targetName, targetUrl });
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token));
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
        const selectableCount = countSelectableFacebookGroups(groups);
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(`${nextSelectedIds.length}/${selectableCount} eligible Facebook group(s) selected.`);
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
      const deletedGroup = await deleteFacebookGroup(token, selectedFacebookGroup.targetId);
      const groups = sortFacebookGroupsByDiscovery(await getFacebookGroups(token));
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
            ? `${nextSelectedIds.length}/${countSelectableFacebookGroups(groups)} eligible Facebook group(s) selected.`
            : 'No Facebook groups are configured for this account yet.',
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

  function selectAllChannels() {
    const next = [...POSTING_CHANNELS];
    setChannels(next);
    void setSelectedChannels(next);
  }

  function clearChannels() {
    setChannels([]);
    setFacebookGroupLoadState('IDLE');
    setFacebookGroupMessage(null);
    void setSelectedChannels([]);
  }

  async function sync() {
    if (!token || !snapshot || !amisRecruitmentId || missingFields.length > 0) return;
    const facebookTargetIds = selectedPostingChannels.includes('FACEBOOK') ? selectedFacebookGroupIds : [];
    if (selectedPostingChannels.includes('FACEBOOK') && facebookTargetIds.length === 0) {
      setError('Select at least one Facebook group before publishing.');
      setState('ERROR');
      return;
    }

    const payload: SyncAmisJobPostingRequest = {
      sourceSystem: 'AMIS',
      amisRecruitmentId,
      amisUrl,
      action: 'PUBLISH',
      snapshot,
      channels: selectedPostingChannels,
      ...(selectedPostingChannels.includes('FACEBOOK') ? { facebookTargetIds } : {}),
      ...(selectedCareerQuestionIds.size > 0
        ? { selectedQuestionIds: Array.from(selectedCareerQuestionIds) }
        : {}),
      metadata: {
        capturedAt: new Date().toISOString(),
        captureSource: extractionResult?.source ?? 'MOCK',
        captureConfidence: extractionResult?.confidence,
        extractionWarnings: extractionResult?.warnings,
        extractionEvidence: extractionResult?.evidence,
        selectedQuestionCount: selectedCareerQuestionIds.size,
      },
    };

    setState('SYNCING');
    setError(null);

    try {
      const response = await syncAndPublishAmisJob(token, payload);
      setResult(response);
      if (response.facebookPublishPlan && selectedPostingChannels.includes('FACEBOOK')) {
        await startFacebookPublish(response.facebookPublishPlan);
      } else {
        setState('SUCCESS');
      }
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

  async function startFacebookPublish(plan: FacebookPublishPlan) {
    if (!token) return;
    const planKey = getFacebookPlanKey(plan);
    if (startedFacebookPlanKeys.current.has(planKey)) return;

    if (plan.targets.length === 0) {
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
      return;
    }

    startedFacebookPlanKeys.current.add(planKey);
    setFacebookRunning(true);
    setState('SYNCING');
    setError(null);
    let latestProgress: FacebookPublishProgress | null = facebookProgress;

    try {
      const facebookResults = await publishFacebookPlan(token, plan, {
        onProgress: (progress) => {
          latestProgress = progress;
          setFacebookProgress(progress);
          void saveLastFacebookPublishProgress(progress);
        },
      });
      const summary = summarizeFacebookPublishResults(facebookResults);
      setResult((current) => current ? updateFacebookChannelStatus(current, facebookResults) : current);
      if (summary.successCount > 0) {
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
        total: latestProgress?.total ?? plan.targets.length,
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

    return (
      <section key={tab} className={`workspace-panel workspace-panel-${tab}${isPinned ? ' is-pinned' : ''}`}>
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
        {tab === 'overview' ? renderOverviewPanel() : null}
        {tab === 'posting' ? renderPostingPanel() : null}
        {tab === 'cv' ? renderCvPanel() : null}
      </section>
    );
  }

  function renderFacebookPostHistoryModal() {
    if (!selectedFacebookHistoryGroup) return null;

    const summary = facebookHistoryData?.summary ?? {
      total: 0,
      posted: 0,
      pendingReview: 0,
      rejected: 0,
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
        company: snapshot.location ?? selectedCareerName ?? 'AMIS Recruitment',
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

        {snapshot ? (
          <section className="preview recruitment-snapshot-card">
            <div>
              <p className="eyebrow">Snapshot</p>
              <h2>{snapshot.title}</h2>
            </div>
            <dl>
              <div>
                <dt>AMIS ID</dt>
                <dd>{amisRecruitmentId}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{snapshot.summary ?? snapshot.description}</dd>
              </div>
              <div>
                <dt>Requirements</dt>
                <dd>{snapshot.requirements.rawText}</dd>
              </div>
              {snapshot.location ? (
                <div>
                  <dt>Location</dt>
                  <dd>{snapshot.location}</dd>
                </div>
              ) : null}
              {snapshot.deadline ? (
                <div>
                  <dt>Deadline</dt>
                  <dd>{snapshot.deadline}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : (
          <div className="empty-panel-state">
            <strong>No snapshot loaded</strong>
            <span>Load the latest AMIS save, run DOM extract, or use mock data.</span>
          </div>
        )}

        {missingFields.length > 0 ? <p className="warning-text">Missing: {missingFields.join(', ')}</p> : null}

        <button
          type="button"
          className="primary-button sync-button"
          disabled={state === 'EXTRACTING' || state === 'SYNCING' || facebookRunning || missingFields.length > 0}
          onClick={sync}
        >
          {facebookRunning ? 'Publishing Facebook...' : state === 'SYNCING' ? 'Syncing...' : 'SYNC AND PUBLISH'}
        </button>

        {state === 'ERROR' && error ? <p className="error-text">{error}</p> : null}

        {result ? (
          <section className="result-panel publish-result-panel">
            <div>
              <p className="eyebrow">RESULT</p>
              <h2>{result.resultCode}</h2>
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

  function renderChannelPanel() {
    return (
      <section className="channel-section">
          <div className="section-heading-row">
            <p className="section-title">Channels</p>
            <div className="channel-select-actions">
              <button type="button" className="text-button" disabled={allChannelsSelected} onClick={selectAllChannels}>
                All
              </button>
              <button
                type="button"
                className="text-button"
                disabled={selectedPostingChannelCount === 0}
                onClick={clearChannels}
              >
                Clear
              </button>
            </div>
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
                      <div className="channel-subselection-title">Facebook groups</div>
                      <div className="channel-subselection-list">
                        {facebookGroupMessage ? (
                          <p className={`channel-subselection-empty${facebookGroupLoadState === 'ERROR' ? ' is-error' : ''}`}>
                            {facebookGroupMessage}
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
                            ? <p className="channel-subselection-empty">No Facebook groups are available.</p>
                            : null
                        )}
                      </div>
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
    return (
      <section className="jd-panel compact-workspace-section">
        <div className="status-row">
          <div>
            <p className="eyebrow">System connection</p>
            <h2>Job descriptions</h2>
          </div>
          <strong>{jobDescriptionPagination?.total ?? jobDescriptions.length}</strong>
        </div>

        <form className="jd-toolbar" onSubmit={submitJobDescriptionSearch}>
          <input
            value={jobDescriptionSearch}
            onChange={(event) => setJobDescriptionSearch(event.target.value)}
            placeholder="Search JD"
            aria-label="Search job descriptions"
          />
          <button type="submit" className="secondary-button" disabled={jobDescriptionStatus === 'LOADING'}>
            Search
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={jobDescriptionStatus === 'LOADING'}
            onClick={() => void loadJobDescriptions(token, jobDescriptionPagination?.page ?? 1)}
          >
            Refresh
          </button>
        </form>

        {jobDescriptionStatus === 'LOADING' ? (
          <p className="muted-text">Loading job descriptions from backend...</p>
        ) : null}

        {jobDescriptionError ? <p className="error-text">{jobDescriptionError}</p> : null}

        {jobDescriptionFillMessage ? (
          <p className={jobDescriptionFillState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {jobDescriptionFillMessage}
          </p>
        ) : null}

        {jobDescriptionStatus !== 'LOADING' && jobDescriptions.length === 0 ? (
          <p className="muted-text">No job descriptions found.</p>
        ) : null}

        {jobDescriptions.length > 0 ? (
          <ul className="jd-list">
            {jobDescriptions.map((jobDescription) => (
              <li key={jobDescription.id}>
                <button
                  type="button"
                  className="jd-card-button"
                  disabled={jobDescriptionFillState === 'FILLING'}
                  onClick={() => void fillJobDescriptionInAmis(jobDescription)}
                >
                  <h3>{jobDescription.title}</h3>
                  <p>{summarizeText(jobDescription.summary ?? jobDescription.description)}</p>
                  <small>
                    {[
                      jobDescription.position?.name,
                      jobDescription.level?.displayName ?? jobDescription.level?.name,
                      formatDate(jobDescription.updatedAt ?? jobDescription.createdAt),
                    ].filter(Boolean).join(' - ')}
                  </small>
                </button>
                <span className="status-badge">{jobDescription.status}</span>
                {fillingJobDescriptionId === jobDescription.id ? <span className="status-badge">FILLING</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {jobDescriptionPagination && jobDescriptionPagination.totalPages > 1 ? (
          <div className="pagination-row">
            <button
              type="button"
              className="ghost-button"
              disabled={jobDescriptionStatus === 'LOADING' || jobDescriptionPagination.page <= 1}
              onClick={() => void loadJobDescriptions(token, jobDescriptionPagination.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {jobDescriptionPagination.page} / {jobDescriptionPagination.totalPages}
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={
                jobDescriptionStatus === 'LOADING'
                || jobDescriptionPagination.page >= jobDescriptionPagination.totalPages
              }
              onClick={() => void loadJobDescriptions(token, jobDescriptionPagination.page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  function renderCareerQuestionPanel() {
    return (
      <section className="question-panel career-question-panel compact-workspace-section">
        <div className="career-panel-topbar">
          <div className="career-title-row">
            <h2>Chỉnh sửa câu hỏi</h2>
            <p>VCS RECRUITMENT POSTING</p>
          </div>
          <button
            type="button"
            className="career-icon-button"
            aria-label="Refresh AMIS career questions"
            disabled={careerQuestionState === 'LOADING'}
            onClick={() => void refreshSelectedCareerContext(token)}
          >
            <RefreshIcon />
          </button>
        </div>

        <div className="career-question-content">
          <div className="career-industry-area">
            <div className="career-industry-badge">
              <BriefcaseIcon />
              <span>Ngành: {selectedCareerName || careerQuestionContext?.career.name || 'Chưa chọn ngành'}</span>
            </div>
            <p>Chọn các câu hỏi cụ thể để thêm vào bài đánh giá của bạn.</p>
          </div>

          {careerQuestionMessage ? (
            <p className={careerQuestionState === 'ERROR' ? 'error-text' : 'muted-text'}>
              {careerQuestionMessage}
            </p>
          ) : null}

          {careerQuestionContext ? (
            <>
              <div className="career-question-summary-row">
                <span>{careerQuestionContext.questions.length} câu hỏi</span>
                <strong>{selectedCareerQuestionCount} đã chọn</strong>
                {careerQuestionContext.questions.length > 0 ? (
                  <div className="question-selection-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={allCareerQuestionsSelected}
                      onClick={selectAllCareerQuestions}
                    >
                      Tất cả
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={selectedCareerQuestionCount === 0}
                      onClick={clearSelectedCareerQuestions}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                ) : null}
              </div>

              {careerQuestionContext.questions.length > 0 ? (
                <ul className="career-question-list">
                  {careerQuestionContext.questions.map((question) => {
                    const checked = selectedCareerQuestionIds.has(question.id);

                    return (
                      <li key={question.id}>
                        <label className={checked ? 'career-question-card is-selected' : 'career-question-card'}>
                          <span className="question-card-handle" aria-hidden="true">
                            <GripIcon />
                          </span>
                          <span className="career-question-card-body">
                            <span className="career-question-title">{question.text}</span>
                            <span className="question-tag-row">
                              <span className="question-tag question-tag-category">
                                {formatQuestionCategoryLabel(question.category)}
                              </span>
                              <span className="question-tag question-tag-muted">{question.subcategory}</span>
                              <span className="question-tag question-tag-type">{question.type}</span>
                            </span>
                            <span className="question-meta-row">
                              <strong>{formatQuestionDifficulty(question.difficulty)}</strong>
                              <span className="question-level-pill">
                                {formatQuestionTargetLevel(question.targetLevels)}
                              </span>
                            </span>
                          </span>
                          <input
                            className="career-question-checkbox"
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCareerQuestion(question.id)}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="career-question-empty">Chưa có câu hỏi nào được map cho ngành này.</p>
              )}

              <button type="button" className="add-question-card-button" onClick={openNewQuestionDrawer}>
                <PlusIcon />
                <span>Thêm câu hỏi mới</span>
              </button>
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
          <button type="button" className="secondary-action-button" onClick={() => void refreshSelectedCareerContext(token)}>
            Xem bộ câu hỏi
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
    const selectedCandidates = getSelectedCvApplications();
    const allVisibleSelected = applications.length > 0
      && applications.every((application) => selectedCvApplicationIds.has(application.applicationId));
    const selectedCandidateUploadableCount = selectedCandidates.filter(canUploadApplicationCv).length;
    const batchUploadableCount = selectedUploadableApplicationCount > 0
      ? selectedUploadableApplicationCount
      : selectedCandidateUploadableCount;

    return (
      <section className="cv-list-screen">
        <div className="cv-list-header">
          <button type="button" className="cv-back-button" aria-label="Back to CV overview" onClick={() => setCvWorkspaceView('overview')}>
            <BackIcon />
          </button>
          <h3>Danh sách hồ sơ ứng viên</h3>
          <button type="button" className="cv-close-button" aria-label="Close candidate list" onClick={() => setCvWorkspaceView('overview')}>
            <CloseIcon />
          </button>
        </div>

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
          <button type="button" className="text-button">Điểm cao nhất</button>
        </div>

        {uploadableApplications.length > 0 ? (
          <div className="cv-clean-actions">
            <span>{batchUploadableCount} / {uploadableApplications.length} clean CVs selected</span>
            <button type="button" className="text-button" onClick={selectAllUploadableApplicationCvs}>
              Select clean CVs
            </button>
            <button type="button" className="text-button" onClick={clearSelectedApplicationCvs}>
              Clear
            </button>
            <button
              type="button"
              className="secondary-action-button cv-load-selected-button"
              disabled={batchUploadableCount === 0 || Boolean(cvUploadApplicationId)}
              onClick={() => void uploadSelectedApplicationCvsToAmisForm()}
            >
              {cvUploadApplicationId === 'BATCH' ? 'Loading CVs...' : 'Load selected CVs'}
            </button>
          </div>
        ) : null}

        {applicationsState === 'LOADING' && applications.length === 0 ? (
          <p className="muted-text">Loading applications for this AMIS recruitment...</p>
        ) : null}

        {applications.length > 0 ? (
          <ul className="cv-candidate-list">
            {applications.map((application) => {
              const cvStatus = getApplicationCvDisplayStatus(application);
              const syncStatus = getApplicationAmisSyncStatus(application);
              const questionStatus = getApplicationQuestionStatus(application);
              const score = getApplicationMatchScore(application);
              const isSelected = selectedCvApplicationIds.has(application.applicationId);

              return (
                <li key={application.applicationId} className={isSelected ? 'is-selected' : ''}>
                  <label className="cv-candidate-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCvCandidateSelection(application.applicationId)}
                    />
                  </label>
                  <div className="cv-candidate-card">
                    <div className="cv-candidate-main">
                      <span className="cv-avatar">{getCandidateInitials(application.candidateName)}</span>
                      <div>
                        <strong>{application.candidateName}</strong>
                        <span>{[application.email, application.mobile].filter(Boolean).join(' - ') || 'No contact'}</span>
                      </div>
                      <span className={`cv-mini-badge ${getQuestionBadgeTone(questionStatus)}`}>{questionStatus}</span>
                    </div>
                    <div className="cv-candidate-meta">
                      <span>Source: {application.sourceChannel ?? 'VCS Portal'}</span>
                      <span>Applied: {formatDate(application.applyDate ?? application.createdAt) ?? '-'}</span>
                    </div>
                    <div className="cv-candidate-status-grid">
                      <span className={cvStatus.tone}>
                        <small>CV status</small>
                        <strong>{cvStatus.label}</strong>
                      </span>
                      <span className="is-score">
                        <small>Score</small>
                        <strong>{score}</strong>
                      </span>
                      <span className={syncStatus.tone}>
                        <small>AMIS sync</small>
                        <strong>{syncStatus.label}</strong>
                      </span>
                    </div>
                    <div className="cv-candidate-badge-row">
                      <span className={getCvStatusBadgeClass(application.cvParseStatus ?? application.cvSanitizeStatus ?? application.status)}>
                        {formatStatusText(application.cvParseStatus ?? application.cvSanitizeStatus ?? application.status)}
                      </span>
                      {canUploadApplicationCv(application) ? (
                        <button
                          type="button"
                          className="text-button"
                          disabled={Boolean(cvUploadApplicationId)}
                          onClick={() => toggleApplicationCvSelection(application.applicationId)}
                        >
                          {selectedApplicationCvIds.has(application.applicationId) ? 'Bỏ chọn CV sạch' : 'Chọn CV sạch'}
                        </button>
                      ) : null}
                    </div>
                    <div className="cv-candidate-footer">
                      <small>{getCandidatePipelineHint(application)}</small>
                      <span className="cv-candidate-footer-actions">
                        {canUploadApplicationCv(application) ? (
                          <button
                            type="button"
                            className="text-button"
                            disabled={Boolean(cvUploadApplicationId)}
                            onClick={() => void uploadApplicationCvToAmisForm(application)}
                          >
                            {cvUploadApplicationId === application.applicationId ? 'Loading CV...' : 'Load CV'}
                          </button>
                        ) : null}
                        <button type="button" className="text-button" onClick={() => openCvSyncReview([application.applicationId])}>
                          Xem chi tiết
                        </button>
                      </span>
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

        <div className="cv-list-sticky-actions">
          <button
            type="button"
            className="secondary-action-button"
            disabled={applicationsState === 'LOADING'}
            onClick={() => void loadAmisApplications(token, amisRecruitmentId)}
          >
            Refresh
          </button>
          <button
            type="button"
            className="secondary-action-button"
            disabled={batchUploadableCount === 0 || Boolean(cvUploadApplicationId)}
            onClick={() => void uploadSelectedApplicationCvsToAmisForm()}
          >
            {cvUploadApplicationId === 'BATCH' ? 'Loading CVs...' : 'Load CVs'}
          </button>
          <button
            type="button"
            className="secondary-action-button"
            disabled={selectedCandidates.length === 0}
            onClick={() => openCvSyncReview()}
          >
            Sync AMIS
          </button>
          <button type="button" className="secondary-action-button" disabled={selectedCandidates.length === 0}>
            Gửi câu hỏi
          </button>
          <button
            type="button"
            className="secondary-action-button"
            disabled={applications.length === 0}
            onClick={allVisibleSelected ? clearCvCandidateSelection : selectAllCvCandidates}
          >
            {allVisibleSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
          </button>
          <button type="button" className="cv-reject-button" disabled={selectedCandidates.length === 0}>
            Từ chối
          </button>
          <button type="button" className="cv-accept-button" disabled={selectedCandidates.length === 0} onClick={() => openCvSyncReview()}>
            Chấp nhận
          </button>
        </div>
      </section>
    );
  }

  function getSelectedCvApplications(overrideIds?: string[]) {
    const selectedIds = overrideIds ?? Array.from(selectedCvApplicationIds);
    const selectedIdSet = new Set(selectedIds);
    return applicationsContext?.applications.filter((application) => selectedIdSet.has(application.applicationId)) ?? [];
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

  function selectAllCvCandidates() {
    setSelectedCvApplicationIds(new Set(applicationsContext?.applications.map((application) => application.applicationId) ?? []));
  }

  function clearCvCandidateSelection() {
    setSelectedCvApplicationIds(new Set());
  }

  function openCvSyncReview(overrideIds?: string[]) {
    if (overrideIds?.length) {
      setSelectedCvApplicationIds(new Set(overrideIds));
    }
    setIsCvSyncReviewOpen(true);
  }

  function renderCvSyncReviewModal() {
    const selectedCandidates = getSelectedCvApplications();

    return (
      <div className="modal-backdrop cv-sync-review-backdrop" role="presentation">
        <section className="cv-sync-review-modal" role="dialog" aria-modal="true" aria-labelledby="cv-sync-review-title">
          <header className="modal-header">
            <div>
              <p className="eyebrow">Đồng bộ sang AMIS</p>
              <h2 id="cv-sync-review-title">Xác nhận dữ liệu trước khi đồng bộ</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Đóng"
              aria-label="Đóng"
              onClick={() => setIsCvSyncReviewOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>

          <div className="cv-sync-review-body">
            <section className="cv-sync-review-summary">
              <article>
                <span>Tổng hồ sơ đã chọn</span>
                <strong>{selectedCandidates.length}</strong>
              </article>
              <article>
                <span>CV đính kèm</span>
                <strong>{selectedCandidates.filter(canUploadApplicationCv).length}</strong>
              </article>
            </section>

            <section className="cv-sync-review-target">
              <p className="cv-section-label">Target AMIS job</p>
              <dl>
                <div>
                  <dt>AMIS Recruitment ID</dt>
                  <dd>{amisRecruitmentId ?? '-'}</dd>
                </div>
                <div>
                  <dt>AMIS Job Title</dt>
                  <dd>{snapshot?.title ?? '-'}</dd>
                </div>
              </dl>
            </section>

            <section className="cv-sync-review-target">
              <p className="cv-section-label">Selected candidates</p>
              {selectedCandidates.length > 0 ? (
                <ul className="cv-sync-candidate-list">
                  {selectedCandidates.slice(0, 4).map((candidate) => (
                    <li key={candidate.applicationId}>
                      <span>{candidate.candidateName}</span>
                      <strong>{getApplicationCvDisplayStatus(candidate).label}</strong>
                    </li>
                  ))}
                  {selectedCandidates.length > 4 ? (
                    <li>
                      <span>Khác</span>
                      <strong>+{selectedCandidates.length - 4}</strong>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="muted-text">Chọn ít nhất một ứng viên trước khi đồng bộ.</p>
              )}
            </section>

            <div className="cv-sync-warning">
              <WarningIcon />
              <p>Lưu ý quan trọng: đây là màn review/confirm UI. Hành động gọi API đồng bộ AMIS thật sẽ được nối ở bước sau.</p>
            </div>

            <div className="form-actions">
              <button type="button" className="text-button" onClick={() => setIsCvSyncReviewOpen(false)}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="primary-button compact-button"
                disabled={selectedCandidates.length === 0}
                onClick={() => setIsCvSyncReviewOpen(false)}
              >
                Xác nhận review
              </button>
            </div>
          </div>
        </section>
      </div>
    );
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
            <h1>VCS Recruitment</h1>
            {user ? <p>{user.email} - {user.role}</p> : null}
          </div>
          <div className="extension-header-actions">
            {user ? (
              <button type="button" className="text-button" onClick={logout}>
                Sign out
              </button>
            ) : null}
            <button type="button" className="extension-close-button" aria-label="Close panel" onClick={() => window.close()}>
              <CloseIcon />
            </button>
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

      {isCvSyncReviewOpen ? renderCvSyncReviewModal() : null}

      {newQuestionDrawerOpen && careerQuestionContext ? (
        <div className="question-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeNewQuestionDrawer();
        }}>
          <section className="question-drawer" role="dialog" aria-modal="true" aria-labelledby="new-question-title">
            <div className="question-drawer-header">
              <button
                type="button"
                className="career-icon-button"
                aria-label="Close create question form"
                onClick={closeNewQuestionDrawer}
              >
                <CloseIcon />
              </button>
              <h2 id="new-question-title">Tạo câu hỏi mới</h2>
            </div>

            <form className="question-drawer-form" onSubmit={submitNewCareerQuestion}>
              <label className="drawer-field">
                <span>Text</span>
                <textarea
                  value={newQuestionText}
                  onChange={(event) => setNewQuestionText(event.target.value)}
                  placeholder="Nhập nội dung câu hỏi..."
                  rows={4}
                />
              </label>

              <div className="drawer-field-grid">
                <label className="drawer-field">
                  <span>Category</span>
                  <select
                    value={newQuestionCategory}
                    onChange={(event) => handleNewQuestionCategoryChange(event.target.value)}
                  >
                    {careerQuestionContext.categories.map((category) => (
                      <option key={category.name} value={category.name}>{category.displayName}</option>
                    ))}
                  </select>
                </label>

                <label className="drawer-field">
                  <span>Subcategory</span>
                  <select
                    value={newQuestionSubcategory}
                    onChange={(event) => {
                      setNewQuestionSubcategory(event.target.value);
                      setNewQuestionCompetencyType('INHERIT');
                    }}
                  >
                    {(selectedNewQuestionCategory?.subcategories ?? []).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="drawer-field">
                <span>Competency Type</span>
                <select
                  value={newQuestionCompetencyType}
                  onChange={(event) => setNewQuestionCompetencyType(event.target.value)}
                >
                  {COMPETENCY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === 'INHERIT' && selectedNewQuestionSubcategory?.competencyType
                        ? `${option.label} (${selectedNewQuestionSubcategory.competencyType})`
                        : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="drawer-field">
                <span>Difficulty (1-5)</span>
                <select
                  value={newQuestionDifficulty}
                  onChange={(event) => setNewQuestionDifficulty(event.target.value)}
                >
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <fieldset className="drawer-target-levels">
                <legend>Target Levels</legend>
                <div>
                  {TARGET_LEVEL_OPTIONS.map((level) => (
                    <label key={level.value}>
                      <input
                        type="checkbox"
                        checked={newQuestionTargetLevels.includes(level.value)}
                        onChange={() => toggleNewQuestionTargetLevel(level.value)}
                      />
                      <span>{level.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="drawer-field">
                <span>Expected Answer / Scoring Guide</span>
                <textarea
                  value={newQuestionExpectedAnswer}
                  onChange={(event) => setNewQuestionExpectedAnswer(event.target.value)}
                  placeholder="Describe what a good answer looks like..."
                  rows={5}
                />
              </label>

              <div className="question-drawer-footer">
                <button
                  type="button"
                  className="drawer-cancel-button"
                  onClick={() => {
                    resetNewQuestionDraft();
                    closeNewQuestionDrawer();
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="drawer-submit-button"
                  disabled={newQuestionSaving || !newQuestionText.trim() || !newQuestionCategory || !newQuestionSubcategory}
                >
                  {newQuestionSaving ? 'Đang tạo...' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

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
                  {facebookGroups.length > 0 ? (
                    facebookGroups.map((group) => {
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
                      <strong>Chưa có nhóm nào</strong>
                      <p>Danh sách này chỉ lấy từ backend cho tài khoản HR hiện tại.</p>
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
                        setFacebookSettingsMessage(facebookGroups.length > 0
                          ? null
                          : 'Chưa có nhóm Facebook nào được cấu hình cho tài khoản này.');
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
  return channels.filter((channel) => {
    if (!POSTING_CHANNEL_SET.has(channel) || seen.has(channel)) return false;
    seen.add(channel);
    return true;
  });
}

function formatChannelLabel(channel: ExtensionChannel) {
  switch (channel) {
    case 'FACEBOOK':
      return 'Facebook';
    case 'TOPCV':
      return 'Top CV';
    case 'LINKEDIN':
      return 'LinkedIn';
    case 'VCS_PORTAL':
      return 'VCS Portal';
    case 'ITVIEC':
      return 'ITviec';
    case 'VIETNAMWORKS':
      return 'VietnamWorks';
    default:
      return channel;
  }
}

function toFacebookGroupUiItem(group: FacebookPublishTarget) {
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
  if (status === 'UNKNOWN') return 'Không rõ';
  return 'Đã đăng';
}

function isSelectableFacebookGroup(group: FacebookPublishTarget) {
  return Boolean(
    group.targetId
      && group.selectable
      && group.eligibilityStatus === 'CAN_POST'
      && !group.quotaExceeded,
  );
}

function countSelectableFacebookGroups(groups: FacebookPublishTarget[]) {
  return groups.filter(isSelectableFacebookGroup).length;
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

function formatQuestionCategoryLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').toUpperCase();
}

function formatQuestionDifficulty(value: ExtensionQuestion['difficulty']) {
  const difficulty = Number.isFinite(value) ? value : 3;
  const labels: Record<number, string> = {
    1: 'Rất dễ',
    2: 'Dễ',
    3: 'Trung bình',
    4: 'Khó',
    5: 'Rất khó',
  };

  return `${labels[difficulty] ?? 'Trung bình'} - ${difficulty}/5`;
}

function formatQuestionTargetLevel(levels: ExtensionQuestion['targetLevels']) {
  if (!levels.length) return 'Any level';

  const [firstLevel] = levels;
  const label = TARGET_LEVEL_OPTIONS.find((level) => level.value === firstLevel)?.label ?? firstLevel;
  return levels.length > 1 ? `${label} +${levels.length - 1}` : label;
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

function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M5.6 5V3.8c0-.7.5-1.2 1.2-1.2h2.4c.7 0 1.2.5 1.2 1.2V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.6 5h10.8c.6 0 1 .4 1 1v6.2c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1V6c0-.6.4-1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 8.2h12.4M7 8.2v1h2v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GripIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 10 16" fill="none">
      <circle cx="3" cy="3" r="1" fill="currentColor" />
      <circle cx="7" cy="3" r="1" fill="currentColor" />
      <circle cx="3" cy="8" r="1" fill="currentColor" />
      <circle cx="7" cy="8" r="1" fill="currentColor" />
      <circle cx="3" cy="13" r="1" fill="currentColor" />
      <circle cx="7" cy="13" r="1" fill="currentColor" />
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

function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
  if (result.created > 0) parts.push(`đã tạo ${result.created}`);
  if (result.updated > 0) parts.push(`đã cập nhật ${result.updated}`);
  if (result.reactivated > 0) parts.push(`đã kích hoạt lại ${result.reactivated}`);
  if (result.skipped > 0) parts.push(`bỏ qua ${result.skipped}`);
  if (result.duplicates > 0) parts.push(`trùng ${result.duplicates}`);
  if (result.conflicts > 0) parts.push(`trùng lặp DB ${result.conflicts}`);
  const summary = parts.length > 0 ? parts.join(', ') : 'không có thay đổi mới';
  const issueText = result.errors.length > 0 ? ` Có ${result.errors.length} lỗi cần kiểm tra.` : '';
  return `Quét xong: ${summary}. Tổng: ${result.valid}/${result.requested} nhóm hợp lệ.${issueText}`;
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
    'các nhóm của bạn',
    'your joined groups',
    'groups you joined',
    'groups youve joined',
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
    'see more',
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
  const scrollHost = pickScrollableHost(sectionRoot instanceof Element ? sectionRoot : document.documentElement);

  let stablePasses = 0;
  let attempts = 0;
  let previousScrollHeight = -1;
  let previousScrollTop = -1;
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
      await sleepMs(900);
    }

    const afterSize = collected.size;
    const sizeChanged = afterSize > beforeSize;

    attempts += 1;
    if (!sizeChanged) stablePasses += 1; else stablePasses = 0;

    if (stablePasses >= 5) break;

    if (scrollHost instanceof HTMLElement) {
      const beforeScrollTop = scrollHost.scrollTop;
      const beforeScrollHeight = scrollHost.scrollHeight;
      scrollHost.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      await sleepMs(900);

      const afterScrollHeight = scrollHost.scrollHeight;
      const afterScrollTop = scrollHost.scrollTop;
      const moved = afterScrollTop > beforeScrollTop || afterScrollHeight > previousScrollHeight;
      previousScrollHeight = afterScrollHeight;

      if (!moved && !sizeChanged) {
        stablePasses += 1;
      }
      if (afterScrollTop === previousScrollTop && !sizeChanged) {
        stablePasses += 1;
      }
      previousScrollTop = afterScrollTop;

      continue;
    }

    const beforeScrollTop = window.scrollY;
    const beforeScrollHeight = document.documentElement.scrollHeight;
    window.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
    await sleepMs(900);

    const moved = window.scrollY > beforeScrollTop || beforeScrollHeight > previousScrollHeight;
    const afterScrollHeight = document.documentElement.scrollHeight;
    previousScrollHeight = afterScrollHeight;
    previousScrollTop = window.scrollY;

    if (!moved && !sizeChanged) stablePasses += 1;
    if (afterScrollHeight === previousScrollHeight && !sizeChanged) stablePasses += 1;
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

  return { groups: Array.from(finalGroups.values()) };
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
  const failedCount = applications.filter((application) =>
    [application.cvScanStatus, application.cvSanitizeStatus, application.cvParseStatus]
      .map(normalizeStatus)
      .some((status) => status.includes('FAIL') || status.includes('ERROR')),
  ).length;
  const readyCount = applications.filter(canUploadApplicationCv).length;
  const reviewCount = Math.max(totalApplied - readyCount - failedCount, 0);
  const syncErrorCount = failedCount;

  return {
    totalApplied,
    newCount,
    processingCount,
    syncErrorCount,
    readyCount,
    reviewCount,
    failedCount,
    noAnswerCount: applications.filter((application) => getApplicationQuestionStatus(application) === 'Chưa trả lời').length,
  };
}

function getApplicationCvDisplayStatus(application: ExtensionApplication) {
  const parseStatus = normalizeStatus(application.cvParseStatus);
  const sanitizeStatus = normalizeStatus(application.cvSanitizeStatus);
  const scanStatus = normalizeStatus(application.cvScanStatus);

  if (parseStatus.includes('PARSED')) return { label: 'Parsed', tone: 'is-success' };
  if (sanitizeStatus.includes('SANITIZED')) return { label: 'Clean ready', tone: 'is-success' };
  if (scanStatus.includes('FAILED') || sanitizeStatus.includes('FAILED') || parseStatus.includes('FAILED')) {
    return { label: 'Parse failed', tone: 'is-danger' };
  }
  if (scanStatus.includes('PENDING') || sanitizeStatus.includes('PENDING') || parseStatus.includes('PARSING')) {
    return { label: 'Scanning', tone: 'is-warning' };
  }

  return { label: application.attachmentCvName ? 'Uploaded' : 'Missing CV', tone: application.attachmentCvName ? 'is-warning' : 'is-danger' };
}

function getApplicationAmisSyncStatus(application: ExtensionApplication) {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (cvStatus.tone === 'is-danger') return { label: 'Failed', tone: 'is-danger' };
  if (canUploadApplicationCv(application)) return { label: 'Not synced', tone: 'is-warning' };
  return { label: 'Pending', tone: 'is-muted' };
}

function getApplicationQuestionStatus(application: ExtensionApplication) {
  const score = getApplicationMatchScore(application);
  if (score >= 88) return 'Answered';
  if (score >= 72) return 'Not sent';
  return 'Chưa trả lời';
}

function getQuestionBadgeTone(status: string) {
  if (status === 'Answered') return 'is-success';
  if (status === 'Not sent') return 'is-warning';
  return 'is-muted';
}

function getApplicationMatchScore(application: ExtensionApplication) {
  const seed = `${application.applicationId}${application.candidateName}${application.email ?? ''}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return 45 + (hash % 51);
}

function getCandidatePipelineHint(application: ExtensionApplication) {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (cvStatus.tone === 'is-danger') return 'Cần kiểm tra CV';
  if (canUploadApplicationCv(application)) return 'Ready for HR review';
  if (application.attachmentCvName) return 'Processing CV...';
  return 'Missing CV attachment';
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

function formatMetricValue(value: number | null) {
  return value === null ? '-' : String(value);
}

function getCvStatusBadgeClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'SANITIZED' || normalized === 'PASSED' || normalized === 'PARSED') {
    return 'status-badge status-badge-success';
  }

  if (normalized === 'FAILED') {
    return 'status-badge status-badge-danger';
  }

  if (normalized === 'PENDING' || normalized === 'PARSING' || normalized === 'SANITIZING') {
    return 'status-badge status-badge-warning';
  }

  return 'status-badge';
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

function isSelectedCareerChangedMessage(value: unknown): value is {
  type: typeof SELECTED_CAREER_CHANGED_MESSAGE_TYPE;
  payload: {
    careerName: string;
    pageUrl: string;
    timestamp: string;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === SELECTED_CAREER_CHANGED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { careerName?: unknown }).careerName === 'string';
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
    summary: truncateForMaxLength(jobDescription.summary ?? jobDescription.description, 500),
    responsibilities: jobDescription.description,
    requirements: stringifyStructuredContent(jobDescription.requirements),
    benefits: stringifyStructuredContent(jobDescription.benefits),
  };
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

function isSelectedCareerResponse(value: unknown): value is AmisSelectedCareerResult {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string';
}

function normalizeMatchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sanitizeDetectedCareerName(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return '';
  if (normalized.length > 120) return '';
  if (/họ và tên|số điện thoại|email|chiến dịch tuyển dụng|trình độ đào tạo|nguồn ứng viên|ngày ứng tuyển/i.test(normalized)) {
    return '';
  }

  return normalized;
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
      ?? parsedUrl.searchParams.get('recruitmentRoundId');

    return {
      amisRecruitmentId: candidatePathMatch?.[1]
        ?? queryRecruitmentId
        ?? jobDetailPathMatch?.[1]
        ?? genericRecruitmentMatch?.[1]
        ?? null,
      amisRecruitmentRoundId: queryRoundId,
      sourceUrl: candidatePathMatch?.[1] ? url : null,
    };
  } catch {
    return {
      amisRecruitmentId: null,
      amisRecruitmentRoundId: null,
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

async function sendMessageToAmisTab(tabId: number, message: unknown) {
  if (!chrome.tabs?.sendMessage) {
    throw new Error('Chrome tabs messaging is unavailable.');
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;
    await injectAmisBridge(tabId);
    await wait(250);
    return chrome.tabs.sendMessage(tabId, message);
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
    plan.targets.map((target) => target.targetId ?? target.targetUrl ?? target.targetName).join('|'),
  ].join(':');
}

function isFacebookGroupLoading(state: FacebookGroupLoadState) {
  return state === 'CHECKING_LOGIN'
    || state === 'WAITING_LOGIN'
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
