import { appendAmisDiagnostic } from './amis-diagnostics-store';
import {
  ensureAmisDebuggerAttached,
  installAmisDebuggerCapture,
  type AmisApplicationsCapture,
  type AmisCareerCapture,
} from './amis-debugger-capture';
import { saveLastAutoSyncState } from './amis-auto-sync-store';
import { saveLastAmisCapture } from './amis-capture-store';
import {
  ApiClientError,
  syncAmisApplications,
  syncAmisCareers,
  syncAndPublishAmisJob,
} from './api-client';
import { clearAccessToken, getAccessToken } from './auth-store';
import { getSelectedChannels } from './channel-preferences';
import type {
  AmisDiagnosticEvent,
  AmisExtractionResult,
  AmisAutoSyncState,
  ExtensionChannel,
  SyncAmisJobPostingRequest,
} from './types';

const AMIS_SAVED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_SAVED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'AMIS_DIAGNOSTIC_EVENT';
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
let lastCareerSyncSignature: string | null = null;
let lastApplicationsSyncSignature: string | null = null;

installAmisDebuggerCapture(
  (capture, sender) => handleAmisSaved(capture, sender),
  (capture, sender) => handleAmisCareersCaptured(capture, sender),
  (capture, sender) => handleAmisApplicationsCaptured(capture, sender),
);

chrome.runtime?.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime?.onMessage.addListener((message, sender) => {
  if (isAmisDiagnosticMessage(message)) {
    void appendAmisDiagnostic(message.payload);
    if (message.payload.type === 'BRIDGE_READY') {
      void ensureAmisDebuggerAttached(sender.tab, message.payload.pageUrl);
    }
    return;
  }

  if (!isAmisSavedMessage(message)) return;

  void handleAmisSaved(message.payload, sender);
});

async function handleAmisSaved(capture: AmisExtractionResult, sender: ChromeMessageSender) {
  await saveLastAmisCapture(capture);
  await appendAmisDiagnostic({
    type: 'BACKGROUND_RECEIVED_CAPTURE',
    pageUrl: capture.url,
    timestamp: new Date().toISOString(),
    details: {
      confidence: capture.confidence,
      missingFields: capture.missingFields,
      hasSnapshot: Boolean(capture.snapshot),
      hasAmisRecruitmentId: Boolean(capture.amisRecruitmentId),
    },
  });
  await openPanel(sender);

  const amisRecruitmentId = capture.amisRecruitmentId;
  const snapshot = capture.snapshot;

  if (!capture.detected || !snapshot || !amisRecruitmentId || capture.missingFields.length > 0) {
    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'SKIPPED',
      capture,
      error: {
        code: 'AMIS_CAPTURE_INCOMPLETE',
        message: `AMIS capture is missing required fields: ${capture.missingFields.join(', ') || 'unknown'}.`,
      },
    }));
    return;
  }

  const channels = await getSelectedChannels();
  await saveLastAutoSyncState(buildAutoSyncState({
    status: 'SYNCING',
    capture,
    channels,
  }));

  const accessToken = await getAccessToken();
  if (!accessToken) {
    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'AUTH_REQUIRED',
      capture,
      channels,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Sign in to the extension before publishing from AMIS.',
      },
    }));
    return;
  }

  try {
    const result = await syncAndPublishAmisJob(
      accessToken,
      buildSyncPayload({ ...capture, amisRecruitmentId, snapshot }, channels),
    );
    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'SUCCESS',
      capture,
      channels,
      result,
    }));
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await clearAccessToken();
      await saveLastAutoSyncState(buildAutoSyncState({
        status: 'AUTH_REQUIRED',
        capture,
        channels,
        error: {
          code: error.code,
          message: error.message,
          status: error.status,
        },
      }));
      return;
    }

    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'ERROR',
      capture,
      channels,
      error: toAutoSyncError(error),
    }));
  }
}

async function handleAmisCareersCaptured(capture: AmisCareerCapture, _sender: ChromeMessageSender) {
  const signature = buildCareerSyncSignature(capture);
  if (signature === lastCareerSyncSignature) {
    await appendAmisDiagnostic({
      type: 'CAREER_AUTO_SYNC_SKIPPED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        reason: 'same-payload',
        itemCount: capture.items.length,
      },
    });
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    await appendAmisDiagnostic({
      type: 'CAREER_AUTO_SYNC_SKIPPED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        reason: 'auth-required',
        itemCount: capture.items.length,
      },
    });
    return;
  }

  try {
    const result = await syncAmisCareers(accessToken, {
      items: capture.items,
      sourceUrl: capture.sourceUrl,
      metadata: {
        autoSync: true,
        trigger: 'AMIS_CAREER_DATA_PAGING_RESPONSE',
        capturedAt: new Date().toISOString(),
        pageUrl: capture.pageUrl,
        rawCount: capture.rawCount,
      },
    });
    lastCareerSyncSignature = signature;

    await appendAmisDiagnostic({
      type: 'CAREER_AUTO_SYNC_SUCCESS',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        syncedCount: result.syncedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        removedCount: result.removedCount,
      },
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await clearAccessToken();
    }

    await appendAmisDiagnostic({
      type: 'CAREER_AUTO_SYNC_FAILED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: toAutoSyncError(error),
    });
  }
}

async function handleAmisApplicationsCaptured(capture: AmisApplicationsCapture, _sender: ChromeMessageSender) {
  const signature = buildApplicationsSyncSignature(capture);
  if (signature === lastApplicationsSyncSignature) {
    await appendAmisDiagnostic({
      type: 'APPLICATIONS_AUTO_SYNC_SKIPPED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        reason: 'same-payload',
        amisRecruitmentId: capture.amisRecruitmentId,
        itemCount: capture.items.length,
      },
    });
    return;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    await appendAmisDiagnostic({
      type: 'APPLICATIONS_AUTO_SYNC_SKIPPED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        reason: 'auth-required',
        amisRecruitmentId: capture.amisRecruitmentId,
        itemCount: capture.items.length,
      },
    });
    return;
  }

  try {
    const result = await syncAmisApplications(accessToken, {
      items: capture.items,
      sourceUrl: capture.sourceUrl,
      metadata: {
        autoSync: true,
        trigger: 'AMIS_APPLICATIONS_RESPONSE',
        capturedAt: new Date().toISOString(),
        pageUrl: capture.pageUrl,
        rawCount: capture.rawCount,
      },
    });
    lastApplicationsSyncSignature = signature;

    await appendAmisDiagnostic({
      type: 'APPLICATIONS_AUTO_SYNC_SUCCESS',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: {
        syncedCount: result.syncedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        jobPostingId: result.jobPostingId,
        amisRecruitmentId: result.amisRecruitmentId,
      },
    });

    void chrome.runtime?.sendMessage?.({
      type: AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE,
      payload: {
        amisRecruitmentId: result.amisRecruitmentId,
        jobPostingId: result.jobPostingId,
        syncedCount: result.syncedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
      },
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await clearAccessToken();
    }

    await appendAmisDiagnostic({
      type: 'APPLICATIONS_AUTO_SYNC_FAILED',
      pageUrl: capture.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: capture.sourceUrl,
      details: toAutoSyncError(error),
    });
  }
}

async function openPanel(sender: ChromeMessageSender) {
  try {
    if (sender.tab?.id !== undefined) {
      await chrome.sidePanel?.open({ tabId: sender.tab.id });
      return;
    }

    if (sender.tab?.windowId !== undefined) {
      await chrome.sidePanel?.open({ windowId: sender.tab.windowId });
    }
  } catch {
    // Browser may require a direct extension user gesture to open the side panel.
    // Capture and backend sync must continue even when opening the panel is blocked.
  }
}

function buildSyncPayload(
  capture: Required<Pick<AmisExtractionResult, 'amisRecruitmentId' | 'snapshot'>> & AmisExtractionResult,
  channels: ExtensionChannel[],
): SyncAmisJobPostingRequest {
  return {
    sourceSystem: 'AMIS',
    amisRecruitmentId: capture.amisRecruitmentId,
    amisUrl: capture.url,
    action: 'PUBLISH',
    snapshot: capture.snapshot,
    channels,
    metadata: {
      autoSync: true,
      trigger: 'AMIS_SAVE_RECRUITMENT_RESPONSE',
      capturedAt: new Date().toISOString(),
      captureSource: capture.source,
      captureConfidence: capture.confidence,
      extractionWarnings: capture.warnings,
      extractionEvidence: capture.evidence,
    },
  };
}

function buildAutoSyncState(
  state: Omit<AmisAutoSyncState, 'updatedAt'>,
): AmisAutoSyncState {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
  };
}

function buildCareerSyncSignature(capture: AmisCareerCapture) {
  return capture.items
    .map((item) => [
      item.amisCareerId,
      item.name,
      item.organizationUnitId ?? '',
      item.usageStatus ?? '',
      item.isActive ?? '',
    ].join(':'))
    .sort()
    .join('|');
}

function buildApplicationsSyncSignature(capture: AmisApplicationsCapture) {
  return capture.items
    .map((item) => [
      item.recruitmentId,
      item.recruitmentRoundId,
      item.candidateId,
      item.status ?? '',
      item.attachmentCvId ?? '',
      item.applyDate ?? '',
    ].join(':'))
    .sort()
    .join('|');
}

function toAutoSyncError(error: unknown) {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'AUTO_SYNC_FAILED',
      message: error.message,
    };
  }

  return {
    code: 'AUTO_SYNC_FAILED',
    message: 'Auto sync failed.',
  };
}

function isAmisSavedMessage(value: unknown): value is {
  type: typeof AMIS_SAVED_MESSAGE_TYPE;
  payload: AmisExtractionResult;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === AMIS_SAVED_MESSAGE_TYPE
    && isAmisExtractionResult((value as { payload?: unknown }).payload);
}

function isAmisDiagnosticMessage(value: unknown): value is {
  type: typeof AMIS_DIAGNOSTIC_MESSAGE_TYPE;
  payload: AmisDiagnosticEvent;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === AMIS_DIAGNOSTIC_MESSAGE_TYPE
    && isAmisDiagnosticEvent((value as { payload?: unknown }).payload);
}

function isAmisExtractionResult(value: unknown): value is AmisExtractionResult {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'AMIS_SAVE_RECRUITMENT_API'
    && typeof (value as { url?: unknown }).url === 'string';
}

function isAmisDiagnosticEvent(value: unknown): value is AmisDiagnosticEvent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
    && typeof (value as { timestamp?: unknown }).timestamp === 'string';
}
