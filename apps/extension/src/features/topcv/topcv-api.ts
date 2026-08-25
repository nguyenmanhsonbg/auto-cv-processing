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

  // Map employee_level string → number
  const employeeLevelMap: Record<string, number> = {
    'intern': 1,
    'Nhân viên': 1,
    'fresher': 2,
    'Fresher': 2,
    ' junior': 3,
    'Junior': 3,
    'senior': 4,
    'Senior': 4,
    'Trưởng nhóm': 5,
    'Trưởng/Phó phòng': 6,
    'Quản lý': 7,
    'Giám đốc': 8,
  };
  const employee_level = employeeLevelMap[formData.employeeLevel] || 1;

  // Map experience string → format "X-Y"
  const experienceMap: Record<string, string> = {
    'Không yêu cầu': '0-0',
    'Dưới 1 năm': '0-1',
    '1-3 năm': '1-3',
    '3-5 năm': '3-5',
    'Trên 5 năm': '3-0', // 3-0 nghĩa là 3+ năm
  };
  const experience = experienceMap[formData.experience] || '0-0';

  // Map education string → number
  const educationMap: Record<string, number> = {
    'Trung học': 1,
    'Trung cấp': 2,
    'Cao đẳng': 3,
    'Cao đẳng trở lên': 3,
    'Đại học': 4,
    'Đại học trở lên': 5,
    'Sau đại học': 6,
  };
  const education = educationMap[formData.education] || 5;

  // Map salary_type: 'range' → 1, 'negotiable' → ?
  const salary_type = formData.salaryType === 'negotiable' ? 2 : 1;

  // Map working_methods từ workingType
  const workingMethodsMap: Record<string, number[]> = {
    'offline': [2],
    'Offline': [2],
    'remote': [3],
    'Remote': [3],
    'hybrid': [1, 2], // Hybrid = Offline + Onsite
    'Hybrid': [1, 2],
    'onsite': [2],
    'Onsite': [2],
  };
  const working_methods = workingMethodsMap[formData.workingType] || [1];

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
    type: 11, // Loại công việc: 11 = tuyển dụng thường
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
    required_skills: formData.requiredSkills,
    should_have_skills: formData.preferredSkills,

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
    foreign_languages: [],
    apply_reasons: ['', '', ''],
    publish_request_days: 30,
    campaign_id: null,
    domain_knowledge_ids: [],
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

export async function publishTopCvJob(payload: Record<string, unknown>) {
  // DEBUG: Log final payload
  console.log('📤 TopCV Final Payload:', JSON.stringify(payload, null, 2));

  const auth = await readTopCvTokens();
  if (!auth.accessToken) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  // Retry logic cho rate limiting (429)
  let lastResponse: Response | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    let response = await sendTopCvRequest('/jobs', auth.accessToken, payload);
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

      // 1. Try refresh token exchange
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

      // 2. If refresh failed, try to extract fresh token from open TopCV tab
      if (!newToken) {
        const freshAuth = await checkTopCvAuth();
        if (freshAuth.ok) {
          const freshTokens = await readTopCvTokens();
          newToken = freshTokens.accessToken;
        }
      }

      if (newToken) {
        await writeTopCvAccessToken(newToken, newRefreshToken || auth.refreshToken);
        response = await sendTopCvRequest('/jobs', newToken, payload);
        lastResponse = response;
        body = await readResponseBody(response) as Record<string, unknown> | null;
        errorName = (body?.error_name ?? body?.error ?? '') as string;
        message = (body?.message ?? '') as string;

        // Check again if still session timeout after refresh
        if (errorName === 'SESSION_TIMEOUT' || errorName.toUpperCase().includes('SESSION_TIMEOUT')) {
          throw new Error('TOPCV_SESSION_TIMEOUT');
        }
      } else if (refreshFailed) {
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

async function sendTopCvRequest(path: string, accessToken: string, body: Record<string, unknown>) {
  return fetch(`${TOPCV_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
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

  // Fallback: thử đọc từ active TopCV tab nếu không có trong storage
  if (!taFp || !taId) {
    try {
      if (chrome.tabs && chrome.scripting) {
        const tabs = await chrome.tabs.query({});
        const topCvTab = tabs.find((t) => t.id !== undefined && t.url && (t.url.includes('tuyendung.topcv.vn') || t.url.includes('topcv.vn')));
        if (topCvTab?.id) {
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
            taFp = taFp || result.result.taFp || '';
            taId = taId || result.result.taId || '';
            taJr = taJr || result.result.taJr || '';
          }
        }
      }
    } catch {
      // Ignore - tracking headers are optional
    }
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

async function readTopCvTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  // 1. Check extension local storage first
  if (chrome.storage?.local) {
    try {
      const data = (await chrome.storage.local.get(TOPCV_STORAGE_KEY_AUTH)) as Record<
        string,
        { accessToken?: string; refreshToken?: string } | undefined
      >;
      const auth = data[TOPCV_STORAGE_KEY_AUTH];
      if (auth?.accessToken) {
        return {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken || null,
        };
      }
    } catch {
      // Fall through
    }
  }

  // 2. Check active TopCV tab
  const tab = await findTopCvTab();
  if (!tab?.id || !chrome.scripting) return { accessToken: null, refreshToken: null };

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

    return result?.result ?? { accessToken: null, refreshToken: null };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

async function writeTopCvAccessToken(accessToken: string, refreshToken: string | null) {
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
    await chrome.scripting.executeScript<[string], void>({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (token: string) => {
        localStorage.setItem('local_storage__token.refresh', token);
      },
      args: [accessToken],
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
