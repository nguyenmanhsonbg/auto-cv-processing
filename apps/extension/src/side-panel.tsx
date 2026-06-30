import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { extractAmisJobFromPage } from './amis-page-extractor';
import { getLastAutoSyncState } from './amis-auto-sync-store';
import { getLastAmisCapture } from './amis-capture-store';
import { getAmisDiagnostics } from './amis-diagnostics-store';
import { ApiClientError, getCurrentUser, login, syncAndPublishAmisJob } from './api-client';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth-store';
import { getSelectedChannels, setSelectedChannels } from './channel-preferences';
import { CHANNELS } from './config';
import { createMockAmisSyncRequest } from './mock-amis';
import type {
  AmisDiagnosticEvent,
  AmisAutoSyncState,
  AmisExtractionResult,
  AmisJobSnapshot,
  ExtensionChannel,
  ExtensionSyncResponse,
  ExtensionUser,
  SyncAmisJobPostingRequest,
} from './types';
import './styles.css';

type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';

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
      }
    });
  }, []);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!amisRecruitmentId) missing.push('AMIS recruitment id');
    if (!snapshot?.title.trim()) missing.push('title');
    if (!snapshot?.description.trim()) missing.push('description');
    if (!snapshot?.requirements.rawText.trim()) missing.push('requirements');
    if (channels.length === 0) missing.push('channel');
    return missing;
  }, [amisRecruitmentId, channels.length, snapshot]);

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
    setState('AUTH_REQUIRED');
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
                  <dd>{snapshot.description}</dd>
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

function formatDiagnosticTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function formatDiagnosticDetails(details: Record<string, unknown>) {
  return JSON.stringify(details).slice(0, 240);
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

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
