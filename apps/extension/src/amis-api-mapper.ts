import type { AmisCareerItem, AmisExtractionResult, AmisJobSnapshot } from './types';

interface AmisSaveRecruitmentResponse {
  Success?: boolean;
  Code?: number;
  Data?: AmisRecruitmentData | null;
  ServerTime?: string;
  TraceID?: string;
}

interface AmisRecruitmentData {
  RecruitmentID?: number | string | null;
  Title?: string | null;
  TitleWebsite?: string | null;
  JobPositionName?: string | null;
  DepartmentName?: string | null;
  RankName?: string | null;
  Quantity?: number | null;
  WorkType?: number | null;
  RegistrationExpiryDate?: string | null;
  CloseDate?: string | null;
  ExpectedTime?: string | null;
  MinSalary?: number | null;
  MaxSalary?: number | null;
  CurrencyCodeID?: number | null;
  Description?: string | null;
  Summary?: string | null;
  Requirement?: string | null;
  Benifit?: string | null;
  RecruitmentURL?: string | null;
  TenantID?: string | null;
  RecruitmentWorkLocations?: Array<{
    WorkLocationName?: string | null;
    WorkLocationDisplayName?: string | null;
    Province?: string | null;
    Address?: string | null;
    IsNationwide?: boolean | null;
  }> | null;
}

export const AMIS_SAVE_RECRUITMENT_PATH =
  '/RecruitmentAPI/api/recruitment/SaveRecruitment';
export const AMIS_CAREER_DATA_PAGING_PATH =
  '/RecruitmentAPI/api/Career/data_paging';

export function isAmisSaveRecruitmentUrl(url: string) {
  return url.toLowerCase().includes(AMIS_SAVE_RECRUITMENT_PATH.toLowerCase());
}

export function isAmisCareerDataPagingUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CAREER_DATA_PAGING_PATH.toLowerCase());
}

export function mapAmisSaveRecruitmentResponse(
  response: unknown,
  requestUrl: string,
  pageUrl: string,
  pageTitle?: string,
): AmisExtractionResult | null {
  if (!isObject(response)) return null;

  const envelope = response as AmisSaveRecruitmentResponse;
  const data = envelope.Data;
  if (!envelope.Success || !data || typeof data !== 'object') return null;

  const recruitmentData = data as AmisRecruitmentData;

  const recruitmentId = recruitmentData.RecruitmentID === undefined || recruitmentData.RecruitmentID === null
    ? ''
    : String(recruitmentData.RecruitmentID).trim();
  const summaryText = truncateText(cleanText(recruitmentData.Summary), 500);
  const descriptionText = htmlToText(recruitmentData.Description) || summaryText;
  const requirementText = htmlToText(recruitmentData.Requirement);
  const benefitText = htmlToText(recruitmentData.Benifit);
  const location = extractLocation(recruitmentData);
  const deadline = recruitmentData.RegistrationExpiryDate ?? recruitmentData.CloseDate ?? recruitmentData.ExpectedTime ?? undefined;

  const snapshot: AmisJobSnapshot = {
    title: cleanText(recruitmentData.TitleWebsite)
      || cleanText(recruitmentData.Title)
      || cleanText(recruitmentData.JobPositionName),
    ...(summaryText ? { summary: summaryText } : {}),
    description: descriptionText,
    requirements: {
      rawText: requirementText,
    },
    ...(benefitText ? { benefits: { rawText: benefitText } } : {}),
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };

  const missingFields: string[] = [];
  if (!recruitmentId) missingFields.push('AMIS recruitment id');
  if (!snapshot.title) missingFields.push('title');
  if (!snapshot.description) missingFields.push('description');
  if (!snapshot.requirements.rawText) missingFields.push('requirements');

  const fieldSources = {
    ...(recruitmentId ? { amisRecruitmentId: 'SaveRecruitment.Data.RecruitmentID' } : {}),
    ...(snapshot.title ? { title: 'SaveRecruitment.Data.TitleWebsite|Title|JobPositionName' } : {}),
    ...(summaryText ? { summary: 'SaveRecruitment.Data.Summary' } : {}),
    ...(snapshot.description ? { description: 'SaveRecruitment.Data.Description|Summary' } : {}),
    ...(snapshot.requirements.rawText ? { requirements: 'SaveRecruitment.Data.Requirement' } : {}),
    ...(benefitText ? { benefits: 'SaveRecruitment.Data.Benifit' } : {}),
    ...(location ? { location: 'SaveRecruitment.Data.RecruitmentWorkLocations' } : {}),
    ...(deadline ? { deadline: 'SaveRecruitment.Data.RegistrationExpiryDate|CloseDate|ExpectedTime' } : {}),
  };

  return {
    status: 'AMIS_PAGE_DETECTED',
    detected: true,
    source: 'AMIS_SAVE_RECRUITMENT_API',
    confidence: missingFields.length === 0 ? 'HIGH' : 'LOW',
    url: pageUrl,
    ...(recruitmentId ? { amisRecruitmentId: recruitmentId } : {}),
    snapshot,
    missingFields,
    warnings: buildWarnings(missingFields),
    evidence: {
      host: new URL(pageUrl).hostname,
      ...(pageTitle ? { title: pageTitle } : {}),
      markers: [
        'host:amisapp.misa.vn',
        'api:SaveRecruitment',
        `request:${new URL(requestUrl).pathname}`,
        ...(envelope.TraceID ? ['trace-id-present'] : []),
        ...(envelope.ServerTime ? ['server-time-present'] : []),
      ],
      fieldSources,
    },
  };
}

function extractLocation(data: AmisRecruitmentData) {
  const [firstLocation] = data.RecruitmentWorkLocations ?? [];
  if (!firstLocation) return undefined;
  if (firstLocation.IsNationwide) return 'Toan quoc';

  return cleanText(firstLocation.WorkLocationDisplayName)
    || cleanText(firstLocation.WorkLocationName)
    || cleanText(firstLocation.Province)
    || cleanText(firstLocation.Address)
    || undefined;
}

function buildWarnings(missingFields: string[]) {
  const warnings = [
    'Snapshot was mapped from AMIS SaveRecruitment response.',
  ];

  if (missingFields.length > 0) {
    warnings.unshift(`Missing required fields: ${missingFields.join(', ')}.`);
  }

  return warnings;
}

function htmlToText(value: string | null | undefined) {
  const html = cleanText(value);
  if (!html) return '';

  if (typeof document === 'undefined') {
    return cleanText(html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '</p>\n')
      .replace(/<\/li>/gi, '</li>\n')
      .replace(/<[^>]+>/g, ' '));
  }

  const element = document.createElement('div');
  element.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '</p>\n')
    .replace(/<\/li>/gi, '</li>\n');

  return cleanText(element.innerText || element.textContent || '');
}

function cleanText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function mapAmisCareerDataPagingResponse(response: unknown): AmisCareerItem[] {
  const rows = extractRows(response);
  const items = rows.map(mapCareerRow).filter(Boolean) as AmisCareerItem[];
  return [...new Map(items.map((item) => [item.amisCareerId, item])).values()];
}

function extractRows(value: unknown): unknown[] {
  const directRows = readKnownRowArray(value);
  if (directRows) return directRows;

  if (!isObject(value)) return [];

  for (const item of Object.values(value)) {
    const nestedRows = extractRows(item);
    if (nestedRows.length > 0) return nestedRows;
  }

  return [];
}

function readKnownRowArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return null;

  for (const key of ['Data', 'data', 'Items', 'items', 'Rows', 'rows', 'PageData', 'pageData', 'Records', 'records']) {
    const child = value[key];
    if (Array.isArray(child)) return child;
  }

  return null;
}

function mapCareerRow(row: unknown): AmisCareerItem | null {
  if (!isObject(row)) return null;

  const amisCareerId = cleanText(readFirst(row, [
    'CareerID',
    'CareerId',
    'careerID',
    'careerId',
    'ID',
    'Id',
    'id',
    'Value',
    'value',
  ]));
  const name = cleanText(readFirst(row, [
    'CareerName',
    'careerName',
    'Name',
    'name',
    'Text',
    'text',
    'DisplayName',
    'displayName',
  ]));

  if (!amisCareerId || !name) return null;

  const usageStatus = readNumber(row, ['UsageStatus', 'usageStatus']);
  const code = cleanText(readFirst(row, ['CareerCode', 'careerCode', 'Code', 'code']));
  const description = cleanText(readFirst(row, ['Description', 'description']));
  const organizationUnitId = cleanText(readFirst(row, [
    'OrganizationUnitID',
    'OrganizationUnitId',
    'organizationUnitID',
    'organizationUnitId',
  ]));
  const organizationUnitName = cleanText(readFirst(row, [
    'OrganizationUnitName',
    'organizationUnitName',
  ]));
  const parentAmisCareerId = cleanText(readFirst(row, [
    'ParentID',
    'ParentId',
    'parentID',
    'parentId',
    'ParentCareerID',
    'ParentCareerId',
    'parentCareerId',
  ]));
  const sortOrder = readNumber(row, ['SortOrder', 'sortOrder', 'OrderIndex', 'orderIndex', 'OrderNo', 'orderNo']);

  return {
    amisCareerId,
    name,
    ...(code ? { code } : {}),
    ...(description ? { description } : {}),
    ...(organizationUnitId ? { organizationUnitId } : {}),
    ...(organizationUnitName ? { organizationUnitName } : {}),
    ...(usageStatus !== undefined ? { usageStatus } : {}),
    ...(parentAmisCareerId ? { parentAmisCareerId } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    isActive: usageStatus === undefined ? readBoolean(row, ['IsActive', 'isActive'], true) : usageStatus === 1,
    rawSnapshot: sanitizeCareerSnapshot(row),
  };
}

function sanitizeCareerSnapshot(row: Record<string, unknown>) {
  const snapshot: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (/(cookie|token|secret|password|authorization|session)/i.test(key)) continue;

    if (typeof value === 'string') {
      snapshot[key] = value.length > 500 ? value.slice(0, 500) : value;
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      snapshot[key] = value;
    }
  }

  return snapshot;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function readFirst(data: Record<string, unknown>, keys: string[]) {
  const value = readFirstValue(data, keys);
  if (typeof value === 'string' || typeof value === 'number') return String(value);

  return '';
}

function readFirstValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    return value;
  }

  return undefined;
}

function readNumber(data: Record<string, unknown>, keys: string[]) {
  const value = readFirstValue(data, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function readBoolean(data: Record<string, unknown>, keys: string[], fallback: boolean) {
  const value = readFirstValue(data, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (/^(true|1)$/i.test(value.trim())) return true;
    if (/^(false|0)$/i.test(value.trim())) return false;
  }

  return fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
