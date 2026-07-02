const SELECTED_FACEBOOK_GROUP_IDS_KEY = 'vcs:selected-facebook-group-ids';

export async function getSelectedFacebookGroupIds(): Promise<string[]> {
  const values = await chrome.storage?.session?.get(SELECTED_FACEBOOK_GROUP_IDS_KEY);
  const targetIds = values?.[SELECTED_FACEBOOK_GROUP_IDS_KEY];
  return isStringArray(targetIds) ? targetIds : [];
}

export async function setSelectedFacebookGroupIds(targetIds: string[]) {
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
