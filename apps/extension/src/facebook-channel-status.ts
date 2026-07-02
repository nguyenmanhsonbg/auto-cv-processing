import type { ExtensionSyncResponse, FacebookPublishResultPayload } from './types';

export function updateFacebookChannelStatus(
  response: ExtensionSyncResponse,
  facebookResults: FacebookPublishResultPayload[],
): ExtensionSyncResponse {
  const successCount = facebookResults.filter((item) => item.status === 'SUCCESS').length;
  const failedCount = facebookResults.filter((item) => item.status === 'FAILED').length;
  const skippedCount = facebookResults.filter((item) => item.status === 'SKIPPED').length;
  const status = successCount === facebookResults.length && facebookResults.length > 0
    ? 'PUBLISHED'
    : successCount > 0
      ? 'UPDATED'
      : 'PUBLISH_FAILED';
  const message = successCount > 0
    ? `Facebook published ${successCount}/${facebookResults.length} target(s).`
    : `Facebook publish failed for ${failedCount} target(s), skipped ${skippedCount}.`;

  return {
    ...response,
    channelPostings: response.channelPostings.map((channel) => (
      channel.channel === 'FACEBOOK'
        ? {
            ...channel,
            status,
            errorCode: successCount > 0 ? null : 'FACEBOOK_PUBLISH_FAILED',
            manualActionRequired: successCount === 0,
            message,
            lastSyncAt: new Date().toISOString(),
          }
        : channel
    )),
  };
}
