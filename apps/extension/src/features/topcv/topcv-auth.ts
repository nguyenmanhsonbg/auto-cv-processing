import { exchangeTopCvToken } from './topcv-api';

const TOPCV_API_BASE_URL = 'https://tuyendung-api.topcv.vn/api/v1';

export type TopCvAuthState = {
  ok: boolean;
  reason: 'READY' | 'TOPCV_TAB_NOT_FOUND' | 'TOKEN_MISSING' | 'TOKEN_EXPIRED' | 'CHECK_UNAVAILABLE';
  expiresAt?: number;
  userEmail?: string;
  companyName?: string;
};

const TOPCV_STORAGE_KEY_AUTH = 'topcv_saved_auth';
const ACCESS_TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// Cần lưu tracking headers để refresh token không cần mở tab TopCV
export interface TopCvAuthData {
  accessToken?: string;
  refreshToken?: string;
  cookieSession?: boolean;
  userEmail?: string;
  companyName?: string;
  updatedAt?: number;
  // Tracking headers cho exchange-token API
  taFp?: string;
  taId?: string;
  taJr?: string;
}

export async function checkTopCvAuth(options?: { allowProbeTab?: boolean }): Promise<TopCvAuthState> {
  const allowProbeTab = options?.allowProbeTab ?? false;
  // 1. Kiểm tra session đã lưu trong extension storage
  if (chrome.storage?.local) {
    try {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<
        string,
        TopCvAuthData | undefined
      >;
      const auth = data[TOPCV_STORAGE_KEY_AUTH];
      if (auth?.accessToken) {
        // Thử dùng token hiện có
        const isValid = await testTopCvToken(auth.accessToken);
        if (isValid && (!auth.refreshToken || !shouldRefreshAccessToken(auth.accessToken))) {
          return {
            ok: true,
            reason: 'READY',
            userEmail: auth.userEmail || auth.companyName || undefined,
            companyName: auth.companyName || undefined,
          };
        }
        // Token hết hạn → thử refresh
      }

      if (auth?.refreshToken) {
        const result = await exchangeTopCvToken(auth.refreshToken);
        if (result.reason === 'success' && result.token) {
          await chrome.storage.local.set({
            [TOPCV_STORAGE_KEY_AUTH]: {
              ...auth,
              accessToken: result.token,
              refreshToken: result.refreshToken || auth.refreshToken,
              updatedAt: Date.now(),
            },
          });
          return {
            ok: true,
            reason: 'READY',
            userEmail: auth.userEmail || auth.companyName || undefined,
            companyName: auth.companyName || undefined,
          };
        }
        // Refresh fail → thử đọc lại token tươi từ tab TopCV đang mở trước khi xóa
        if (result.reason === 'session_timeout') {
          const freshFromTab = await tryExtractFreshTokensFromTab();
          if (freshFromTab.accessToken || freshFromTab.refreshToken) {
            await saveTopCvAuthToStorage({
              accessToken: freshFromTab.accessToken || '',
              refreshToken: freshFromTab.refreshToken,
              userEmail: auth.userEmail,
              companyName: auth.companyName,
              taFp: freshFromTab.taFp,
              taId: freshFromTab.taId,
              taJr: freshFromTab.taJr,
            });
            return {
              ok: true,
              reason: 'READY',
              userEmail: auth.userEmail || auth.companyName || undefined,
              companyName: auth.companyName || undefined,
            };
          }
          await chrome.storage.local.remove(TOPCV_STORAGE_KEY_AUTH);
        } else if (result.reason === 'invalid_token') {
          await chrome.storage.local.remove(TOPCV_STORAGE_KEY_AUTH);
        }
      } else if (auth?.accessToken) {
        // Có accessToken nhưng hết hạn, không có refreshToken → xóa
        await chrome.storage.local.remove(TOPCV_STORAGE_KEY_AUTH);
      }
    } catch {
      // Fall through
    }
  }

  // 2. Tìm tab tuyendung.topcv.vn đang mở trên trình duyệt (nếu có)
  if (chrome.tabs && chrome.scripting) {
    try {
      const allTabs = await chrome.tabs.query({});
      const topCvTab = allTabs.find(
        (t) => t.id !== undefined && t.url && (t.url.includes('tuyendung.topcv.vn') || t.url.includes('topcv.vn'))
      );

      if (topCvTab?.id) {
        // Kiểm tra xem tab có đang ở trang dashboard (đã đăng nhập) không
        const isLoggedIn = await checkTabIsLoggedIn(topCvTab.id);
        if (!isLoggedIn) {
          // Tab đang ở trang login → không dùng được
          console.warn('TopCV tab is on login page');
        } else {
          const authFromTab = await extractAuthFromTab(topCvTab.id);
          if (authFromTab.ok && (authFromTab.accessToken || authFromTab.refreshToken)) {
            // Nếu chỉ có refreshToken, exchange trước
            let finalAccessToken = authFromTab.accessToken;
            let finalRefreshToken = authFromTab.refreshToken;
            if (
              authFromTab.refreshToken
              && (!finalAccessToken || shouldRefreshAccessToken(finalAccessToken))
            ) {
              const result = await exchangeTopCvToken(authFromTab.refreshToken);
              if (result.reason === 'success' && result.token) {
                finalAccessToken = result.token;
                finalRefreshToken = result.refreshToken || finalRefreshToken;
              } else {
                finalAccessToken = undefined;
              }
            }
            if (finalAccessToken) {
              await saveTopCvAuthToStorage({
                accessToken: finalAccessToken,
                refreshToken: finalRefreshToken,
                userEmail: authFromTab.userEmail,
                companyName: authFromTab.companyName,
                taFp: authFromTab.taFp,
                taId: authFromTab.taId,
                taJr: authFromTab.taJr,
              });
              return {
                ok: true,
                reason: 'READY',
                userEmail: authFromTab.userEmail || authFromTab.companyName,
                companyName: authFromTab.companyName,
              };
            }
          }

          const cookieSession = await checkTopCvCookieSession(topCvTab.id);
          if (cookieSession) {
            await saveTopCvAuthToStorage({
              accessToken: '',
              userEmail: cookieSession.userEmail,
              companyName: cookieSession.companyName,
              cookieSession: true,
            });
            return {
              ok: true,
              reason: 'READY',
              userEmail: cookieSession.userEmail,
              companyName: cookieSession.companyName,
            };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to extract from open TopCV tab:', err);
    }

    // 3. Tự probe tab mới để lấy token (mở /app/dashboard) nếu người dùng chủ động yêu cầu
    if (allowProbeTab) {
      try {
        const authFromBgProbe = await probeTopCvDashboard();
        if (authFromBgProbe.ok && authFromBgProbe.accessToken) {
          await saveTopCvAuthToStorage({
            accessToken: authFromBgProbe.accessToken,
            refreshToken: authFromBgProbe.refreshToken,
            userEmail: authFromBgProbe.userEmail,
            companyName: authFromBgProbe.companyName,
            taFp: authFromBgProbe.taFp,
            taId: authFromBgProbe.taId,
            taJr: authFromBgProbe.taJr,
          });
          return {
            ok: true,
            reason: 'READY',
            userEmail: authFromBgProbe.userEmail || authFromBgProbe.companyName,
            companyName: authFromBgProbe.companyName,
          };
        }
      } catch (err) {
        console.warn('Failed to probe TopCV dashboard:', err);
      }
    }
  }

  return { ok: false, reason: 'TOKEN_MISSING' };
}

// Test xem token có còn valid không
async function testTopCvToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${TOPCV_API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Origin: 'https://tuyendung.topcv.vn',
        Referer: 'https://tuyendung.topcv.vn/',
      },
    });

    // 200 = token valid
    if (response.ok) return true;

    // 401/403 hoặc SESSION_TIMEOUT = token hết hạn
    const body = await readResponseBody(response) as Record<string, unknown> | null;
    const errorName = (body?.error_name ?? '') as string;
    if (errorName === 'SESSION_TIMEOUT' || errorName.toUpperCase().includes('SESSION_TIMEOUT')) {
      return false;
    }

    // 429 = rate limit → vẫn coi như token valid, để retry sau
    if (response.status === 429) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// Kiểm tra xem tab TopCV có đang đăng nhập không (bằng cách kiểm tra URL)
async function checkTabIsLoggedIn(tabId: number): Promise<boolean> {
  try {
    if (!chrome.tabs) return false;
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';
    // Nếu URL chứa /login → chưa đăng nhập
    if (url.includes('/app/login') || url === 'https://tuyendung.topcv.vn/app/login') {
      return false;
    }
    // Ngược lại → có thể đã đăng nhập
    return true;
  } catch {
    return false;
  }
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function checkTopCvCookieSession(tabId: number): Promise<{
  userEmail?: string;
  companyName?: string;
} | null> {
  if (!chrome.scripting) return null;

  try {
    const [result] = await chrome.scripting.executeScript<[], {
      ok: boolean;
      userEmail?: string;
      companyName?: string;
    }>({
      target: { tabId },
      world: 'MAIN',
      func: async () => {
        try {
          const response = await fetch('https://tuyendung-api.topcv.vn/api/v1/auth/me', {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) return { ok: false };
          const body = await response.json() as { data?: { email?: string; company_name?: string } };
          return {
            ok: true,
            userEmail: body.data?.email,
            companyName: body.data?.company_name,
          };
        } catch {
          return { ok: false };
        }
      },
    });

    return result?.result?.ok ? result.result : null;
  } catch {
    return null;
  }
}

async function extractAuthFromTab(tabId: number): Promise<{
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  userEmail?: string;
  companyName?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
}> {
  if (!chrome.scripting) return { ok: false };

  // Thử cả 2 chế độ ISOLATED và MAIN để đảm bảo không bị chặn bởi CSP
  for (const world of ['ISOLATED', 'MAIN'] as const) {
    try {
      const [result] = await chrome.scripting.executeScript<
        [],
        {
          ok: boolean;
          accessToken?: string;
          refreshToken?: string;
          userEmail?: string;
          companyName?: string;
          taFp?: string;
          taId?: string;
          taJr?: string;
        }
      >({
        target: { tabId },
        world,
        func: inspectTopCvLocalStorage,
      });

      const res = result?.result;
      if (res?.ok && (res.accessToken || res.refreshToken)) {
        // Token đã có sẵn → dùng trực tiếp, không cần exchange
        return {
          ok: true,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          userEmail: res.userEmail,
          companyName: res.companyName,
          taFp: res.taFp,
          taId: res.taId,
          taJr: res.taJr,
        };
      }
    } catch (e) {
      console.warn(`ExecuteScript in ${world} failed:`, e);
    }
  }
  return { ok: false };
}

let probePromise: Promise<{
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  userEmail?: string;
  companyName?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
}> | null = null;

async function probeTopCvDashboard(): Promise<{
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  userEmail?: string;
  companyName?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
}> {
  if (probePromise) {
    return probePromise;
  }

  probePromise = (async () => {
    if (!chrome.tabs || !chrome.scripting) return { ok: false };

    try {
      const allTabs = await chrome.tabs.query({});
      const existingTab = allTabs.find(
        (t) => t.id !== undefined && t.url && (t.url.includes('tuyendung.topcv.vn') || t.url.includes('topcv.vn'))
      );

      if (existingTab?.id) {
        return await extractAuthFromTab(existingTab.id);
      }
    } catch {
      // Fall through to open tab if query fails
    }

    let tabId: number | undefined;
    try {
      const tab = await chrome.tabs.create({
        url: 'https://tuyendung.topcv.vn/app/dashboard',
        active: false,
      });
      tabId = tab.id;
      if (!tabId) return { ok: false };

      // Đợi tab ngầm tải xong (tối đa 3.5 giây)
      await waitForTabComplete(tabId, 3500);

      // Kiểm tra xem tab có bị redirect về login không
      const finalTab = await chrome.tabs.get(tabId);
      if (finalTab.url?.includes('/app/login')) {
        // Bị redirect về login → user chưa đăng nhập
        return { ok: false };
      }

      return await extractAuthFromTab(tabId);
    } catch (err) {
      console.warn('probeTopCvDashboard error:', err);
      return { ok: false };
    } finally {
      if (tabId && chrome.tabs) {
        try {
          await chrome.tabs.remove(tabId);
        } catch {
          // Ignore cleanup
        }
      }
    }
  })();

  try {
    return await probePromise;
  } finally {
    probePromise = null;
  }
}

async function waitForTabComplete(tabId: number, maxWaitMs = 3500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      if (chrome.tabs) {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          await new Promise((r) => setTimeout(r, 300));
          return;
        }
      }
    } catch {
      // Ignore
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function saveTopCvAuthToStorage(auth: {
  accessToken: string;
  refreshToken?: string;
  cookieSession?: boolean;
  userEmail?: string;
  companyName?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
}) {
  if (chrome.storage?.local) {
    // Lấy tracking headers cũ nếu không có headers mới
    const existing = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<string, TopCvAuthData>;
    const currentAuth = existing[TOPCV_STORAGE_KEY_AUTH];

    await chrome.storage.local.set({
      [TOPCV_STORAGE_KEY_AUTH]: {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        cookieSession: auth.cookieSession,
        userEmail: auth.userEmail || currentAuth?.userEmail,
        companyName: auth.companyName || currentAuth?.companyName,
        updatedAt: Date.now(),
        // Lưu tracking headers để refresh không cần mở tab TopCV
        taFp: auth.taFp || currentAuth?.taFp,
        taId: auth.taId || currentAuth?.taId,
        taJr: auth.taJr || currentAuth?.taJr,
      },
    });
  }
}

// Thử đọc token tươi từ tab TopCV đang mở (dùng khi refresh thất bại)
async function tryExtractFreshTokensFromTab(): Promise<{
  accessToken?: string;
  refreshToken?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
}> {
  if (!chrome.tabs || !chrome.scripting) return {};

  try {
    const allTabs = await chrome.tabs.query({});
    const topCvTab = allTabs.find(
      (t) =>
        t.id !== undefined &&
        t.url &&
        (t.url.includes('tuyendung.topcv.vn') || t.url.includes('topcv.vn'))
    );
    if (!topCvTab?.id) return {};

    // Bỏ qua tab login
    if (topCvTab.url?.includes('/app/login')) return {};

    // Lấy token từ tab
    for (const world of ['ISOLATED', 'MAIN'] as const) {
      try {
        const [result] = await chrome.scripting.executeScript<
          [],
          { accessToken: string | null; refreshToken: string | null; taFp: string | null; taId: string | null; taJr: string | null }
        >({
          target: { tabId: topCvTab.id },
          world,
          func: () => ({
            accessToken: localStorage.getItem('local_storage__token.refresh')
              ?? localStorage.getItem('local_storage__token.local')
              ?? localStorage.getItem('auth._token.local'),
            refreshToken: localStorage.getItem('local_storage__refresh_token.refresh'),
            taFp: localStorage.getItem('_tafp'),
            taId: localStorage.getItem('_taid'),
            taJr: localStorage.getItem('_tajr'),
          }),
        });

        const r = result?.result;
        if (r?.accessToken || r?.refreshToken) {
          return {
            accessToken: r.accessToken ?? undefined,
            refreshToken: r.refreshToken ?? undefined,
            taFp: r.taFp ?? undefined,
            taId: r.taId ?? undefined,
            taJr: r.taJr ?? undefined,
          };
        }
      } catch {
        // continue to next world
      }
    }
  } catch {
    // Ignore
  }
  return {};
}

function inspectTopCvLocalStorage(): {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  userEmail?: string;
  companyName?: string;
  taFp?: string;
  taId?: string;
  taJr?: string;
} {
  const readKey = (k: string) => {
    try {
      const v = localStorage.getItem(k);
      if (v && v !== 'null' && v !== 'undefined' && v !== 'false') return v;
    } catch {}
    try {
      const v = sessionStorage.getItem(k);
      if (v && v !== 'null' && v !== 'undefined' && v !== 'false') return v;
    } catch {}
    return null;
  };

  // 1. Đọc chính xác bộ key của tuyendung.topcv.vn
  const rawToken = readKey('local_storage__token.refresh')
    || readKey('local_storage_employer_access_token_local')
    || readKey('local_storage__token.local')
    || readKey('auth._token.refresh')
    || readKey('auth._token.local');

  const rawRefreshToken = readKey('local_storage__refresh_token.refresh')
    || readKey('local_storage__refresh_token.local')
    || readKey('auth._refresh_token.refresh');

  let cleanToken: string | undefined;
  if (rawToken) {
    cleanToken = rawToken.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
  }

  let cleanRefreshToken: string | undefined;
  if (rawRefreshToken) {
    cleanRefreshToken = rawRefreshToken.replace(/^["']|["']$/g, '').trim();
  }

  // Nếu chưa có, quét qua toàn bộ localStorage tìm JWT token
  if (!cleanToken) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const val = localStorage.getItem(k);
        if (!val) continue;
        if (val.includes('eyJ') && val.split('.').length === 3) {
          cleanToken = val.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
          break;
        }
      }
    } catch {}
  }

  if (!cleanToken && !cleanRefreshToken) {
    return { ok: false };
  }

  // 2. Trích xuất tên công ty từ DOM của trang TopCV đang mở (như .user-info .user-name a)
  let companyName: string | undefined;
  try {
    const companyEl = document.querySelector<HTMLElement>(
      '.user-info .user-name a, .user-info .user-name, .sidebar-header .user-name a, .sidebar-header .user-name, .user-name a, .user-name'
    );
    if (companyEl && companyEl.textContent) {
      const text = companyEl.textContent.replace(/\s+/g, ' ').trim();
      if (text && text.length > 1) {
        companyName = text;
      }
    }
  } catch {}

  // 3. Nếu chưa có từ DOM, thử đọc từ Nuxt.js State (window.__NUXT__)
  if (!companyName) {
    try {
      const win = window as unknown as {
        __NUXT__?: {
          state?: {
            auth?: {
              user?: {
                company_name?: string;
                company?: { name?: string };
                name?: string;
              };
            };
          };
        };
      };
      const nuxtUser = win.__NUXT__?.state?.auth?.user;
      companyName = nuxtUser?.company_name || nuxtUser?.company?.name || nuxtUser?.name;
    } catch {}
  }

  // 4. Lấy email / username / tên tài khoản từ JWT payload
  let userEmail: string | undefined;
  if (cleanToken) {
    try {
      const parts = cleanToken.split('.');
      if (parts.length === 3) {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(decodeURIComponent(escape(atob(payloadBase64)))) as {
          email?: string;
          user_email?: string;
          username?: string;
          name?: string;
          sub?: string;
        };
        userEmail = payload.email || payload.user_email || payload.username || payload.name;
      }
    } catch {}
  }

  if (!userEmail) {
    const userKeys = [
      'local_storage__user.refresh',
      'local_storage__user.local',
      'auth.user',
      'user',
      'profile',
    ];
    for (const key of userKeys) {
      const val = readKey(key);
      if (val) {
        try {
          const parsed = JSON.parse(val) as { email?: string; name?: string; username?: string; company_name?: string };
          if (!companyName && parsed.company_name) {
            companyName = parsed.company_name;
          }
          userEmail = parsed.email || parsed.name || parsed.company_name || parsed.username;
          if (userEmail) break;
        } catch {}
      }
    }
  }

  // Đọc tracking headers cho exchange-token API
  const taFp = readKey('_tafp') || undefined;
  const taId = readKey('_taid') || undefined;
  const taJr = readKey('_tajr') || undefined;

  return {
    ok: true,
    accessToken: cleanToken,
    refreshToken: cleanRefreshToken,
    userEmail: companyName || userEmail || 'Nhà tuyển dụng TopCV',
    companyName: companyName || undefined,
    taFp,
    taId,
    taJr,
  };
}

function shouldRefreshAccessToken(accessToken: string): boolean {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return false;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = atob(normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '='));
    const parsedPayload = JSON.parse(decodedPayload) as { exp?: unknown };
    return typeof parsedPayload.exp === 'number'
      && parsedPayload.exp * 1000 - Date.now() <= ACCESS_TOKEN_REFRESH_THRESHOLD_MS;
  } catch {
    return false;
  }
}


