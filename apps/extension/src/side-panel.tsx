import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractAmisJobFromPage } from './amis-page-extractor';
import { getLastAutoSyncState } from './amis-auto-sync-store';
import { getLastAmisCapture } from './amis-capture-store';
import { getAmisDiagnostics } from './amis-diagnostics-store';
import {
  ApiClientError,
  createAmisCareerQuestion,
  getAmisCareerQuestionContext,
  getCurrentUser,
  listJobDescriptions,
  listAmisCareers,
  login,
  syncAndPublishAmisJob,
} from './api-client';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth-store';
import { getSelectedChannels, setSelectedChannels } from './channel-preferences';
import { CHANNELS } from './config';
import { createMockAmisSyncRequest } from './mock-amis';
import type {
  AmisDiagnosticEvent,
  AmisAutoSyncState,
  AmisCareerQuestionContext,
  AmisSelectedCareerResult,
  AmisExtractionResult,
  AmisJobSnapshot,
  ApiPagination,
  ChannelPostingResult,
  ExtensionQuestion,
  ExtensionChannel,
  ExtensionSyncResponse,
  ExtensionUser,
  JobDescriptionSummary,
  SyncAmisJobPostingRequest,
} from './types';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
type CareerQuestionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

interface FacebookGroup {
  id: string;
  name: string;
  url: string;
}

const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const CAREER_QUESTION_SELECTION_PREFIX = 'vcs:selected-career-questions:';
const DEFAULT_FACEBOOK_GROUPS: FacebookGroup[] = [
  {
    id: 'dev-java-vn',
    name: 'Hội Dev Java VN',
    url: 'https://facebook.com/groups/devjavavn',
  },
  {
    id: 'frontend-vn',
    name: 'Cộng đồng Frontend Việt Nam',
    url: 'https://facebook.com/groups/frontendvietnam',
  },
  {
    id: 'it-hcm',
    name: 'Việc làm IT HCM',
    url: 'https://facebook.com/groups/vieclamit.hcm',
  },
];
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

function getCareerQuestionSelectionStorageKey(amisCareerId: string) {
  return `${CAREER_QUESTION_SELECTION_PREFIX}${amisCareerId}`;
}

function SidePanel() {
  const [state, setState] = useState<PanelState>('AUTH_LOADING');
  const [user, setUser] = useState<ExtensionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [snapshot, setSnapshot] = useState<AmisJobSnapshot | null>(null);
  const [amisRecruitmentId, setAmisRecruitmentId] = useState<string | null>(null);
  const [amisUrl, setAmisUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<ExtensionChannel[]>(['VCS_PORTAL']);
  const [facebookGroups, setFacebookGroups] = useState<FacebookGroup[]>(DEFAULT_FACEBOOK_GROUPS);
  const [selectedFacebookGroupId, setSelectedFacebookGroupId] = useState(DEFAULT_FACEBOOK_GROUPS[0].id);
  const [facebookGroupDropdownOpen, setFacebookGroupDropdownOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState<ExtensionChannel | null>(null);
  const [newFacebookGroupName, setNewFacebookGroupName] = useState('');
  const [newFacebookGroupUrl, setNewFacebookGroupUrl] = useState('');
  const [deleteFacebookGroupId, setDeleteFacebookGroupId] = useState<string | null>(null);
  const [result, setResult] = useState<ExtensionSyncResponse | null>(null);
  const [extractionResult, setExtractionResult] = useState<AmisExtractionResult | null>(null);
  const [autoSyncState, setAutoSyncState] = useState<AmisAutoSyncState | null>(null);
  const [diagnostics, setDiagnostics] = useState<AmisDiagnosticEvent[]>([]);
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
  const lastCareerContextIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    void restoreAuth();
    void restoreSelectedChannels();
    void loadLatestAmisCapture({ silent: true });
    void loadDiagnostics();
  }, []);

  useEffect(() => {
    chrome.runtime?.onMessage.addListener((message) => {
      if (isAutoSyncUpdateMessage(message)) {
        applyAutoSyncState(message.payload);
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
      }
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    void refreshSelectedCareerContext(token, { silent: true });
    const intervalId = window.setInterval(() => {
      void refreshSelectedCareerContext(token, { silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [token]);

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

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!amisRecruitmentId) missing.push('AMIS recruitment id');
    if (!snapshot?.title.trim()) missing.push('title');
    if (!snapshot?.description.trim()) missing.push('description');
    if (!snapshot?.requirements.rawText.trim()) missing.push('requirements');
    if (channels.length === 0) missing.push('channel');
    return missing;
  }, [amisRecruitmentId, channels.length, snapshot]);
  const selectedFacebookGroup = useMemo(
    () => facebookGroups.find((group) => group.id === selectedFacebookGroupId) ?? facebookGroups[0] ?? null,
    [facebookGroups, selectedFacebookGroupId],
  );
  const deleteFacebookGroup = useMemo(
    () => facebookGroups.find((group) => group.id === deleteFacebookGroupId) ?? null,
    [deleteFacebookGroupId, facebookGroups],
  );
  const allChannelsSelected = channels.length === CHANNELS.length;
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
      setToken(storedToken);
      setUser(currentUser);
      setState('READY');
      await loadJobDescriptions(storedToken);
      await loadLatestAutoSyncState({ silent: true });
    } catch {
      await clearAccessToken();
      setState('AUTH_REQUIRED');
    }
  }

  async function restoreSelectedChannels() {
    setChannels(await getSelectedChannels());
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const auth = await login(email, password);
      if (auth.user.role !== 'ADMIN' && auth.user.role !== 'HR') {
        throw new ApiClientError('FORBIDDEN', 'Only ADMIN and HR can sync postings.', 403);
      }
      await setAccessToken(auth.accessToken);
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

      const careerName = selected.careerName?.trim() ?? '';
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
    } catch {
      setSelectedCareerQuestionIds(new Set());
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
    if (careerQuestionContext) {
      void persistSelectedCareerQuestions(careerQuestionContext.career.amisCareerId, Array.from(nextQuestionIds));
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
    setChannels(mock.channels);
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

  async function loadDiagnostics() {
    setDiagnostics(await getAmisDiagnostics());
  }

  async function extractFromCurrentTab() {
    setState('EXTRACTING');
    setError(null);
    setResult(null);

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
      setState('READY');
    } catch (err) {
      setExtractionResult(null);
      setError(toErrorMessage(err));
      setState('ERROR');
    }
  }

  function applyExtractionResult(extraction: AmisExtractionResult) {
    setExtractionResult(extraction);
    setAmisUrl(extraction.url);
    setResult(null);
    setError(null);

    if (extraction.detected && extraction.snapshot) {
      setSnapshot(extraction.snapshot);
      setAmisRecruitmentId(extraction.amisRecruitmentId ?? null);
    } else {
      setSnapshot(null);
      setAmisRecruitmentId(null);
    }
  }

  function applyAutoSyncState(latestState: AmisAutoSyncState) {
    setAutoSyncState(latestState);
    if (latestState.channels) setChannels(latestState.channels);
    if (latestState.capture) applyExtractionResult(latestState.capture);
    if (latestState.result) setResult(latestState.result);
    if (latestState.error) setError(`${latestState.error.code}: ${latestState.error.message}`);

    if (latestState.status === 'SYNCING') setState('SYNCING');
    if (latestState.status === 'SUCCESS') setState('SUCCESS');
    if (latestState.status === 'ERROR' || latestState.status === 'SKIPPED') setState('ERROR');
    if (latestState.status === 'AUTH_REQUIRED') setState('AUTH_REQUIRED');
  }

  function toggleChannel(channel: ExtensionChannel) {
    setChannels((current) => {
      const isSelected = current.includes(channel);
      const next = isSelected
        ? current.filter((item) => item !== channel)
        : [...current, channel];

      if (channel === 'FACEBOOK' && isSelected) {
        setFacebookGroupDropdownOpen(false);
      }

      void setSelectedChannels(next);
      return next;
    });
  }

  function selectAllChannels() {
    const next = [...CHANNELS];
    setChannels(next);
    void setSelectedChannels(next);
  }

  function clearChannels() {
    setChannels([]);
    setFacebookGroupDropdownOpen(false);
    void setSelectedChannels([]);
  }

  function ensureChannelSelected(channel: ExtensionChannel) {
    setChannels((current) => {
      if (current.includes(channel)) return current;

      const next = [...current, channel];
      void setSelectedChannels(next);
      return next;
    });
  }

  function openChannelSettings(channel: ExtensionChannel) {
    setChannelSettingsOpen(channel);
    setNewFacebookGroupName('');
    setNewFacebookGroupUrl('');
  }

  function closeChannelSettings() {
    setChannelSettingsOpen(null);
    setNewFacebookGroupName('');
    setNewFacebookGroupUrl('');
  }

  function selectFacebookGroup(groupId: string) {
    setSelectedFacebookGroupId(groupId);
    setFacebookGroupDropdownOpen(false);
    ensureChannelSelected('FACEBOOK');
  }

  function submitMockFacebookGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newFacebookGroupName.trim();
    if (!name) return;

    const group: FacebookGroup = {
      id: `mock-${Date.now()}`,
      name,
      url: newFacebookGroupUrl.trim() || 'https://facebook.com/groups/mock',
    };

    setFacebookGroups((current) => [...current, group]);
    setSelectedFacebookGroupId(group.id);
    ensureChannelSelected('FACEBOOK');
    closeChannelSettings();
  }

  function confirmDeleteFacebookGroup() {
    if (!deleteFacebookGroupId) return;

    setFacebookGroups((current) => {
      const next = current.filter((group) => group.id !== deleteFacebookGroupId);
      if (selectedFacebookGroupId === deleteFacebookGroupId) {
        setSelectedFacebookGroupId(next[0]?.id ?? '');
      }

      return next;
    });
    setDeleteFacebookGroupId(null);
  }

  async function sync() {
    if (!token || !snapshot || !amisRecruitmentId || missingFields.length > 0) return;

    const payload: SyncAmisJobPostingRequest = {
      sourceSystem: 'AMIS',
      amisRecruitmentId,
      amisUrl,
      action: 'PUBLISH',
      snapshot,
      channels,
      metadata: {
        capturedAt: new Date().toISOString(),
        captureSource: extractionResult?.source ?? 'MOCK',
        captureConfidence: extractionResult?.confidence,
        extractionWarnings: extractionResult?.warnings,
        extractionEvidence: extractionResult?.evidence,
      },
    };

    setState('SYNCING');
    setError(null);

    try {
      const response = await syncAndPublishAmisJob(token, payload);
      setResult(response);
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

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div>
          <p className="eyebrow">VCS Recruitment</p>
          <h1>AMIS Posting Sync</h1>
        </div>
        {user ? (
          <button type="button" className="ghost-button" onClick={logout}>
            Sign out
          </button>
        ) : null}
      </header>

      {state === 'AUTH_LOADING' ? <p className="muted-text">Checking session...</p> : null}

      {state === 'AUTH_REQUIRED' ? (
        <form className="auth-form" onSubmit={submitLogin}>
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
        <section className="stack">
          <div className="status-row">
            <span>{user.email}</span>
            <strong>{user.role}</strong>
          </div>

          <section className="question-panel career-question-panel">
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

                  <button
                    type="button"
                    className="add-question-card-button"
                    onClick={openNewQuestionDrawer}
                  >
                    <PlusIcon />
                    <span>Thêm câu hỏi mới</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>

          <section className="jd-panel">
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
              <button
                type="submit"
                className="secondary-button"
                disabled={jobDescriptionStatus === 'LOADING'}
              >
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
                        ].filter(Boolean).join(' • ')}
                      </small>
                    </button>
                    <span className="status-badge">{jobDescription.status}</span>
                    {fillingJobDescriptionId === jobDescription.id ? (
                      <span className="status-badge">FILLING</span>
                    ) : null}
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

          <div className="button-grid">
            <button
              type="button"
              className="secondary-button"
              disabled={state === 'EXTRACTING' || state === 'SYNCING'}
              onClick={() => void loadLatestAutoSyncState()}
            >
              Load latest auto sync
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={state === 'EXTRACTING' || state === 'SYNCING'}
              onClick={() => void loadLatestAmisCapture()}
            >
              Load latest AMIS save
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={state === 'EXTRACTING' || state === 'SYNCING'}
              onClick={extractFromCurrentTab}
            >
              {state === 'EXTRACTING' ? 'Extracting...' : 'Fallback DOM extract'}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={state === 'EXTRACTING' || state === 'SYNCING'}
              onClick={loadMockSnapshot}
            >
              Load mock snapshot
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={state === 'EXTRACTING' || state === 'SYNCING'}
              onClick={() => void loadDiagnostics()}
            >
              Refresh diagnostics
            </button>
          </div>

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
                  {extractionResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {snapshot ? (
            <section className="preview">
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
            <p className="muted-text">No snapshot loaded.</p>
          )}

          <section className="channel-section">
            <div className="section-heading-row">
              <p className="section-title">Channels</p>
              <div className="channel-select-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={allChannelsSelected}
                  onClick={selectAllChannels}
                >
                  All
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={channels.length === 0}
                  onClick={clearChannels}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="channel-list">
              {CHANNELS.map((channel) => {
                const isSelected = channels.includes(channel);
                const isFacebook = channel === 'FACEBOOK';

                return (
                  <article
                    key={channel}
                    className={[
                      'channel-option',
                      isSelected ? 'is-selected' : '',
                      isFacebook ? 'is-facebook' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="channel-option-main">
                      <label className="channel-checkbox-row">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleChannel(channel)}
                        />
                        <span>{channel}</span>
                      </label>

                      <div className="channel-tools">
                        {isFacebook && isSelected ? (
                          <button
                            type="button"
                            className={facebookGroupDropdownOpen ? 'icon-button is-active' : 'icon-button'}
                            aria-label="Toggle Facebook group list"
                            onClick={() => setFacebookGroupDropdownOpen((current) => !current)}
                          >
                            <ChevronDownIcon />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Configure ${channel}`}
                          onClick={() => openChannelSettings(channel)}
                        >
                          <CogIcon />
                        </button>
                      </div>
                    </div>

                    {isFacebook && isSelected ? (
                      <div className="facebook-group-area">
                        <button
                          type="button"
                          className="facebook-group-summary"
                          onClick={() => setFacebookGroupDropdownOpen((current) => !current)}
                        >
                          <span>Chọn Group:</span>
                          <strong>{selectedFacebookGroup?.name ?? 'Chưa có group mock'}</strong>
                        </button>

                        {facebookGroupDropdownOpen ? (
                          <div className="facebook-group-menu">
                            <p>CHỌN GROUP</p>
                            {facebookGroups.map((group) => {
                              const groupSelected = group.id === selectedFacebookGroup?.id;

                              return (
                                <button
                                  type="button"
                                  key={group.id}
                                  className={groupSelected ? 'facebook-group-item is-selected' : 'facebook-group-item'}
                                  onClick={() => selectFacebookGroup(group.id)}
                                >
                                  <span className="facebook-group-check">
                                    {groupSelected ? <CheckIcon /> : null}
                                  </span>
                                  <span>{group.name}</span>
                                </button>
                              );
                            })}
                            {facebookGroups.length === 0 ? (
                              <span className="facebook-group-empty">Chưa có group nào.</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          {missingFields.length > 0 ? (
            <p className="warning-text">Missing: {missingFields.join(', ')}</p>
          ) : null}

          <button
            type="button"
            className="primary-button sync-button"
            disabled={state === 'EXTRACTING' || state === 'SYNCING' || missingFields.length > 0}
            onClick={sync}
          >
            {state === 'SYNCING' ? 'SYNCING...' : 'SYNC AND PUBLISH'}
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
                    <span className="result-channel-name">{channel.channel}</span>
                    <span className="result-actions">
                      <strong className={`result-status ${getChannelPostingStatusClass(channel)}`}>
                        {channel.status}
                      </strong>
                      {channel.publishedUrl ? (
                        <a
                          className="result-open-link"
                          href={channel.publishedUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}

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

      {channelSettingsOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeChannelSettings();
        }}>
          <section className="channel-modal" role="dialog" aria-modal="true" aria-labelledby="channel-settings-title">
            <div className="modal-header">
              <h2 id="channel-settings-title">
                {channelSettingsOpen === 'FACEBOOK' ? 'Thêm nhóm Facebook mới' : `Cấu hình ${channelSettingsOpen}`}
              </h2>
              <button type="button" className="icon-button" aria-label="Close settings" onClick={closeChannelSettings}>
                <CloseIcon />
              </button>
            </div>

            {channelSettingsOpen === 'FACEBOOK' ? (
              <form className="modal-form" onSubmit={submitMockFacebookGroup}>
                <label className="mock-field">
                  <span>TÊN NHÓM</span>
                  <input
                    value={newFacebookGroupName}
                    onChange={(event) => setNewFacebookGroupName(event.target.value)}
                    placeholder="Ví dụ: Việc làm IT Đà Nẵng"
                  />
                </label>
                <label className="mock-field">
                  <span>LINK URL</span>
                  <input
                    value={newFacebookGroupUrl}
                    onChange={(event) => setNewFacebookGroupUrl(event.target.value)}
                    placeholder="https://facebook.com/groups/..."
                  />
                </label>
                <p className="modal-helper">Link trực tiếp đến trang chủ của nhóm Facebook.</p>

                <ul className="mock-group-list">
                  {facebookGroups.map((group) => (
                    <li key={group.id}>
                      <button
                        type="button"
                        className="mock-group-select"
                        onClick={() => selectFacebookGroup(group.id)}
                      >
                        <span>{group.name}</span>
                        <small>{group.url}</small>
                      </button>
                      <button
                        type="button"
                        className="danger-icon-button"
                        aria-label={`Delete ${group.name}`}
                        onClick={() => setDeleteFacebookGroupId(group.id)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="modal-footer">
                  <button type="button" className="modal-cancel-button" onClick={closeChannelSettings}>
                    HỦY
                  </button>
                  <button type="submit" className="modal-submit-button" disabled={!newFacebookGroupName.trim()}>
                    <PlusIcon />
                    THÊM MỚI
                  </button>
                </div>
              </form>
            ) : (
              <div className="modal-form">
                <p className="modal-helper">
                  Kênh {channelSettingsOpen} chưa có cấu hình bổ sung trong bản mock này.
                </p>
                <div className="modal-footer">
                  <button type="button" className="modal-cancel-button" onClick={closeChannelSettings}>
                    HỦY
                  </button>
                  <button type="button" className="modal-submit-button" onClick={closeChannelSettings}>
                    LƯU THAY ĐỔI
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {deleteFacebookGroup ? (
        <div className="modal-backdrop modal-backdrop-danger" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleteFacebookGroupId(null);
        }}>
          <section className="channel-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-group-title">
            <div className="delete-modal-icon">
              <WarningIcon />
            </div>
            <div className="delete-modal-copy">
              <h2 id="delete-group-title">Xác nhận xóa nhóm</h2>
              <p>Bạn có chắc chắn muốn xóa nhóm này không?</p>
              <span>Hành động này không thể hoàn tác và dữ liệu liên quan sẽ bị mất.</span>
            </div>
            <div className="delete-target">
              <span>NHÓM SẼ BỊ XÓA:</span>
              <strong>{deleteFacebookGroup.name}</strong>
            </div>
            <div className="modal-footer">
              <button type="button" className="modal-cancel-button" onClick={() => setDeleteFacebookGroupId(null)}>
                HỦY
              </button>
              <button type="button" className="modal-danger-button" onClick={confirmDeleteFacebookGroup}>
                <TrashIcon />
                XÓA NHÓM
              </button>
            </div>
          </section>
        </div>
      ) : null}
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

function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M13.2 4.3 6.5 11 2.8 7.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function CogIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M8.9 2.5h2.2l.4 2a5.8 5.8 0 0 1 1.4.6l1.7-1.1 1.6 1.6-1.1 1.7c.3.5.5.9.6 1.4l2 .4v2.2l-2 .4a5.8 5.8 0 0 1-.6 1.4l1.1 1.7-1.6 1.6-1.7-1.1a5.8 5.8 0 0 1-1.4.6l-.4 2H8.9l-.4-2a5.8 5.8 0 0 1-1.4-.6l-1.7 1.1-1.6-1.6 1.1-1.7a5.8 5.8 0 0 1-.6-1.4l-2-.4V9.1l2-.4c.1-.5.3-1 .6-1.4L3.8 5.6 5.4 4l1.7 1.1c.5-.3.9-.5 1.4-.6l.4-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10.2" r="2.2" stroke="currentColor" strokeWidth="1.4" />
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

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'Request failed.';
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

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
