import type { FacebookPublishProgress } from './types';

const LAST_FACEBOOK_PUBLISH_PROGRESS_KEY = 'vcs:last-facebook-publish-progress';

export async function saveLastFacebookPublishProgress(progress: FacebookPublishProgress) {
  await chrome.storage?.session?.set({
    [LAST_FACEBOOK_PUBLISH_PROGRESS_KEY]: progress,
  });
}

export async function getLastFacebookPublishProgress() {
  const values = await chrome.storage?.session?.get(LAST_FACEBOOK_PUBLISH_PROGRESS_KEY);
  const progress = values?.[LAST_FACEBOOK_PUBLISH_PROGRESS_KEY];
  return isFacebookPublishProgress(progress) ? progress : null;
}

function isFacebookPublishProgress(value: unknown): value is FacebookPublishProgress {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { status?: unknown }).status === 'string'
    && typeof (value as { currentIndex?: unknown }).currentIndex === 'number'
    && typeof (value as { total?: unknown }).total === 'number'
    && typeof (value as { message?: unknown }).message === 'string'
    && Array.isArray((value as { results?: unknown }).results);
}
