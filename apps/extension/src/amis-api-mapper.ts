import type { AmisExtractionResult, AmisJobSnapshot } from './types';

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

export function isAmisSaveRecruitmentUrl(url: string) {
  return url.toLowerCase().includes(AMIS_SAVE_RECRUITMENT_PATH.toLowerCase());
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
  const descriptionText = htmlToText(recruitmentData.Description) || cleanText(recruitmentData.Summary);
  const requirementText = htmlToText(recruitmentData.Requirement);
  const benefitText = htmlToText(recruitmentData.Benifit);
  const location = extractLocation(recruitmentData);
  const deadline = recruitmentData.RegistrationExpiryDate ?? recruitmentData.CloseDate ?? recruitmentData.ExpectedTime ?? undefined;

  const snapshot: AmisJobSnapshot = {
    title: cleanText(recruitmentData.TitleWebsite)
      || cleanText(recruitmentData.Title)
      || cleanText(recruitmentData.JobPositionName),
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
