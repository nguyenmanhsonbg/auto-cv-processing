const ACTIVE_FACEBOOK_ACCOUNT_ID_KEY = 'vcs:active-facebook-account-id';

function normalizeFacebookAccountId(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export async function getActiveFacebookAccountId(): Promise<string | null> {
  const values = await chrome.storage?.local?.get(
    ACTIVE_FACEBOOK_ACCOUNT_ID_KEY,
  );

  return normalizeFacebookAccountId(
    values?.[ACTIVE_FACEBOOK_ACCOUNT_ID_KEY],
  );
}

export async function setActiveFacebookAccountId(
  accountId: string | null | undefined,
): Promise<void> {
  const normalizedAccountId = normalizeFacebookAccountId(accountId);

  if (normalizedAccountId) {
    await chrome.storage?.local?.set({
      [ACTIVE_FACEBOOK_ACCOUNT_ID_KEY]: normalizedAccountId,
    });
    return;
  }

  await chrome.storage?.local?.remove(
    ACTIVE_FACEBOOK_ACCOUNT_ID_KEY,
  );
}

export async function clearActiveFacebookAccountId(): Promise<void> {
  await chrome.storage?.local?.remove(
    ACTIVE_FACEBOOK_ACCOUNT_ID_KEY,
  );
}