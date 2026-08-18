const ACCESS_TOKEN_KEY = 'vcs_extension_access_token';
const REFRESH_TOKEN_KEY = 'vcs_extension_refresh_token';
const REMEMBERED_REFRESH_TOKEN_KEY = 'vcs_extension_remembered_refresh_token';

let memoryToken: string | null = null;
let memoryRefreshToken: string | null = null;
let storageChangeListenerInstalled = false;

export interface AuthTokenSnapshot {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface SetAuthTokensOptions {
  rememberMe?: boolean;
}

type AuthTokenChangeListener = (tokens: AuthTokenSnapshot) => void;

const authTokenChangeListeners = new Set<AuthTokenChangeListener>();

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
  if (storage) {
    await storage.set({ [ACCESS_TOKEN_KEY]: token });
  }
  notifyAuthTokenChange();
}

export async function getRefreshToken(): Promise<string | null> {
  const storage = chrome.storage?.session;
  if (storage) {
    const result = await storage.get(REFRESH_TOKEN_KEY);
    const token = result[REFRESH_TOKEN_KEY];
    if (typeof token === 'string' && token) return token;
  }

  const localStorage = chrome.storage?.local;
  if (localStorage) {
    const result = await localStorage.get(REMEMBERED_REFRESH_TOKEN_KEY);
    const token = result[REMEMBERED_REFRESH_TOKEN_KEY];
    if (typeof token === 'string' && token) return token;
  }

  return memoryRefreshToken;
}

export async function setRefreshToken(token: string): Promise<void> {
  memoryRefreshToken = token;
  const storage = chrome.storage?.session;
  if (storage) {
    await storage.set({ [REFRESH_TOKEN_KEY]: token });
  }
  notifyAuthTokenChange();
}

export async function setAuthTokens(
  tokens: { accessToken: string; refreshToken: string },
  options: SetAuthTokensOptions = {},
): Promise<void> {
  memoryToken = tokens.accessToken;
  memoryRefreshToken = tokens.refreshToken;
  const sessionStorage = chrome.storage?.session;
  if (sessionStorage) {
    await sessionStorage.set({
      [ACCESS_TOKEN_KEY]: tokens.accessToken,
      [REFRESH_TOKEN_KEY]: tokens.refreshToken,
    });
  }

  const localStorage = chrome.storage?.local;
  if (localStorage) {
    const rememberMe = options.rememberMe ?? await hasRememberedRefreshToken();
    if (rememberMe) {
      await localStorage.set({ [REMEMBERED_REFRESH_TOKEN_KEY]: tokens.refreshToken });
    } else {
      await localStorage.remove(REMEMBERED_REFRESH_TOKEN_KEY);
    }
  }
  notifyAuthTokenChange();
}

export async function clearAccessToken(): Promise<void> {
  memoryToken = null;
  memoryRefreshToken = null;
  const sessionStorage = chrome.storage?.session;
  if (sessionStorage) {
    await sessionStorage.remove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  }
  const localStorage = chrome.storage?.local;
  if (localStorage) {
    await localStorage.remove(REMEMBERED_REFRESH_TOKEN_KEY);
  }
  notifyAuthTokenChange();
}

async function hasRememberedRefreshToken(): Promise<boolean> {
  const storage = chrome.storage?.local;
  if (!storage) return false;

  const result = await storage.get(REMEMBERED_REFRESH_TOKEN_KEY);
  const token = result[REMEMBERED_REFRESH_TOKEN_KEY];
  return typeof token === 'string' && Boolean(token);
}

const SAVED_CREDENTIALS_KEY = 'vcs_extension_saved_credentials';

export interface SavedCredentials {
  login: string;
  password: string;
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  const storage = chrome.storage?.local;
  if (!storage) {
    try {
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      return raw ? (JSON.parse(raw) as SavedCredentials) : null;
    } catch {
      return null;
    }
  }

  const result = await storage.get(SAVED_CREDENTIALS_KEY);
  const data = result[SAVED_CREDENTIALS_KEY] as Record<string, unknown> | undefined;
  if (data && typeof data.login === 'string' && typeof data.password === 'string') {
    return {
      login: data.login,
      password: data.password,
    };
  }
  return null;
}

export async function saveCredentials(credentials: SavedCredentials): Promise<void> {
  const storage = chrome.storage?.local;
  if (storage) {
    await storage.set({ [SAVED_CREDENTIALS_KEY]: credentials });
  } else {
    try {
      localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(credentials));
    } catch {}
  }
}

export async function clearSavedCredentials(): Promise<void> {
  const storage = chrome.storage?.local;
  if (storage) {
    await storage.remove(SAVED_CREDENTIALS_KEY);
  } else {
    try {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    } catch {}
  }
}

export function subscribeAuthTokenChanges(listener: AuthTokenChangeListener) {
  authTokenChangeListeners.add(listener);
  installStorageChangeListener();

  return () => {
    authTokenChangeListeners.delete(listener);
  };
}

function notifyAuthTokenChange(tokens: AuthTokenSnapshot = {
  accessToken: memoryToken,
  refreshToken: memoryRefreshToken,
}) {
  authTokenChangeListeners.forEach((listener) => listener(tokens));
}

function installStorageChangeListener() {
  if (storageChangeListenerInstalled || !chrome.storage?.onChanged) return;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      (areaName !== 'session' && areaName !== 'local')
      || (
        !(ACCESS_TOKEN_KEY in changes)
        && !(REFRESH_TOKEN_KEY in changes)
        && !(REMEMBERED_REFRESH_TOKEN_KEY in changes)
      )
    ) {
      return;
    }

    void readStoredAuthTokens().then((tokens) => {
      memoryToken = tokens.accessToken;
      memoryRefreshToken = tokens.refreshToken;
      notifyAuthTokenChange(tokens);
    });
  });

  storageChangeListenerInstalled = true;
}

async function readStoredAuthTokens(): Promise<AuthTokenSnapshot> {
  return {
    accessToken: await getAccessToken(),
    refreshToken: await getRefreshToken(),
  };
}
