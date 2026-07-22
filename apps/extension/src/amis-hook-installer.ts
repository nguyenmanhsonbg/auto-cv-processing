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

  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-source-column.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-bridge.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['assets/amis-page-hook.js'],
    world: 'MAIN',
  });

  return {
    status: 'INJECTED',
    message: 'AMIS bridge and SaveRecruitment hook are active in the current tab.',
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
