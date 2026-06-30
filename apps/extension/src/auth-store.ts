const ACCESS_TOKEN_KEY = 'vcs_extension_access_token';

let memoryToken: string | null = null;

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

export async function clearAccessToken(): Promise<void> {
  memoryToken = null;
  const storage = chrome.storage?.session;
  if (!storage) return;
  await storage.remove(ACCESS_TOKEN_KEY);
}
