const ACTIVE_FACEBOOK_ACCOUNT_ID_KEY = 'vcs:active-facebook-account-id';

export async function getActiveFacebookAccountId(): Promise<string | null> {
  const values = await chrome.storage?.local?.get(ACTIVE_FACEBOOK_ACCOUNT_ID_KEY);
  const value = values?.[ACTIVE_FACEBOOK_ACCOUNT_ID_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function setActiveFacebookAccountId(accountId: string | null) {
  if (accountId?.trim()) {
    await chrome.storage?.local?.set({ [ACTIVE_FACEBOOK_ACCOUNT_ID_KEY]: accountId.trim() });
    return;
  }
  await chrome.storage?.local?.remove(ACTIVE_FACEBOOK_ACCOUNT_ID_KEY);
}
