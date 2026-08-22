/**
 * TopCV Login Service
 * Allows users to log in to TopCV directly from the side-panel without switching tabs.
 */

export interface TopCvLoginResult {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  userEmail?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
  error?: string;
}

const TOPCV_LOGIN_URL = 'https://tuyendung.topcv.vn/app/login';
const TOPCV_STORAGE_KEY_AUTH = 'topcv_saved_auth';

export async function loginTopCv(email: string, password: string): Promise<TopCvLoginResult> {
  if (!chrome.tabs || !chrome.scripting) {
    return { ok: false, error: 'Tiện ích không đủ quyền hạn (chrome.tabs/scripting).' };
  }

  // 1. Check if there is an existing TopCV tab, otherwise create a background inactive tab
  let targetTabId: number | null = null;
  let createdNewTab = false;

  try {
    const existingTabs = await chrome.tabs.query({ url: 'https://tuyendung.topcv.vn/*' });
    const activeTopCvTab = existingTabs.find((t) => t.id !== undefined);

    if (activeTopCvTab?.id) {
      targetTabId = activeTopCvTab.id;
    } else {
      const createdTab = await chrome.tabs.create({
        url: TOPCV_LOGIN_URL,
        active: false, // Inactive background tab - user stays in side-panel
      });
      targetTabId = createdTab.id ?? null;
      createdNewTab = true;
    }

    if (!targetTabId) {
      return { ok: false, error: 'Không thể khởi tạo tab ngầm để xác thực TopCV.' };
    }

    // 2. Wait for tab to finish loading
    await waitForTabComplete(targetTabId);

    // 3. Execute login script inside the TopCV page context
    const [execResult] = await chrome.scripting.executeScript<[string, string], TopCvLoginResult>({
      target: { tabId: targetTabId },
      world: 'MAIN',
      func: runTopCvLoginInPage,
      args: [email, password],
    });

    const result = execResult?.result ?? { ok: false, error: 'Không nhận được phản hồi từ TopCV.' };

    if (result.ok && result.accessToken) {
      // Store in extension local storage for future auto-refresh (including tracking headers)
      if (chrome.storage?.local) {
        await chrome.storage.local.set({
          [TOPCV_STORAGE_KEY_AUTH]: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            userEmail: email,
            updatedAt: Date.now(),
            taFp: result.taFp,
            taId: result.taId,
            taJr: result.taJr,
          },
        });
      }
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Lỗi đăng nhập TopCV: ${message}` };
  } finally {
    // Clean up background tab if we created it
    if (createdNewTab && targetTabId && chrome.tabs) {
      try {
        await chrome.tabs.remove(targetTabId);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export async function logoutTopCv(): Promise<void> {
  if (chrome.storage?.local) {
    await chrome.storage.local.remove(TOPCV_STORAGE_KEY_AUTH);
  }

  // Clear from active TopCV tabs if any
  if (chrome.tabs && chrome.scripting) {
    const existingTabs = await chrome.tabs.query({ url: 'https://tuyendung.topcv.vn/*' });
    for (const tab of existingTabs) {
      if (tab.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => {
              localStorage.removeItem('local_storage__token.refresh');
              localStorage.removeItem('local_storage__token.local');
              localStorage.removeItem('local_storage__refresh_token.refresh');
              localStorage.removeItem('local_storage__token_expiration.refresh');
            },
          });
        } catch {
          // Ignore
        }
      }
    }
  }
}

export async function getSavedTopCvAuth(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
}> {
  try {
    if (chrome.storage?.local) {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<
        string,
        { accessToken?: string; refreshToken?: string; userEmail?: string } | undefined
      >;
      const auth = data[TOPCV_STORAGE_KEY_AUTH];
      if (auth?.accessToken) {
        return {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken || null,
          userEmail: auth.userEmail || null,
        };
      }
    }
  } catch {
    // Ignore storage errors
  }

  return { accessToken: null, refreshToken: null, userEmail: null };
}


/**
 * Script executed directly inside the TopCV page context (https://tuyendung.topcv.vn)
 */
async function runTopCvLoginInPage(emailInputVal: string, passwordInputVal: string): Promise<TopCvLoginResult> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const setInputValue = (input: HTMLInputElement, value: string) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  try {
    const startTime = Date.now();
    let emailEl: HTMLInputElement | null = null;
    let passEl: HTMLInputElement | null = null;

    while (Date.now() - startTime < 8000) {
      emailEl = document.querySelector<HTMLInputElement>('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i], input[type="text"]');
      passEl = document.querySelector<HTMLInputElement>('input[type="password"], input[name="password"]');
      if (emailEl && passEl) break;
      await sleep(200);
    }

    if (!emailEl || !passEl) {
      return { ok: false, error: 'Không tìm thấy khung đăng nhập trên trang TopCV.' };
    }

    // Set credentials
    setInputValue(emailEl, emailInputVal);
    setInputValue(passEl, passwordInputVal);
    await sleep(200);

    // Click submit button
    const submitBtn = document.querySelector<HTMLButtonElement>('button[type="submit"], button.btn-login, button.btn-primary, button.btn-submit');
    if (submitBtn) {
      submitBtn.click();
    } else {
      emailEl.form?.submit();
    }

    // Poll localStorage and UI errors for up to 10 seconds
    const waitStartTime = Date.now();
    while (Date.now() - waitStartTime < 10000) {
      const accessToken = localStorage.getItem('local_storage__token.refresh') || localStorage.getItem('local_storage__token.local');
      const refreshToken = localStorage.getItem('local_storage__refresh_token.refresh');

      if (accessToken) {
        return {
          ok: true,
          accessToken,
          refreshToken: refreshToken || undefined,
          userEmail: emailInputVal,
          taFp: localStorage.getItem('_tafp') || undefined,
          taId: localStorage.getItem('_taid') || undefined,
          taJr: localStorage.getItem('_tajr') || undefined,
        };
      }

      // Check if error message appeared on screen
      const errorEl = document.querySelector<HTMLElement>('.alert-danger, .text-danger, .error-message, .error-feedback, .v-messages__message, .invalid-feedback');
      if (errorEl && errorEl.textContent?.trim()) {
        const text = errorEl.textContent.trim();
        if (text.length > 3 && !text.includes('placeholder')) {
          return { ok: false, error: text };
        }
      }

      await sleep(300);
    }

    return { ok: false, error: 'Đăng nhập TopCV quá thời gian chờ (Timeout). Vui lòng thử lại.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function waitForTabComplete(tabId: number, maxWaitMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      if (chrome.tabs) {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          return;
        }
      }
    } catch {
      // Tab may not exist yet or closed
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

