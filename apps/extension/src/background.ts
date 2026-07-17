import { appendAmisDiagnostic } from './amis-diagnostics-store';
import {
  ensureAmisDebuggerAttached,
  installAmisDebuggerCapture,
  type AmisApplicationsCapture,
  type AmisCareerCapture,
} from './amis-debugger-capture';
import { saveLastAutoSyncState } from './amis-auto-sync-store';
import { saveLastAmisCapture } from './amis-capture-store';
import { extractAmisJobFromPage } from './amis-page-extractor';
import {
  ApiClientError,
  claimNextExtensionTask,
  completeExtensionTask,
  failExtensionTask,
  heartbeatExtensionInstance,
  reportExtensionTaskProgress,
  startExtensionTask,
  syncAmisApplications,
  syncAmisCareers,
  syncAndPublishAmisJob,
  verifyFacebookGroup,
} from './api-client';
import { clearAccessToken, getAccessToken } from './auth-store';
import { getSelectedChannels } from './channel-preferences';
import { EXTENSION_TASK_QUEUE_ENABLED, FACEBOOK_MAX_IMAGE_ATTACHMENTS } from './config';
import { summarizeFacebookPublishResults, updateFacebookChannelStatus } from './facebook-channel-status';
import {
  clearFacebookContentDraft as clearStoredFacebookContentDraft,
  buildFacebookDraftSnapshotFingerprint,
  getFacebookContentDraft,
} from './facebook-content-draft-store';
import { getSelectedFacebookGroupIds } from './facebook-group-preferences';
import {
  beginFacebookImagePublish,
  getFacebookImageAttachments,
  syncFacebookImagePublishStatuses,
} from './facebook-image-attachment-store';
import {
  ensureFacebookSession,
  publishFacebookPlan,
  verifyFacebookGroupPostingEligibility,
} from './facebook-publish-orchestrator';
import { saveLastFacebookPublishProgress } from './facebook-publish-store';
import { getSelectedJobQuestionContextForTab, getSelectedJobQuestionIdsForTab } from './selected-job-question-store';
import type {
  AmisDiagnosticEvent,
  AmisExtractionResult,
  AmisAutoSyncState,
  ExtensionChannel,
  FacebookImageAttachFailureContext,
  FacebookImageAttachFailureDecision,
  ExtensionTask,
  FacebookPublishPlan,
  FacebookPublishTarget,
  FacebookPublishProgress,
  SyncAmisJobPostingRequest,
} from './types';

const AMIS_SAVED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_SAVED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'AMIS_DIAGNOSTIC_EVENT';
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
let lastCareerSyncSignature: string | null = null;
let lastApplicationsSyncSignature: string | null = null;
const FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST = 'FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const FRONTEND_FACEBOOK_PUBLISH_REQUEST = 'FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST = 'FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST';
const FRONTEND_FACEBOOK_EVENT = 'FRONTEND_FACEBOOK_EVENT';
const FRONTEND_FACEBOOK_PORT = 'frontend-facebook-publish';
const FRONTEND_FACEBOOK_IMAGE_ATTACH_DECISION = 'VCS_FRONTEND_FACEBOOK_IMAGE_ATTACH_DECISION';
const EXTENSION_TASK_POLL_ALARM = 'vcs-extension-task-poll';
const EXTENSION_TASK_POLL_INTERVAL_MINUTES = 1;
const activeAutoSyncKeys = new Set<string>();
let extensionTaskPollRunning = false;

installAmisDebuggerCapture(
  (capture, sender) => handleAmisSaved(capture, sender),
  (capture, sender) => handleAmisCareersCaptured(capture, sender),
  (capture, sender) => handleAmisApplicationsCaptured(capture, sender),
);

chrome.runtime?.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
  scheduleExtensionTaskPolling();
});

chrome.runtime?.onStartup?.addListener(() => {
  scheduleExtensionTaskPolling();
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== EXTENSION_TASK_POLL_ALARM) return;
  void runExtensionTaskPoll();
});

scheduleExtensionTaskPolling();
void runExtensionTaskPoll();

chrome.runtime?.onMessage.addListener((message, sender) => {
  if (isAmisDiagnosticMessage(message)) {
    void appendAmisDiagnostic(message.payload);
    if (message.payload.type === 'BRIDGE_READY') {
      void ensureAmisDebuggerAttached(sender.tab, message.payload.pageUrl);
    }
    return;
  }

  if (isFrontendFacebookAuthCheckRequest(message)) {
    void handleFrontendFacebookAuthCheck(message.requestId, sender);
    return;
  }

  if (isFrontendFacebookPublishRequest(message)) {
    void handleFrontendFacebookPublish(message, sender);
    return;
  }

  if (isFrontendFacebookGroupVerifyRequest(message)) {
    void handleFrontendFacebookGroupVerify(message, sender);
    return;
  }

  if (!isAmisSavedMessage(message)) return;

  void handleAmisSaved(message.payload, sender);
});

chrome.runtime?.onConnect?.addListener((port) => {
  if (port.name !== FRONTEND_FACEBOOK_PORT) return;

  port.onMessage.addListener((message) => {
    if (isFrontendFacebookAuthCheckRequest(message)) {
      void runFrontendFacebookPortTask(port, message.requestId, async (emit) => {
        await handleFrontendFacebookAuthCheck(message.requestId, emit);
      });
      return;
    }

    if (isFrontendFacebookPublishRequest(message)) {
      void runFrontendFacebookPortTask(port, message.requestId, async (emit) => {
        await handleFrontendFacebookPublish(message, emit, (context) => (
          requestFrontendFacebookImageAttachDecision(port, message.requestId, context)
        ));
      });
      return;
    }

    if (isFrontendFacebookGroupVerifyRequest(message)) {
      void runFrontendFacebookPortTask(port, message.requestId, async (emit) => {
        await handleFrontendFacebookGroupVerify(message, emit);
      });
      return;
    }

    if (isFrontendFacebookImageAttachDecision(message)) {
      return;
    }

    postFrontendFacebookPortEvent(port, 'unknown', 'ERROR', {
      message: 'Unsupported Facebook bridge request.',
    });
  });
});

async function runFrontendFacebookPortTask(
  port: ChromePort,
  requestId: string,
  task: (emit: FrontendFacebookEventEmitter) => Promise<void>,
) {
  const emit: FrontendFacebookEventEmitter = async (event, payload) => {
    postFrontendFacebookPortEvent(port, requestId, event, payload);
  };

  try {
    await emit('ACCEPTED', { message: 'Facebook browser automation request accepted.' });
    await task(emit);
  } catch (error) {
    await emit('ERROR', {
      message: `FACEBOOK_BACKGROUND_PORT_ERROR: ${toExtensionErrorMessage(error, 'Facebook browser automation failed.')}`,
    });
  } finally {
    try {
      port.disconnect();
    } catch {
      // The content script may close the port immediately after a terminal event.
    }
  }
}

type FrontendFacebookEventEmitter = (event: string, payload?: unknown) => Promise<void>;

async function handleFrontendFacebookAuthCheck(
  requestId: string,
  emitOrSender: FrontendFacebookEventEmitter | ChromeMessageSender,
) {
  const emit = toFrontendFacebookEmitter(requestId, emitOrSender);
  try {
    await emit('AUTH_CHECKING', {
      message: 'Checking Facebook login in this browser.',
    });
    const result = await ensureFacebookSession({
      onStatus: (event) => {
        void emit(event.status, event);
      },
    });
    await emit('COMPLETED', result);
  } catch (error) {
    await emit('ERROR', {
      message: error instanceof Error ? error.message : 'Facebook login could not be completed.',
    });
  }
}

async function handleFrontendFacebookPublish(
  request: {
    requestId: string;
    accessToken: string;
    plan: FacebookPublishPlan;
  },
  emitOrSender: FrontendFacebookEventEmitter | ChromeMessageSender,
  requestImageAttachDecision?: (
    context: FacebookImageAttachFailureContext,
  ) => Promise<FacebookImageAttachFailureDecision>,
) {
  const emit = toFrontendFacebookEmitter(request.requestId, emitOrSender);
  try {
    await heartbeatExtensionInstance(request.accessToken);
    await emit('PROGRESS', {
      status: 'LOGIN_REQUIRED',
      currentIndex: 0,
      total: request.plan.targets.length,
      message: 'Starting Facebook browser automation.',
      results: [],
    });
    const results = await publishFacebookPlan(request.accessToken, request.plan, {
      onProgress: (progress) => {
        void saveLastFacebookPublishProgress(progress);
        void emit('PROGRESS', progress);
      },
      onImageAttachFailed: requestImageAttachDecision,
    });
    const summary = summarizeFacebookPublishResults(results);
    if (summary.successCount === 0) {
      await emit('ERROR', { message: summary.message, results });
      return;
    }
    await emit('COMPLETED', { results });
  } catch (error) {
    await emit('ERROR', {
      message: `FACEBOOK_BACKGROUND_UNEXPECTED_ERROR: ${toExtensionErrorMessage(error, 'Facebook publishing could not be completed.')}`,
    });
  }
}

async function handleFrontendFacebookGroupVerify(
  request: {
    requestId: string;
    target: FacebookPublishTarget;
  },
  emitOrSender: FrontendFacebookEventEmitter | ChromeMessageSender,
) {
  const emit = toFrontendFacebookEmitter(request.requestId, emitOrSender);
  try {
    await emit('VERIFYING', {
      message: `Checking ${request.target.targetName}.`,
    });
    const result = await verifyFacebookGroupPostingEligibility(request.target);
    await emit('COMPLETED', result);
  } catch (error) {
    await emit('ERROR', {
      message: error instanceof Error ? error.message : 'Facebook group verification could not be completed.',
    });
  }
}

function scheduleExtensionTaskPolling() {
  if (!EXTENSION_TASK_QUEUE_ENABLED) return;

  chrome.alarms?.create(EXTENSION_TASK_POLL_ALARM, {
    delayInMinutes: EXTENSION_TASK_POLL_INTERVAL_MINUTES,
    periodInMinutes: EXTENSION_TASK_POLL_INTERVAL_MINUTES,
  });
}

async function runExtensionTaskPoll() {
  if (!EXTENSION_TASK_QUEUE_ENABLED || extensionTaskPollRunning) return;
  extensionTaskPollRunning = true;

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    await heartbeatExtensionInstance(accessToken);
    const task = await claimNextExtensionTask(accessToken);
    if (!task) return;

    await executeExtensionTask(accessToken, task);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await clearAccessToken();
    }
  } finally {
    extensionTaskPollRunning = false;
  }
}

async function executeExtensionTask(accessToken: string, task: ExtensionTask) {
  try {
    await startExtensionTask(accessToken, task.id);

    if (task.type === 'FACEBOOK_PUBLISH') {
      await executeFacebookPublishTask(accessToken, task);
      return;
    }

    if (task.type === 'FACEBOOK_VERIFY') {
      await executeFacebookVerifyTask(accessToken, task);
      return;
    }

    await failExtensionTask(accessToken, task.id, {
      errorCode: 'UNSUPPORTED_EXTENSION_TASK',
      errorMessage: `${task.type} is not supported by this extension version.`,
    });
  } catch (error) {
    await failClaimedTask(accessToken, task, error);
  }
}

async function executeFacebookPublishTask(accessToken: string, task: ExtensionTask) {
  const plan = readFacebookPublishPlanTaskPayload(task.payload);
  if (!plan) {
    throw new Error('FACEBOOK_PUBLISH task payload must include a valid plan.');
  }

  await reportExtensionTaskProgress(accessToken, task.id, {
    eventType: 'FACEBOOK_PUBLISH_STARTED',
    message: 'Starting Facebook browser automation.',
    payload: {
      jobPostingId: plan.jobPostingId,
      targetCount: plan.targets.length,
    },
  });

  const results = await publishFacebookPlan(accessToken, plan, {
    onProgress: (progress) => {
      void saveLastFacebookPublishProgress(progress);
      void reportFacebookPublishTaskProgress(accessToken, task.id, progress);
    },
  });

  await completeExtensionTask(accessToken, task.id, { results });
}

async function executeFacebookVerifyTask(accessToken: string, task: ExtensionTask) {
  const target = readFacebookVerifyTaskPayload(task.payload);
  if (!target) {
    throw new Error('FACEBOOK_VERIFY task payload must include a valid target.');
  }

  await reportExtensionTaskProgress(accessToken, task.id, {
    eventType: 'FACEBOOK_VERIFY_STARTED',
    message: `Checking ${target.targetName}.`,
    payload: {
      targetId: target.targetId ?? null,
      targetName: target.targetName,
    },
  });

  const result = await verifyFacebookGroupPostingEligibility(target);
  const persistedTarget = target.targetId
    ? await verifyFacebookGroup(accessToken, target.targetId, {
      eligibilityStatus: result.eligibilityStatus,
      eligibilityReason: result.eligibilityReason,
      verifiedAt: result.verifiedAt,
    })
    : null;

  await completeExtensionTask(accessToken, task.id, {
    verification: result,
    target: persistedTarget,
  });
}

async function reportFacebookPublishTaskProgress(
  accessToken: string,
  taskId: string,
  progress: FacebookPublishProgress,
) {
  await reportExtensionTaskProgress(accessToken, taskId, {
    eventType: `FACEBOOK_PUBLISH_${progress.status}`,
    message: progress.message,
    payload: {
      currentIndex: progress.currentIndex,
      total: progress.total,
      targetName: progress.target?.targetName ?? null,
      resultCount: progress.results.length,
    },
  });
}

async function failClaimedTask(accessToken: string, task: ExtensionTask, error: unknown) {
  try {
    await failExtensionTask(accessToken, task.id, {
      errorCode: error instanceof ApiClientError ? error.code : 'EXTENSION_TASK_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Extension task failed.',
    });
  } catch {
    // If the backend rejected the fail report, the lock timeout will make the task retryable.
  }
}

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

  const enrichedCapture = await enrichCaptureFromDom(capture, sender);
  if (enrichedCapture !== capture) {
    await saveLastAmisCapture(enrichedCapture);
    await appendAmisDiagnostic({
      type: 'BACKGROUND_RECEIVED_CAPTURE',
      pageUrl: enrichedCapture.url,
      timestamp: new Date().toISOString(),
      details: {
        domFallbackMerged: true,
        originalMissingFields: capture.missingFields,
        mergedMissingFields: enrichedCapture.missingFields,
      },
    });
  }

  const amisRecruitmentId = enrichedCapture.amisRecruitmentId;
  const snapshot = enrichedCapture.snapshot;

  if (!enrichedCapture.detected || !snapshot || !amisRecruitmentId || enrichedCapture.missingFields.length > 0) {
    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'SKIPPED',
      capture: enrichedCapture,
      error: {
        code: 'AMIS_CAPTURE_INCOMPLETE',
        message: `AMIS capture is missing required fields: ${enrichedCapture.missingFields.join(', ') || 'unknown'}.`,
      },
    }));
    return;
  }

  const channels = await getSelectedChannels();
  const facebookTargetIds = channels.includes('FACEBOOK')
    ? await getSelectedFacebookGroupIds()
    : [];
  const selectedJobQuestionContext = await getSelectedJobQuestionContextForTab(sender.tab?.id);
  const facebookContentDraft = channels.includes('FACEBOOK')
    ? await getFacebookContentDraft({
      recruitmentId: amisRecruitmentId,
      tabId: sender.tab?.id,
      jobDescriptionId: selectedJobQuestionContext?.jobDescriptionId,
      snapshot,
    })
    : null;
  const facebookContentForPublish = facebookContentDraft?.content.trim() ?? '';
  const autoSyncKey = buildAutoSyncKey(
    amisRecruitmentId,
    channels,
    facebookTargetIds,
    facebookContentForPublish,
  );
  if (activeAutoSyncKeys.has(autoSyncKey)) {
    await appendAmisDiagnostic({
      type: 'BACKGROUND_RECEIVED_CAPTURE',
      pageUrl: capture.url,
      timestamp: new Date().toISOString(),
      details: {
        duplicateIgnored: true,
        amisRecruitmentId,
        channels,
        facebookTargetIds,
      },
    });
    return;
  }

  activeAutoSyncKeys.add(autoSyncKey);

  try {
    await saveLastAutoSyncState(buildAutoSyncState({
      status: 'SYNCING',
      capture: enrichedCapture,
      channels,
    }));

    const accessToken = await getAccessToken();
    if (!accessToken) {
      await saveLastAutoSyncState(buildAutoSyncState({
        status: 'AUTH_REQUIRED',
        capture: enrichedCapture,
        channels,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Sign in to the extension before publishing from AMIS.',
        },
      }));
      return;
    }

    try {
      await heartbeatExtensionInstance(accessToken);
      const selectedQuestionIds = await getSelectedJobQuestionIdsForTab(sender.tab?.id);
      const result = await syncAndPublishAmisJob(
        accessToken,
        await buildSyncPayload(
          { ...enrichedCapture, amisRecruitmentId, snapshot },
          channels,
          facebookTargetIds,
          selectedQuestionIds,
          facebookContentForPublish,
        ),
      );

      if (channels.includes('FACEBOOK') && result.facebookPublishPlan) {
        const resolvedFacebookPublishPlan = await resolveFacebookPublishPlanContent(
          result.facebookPublishPlan,
          { ...enrichedCapture, amisRecruitmentId, snapshot },
          facebookContentForPublish,
        );
        const facebookImageScope = {
          recruitmentId: amisRecruitmentId,
          jobDescriptionId: selectedJobQuestionContext?.jobDescriptionId ?? null,
          snapshotFingerprint: buildFacebookDraftSnapshotFingerprint(snapshot),
        };
        let facebookPublishPlan = resolvedFacebookPublishPlan;
        try {
          const imageAttachments = await getFacebookImageAttachments(facebookImageScope);
          await appendAmisDiagnostic({
            type: 'FACEBOOK_IMAGE_ATTACHMENTS_RESOLVED',
            pageUrl: enrichedCapture.url,
            timestamp: new Date().toISOString(),
            details: {
              attachmentCount: imageAttachments.length,
              recruitmentId: facebookImageScope.recruitmentId,
              jobDescriptionId: facebookImageScope.jobDescriptionId,
            },
          });
          if (imageAttachments.length > 0) {
            facebookPublishPlan = {
              ...resolvedFacebookPublishPlan,
              attachments: imageAttachments.slice(0, FACEBOOK_MAX_IMAGE_ATTACHMENTS),
            };
            await beginFacebookImagePublish(
              facebookImageScope,
              resolvedFacebookPublishPlan.jobPostingId,
              resolvedFacebookPublishPlan.targets,
            );
          }
        } catch (error) {
          const message = toExtensionErrorMessage(error, 'Facebook image attachments could not be loaded.');
          await appendAmisDiagnostic({
            type: 'FACEBOOK_IMAGE_ATTACHMENTS_RESOLVED',
            pageUrl: enrichedCapture.url,
            timestamp: new Date().toISOString(),
            details: {
              attachmentCount: null,
              recruitmentId: facebookImageScope.recruitmentId,
              jobDescriptionId: facebookImageScope.jobDescriptionId,
              error: message,
            },
          });
          throw new Error(`FB_IMAGE_ATTACHMENT_STORE_FAILED: ${message}`);
        }
        const resultForFacebookPublish = {
          ...result,
          facebookPublishPlan,
        };

        await saveLastAutoSyncState(buildAutoSyncState({
          status: 'SYNCING',
          capture: enrichedCapture,
          channels,
          result: resultForFacebookPublish,
        }));

        const facebookResults = await publishFacebookPlan(accessToken, facebookPublishPlan, {
          onProgress: (progress) => {
            void saveLastFacebookPublishProgress(progress);
          },
        });
        if (facebookPublishPlan.attachments?.length) {
          try {
            await syncFacebookImagePublishStatuses(facebookResults.map((publishResult) => {
              const target = facebookPublishPlan.targets.find((candidate) => (
                candidate.targetId === publishResult.targetId
                  || candidate.targetUrl === publishResult.targetUrl
                  || candidate.targetName === publishResult.targetName
              ));
              return {
                jobPostingId: facebookPublishPlan.jobPostingId,
                targetId: publishResult.targetId,
                targetExternalId: target?.targetExternalId ?? null,
                targetName: publishResult.targetName,
                targetUrl: publishResult.targetUrl ?? target?.targetUrl ?? null,
                facebookReviewStatus: publishResult.facebookReviewStatus ?? 'UNKNOWN',
              };
            }));
          } catch {
            // Facebook results remain authoritative if local attachment cleanup fails.
          }
        }
        const resultWithFacebookStatus = updateFacebookChannelStatus(resultForFacebookPublish, facebookResults);
        const facebookSummary = summarizeFacebookPublishResults(facebookResults);
        if (facebookSummary.successCount > 0) {
          await clearStoredFacebookContentDraft({
            recruitmentId: amisRecruitmentId,
            tabId: sender.tab?.id,
            jobDescriptionId: selectedJobQuestionContext?.jobDescriptionId,
            snapshot,
          });
        }

        await saveLastAutoSyncState(buildAutoSyncState({
          status: facebookSummary.successCount > 0 ? 'SUCCESS' : 'ERROR',
          capture: enrichedCapture,
          channels,
          result: resultWithFacebookStatus,
          error: facebookSummary.successCount > 0
            ? undefined
            : {
                code: 'FACEBOOK_PUBLISH_FAILED',
                message: facebookSummary.message,
              },
        }));
        return;
      }

      await saveLastAutoSyncState(buildAutoSyncState({
        status: 'SUCCESS',
        capture: enrichedCapture,
        channels,
        result,
      }));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        await clearAccessToken();
        await saveLastAutoSyncState(buildAutoSyncState({
          status: 'AUTH_REQUIRED',
          capture: enrichedCapture,
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
        capture: enrichedCapture,
        channels,
        error: toAutoSyncError(error),
      }));
    }
  } finally {
    activeAutoSyncKeys.delete(autoSyncKey);
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
    await heartbeatExtensionInstance(accessToken);
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
    await heartbeatExtensionInstance(accessToken);
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

async function resolveFacebookPublishPlanContent(
  plan: FacebookPublishPlan,
  capture: Required<Pick<AmisExtractionResult, 'amisRecruitmentId' | 'snapshot'>> & AmisExtractionResult,
  contentOverride?: string | null,
): Promise<FacebookPublishPlan> {
  const trimmedContentOverride = contentOverride?.trim();
  if (trimmedContentOverride) {
    return {
      ...plan,
      content: hydrateFacebookContentOverride(trimmedContentOverride, plan.content),
    };
  }

  const draft = await getFacebookContentDraft({
    recruitmentId: capture.amisRecruitmentId,
    snapshot: capture.snapshot,
  });
  if (!draft?.content.trim()) return plan;

  return {
    ...plan,
    content: draft.content.trim(),
  };
}

async function buildSyncPayload(
  capture: Required<Pick<AmisExtractionResult, 'amisRecruitmentId' | 'snapshot'>> & AmisExtractionResult,
  channels: ExtensionChannel[],
  facebookTargetIds: string[],
  selectedQuestionIds: string[] = [],
  facebookContentOverride?: string | null,
): Promise<SyncAmisJobPostingRequest> {
  const trimmedFacebookContentOverride = facebookContentOverride?.trim();
  const facebookDraft = channels.includes('FACEBOOK') && !trimmedFacebookContentOverride
    ? await getFacebookContentDraft({
      recruitmentId: capture.amisRecruitmentId,
      snapshot: capture.snapshot,
    })
    : null;
  const facebookContent = trimmedFacebookContentOverride || facebookDraft?.content.trim() || '';

  return {
    sourceSystem: 'AMIS',
    amisRecruitmentId: capture.amisRecruitmentId,
    amisUrl: capture.url,
    action: 'PUBLISH',
    snapshot: capture.snapshot,
    channels,
    ...(channels.includes('FACEBOOK') ? { facebookTargetIds } : {}),
    ...(facebookContent ? { facebookContent } : {}),
    ...(selectedQuestionIds.length ? { selectedQuestionIds } : {}),
    metadata: {
      autoSync: true,
      trigger: 'AMIS_SAVE_RECRUITMENT_RESPONSE',
      capturedAt: new Date().toISOString(),
      captureSource: capture.source,
      captureConfidence: capture.confidence,
      extractionWarnings: capture.warnings,
      extractionEvidence: capture.evidence,
      selectedQuestionCount: selectedQuestionIds.length,
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

function buildAutoSyncKey(
  amisRecruitmentId: string,
  channels: ExtensionChannel[],
  facebookTargetIds: string[],
  facebookContent: string,
) {
  return [
    amisRecruitmentId,
    [...channels].sort().join(','),
    [...facebookTargetIds].sort().join(','),
    hashText(facebookContent),
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

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function enrichCaptureFromDom(
  capture: AmisExtractionResult,
  sender: ChromeMessageSender,
) {
  if (capture.missingFields.length === 0 || !sender.tab?.id || !chrome.scripting) {
    return capture;
  }

  try {
    const [injectionResult] = await chrome.scripting.executeScript<[], AmisExtractionResult>({
      target: { tabId: sender.tab.id },
      func: extractAmisJobFromPage,
    });
    const domCapture = injectionResult?.result;
    if (!domCapture?.detected || !domCapture.snapshot) return capture;

    const mergedCapture = mergeAmisCapture(capture, domCapture);
    return mergedCapture.missingFields.length < capture.missingFields.length
      ? mergedCapture
      : capture;
  } catch {
    return capture;
  }
}

function mergeAmisCapture(
  apiCapture: AmisExtractionResult,
  domCapture: AmisExtractionResult,
): AmisExtractionResult {
  const apiSnapshot = apiCapture.snapshot;
  const domSnapshot = domCapture.snapshot;
  const snapshot = {
    title: firstText(apiSnapshot?.title, domSnapshot?.title),
    description: firstText(apiSnapshot?.description, domSnapshot?.description),
    requirements: {
      ...domSnapshot?.requirements,
      ...apiSnapshot?.requirements,
      rawText: firstText(apiSnapshot?.requirements.rawText, domSnapshot?.requirements.rawText),
    },
    ...(apiSnapshot?.benefits ?? domSnapshot?.benefits ? {
      benefits: apiSnapshot?.benefits ?? domSnapshot?.benefits,
    } : {}),
    ...(firstText(apiSnapshot?.location, domSnapshot?.location) ? {
      location: firstText(apiSnapshot?.location, domSnapshot?.location),
    } : {}),
    ...(firstText(apiSnapshot?.deadline, domSnapshot?.deadline) ? {
      deadline: firstText(apiSnapshot?.deadline, domSnapshot?.deadline),
    } : {}),
  };
  const amisRecruitmentId = firstText(apiCapture.amisRecruitmentId, domCapture.amisRecruitmentId);
  const missingFields = getMissingFields(amisRecruitmentId, snapshot);
  const markers = uniqueStrings([
    ...apiCapture.evidence.markers,
    ...domCapture.evidence.markers,
    'dom-fallback-merged',
  ]);

  return {
    ...apiCapture,
    ...(amisRecruitmentId ? { amisRecruitmentId } : {}),
    snapshot,
    missingFields,
    confidence: missingFields.length === 0 ? 'HIGH' : missingFields.length <= 1 ? 'MEDIUM' : 'LOW',
    warnings: uniqueStrings([
      ...apiCapture.warnings,
      ...domCapture.warnings,
      'Missing AMIS SaveRecruitment fields were supplemented from the visible AMIS page.',
    ]),
    evidence: {
      ...apiCapture.evidence,
      markers,
      fieldSources: {
        ...domCapture.evidence.fieldSources,
        ...apiCapture.evidence.fieldSources,
      },
    },
  };
}

function getMissingFields(
  amisRecruitmentId: string,
  snapshot: NonNullable<AmisExtractionResult['snapshot']>,
) {
  const missingFields: string[] = [];
  if (!amisRecruitmentId) missingFields.push('AMIS recruitment id');
  if (!snapshot.title) missingFields.push('title');
  if (!snapshot.description) missingFields.push('description');
  if (!snapshot.requirements.rawText) missingFields.push('requirements');
  return missingFields;
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function buildApplicationsSyncSignature(capture: AmisApplicationsCapture) {
  return capture.items
    .map((item) => [
      item.recruitmentId,
      item.recruitmentRoundId,
      item.candidateConvertId || item.candidateId,
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

function toExtensionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message} (status=${error.status})`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
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

function isFrontendFacebookAuthCheckRequest(value: unknown): value is {
  type: typeof FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST;
  requestId: string;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string';
}

function isFrontendFacebookPublishRequest(value: unknown): value is {
  type: typeof FRONTEND_FACEBOOK_PUBLISH_REQUEST;
  requestId: string;
  accessToken: string;
  plan: FacebookPublishPlan;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FRONTEND_FACEBOOK_PUBLISH_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof (value as { accessToken?: unknown }).accessToken === 'string'
    && isFacebookPublishPlan((value as { plan?: unknown }).plan);
}

function isFrontendFacebookGroupVerifyRequest(value: unknown): value is {
  type: typeof FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST;
  requestId: string;
  target: FacebookPublishTarget;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && isFacebookPublishTarget((value as { target?: unknown }).target);
}

function isFacebookPublishPlan(value: unknown): value is FacebookPublishPlan {
  const delay = (value as { delay?: { minMs?: unknown; maxMs?: unknown } } | null)?.delay;
  return typeof value === 'object'
    && value !== null
    && typeof (value as { jobPostingId?: unknown }).jobPostingId === 'string'
    && typeof (value as { content?: unknown }).content === 'string'
    && Array.isArray((value as { targets?: unknown }).targets)
    && typeof delay?.minMs === 'number'
    && typeof delay.maxMs === 'number';
}

function readFacebookPublishPlanTaskPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  if (isFacebookPublishPlan(payload)) return payload;
  const plan = payload.plan;
  return isFacebookPublishPlan(plan) ? plan : null;
}

function isFacebookPublishTarget(value: unknown): value is FacebookPublishTarget {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { targetType?: unknown }).targetType === 'string'
    && typeof (value as { targetName?: unknown }).targetName === 'string';
}

function readFacebookVerifyTaskPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  if (isFacebookPublishTarget(payload)) return payload;
  const target = payload.target;
  return isFacebookPublishTarget(target) ? target : null;
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

async function sendFrontendFacebookEvent(
  tabId: number | undefined,
  requestId: string,
  event: string,
  payload?: unknown,
) {
  if (!tabId || !chrome.tabs?.sendMessage) return;
  await chrome.tabs.sendMessage(tabId, {
    type: FRONTEND_FACEBOOK_EVENT,
    requestId,
    event,
    payload,
  }).catch(() => undefined);
}

function toFrontendFacebookEmitter(
  requestId: string,
  emitOrSender: FrontendFacebookEventEmitter | ChromeMessageSender,
): FrontendFacebookEventEmitter {
  if (typeof emitOrSender === 'function') return emitOrSender;

  return async (event, payload) => {
    await sendFrontendFacebookEvent(emitOrSender.tab?.id, requestId, event, payload);
  };
}

function postFrontendFacebookPortEvent(
  port: ChromePort,
  requestId: string,
  event: string,
  payload?: unknown,
) {
  try {
    port.postMessage({
      type: FRONTEND_FACEBOOK_EVENT,
      requestId,
      event,
      payload,
    });
  } catch {
    // The tab may have navigated away or closed while Facebook automation is running.
  }
}

function requestFrontendFacebookImageAttachDecision(
  port: ChromePort,
  requestId: string,
  context: FacebookImageAttachFailureContext,
): Promise<FacebookImageAttachFailureDecision> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settle('SKIP');
    }, 5 * 60_000);

    const settle = (decision: FacebookImageAttachFailureDecision) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        port.onMessage.removeListener(onMessage);
      } catch {
        // Listener cleanup is best-effort because the port may already be closed.
      }
      resolve(decision);
    };

    const onMessage = (message: unknown) => {
      if (!isFrontendFacebookImageAttachDecision(message)) return;
      if (message.requestId !== requestId) return;
      settle(message.decision);
    };

    port.onMessage.addListener(onMessage);
    postFrontendFacebookPortEvent(port, requestId, 'IMAGE_ATTACH_FAILED', {
      ...context,
      requestId,
    });
  });
}

function isFrontendFacebookImageAttachDecision(value: unknown): value is {
  type: typeof FRONTEND_FACEBOOK_IMAGE_ATTACH_DECISION;
  requestId: string;
  decision: FacebookImageAttachFailureDecision;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FRONTEND_FACEBOOK_IMAGE_ATTACH_DECISION
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && (
      (value as { decision?: unknown }).decision === 'SKIP'
      || (value as { decision?: unknown }).decision === 'POST_TEXT_ONLY'
    );
}
