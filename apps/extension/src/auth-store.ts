const ACCESS_TOKEN_KEY = 'vcs_extension_access_token';
const REFRESH_TOKEN_KEY = 'vcs_extension_refresh_token';

let memoryToken: string | null = null;
let memoryRefreshToken: string | null = null;

export async function getAccessToken(): Promise<string | null> {
  const storage = chrome.storage?.session;
  if (!storage) return memoryToken;

  const result = await storage.get(ACCESS_TOKEN_KEY);
  const token = result[ACCESS_TOKEN_KEY];
  return typeof token === 'string' && token ? token : null;
}

export async function setAccessToken(token: string): Promise<void> {
  memoryToken = token;
  const storage = chrome.storage?.session;
  if (!storage) return;
  await storage.set({ [ACCESS_TOKEN_KEY]: token });
}

export async function getRefreshToken(): Promise<string | null> {
  const storage = chrome.storage?.session;
  if (!storage) return memoryRefreshToken;

  const result = await storage.get(REFRESH_TOKEN_KEY);
  const token = result[REFRESH_TOKEN_KEY];
  return typeof token === 'string' && token ? token : null;
}

export async function setRefreshToken(token: string): Promise<void> {
  memoryRefreshToken = token;
  const storage = chrome.storage?.session;
  if (!storage) return;
  await storage.set({ [REFRESH_TOKEN_KEY]: token });
}

export async function setAuthTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
  memoryToken = tokens.accessToken;
  memoryRefreshToken = tokens.refreshToken;
  const storage = chrome.storage?.session;
  if (!storage) return;
  await storage.set({
    [ACCESS_TOKEN_KEY]: tokens.accessToken,
    [REFRESH_TOKEN_KEY]: tokens.refreshToken,
  });
}

export async function clearAccessToken(): Promise<void> {
  memoryToken = null;
  memoryRefreshToken = null;
  const storage = chrome.storage?.session;
  if (!storage) return;
  await storage.remove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}
