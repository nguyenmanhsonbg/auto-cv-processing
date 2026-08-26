/**
 * TopCV Location Service
 * Fetch provinces and districts for location picker
 */

const TOPCV_API_BASE_URL = 'https://tuyendung-api.topcv.vn/api/v1';

export interface Province {
  id: number;
  title: string;
  name: string;
  alias: string;
}

export interface District {
  id: number;
  title: string;
  name: string;
  alias: string;
}

let cachedProvinces: Province[] | null = null;
let cachedDistricts: Record<number, District[] | null> = {};

export async function fetchProvinces(): Promise<Province[]> {
  if (cachedProvinces) return cachedProvinces;

  const auth = chrome.storage?.local
    ? (await chrome.storage.local.get('topcv_saved_auth') as { topcv_saved_auth?: { accessToken?: string; cookieSession?: boolean } } | undefined)
    : undefined;
  const token = auth?.topcv_saved_auth?.accessToken;
  if (!token && !auth?.topcv_saved_auth?.cookieSession) throw new Error('TOPCV_LOGIN_REQUIRED');

  const response = await fetch(`${TOPCV_API_BASE_URL}/provinces`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: 'https://tuyendung.topcv.vn',
      Referer: 'https://tuyendung.topcv.vn/',
    },
    credentials: 'include',
  });

  if (!response.ok) throw new Error(`Failed to fetch provinces: ${response.status}`);

  const body = await response.json();
  cachedProvinces = body?.provinces ?? [];
  return cachedProvinces as Province[];
}

export async function fetchDistricts(provinceId: number): Promise<District[]> {
  if (cachedDistricts[provinceId]) return cachedDistricts[provinceId];

  const auth = chrome.storage?.local
    ? (await chrome.storage.local.get('topcv_saved_auth') as { topcv_saved_auth?: { accessToken?: string; cookieSession?: boolean } } | undefined)
    : undefined;
  const token = auth?.topcv_saved_auth?.accessToken;
  if (!token && !auth?.topcv_saved_auth?.cookieSession) throw new Error('TOPCV_LOGIN_REQUIRED');

  const response = await fetch(`${TOPCV_API_BASE_URL}/provinces/${provinceId}/districts?option_all=true`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: 'https://tuyendung.topcv.vn',
      Referer: 'https://tuyendung.topcv.vn/',
    },
    credentials: 'include',
  });

  if (!response.ok) throw new Error(`Failed to fetch districts: ${response.status}`);

  const body = await response.json();
  // Filter out "Tất cả" option (id: -1)
  const districts = (body?.districts ?? []).filter((d: District) => d.id !== -1);
  cachedDistricts[provinceId] = districts;
  return districts;
}
