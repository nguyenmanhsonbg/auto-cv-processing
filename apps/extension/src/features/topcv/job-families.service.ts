/**
 * TopCV Job Families Service
 * Fetch and provide job family categories (3-level hierarchy)
 */

const TOPCV_API_BASE_URL = 'https://tuyendung-api.topcv.vn/api/v1';

export interface JobFamilyField {
  id: number;
  name: string;
}

export interface JobFamily {
  name: string;
  level: 1 | 2 | 3;
  id: number;
  tag: string | null;
  fields: JobFamilyField[];
  children?: JobFamily[];
}

let cachedData: JobFamily[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchJobFamilies(): Promise<JobFamily[]> {
  // Check cache
  if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedData;
  }

  const auth = chrome.storage?.local
    ? (await chrome.storage.local.get('topcv_saved_auth') as { topcv_saved_auth?: { accessToken?: string } } | undefined)
    : undefined;
  const token = auth?.topcv_saved_auth?.accessToken;
  if (!token) {
    throw new Error('TOPCV_LOGIN_REQUIRED');
  }

  const response = await fetch(`${TOPCV_API_BASE_URL}/job-families/all`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: 'https://tuyendung.topcv.vn',
      Referer: 'https://tuyendung.topcv.vn/',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job families: ${response.status}`);
  }

  const body = await response.json();
  const data = body?.data ?? body ?? [];

  cachedData = data;
  cacheTimestamp = Date.now();

  return data;
}

// Helper: tìm job family theo ID (level 3) và trả về cây đầy đủ với parents
export interface JobFamilyPath {
  level1: JobFamily;
  level2: JobFamily;
  level3: JobFamily;
  categoryIds: [number, number, number]; // [level1.id, level2.id, level3.id]
  mappedJobFamilyCategory: JobFamily & {
    parents: Array<JobFamily & { parents: JobFamily[] }>;
  };
}

export function buildJobFamilyPath(level3Id: number, data: JobFamily[]): JobFamilyPath | null {
  // Tìm level 3 chứa id
  for (const level1 of data) {
    for (const level2 of level1.children ?? []) {
      for (const level3 of level2.children ?? []) {
        if (level3.id === level3Id) {
          // Build mappedJobFamilyCategory: từ level3 → level2 → level1 (parents chain)
          // NOTE: parents không nên có children
          const mappedL3 = {
            ...level3,
            parents: [
              {
                name: level2.name,
                level: level2.level,
                id: level2.id,
                tag: level2.tag,
                fields: level2.fields,
                parents: [
                  { name: level1.name, level: level1.level, id: level1.id, tag: level1.tag, fields: level1.fields },
                ],
              },
            ],
          };
          return {
            level1,
            level2,
            level3,
            categoryIds: [level1.id, level2.id, level3.id],
            mappedJobFamilyCategory: mappedL3,
          };
        }
      }
    }
  }
  return null;
}
