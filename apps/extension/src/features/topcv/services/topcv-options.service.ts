import { readTopCvTokens } from './topcv-api.service';

const TOPCV_API_BASE_URL = 'https://tuyendung-api.topcv.vn/api/v1';

export interface TopCvOption {
  value: number;
  name: string;
}

export interface TopCvDomainKnowledge {
  id: number;
  name: string;
}

export interface TopCvOptionsResponse {
  status: string;
  message: string;
  data: {
    education: TopCvOption[];
    foreign_languages: TopCvOption[];
    subsidies: TopCvOption[];
    supported_devices: TopCvOption[];
    benefits: TopCvOption[];
    certificate_foreign_languages: Array<TopCvOption & { data: TopCvOption[] }>;
    sale_methods: TopCvOption[];
    target_customers: TopCvOption[];
    voice_tones: TopCvOption[];
    mbti: TopCvOption[];
    job_types: TopCvOption[];
    working_methods: TopCvOption[];
  };
}

// Cache options for the session
let cachedOptions: TopCvOptionsResponse['data'] | null = null;
let cachedDomainKnowledge: TopCvDomainKnowledge[] | null = null;

export async function fetchTopCvOptions(): Promise<TopCvOptionsResponse['data']> {
  if (cachedOptions) return cachedOptions;

  const auth = await readTopCvTokens();
  if (!auth.accessToken && !auth.cookieSession) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  const response = await fetch(`${TOPCV_API_BASE_URL}/custom-form-job/get-options`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      Origin: 'https://tuyendung.topcv.vn',
      Referer: 'https://tuyendung.topcv.vn/',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch TopCV options: ${response.status}`);
  }

  const data = (await response.json()) as TopCvOptionsResponse;
  cachedOptions = data.data;
  return cachedOptions;
}

export async function fetchTopCvDomainKnowledge(): Promise<TopCvDomainKnowledge[]> {
  if (cachedDomainKnowledge) return cachedDomainKnowledge;

  const auth = await readTopCvTokens();
  if (!auth.accessToken && !auth.cookieSession) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  const response = await fetch('https://tuyendung-api.topcv.vn/api/v1/domain-knowledge', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      Origin: 'https://tuyendung.topcv.vn',
      Referer: 'https://tuyendung.topcv.vn/',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch TopCV domain knowledge: ${response.status}`);
  }

  const body = (await response.json()) as { data?: TopCvDomainKnowledge[] };
  cachedDomainKnowledge = body.data ?? [];
  return cachedDomainKnowledge;
}

// Transform TopCV numeric value to display name
export function getEducationName(value: number, options: TopCvOption[]): string {
  const option = options.find(o => o.value === value);
  return option?.name ?? '';
}

// Resolve foreign language + certificate to display string
export function getLanguageDisplay(
  languageValue: number,
  certificateValue: number | '',
  options: TopCvOptionsResponse['data']['certificate_foreign_languages']
): string {
  const langOpt = options.find((l) => l.value === languageValue);
  if (!langOpt) return '';
  if (certificateValue === '') return langOpt.name;
  const certOpt = langOpt.data.find((c) => c.value === certificateValue);
  return certOpt ? `${langOpt.name} — ${certOpt.name}` : langOpt.name;
}
