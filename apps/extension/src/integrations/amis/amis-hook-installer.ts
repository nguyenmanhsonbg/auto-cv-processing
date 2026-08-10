export interface AmisHookInstallResult {
  status: 'INJECTED' | 'SKIPPED' | 'UNAVAILABLE';
  message: string;
  tabUrl?: string;
}

export async function ensureAmisHooksInActiveTab(): Promise<AmisHookInstallResult> {
  if (!chrome.tabs || !chrome.scripting) {
    return {
      status: 'UNAVAILABLE',
      message: 'Chrome tabs/scripting API is unavailable.',
    };
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return {
      status: 'SKIPPED',
      message: 'No active tab found.',
    };
  }

  if (!isAmisUrl(activeTab.url)) {
    return {
      status: 'SKIPPED',
      message: 'Active tab is not an AMIS recruitment page.',
      tabUrl: activeTab.url,
    };
  }

  // The page hook must run in AMIS's main world so it can observe the page's
  // XHR/fetch calls. The bridge remains isolated and relays those events to
  // the extension service worker.
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-page-hook.js'],
    world: 'MAIN',
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-source-column.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-bridge.js'],
  });

  return {
    status: 'INJECTED',
    message: 'AMIS page hook and bridge are active in the current tab.',
    tabUrl: activeTab.url,
  };
}

function isAmisUrl(value: string | undefined) {
  if (!value) return false;

  try {
    return new URL(value).hostname === 'amisapp.misa.vn';
  } catch {
    return false;
  }
}
