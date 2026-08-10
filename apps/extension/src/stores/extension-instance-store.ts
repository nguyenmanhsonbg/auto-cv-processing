const INSTALL_ID_KEY = 'vcs_extension_install_id';
const INSTANCE_ID_KEY = 'vcs_extension_instance_id';

let memoryInstallId: string | null = null;
let memoryInstanceId: string | null = null;

export async function getOrCreateInstallId(): Promise<string> {
  const existing = await getInstallId();
  if (existing) return existing;

  const installId = newId();
  memoryInstallId = installId;
  const storage = chrome.storage?.local;
  if (storage) {
    await storage.set({ [INSTALL_ID_KEY]: installId });
  }
  return installId;
}

export async function getInstallId(): Promise<string | null> {
  const storage = chrome.storage?.local;
  if (!storage) return memoryInstallId;

  const result = await storage.get(INSTALL_ID_KEY);
  const installId = result[INSTALL_ID_KEY];
  return typeof installId === 'string' && installId ? installId : null;
}

export async function getExtensionInstanceId(): Promise<string | null> {
  const storage = chrome.storage?.local;
  if (!storage) return memoryInstanceId;

  const result = await storage.get(INSTANCE_ID_KEY);
  const instanceId = result[INSTANCE_ID_KEY];
  return typeof instanceId === 'string' && instanceId ? instanceId : null;
}

export async function setExtensionInstanceId(instanceId: string): Promise<void> {
  memoryInstanceId = instanceId;
  const storage = chrome.storage?.local;
  if (storage) {
    await storage.set({ [INSTANCE_ID_KEY]: instanceId });
  }
}

export async function clearExtensionInstanceId(): Promise<void> {
  memoryInstanceId = null;
  const storage = chrome.storage?.local;
  if (storage) {
    await storage.remove(INSTANCE_ID_KEY);
  }
}

export function getExtensionInstanceMetadata() {
  const browser = detectBrowser();

  return {
    browser: browser.key,
    platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

export function getExtensionDisplayName() {
  return detectBrowser().displayName;
}

function detectBrowser() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (/\bEdg(A|iOS)?\//.test(userAgent)) {
    return { key: 'edge', displayName: 'Edge Extension' };
  }

  if (/\bChrome\//.test(userAgent) || /\bCriOS\//.test(userAgent)) {
    return { key: 'chrome', displayName: 'Chrome Extension' };
  }

  return { key: 'unknown', displayName: 'Browser Extension' };
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `ext-install-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
