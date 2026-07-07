import type {
  ExtensionSyncResponse,
  FacebookPublishProgressStatus,
  FacebookPublishResultPayload,
} from './types';

export interface FacebookPublishSummary {
  total: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  progressStatus: FacebookPublishProgressStatus;
  channelStatus: 'PUBLISHED' | 'UPDATED' | 'PUBLISH_FAILED';
  message: string;
  errorCode: string | null;
  manualActionRequired: boolean;
}

export function summarizeFacebookPublishResults(
  facebookResults: FacebookPublishResultPayload[],
): FacebookPublishSummary {
  const total = facebookResults.length;
  const successCount = facebookResults.filter((item) => item.status === 'SUCCESS').length;
  const failedCount = facebookResults.filter((item) => item.status === 'FAILED').length;
  const skippedCount = facebookResults.filter((item) => item.status === 'SKIPPED').length;
  const pendingReviewCount = facebookResults.filter((item) => item.facebookReviewStatus === 'PENDING_REVIEW').length;
  const successVerb = pendingReviewCount > 0 ? 'submitted' : 'published';
  const allSucceeded = successCount === total && total > 0;
  const partiallySucceeded = successCount > 0 && successCount < total;

  if (allSucceeded) {
    return {
      total,
      successCount,
      failedCount,
      skippedCount,
      progressStatus: 'SUCCESS',
      channelStatus: 'PUBLISHED',
      message: `Facebook ${successVerb} ${successCount}/${total} target(s).`,
      errorCode: null,
      manualActionRequired: false,
    };
  }

  if (partiallySucceeded) {
    return {
      total,
      successCount,
      failedCount,
      skippedCount,
      progressStatus: 'PARTIAL_SUCCESS',
      channelStatus: 'UPDATED',
      message: `Facebook ${successVerb} ${successCount}/${total} target(s); ${failedCount} failed, ${skippedCount} skipped.`,
      errorCode: null,
      manualActionRequired: false,
    };
  }

  return {
    total,
    successCount,
    failedCount,
    skippedCount,
    progressStatus: 'ERROR',
    channelStatus: 'PUBLISH_FAILED',
    message: `Facebook submitted 0/${total} target(s); ${failedCount} failed, ${skippedCount} skipped.`,
    errorCode: 'FACEBOOK_PUBLISH_FAILED',
    manualActionRequired: true,
  };
}

export function updateFacebookChannelStatus(
  response: ExtensionSyncResponse,
  facebookResults: FacebookPublishResultPayload[],
): ExtensionSyncResponse {
  const summary = summarizeFacebookPublishResults(facebookResults);

  return {
    ...response,
    channelPostings: response.channelPostings.map((channel) => (
      channel.channel === 'FACEBOOK'
        ? {
            ...channel,
            status: summary.channelStatus,
            errorCode: summary.errorCode,
            manualActionRequired: summary.manualActionRequired,
            message: summary.message,
            lastSyncAt: new Date().toISOString(),
          }
        : channel
    )),
  };
}
