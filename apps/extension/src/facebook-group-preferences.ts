const SELECTED_FACEBOOK_GROUP_IDS_KEY = 'vcs:selected-facebook-group-ids';
const SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY = 'vcs:selected-facebook-group-ids-by-account';

export async function getSelectedFacebookGroupIds(facebookAccountId?: string | null): Promise<string[]> {
  if (facebookAccountId) {
    const values = await chrome.storage?.session?.get(SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY);
    const stored = values?.[SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY];
    if (!isStringMap(stored)) return [];
    return isStringArray(stored[facebookAccountId]) ? stored[facebookAccountId] : [];
  }

  const values = await chrome.storage?.session?.get(SELECTED_FACEBOOK_GROUP_IDS_KEY);
  const targetIds = values?.[SELECTED_FACEBOOK_GROUP_IDS_KEY];
  return isStringArray(targetIds) ? targetIds : [];
}

export async function setSelectedFacebookGroupIds(targetIds: string[], facebookAccountId?: string | null) {
  if (facebookAccountId) {
    const values = await chrome.storage?.session?.get(SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY);
    const stored = isStringMap(values?.[SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY])
      ? values[SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY]
      : {};
    await chrome.storage?.session?.set({
      [SELECTED_FACEBOOK_GROUP_IDS_BY_ACCOUNT_KEY]: {
        ...stored,
        [facebookAccountId]: uniqueStrings(targetIds),
      },
    });
    return;
  }

  await chrome.storage?.session?.set({
    [SELECTED_FACEBOOK_GROUP_IDS_KEY]: uniqueStrings(targetIds),
  });
}

function uniqueStrings(value: string[]) {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringMap(value: unknown): value is Record<string, string[]> {
  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((item) => isStringArray(item));
}
