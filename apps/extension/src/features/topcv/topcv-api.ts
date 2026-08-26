import { checkTopCvAuth } from './topcv-auth';
import type { TopCvFormData } from './topcv-form.types';

// Transform TopCV form data to API payload
export function transformTopCvPayload(formData: TopCvFormData): Record<string, unknown> {
  // Helper để wrap text thành HTML paragraphs
  const toHtmlParagraphs = (text: string): string => {
    if (!text.trim()) return '<p></p>';
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '<p></p>';
    return lines.map(line => `<p>${line.trim()}</p>`).join('');
  };

  const employee_level = formData.employeeLevel === '' ? 1 : formData.employeeLevel;

  // experience is already in "X-Y" format from SelectFilter options
  const experience = formData.experience || '0-0';

  // education is already a number from TopCV options API
  const education = typeof formData.education === 'number' ? formData.education : 5;

  // Map salary_type: 'range' → 1, 'negotiable' → ?
  const salary_type = formData.salaryType === 'negotiable' ? 2 : 1;

  const working_methods = formData.workingType.length > 0 ? formData.workingType : [1];

  // Transform locations - giữ nguyên format từ TopCvLocationPicker
  // NOTE: id field cần giữ nguyên từ TopCV API, không generate local id
  const locations = formData.locations.length > 0 ? formData.locations.map((loc) => ({
    province_id: loc.province_id,
    province_name: loc.province_name,
    addresses: loc.addresses.map((addr) => ({
      district_id: addr.district_id,
      district_name: addr.district_name,
      working_address: addr.working_address,
    })),
    // id được set từ TopCvLocationPicker
    id: loc.id,
  })) : [{
    province_id: 1,
    province_name: 'Hà Nội',
    addresses: [],
    id: 'TjIPX',
  }];

  return {
    // Title & basic info
    title: formData.title,
    type: formData.jobType === '' ? 11 : formData.jobType,
    salary_level: 1,
    salary_from: formData.salaryFrom || 0,
    salary_to: formData.salaryTo || 0,
    salary_currency: formData.salaryCurrency || 'VND',
    salary_type,
    quantity: formData.quantity || 1,

    // Job details
    description: '', // Trống theo format mới
    job_description: toHtmlParagraphs(formData.jobDescription),
    job_requirement: toHtmlParagraphs(formData.jobRequirement),
    job_benefit: toHtmlParagraphs(formData.jobBenefit),

    // Requirements
    employee_level,
    experience,
    education,
    gender: formData.gender || null,
    required_skills: formData.requiredSkills.map((s) => s.label),
    should_have_skills: formData.preferredSkills.map((s) => s.label),

    // Location & working time
    locations,
    working_time: {
      working_time_settings: formData.workingHours.fromDay ? [{
        date_from: parseInt(formData.workingHours.fromDay) || 1,
        date_to: parseInt(formData.workingHours.toDay) || 5,
        start_time: formData.workingHours.fromTime || '08:30',
        end_time: formData.workingHours.toTime || '18:00',
      }] : [{
        date_from: 1,
        date_to: 5,
        start_time: '08:30',
        end_time: '18:00',
      }],
      working_time_text: formData.workingHours.lunchBreak || '',
      category: 2,
      shift: null,
    },
    job_status: { name_status: '', str_status: '' },
    job_approve_status: { name_status: '', str_status: '' },
    working_methods,

    // Contact
    contact_name: formData.contactName,
    contact_phone: formData.contactPhone,
    contact_email: formData.contactEmails,

    // Deadline
    deadline: formData.deadline,

    // Job family category - lấy từ jobFamily selection (level 1, 2, 3)
    job_family_category: formData.jobFamily?.categoryIds ?? [177, 178, 182],
    mappedJobFamilyCategory: formData.jobFamily?.mappedJobFamilyCategory ?? {
      name: 'Tuyển dụng',
      level: 3,
      id: 182,
      tag: null,
      fields: [],
      parents: [
        { name: 'Nhân sự', level: 2, id: 178, tag: null, fields: [], parents: [
          { name: 'Nhân sự/Hành chính/Pháp chế', level: 1, id: 177, tag: null, fields: [] }
        ]}
      ]
    },
    category_names: [],

    // Other required fields - thêm các fields còn thiếu
    has_ai_check_content: true,
    require_cv: false,
    categories: [],
    must_have_skills: [],
    job_tag_ids: [],
    services: [],
    medias: [],
    raw_title: '',
    recruitment_position_title: '',
    can_use_top_job_title_service: false,
    base_salary_level: -1,
    requirement_more_info: [],
    age_range: { from: '', to: '' },
    save_logs_job_blocked: false,
    job_blocked_type: null,
    foreign_languages: formData.languages
      .filter((lang) => lang.language !== 0 && lang.certificate !== '')
      .map((lang) => ({
        language: lang.language,
        certificate: lang.certificate,
      })),
    apply_reasons: ['', '', ''],
    publish_request_days: 30,
    campaign_id: null,
    domain_knowledge_ids: formData.industryKnowledge,
    subsidy_ids: [],
    benefit_ids: [],
    salary_label_type: 2,
    update_job_option: 3,
    request_active_service: [],
    request_delete_service: [],
    request_update_service: [],
  };
}

const TOPCV_API_BASE_URL = 'https://tuyendung-api.topcv.vn/api/v1';

export interface TopCvSkill {
  value: number;
  text: string;
}

interface SkillsResponse {
  status: string;
  skills: TopCvSkill[];
}

// Cache skills for session
const skillsCache: TopCvSkill[] = [];
let skillsLastFetchedPage = 0;

export async function fetchTopCvSkills(page: number = 1, limit: number = 25): Promise<{ skills: TopCvSkill[]; hasMore: boolean }> {
  if (page === 1) {
    skillsCache.length = 0;
    skillsLastFetchedPage = 0;
  }

  // Skip if already fetched this page
  if (page <= skillsLastFetchedPage) {
    return { skills: [...skillsCache], hasMore: true };
  }

  const auth = await readTopCvTokens();
  if (!auth.accessToken && !auth.cookieSession) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  const response = await fetch(`${TOPCV_API_BASE_URL}/skills/list?page=${page}&limit=${limit}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch skills: ${response.status}`);
  }

  const data = (await response.json()) as SkillsResponse;
  skillsCache.push(...data.skills);
  skillsLastFetchedPage = page;

  return {
    skills: [...skillsCache],
    hasMore: data.skills.length === limit,
  };
}

export async function publishTopCvJob(payload: Record<string, unknown>) {
  // DEBUG: Log final payload
  console.log('📤 TopCV Final Payload:', JSON.stringify(payload, null, 2));

  const auth = await readTopCvTokens();
  if (!auth.accessToken && !auth.cookieSession) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  // Retry logic cho rate limiting (429)
  let lastResponse: Response | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    let response = await sendTopCvRequest('/jobs', auth.accessToken, payload, auth.cookieSession);
    lastResponse = response;
    let body = await readResponseBody(response) as Record<string, unknown> | null;
    let errorName = (body?.error_name ?? body?.error ?? '') as string;
    let message = (body?.message ?? '') as string;

    // Check for rate limiting (429)
    if (response.status === 429 || message.toLowerCase().includes('quá nhanh') || message.toLowerCase().includes('too many requests')) {
      attempts++;
      if (attempts < maxAttempts) {
        // Chờ 2 giây trước khi retry
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error('TOPCV_RATE_LIMITED');
    }

    // Check for session timeout - TopCV returns 200 with error_name: "SESSION_TIMEOUT"
    const isSessionTimeout =
      response.status === 401 ||
      response.status === 403 ||
      errorName === 'SESSION_TIMEOUT' ||
      errorName.toUpperCase().includes('SESSION_TIMEOUT') ||
      message.toLowerCase().includes('session_timeout') ||
      message.toLowerCase().includes('hết hạn') ||
      message.toLowerCase().includes('đăng nhập lại');

    // If token expired, try refresh → then re-extract from open tab as last resort
    if (isSessionTimeout) {
      let newToken: string | null = null;
      let newRefreshToken: string | null = null;
      let refreshFailed = false;

      // 1. Try refresh token exchange (stored refreshToken)
      if (auth.refreshToken) {
        const result = await exchangeTopCvToken(auth.refreshToken);
        if (result.reason === 'success' && result.token) {
          newToken = result.token;
          newRefreshToken = result.refreshToken;
        } else if (result.reason === 'invalid_token') {
          await clearTopCvAuth();
          throw new Error('TOPCV_LOGIN_REQUIRED');
        } else {
          refreshFailed = true;
        }
      }

      // 2. If stored refreshToken gave SESSION_TIMEOUT, extract FRESH tokens from open TopCV tab
      if (refreshFailed) {
        const tabTokens = await extractFreshTokensFromOpenTab();
        console.warn('[TopCV] Stored refreshToken expired, extracting from tab:', {
          hasAccess: !!tabTokens.accessToken,
          hasRefresh: !!tabTokens.refreshToken,
          hasTaId: !!tabTokens.taId,
        });

        // 2a. Ưu tiên: thử accessToken từ tab trước (nhanh nhất, không cần exchange)
        if (tabTokens.accessToken) {
          const accessValid = await testTopCvAccessToken(tabTokens.accessToken);
          if (accessValid) {
            console.warn('[TopCV] Using fresh accessToken from tab');
            newToken = tabTokens.accessToken;
            await writeTopCvAccessToken(newToken, tabTokens.refreshToken ?? null, {
              taFp: tabTokens.taFp,
              taId: tabTokens.taId,
              taJr: tabTokens.taJr,
            });
          }
        }

        // 2b. Nếu accessToken từ tab không có/không valid, thử exchange với refreshToken từ tab
        if (!newToken && tabTokens.refreshToken) {
          const retryResult = await exchangeTopCvToken(tabTokens.refreshToken);
          if (retryResult.reason === 'success' && retryResult.token) {
            newToken = retryResult.token;
            newRefreshToken = retryResult.refreshToken;
            await writeTopCvAccessToken(newToken, newRefreshToken || tabTokens.refreshToken, {
              taFp: tabTokens.taFp,
              taId: tabTokens.taId,
              taJr: tabTokens.taJr,
            });
          } else {
            console.warn('[TopCV] Tab refreshToken also failed:', retryResult.reason);
          }
        }
      }

      if (newToken) {
        response = await sendTopCvRequest('/jobs', newToken, payload, false);
        lastResponse = response;
        body = await readResponseBody(response) as Record<string, unknown> | null;
        errorName = (body?.error_name ?? body?.error ?? '') as string;
        message = (body?.message ?? '') as string;

        // Check again if still session timeout after refresh
        if (errorName === 'SESSION_TIMEOUT' || errorName.toUpperCase().includes('SESSION_TIMEOUT')) {
          throw new Error('TOPCV_SESSION_TIMEOUT');
        }
      } else {
        throw new Error('TOPCV_SESSION_TIMEOUT');
      }
    }

    if (!lastResponse.ok) {
      throw new Error(`TOPCV_PUBLISH_FAILED: ${errorName} - ${message || `HTTP ${lastResponse.status}`}`);
    }

    return body;
  }

  // Max attempts reached
  throw new Error('TOPCV_RATE_LIMITED');
}

async function clearTopCvAuth() {
  if (chrome.storage?.local) {
    await chrome.storage.local.remove(TOPCV_STORAGE_KEY_AUTH);
  }
}

async function sendTopCvRequest(path: string, accessToken: string | null, body: Record<string, unknown>, cookieSession = false) {
  return fetch(`${TOPCV_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: cookieSession ? 'include' : 'same-origin',
    body: JSON.stringify(body),
  });
}

const TOPCV_STORAGE_KEY_AUTH = 'topcv_saved_auth';

export interface ExchangeTokenResult {
  token: string | null;
  refreshToken: string | null;
  reason: 'success' | 'session_timeout' | 'invalid_token' | 'error';
}

export async function exchangeTopCvToken(refreshToken: string): Promise<ExchangeTokenResult> {
  // Đọc tracking headers từ storage (đã được lưu khi sync từ tab TopCV)
  let taFp = '';
  let taId = '';
  let taJr = '';

  if (chrome.storage?.local) {
    try {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<string, {
        taFp?: string;
        taId?: string;
        taJr?: string;
      } | undefined>;
      const auth = data[TOPCV_STORAGE_KEY_AUTH];
      if (auth) {
        taFp = auth.taFp || '';
        taId = auth.taId || '';
        taJr = auth.taJr || '';
      }
    } catch {
      // Ignore
    }
  }

  // LUÔN thử đọc tracking headers tươi từ tab TopCV (ghi đè storage vì có thể stale)
  // Trừ khi không có tab nào đang mở
  try {
    if (chrome.tabs && chrome.scripting) {
      const tabs = await chrome.tabs.query({});
      const topCvTab = tabs.find((t) => t.id !== undefined && t.url && (t.url.includes('tuyendung.topcv.vn') || t.url.includes('topcv.vn')));
      if (topCvTab?.id && !topCvTab.url?.includes('/app/login')) {
        const [result] = await chrome.scripting.executeScript<[], { taFp: string | null; taId: string | null; taJr: string | null }>({
          target: { tabId: topCvTab.id },
          world: 'MAIN',
          func: () => ({
            taFp: localStorage.getItem('_tafp'),
            taId: localStorage.getItem('_taid'),
            taJr: localStorage.getItem('_tajr'),
          }),
        });
        if (result?.result) {
            // Ghi đè hoàn toàn b�ng giá trị từ tab (ưu tiên tab vì luôn mới nhất)
            taFp = result.result.taFp ?? taFp;
            taId = result.result.taId ?? taId;
            taJr = result.result.taJr ?? taJr;
          }
        }
      }
    } catch {
      // Ignore - tracking headers are optional
    }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://tuyendung.topcv.vn',
    Referer: 'https://tuyendung.topcv.vn/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
  };

  if (taFp) headers['_tafp'] = taFp;
  if (taId) headers['_taid'] = taId;
  if (taJr) headers['_tajr'] = taJr;

    // TopCV token exchange is the only TopCV request that intentionally has no Bearer header.
  const response = await fetch(`${TOPCV_API_BASE_URL}/auth/exchange-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const body = await readResponseBody(response) as Record<string, unknown> | null;
  const errorName = (body?.error_name ?? '') as string;
  const message = (body?.message ?? '') as string;

  // Phân biệt các loại lỗi:
  // - SESSION_TIMEOUT: refresh token hết hạn → có thể re-login trên trang TopCV
  // - INVALID_TOKEN: refresh token bị corrupt/invalid → bắt buộc đăng nhập lại
  if (
    errorName === 'SESSION_TIMEOUT' ||
    errorName.toUpperCase().includes('SESSION_TIMEOUT') ||
    message.toLowerCase().includes('hết hạn')
  ) {
    return { token: null, refreshToken: null, reason: 'session_timeout' };
  }

  if (
    errorName === 'INVALID_TOKEN' ||
    errorName.toUpperCase().includes('INVALID_TOKEN') ||
    message.toLowerCase().includes('không hợp lệ')
  ) {
    return { token: null, refreshToken: null, reason: 'invalid_token' };
  }

  if (!response.ok) return { token: null, refreshToken: null, reason: 'error' };

  const token = body?.access_token ?? body?.accessToken ?? body?.token;
  const nextRefreshToken = body?.refresh_token ?? body?.refreshToken;
  if (typeof token === 'string' && token) {
    return {
      token,
      refreshToken: typeof nextRefreshToken === 'string' && nextRefreshToken ? nextRefreshToken : null,
      reason: 'success',
    };
  }

  return { token: null, refreshToken: null, reason: 'error' };
}

export async function readTopCvTokens(): Promise<{ accessToken: string | null; refreshToken: string | null; cookieSession: boolean }> {
  // 1. Check extension local storage first
  if (chrome.storage?.local) {
    try {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<
        string,
        { accessToken?: string; refreshToken?: string; cookieSession?: boolean } | undefined
      >;
      const auth = data[TOPCV_STORAGE_KEY_AUTH];
      if (auth?.accessToken || auth?.cookieSession) {
        return {
          accessToken: auth.accessToken || null,
          refreshToken: auth.refreshToken || null,
          cookieSession: auth.cookieSession === true,
        };
      }
    } catch {
      // Fall through
    }
  }

  // 2. Check active TopCV tab
  const tab = await findTopCvTab();
  if (!tab?.id || !chrome.scripting) return { accessToken: null, refreshToken: null, cookieSession: false };

  try {
    const [result] = await chrome.scripting.executeScript<[], { accessToken: string | null; refreshToken: string | null }>({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({
        accessToken: localStorage.getItem('local_storage__token.refresh')
          ?? localStorage.getItem('local_storage__token.local'),
        refreshToken: localStorage.getItem('local_storage__refresh_token.refresh'),
      }),
    });

    return result?.result ? { ...result.result, cookieSession: false } : { accessToken: null, refreshToken: null, cookieSession: false };
  } catch {
    return { accessToken: null, refreshToken: null, cookieSession: false };
  }
}

async function writeTopCvAccessToken(
  accessToken: string,
  refreshToken: string | null,
  trackingHeaders?: { taFp?: string; taId?: string; taJr?: string }
) {
  // Update in extension local storage
  if (chrome.storage?.local) {
    try {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<string, Record<string, unknown> | undefined>;
      const current = data[TOPCV_STORAGE_KEY_AUTH] || {};
      await chrome.storage.local.set({
        [TOPCV_STORAGE_KEY_AUTH]: {
          ...current,
          accessToken,
          refreshToken: refreshToken || current.refreshToken,
          updatedAt: Date.now(),
          // Update tracking headers if provided
          ...(trackingHeaders?.taFp && { taFp: trackingHeaders.taFp }),
          ...(trackingHeaders?.taId && { taId: trackingHeaders.taId }),
          ...(trackingHeaders?.taJr && { taJr: trackingHeaders.taJr }),
        },
      });
    } catch {
      // Ignore
    }
  }

  // Also update in active tab if open
  const tab = await findTopCvTab();
  if (!tab?.id || !chrome.scripting) return;

  try {
    await chrome.scripting.executeScript<
      [string, string | null, string | null, string | null],
      void
    >({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (token, rt, taIdVal, taFpVal) => {
        localStorage.setItem('local_storage__token.refresh', token);
        if (rt) localStorage.setItem('local_storage__refresh_token.refresh', rt);
        if (taIdVal) localStorage.setItem('_taid', taIdVal);
        if (taFpVal) localStorage.setItem('_tafp', taFpVal);
      },
      args: [
        accessToken,
        refreshToken,
        trackingHeaders?.taId ?? null,
        trackingHeaders?.taFp ?? null,
      ],
    });
  } catch {
    // Ignore
  }
}


async function findTopCvTab() {
  if (!chrome.tabs) return null;
  const tabs = await chrome.tabs.query({});
  return tabs?.find((tab) => tab.id !== undefined && tab.url && (tab.url.includes('tuyendung.topcv.vn') || tab.url.includes('topcv.vn'))) ?? null;
}


// Test nhanh accessToken có còn valid không (gọi /auth/me, không throw)
async function testTopCvAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${TOPCV_API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}


// Đọc token tươi từ tab TopCV đang mở (dùng khi stored refreshToken hết hạn)
async function extractFreshTokensFromOpenTab(): Promise<{
  accessToken?: string | null;
  refreshToken?: string | null;
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

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function assertTopCvReady() {
  const auth = await checkTopCvAuth();
  if (!auth.ok) throw new Error(`TOPCV_${auth.reason}`);
  return auth;
}
