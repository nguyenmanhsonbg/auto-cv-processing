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

const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const CAREER_QUESTION_SELECTION_PREFIX = 'vcs:selected-career-questions:';

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
  const selectedNewQuestionCategory = useMemo(
    () => careerQuestionContext?.categories.find((category) => category.name === newQuestionCategory) ?? null,
    [careerQuestionContext, newQuestionCategory],
  );
  const selectedCareerQuestionCount = useMemo(() => {
    if (!careerQuestionContext) return 0;

    const visibleQuestionIds = new Set(careerQuestionContext.questions.map((question) => question.id));
    return Array.from(selectedCareerQuestionIds).filter((questionId) => visibleQuestionIds.has(questionId)).length;
  }, [careerQuestionContext, selectedCareerQuestionIds]);

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
      setNewQuestionText('');
      setNewQuestionExpectedAnswer('');
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
      const next = current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel];
      void setSelectedChannels(next);
      return next;
    });
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

          <section className="question-panel">
            <div className="status-row">
              <div>
                <p className="eyebrow">AMIS career</p>
                <h2>{selectedCareerName || 'No career selected'}</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                disabled={careerQuestionState === 'LOADING'}
                onClick={() => void refreshSelectedCareerContext(token)}
              >
                Refresh
              </button>
            </div>

            {careerQuestionMessage ? (
              <p className={careerQuestionState === 'ERROR' ? 'error-text' : 'muted-text'}>
                {careerQuestionMessage}
              </p>
            ) : null}

            {careerQuestionContext ? (
              <>
                <div className="mapped-category-list">
                  {careerQuestionContext.categories.map((category) => (
                    <span key={category.name} className="status-badge">{category.name}</span>
                  ))}
                </div>

                <div className="question-summary">
                  <div>
                    <strong>{careerQuestionContext.questions.length}</strong>
                    <span> mapped questions</span>
                    <span className="selection-count"> - {selectedCareerQuestionCount} selected</span>
                  </div>
                  {careerQuestionContext.questions.length > 0 ? (
                    <div className="question-selection-actions">
                      <button type="button" className="text-button" onClick={selectAllCareerQuestions}>
                        Select all
                      </button>
                      <button type="button" className="text-button" onClick={clearSelectedCareerQuestions}>
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>

                {careerQuestionContext.questions.length > 0 ? (
                  <ul className="question-list">
                    {careerQuestionContext.questions.map((question) => (
                      <li key={question.id}>
                        <label className="question-option">
                          <input
                            type="checkbox"
                            checked={selectedCareerQuestionIds.has(question.id)}
                            onChange={() => toggleCareerQuestion(question.id)}
                          />
                          <span className="question-option-body">
                            <p>{question.text}</p>
                            <small>{question.category} / {question.subcategory}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">No questions are mapped to this career yet.</p>
                )}

                <form className="question-form" onSubmit={submitNewCareerQuestion}>
                  <select
                    value={newQuestionCategory}
                    onChange={(event) => handleNewQuestionCategoryChange(event.target.value)}
                    aria-label="Question category"
                  >
                    {careerQuestionContext.categories.map((category) => (
                      <option key={category.name} value={category.name}>{category.displayName}</option>
                    ))}
                  </select>
                  <select
                    value={newQuestionSubcategory}
                    onChange={(event) => setNewQuestionSubcategory(event.target.value)}
                    aria-label="Question subcategory"
                  >
                    {(selectedNewQuestionCategory?.subcategories ?? []).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={newQuestionText}
                    onChange={(event) => setNewQuestionText(event.target.value)}
                    placeholder="New question"
                    rows={3}
                  />
                  <textarea
                    value={newQuestionExpectedAnswer}
                    onChange={(event) => setNewQuestionExpectedAnswer(event.target.value)}
                    placeholder="Expected answer (optional)"
                    rows={3}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={newQuestionSaving || !newQuestionText.trim() || !newQuestionCategory || !newQuestionSubcategory}
                  >
                    {newQuestionSaving ? 'Adding...' : 'Add question'}
                  </button>
                </form>
              </>
            ) : null}
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

          <section>
            <p className="section-title">Channels</p>
            <div className="channel-list">
              {CHANNELS.map((channel) => (
                <label key={channel} className="channel-option">
                  <input
                    type="checkbox"
                    checked={channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                  />
                  <span>{channel}</span>
                </label>
              ))}
            </div>
          </section>

          {missingFields.length > 0 ? (
            <p className="warning-text">Missing: {missingFields.join(', ')}</p>
          ) : null}

          <button
            type="button"
            className="primary-button"
            disabled={state === 'EXTRACTING' || state === 'SYNCING' || missingFields.length > 0}
            onClick={sync}
          >
            {state === 'SYNCING' ? 'Syncing...' : 'Sync and publish'}
          </button>

          {state === 'ERROR' && error ? <p className="error-text">{error}</p> : null}

          {result ? (
            <section className="result-panel">
              <div>
                <p className="eyebrow">Result</p>
                <h2>{result.resultCode}</h2>
              </div>
              <ul>
                {result.channelPostings.map((channel) => (
                  <li key={channel.channel}>
                    <span>{channel.channel}</span>
                    <strong>{channel.status}</strong>
                    {channel.publishedUrl ? <a href={channel.publishedUrl} target="_blank" rel="noreferrer">Open</a> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
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
