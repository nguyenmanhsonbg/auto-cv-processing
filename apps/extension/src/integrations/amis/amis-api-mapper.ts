import type {
  AmisApplicationItem,
  AmisCandidateAttractivePersonnelChangedPayload,
  AmisCandidateStageChangedPayload,
  AmisCareerItem,
  AmisExtractionResult,
  AmisJobSnapshot,
} from '@/types/types';
import {
  removeHorizontalWhitespaceBeforeNewlines,
  stripHtmlTags,
} from '@/text-normalization';
import {
  extractAmisCandidateRows,
  extractAmisRows,
} from '@/integrations/amis/amis-response-utils';

export { AMIS_APPLICATIONS_CANDIDATES_MARKER } from '@/integrations/amis/amis-response-utils';

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
export const AMIS_CANDIDATE_ADDITIONAL_INFO_PATH =
  '/RecruitmentAPI/api/Candidate/candidate-additional-infor/';
export const AMIS_CANDIDATE_UPDATE_ROUND_PATH =
  '/RecruitmentAPI/api/RecruitmentDetail/updateRound';
export const AMIS_CANDIDATE_SAVE_PATH =
  '/RecruitmentAPI/api/Candidate/save';
export function isAmisSaveRecruitmentUrl(url: string) {
  return url.toLowerCase().includes(AMIS_SAVE_RECRUITMENT_PATH.toLowerCase());
}

export function isAmisCareerDataPagingUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CAREER_DATA_PAGING_PATH.toLowerCase());
}

export function isAmisCandidateAdditionalInfoUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_ADDITIONAL_INFO_PATH.toLowerCase());
}

export function isAmisCandidateUpdateRoundUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_UPDATE_ROUND_PATH.toLowerCase());
}

export function isAmisCandidateSaveUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_SAVE_PATH.toLowerCase());
}

export function isLikelyAmisApplicationListUrl(url: string) {
  const normalizedUrl = url.toLowerCase();
  return normalizedUrl.includes('/recruitmentapi/api/')
    && (
      normalizedUrl.includes('candidate')
      || normalizedUrl.includes('application')
      || normalizedUrl.includes('round')
      || normalizedUrl.includes('recruitment')
    );
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

  const mapped = mapRecruitmentData(data as AmisRecruitmentData);
  const missingFields = findMissingRecruitmentFields(mapped.recruitmentId, mapped.snapshot);

  return {
    status: 'AMIS_PAGE_DETECTED',
    detected: true,
    source: 'AMIS_SAVE_RECRUITMENT_API',
    confidence: missingFields.length === 0 ? 'HIGH' : 'LOW',
    url: pageUrl,
    ...(mapped.recruitmentId ? { amisRecruitmentId: mapped.recruitmentId } : {}),
    snapshot: mapped.snapshot,
    missingFields,
    warnings: buildWarnings(missingFields),
    evidence: buildRecruitmentEvidence(requestUrl, pageUrl, pageTitle, envelope, mapped.fieldSources),
  };
}

function mapRecruitmentData(data: AmisRecruitmentData) {
  const recruitmentId = data.RecruitmentID == null ? '' : String(data.RecruitmentID).trim();
  const summaryText = truncateText(cleanText(data.Summary), 500);
  const descriptionText = htmlToText(data.Description) || summaryText;
  const requirementText = htmlToText(data.Requirement);
  const benefitText = htmlToText(data.Benifit);
  const location = extractLocation(data);
  const deadline = data.RegistrationExpiryDate ?? data.CloseDate ?? data.ExpectedTime ?? undefined;
  const snapshot: AmisJobSnapshot = {
    title: cleanText(data.TitleWebsite) || cleanText(data.Title) || cleanText(data.JobPositionName),
    ...(summaryText ? { summary: summaryText } : {}),
    description: descriptionText,
    requirements: { rawText: requirementText },
    ...(benefitText ? { benefits: { rawText: benefitText } } : {}),
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };
  return {
    recruitmentId,
    snapshot,
    fieldSources: buildRecruitmentFieldSources(recruitmentId, snapshot, summaryText, benefitText, location, deadline),
  };
}

function findMissingRecruitmentFields(recruitmentId: string, snapshot: AmisJobSnapshot) {
  return [
    !recruitmentId ? 'AMIS recruitment id' : null,
    !snapshot.title ? 'title' : null,
    !snapshot.description ? 'description' : null,
    !snapshot.requirements.rawText ? 'requirements' : null,
  ].filter((field): field is string => Boolean(field));
}

function buildRecruitmentFieldSources(
  recruitmentId: string,
  snapshot: AmisJobSnapshot,
  summaryText: string,
  benefitText: string,
  location?: string,
  deadline?: string,
) {
  return {
    ...(recruitmentId ? { amisRecruitmentId: 'SaveRecruitment.Data.RecruitmentID' } : {}),
    ...(snapshot.title ? { title: 'SaveRecruitment.Data.TitleWebsite|Title|JobPositionName' } : {}),
    ...(summaryText ? { summary: 'SaveRecruitment.Data.Summary' } : {}),
    ...(snapshot.description ? { description: 'SaveRecruitment.Data.Description|Summary' } : {}),
    ...(snapshot.requirements.rawText ? { requirements: 'SaveRecruitment.Data.Requirement' } : {}),
    ...(benefitText ? { benefits: 'SaveRecruitment.Data.Benifit' } : {}),
    ...(location ? { location: 'SaveRecruitment.Data.RecruitmentWorkLocations' } : {}),
    ...(deadline ? { deadline: 'SaveRecruitment.Data.RegistrationExpiryDate|CloseDate|ExpectedTime' } : {}),
  };
}

function buildRecruitmentEvidence(
  requestUrl: string,
  pageUrl: string,
  pageTitle: string | undefined,
  envelope: AmisSaveRecruitmentResponse,
  fieldSources: Record<string, string>,
) {
  return {
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
    return cleanText(stripHtmlTags(html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '</p>\n')
      .replace(/<\/li>/gi, '</li>\n')
    ));
  }

  const element = document.createElement('div');
  element.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '</p>\n')
    .replace(/<\/li>/gi, '</li>\n');

  return cleanText(element.innerText || element.textContent || '');
}

function cleanText(value: string | null | undefined) {
  return removeHorizontalWhitespaceBeforeNewlines((value ?? '')
    .replaceAll('\u00a0', ' '))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function mapAmisCareerDataPagingResponse(response: unknown): AmisCareerItem[] {
  const rows = extractAmisRows(response);
  const items = rows.map(mapCareerRow).filter(Boolean) as AmisCareerItem[];
  return [...new Map(items.map((item) => [item.amisCareerId, item])).values()];
}

export function mapAmisApplicationsResponse(response: unknown): AmisApplicationItem[] {
  const rows = extractAmisCandidateRows(response);
  const items = rows.map(mapApplicationRow).filter(Boolean) as AmisApplicationItem[];
  return [...new Map(items.map((item) => [
    `${item.recruitmentId}:${item.recruitmentRoundId}:${getAmisApplicationIdentityId(item)}`,
    item,
  ])).values()];
}

export function mapAmisCandidateStageResponse(
  response: unknown,
  sourceUrl: string,
  pageUrl: string,
): AmisCandidateStageChangedPayload | null {
  if (!isObject(response)) return null;
  if ((response.Success ?? response.success) === false) return null;

  const responseData = response.Data ?? response.data;
  if (!isObject(responseData)) return null;

  const details = responseData.ListRecruitmentDetails ?? responseData.listRecruitmentDetails;
  if (!Array.isArray(details)) return null;

  const current = details.find(isObject);
  if (!current) return null;

  const amisRecruitmentId = cleanText(readFirst(current, [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
  ]));
  const amisCandidateId = cleanText(readFirst(current, [
    'CandidateID',
    'CandidateId',
    'candidateId',
  ]));
  const amisRecruitmentRoundId = cleanText(readFirst(current, [
    'RecruitmentRoundID',
    'RecruitmentRoundId',
    'recruitmentRoundId',
  ]));
  const amisRecruitmentRoundName = cleanText(readFirst(current, [
    'RecruitmentRoundName',
    'RecruitmentRound',
    'recruitmentRoundName',
  ]));
  const reasonRemoved = cleanText(readFirst(current, [
    'ReasonRemoved',
    'ReasonRemovedName',
    'reasonRemoved',
    'reasonRemovedName',
  ]));

  if (!amisRecruitmentId || !amisCandidateId || !amisRecruitmentRoundId) return null;

  return {
    amisRecruitmentId,
    amisCandidateId,
    amisRecruitmentRoundId,
    amisRecruitmentRoundName: amisRecruitmentRoundName || null,
    reasonRemoved: reasonRemoved || null,
    amisStatus: readNumber(current, ['Status', 'status']) ?? null,
    sourceUrl,
    pageUrl,
    changedAt: new Date().toISOString(),
    isTransitionEvent: false,
  };
}

export function mapAmisCandidateAttractivePersonnelResponse(
  response: unknown,
  requestPayload: unknown,
  sourceUrl: string,
  pageUrl: string,
): AmisCandidateAttractivePersonnelChangedPayload | null {
  if (!isObject(response) || !isSuccessfulAmisResponse(response)) return null;

  const responseData = readCandidateSaveData(response);
  const requestData = isObject(requestPayload) ? requestPayload : null;
  const readMergedText = (keys: string[]) => cleanText(
    readFromObjects([...responseData, requestData], keys),
  );

  const amisRecruitmentId = readMergedText([
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
  ]) || extractAmisRecruitmentIdFromPageUrl(pageUrl);
  const amisCandidateId = readMergedText([
    'CandidateID',
    'CandidateId',
    'candidateId',
    'candidateID',
  ]);
  const attractivePersonnelId = readMergedText([
    'AttractivePersonnelID',
    'AttractivePersonnelId',
    'attractivePersonnelId',
    'attractivePersonnelID',
  ]);
  const attractivePersonnelName = readMergedText([
    'AttractivePersonnel',
    'AttractivePersonnelName',
    'attractivePersonnel',
    'attractivePersonnelName',
  ]);

  if (!amisRecruitmentId || !amisCandidateId || !attractivePersonnelId || !attractivePersonnelName) {
    return null;
  }

  const candidateName = readMergedText([
    'CandidateName',
    'candidateName',
    'Name',
    'name',
  ]);

  return {
    amisRecruitmentId,
    amisCandidateId,
    attractivePersonnelId,
    attractivePersonnelName,
    sourceUrl,
    pageUrl,
    changedAt: new Date().toISOString(),
    ...(candidateName ? { candidateName } : {}),
  };
}

function isSuccessfulAmisResponse(response: Record<string, unknown>) {
  const success = readFirstValue(response, ['Success', 'success']);
  return success === true || success === 1 || success === 'true' || success === '1';
}

function readCandidateSaveData(response: Record<string, unknown>) {
  const data = readFirstValue(response, ['Data', 'data']);
  if (!isObject(data)) return [];

  const nestedCandidate = readFirstValue(data, ['Candidate', 'candidate']);
  return [nestedCandidate, data].filter(isObject);
}

function readFromObjects(objects: Array<Record<string, unknown> | null>, keys: string[]) {
  for (const object of objects) {
    if (!object) continue;
    const value = readFirst(object, keys);
    if (value) return value;
  }

  return '';
}

function extractAmisRecruitmentIdFromPageUrl(pageUrl: string) {
  try {
    const pathSegments = new URL(pageUrl).pathname.split('/').filter(Boolean);
    const detailIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'detail');
    const recruitmentId = detailIndex >= 0 ? pathSegments[detailIndex + 1] : undefined;
    return cleanText(recruitmentId);
  } catch {
    return '';
  }
}

function getAmisApplicationIdentityId(item: AmisApplicationItem) {
  return item.candidateConvertId || item.candidateId;
}

function mapApplicationRow(row: unknown): AmisApplicationItem | null {
  if (!isObject(row)) return null;

  const fields = readApplicationRowFields(row);
  if (!fields.recruitmentId || !fields.recruitmentRoundId || !fields.candidateId || !fields.candidateName) return null;
  if (!fields.email && !fields.mobile) return null;

  return {
    recruitmentId: fields.recruitmentId,
    recruitmentRoundId: fields.recruitmentRoundId,
    candidateId: fields.candidateId,
    candidateName: fields.candidateName,
    ...omitUndefined({
      candidateConvertId: fields.candidateConvertId,
      email: fields.email,
      mobile: fields.mobile,
      birthday: fields.birthday,
      recruitmentRoundName: fields.recruitmentRoundName,
      reasonRemoved: fields.reasonRemoved,
      attractivePersonnelName: fields.attractivePersonnelName,
      attractivePersonnelId: fields.attractivePersonnelId,
      status: fields.status,
      recruitmentChannelId: fields.recruitmentChannelId,
      channelName: fields.channelName,
      applyDate: fields.applyDate,
      recruitmentTitle: fields.recruitmentTitle,
      attachmentCvId: fields.attachmentCvId,
      attachmentCvName: fields.attachmentCvName,
      educationDegreeName: fields.educationDegreeName,
      educationMajorName: fields.educationMajorName,
      workPlaceRecent: fields.workPlaceRecent,
    }),
    rawSnapshot: sanitizeApplicationSnapshot(row),
  };
}

function readApplicationRowFields(row: Record<string, unknown>) {
  return {
    recruitmentId: readCleanText(row, ['RecruitmentID', 'recruitmentId']),
    recruitmentRoundId: readCleanText(row, ['RecruitmentRoundID', 'recruitmentRoundId']),
    candidateId: readCleanText(row, ['CandidateID', 'candidateId']),
    candidateName: readCleanText(row, ['CandidateName', 'candidateName', 'Name', 'name']),
    email: readCleanText(row, ['Email', 'email']),
    mobile: readCleanText(row, ['Mobile', 'Phone', 'phone', 'mobile']),
    candidateConvertId: readCleanText(row, ['CandidateConvertID', 'candidateConvertId']),
    birthday: readCleanText(row, ['Birthday', 'birthday']),
    recruitmentRoundName: readCleanText(row, ['RecruitmentRoundName', 'recruitmentRoundName']),
    reasonRemoved: readCleanText(row, ['ReasonRemoved', 'ReasonRemovedName', 'reasonRemoved', 'reasonRemovedName']),
    attractivePersonnelName: readCleanText(row, ['AttractivePersonnel', 'attractivePersonnel', 'AttractivePersonnelName', 'attractivePersonnelName']),
    attractivePersonnelId: readCleanText(row, ['AttractivePersonnelID', 'attractivePersonnelId', 'AttractivePersonnelId']),
    status: readNumber(row, ['Status', 'status']),
    recruitmentChannelId: readNumber(row, ['RecruitmentChannelID', 'recruitmentChannelId']),
    channelName: readCleanText(row, [
      'ChannelName', 'channelName', 'RecruitmentChannelName', 'recruitmentChannelName',
      'SourceCandidateName', 'sourceCandidateName', 'SourceName', 'sourceName',
    ]),
    applyDate: readCleanText(row, ['ApplyDate', 'ApplyDateOnly', 'applyDate']),
    recruitmentTitle: readCleanText(row, ['RecruitmentTitle', 'recruitmentTitle']),
    attachmentCvId: readCleanText(row, ['AttachmentCVID', 'attachmentCvId']),
    attachmentCvName: readCleanText(row, ['AttachmentCVName', 'attachmentCvName']),
    educationDegreeName: readCleanText(row, ['EducationDegreeName', 'educationDegreeName']),
    educationMajorName: readCleanText(row, ['EducationMajorName', 'educationMajorName']),
    workPlaceRecent: readCleanText(row, ['WorkPlaceRecent', 'workPlaceRecent']),
  };
}

function readCleanText(data: Record<string, unknown>, keys: string[]) {
  const value = cleanText(readFirst(data, keys));
  return value || undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
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

function sanitizeApplicationSnapshot(row: Record<string, unknown>) {
  const allowedKeys = new Set([
    'RecruitmentID',
    'RecruitmentRoundID',
    'RecruitmentRoundName',
    'ReasonRemoved',
    'ReasonRemovedName',
    'AttractivePersonnel',
    'AttractivePersonnelID',
    'AttractivePersonnelName',
    'Status',
    'SortOrder',
    'CandidateID',
    'CandidateConvertID',
    'RecruitmentChannelID',
    'RecruitmentChannelName',
    'SourceCandidateName',
    'SourceName',
    'AttachmentCVID',
    'AttachmentCVName',
    'ChannelName',
    'ApplyDate',
    'RecruitmentTitle',
    'RecruitmentPeriodID',
    'EducationDegreeName',
    'EducationMajorName',
    'WorkPlaceRecent',
    'IsHaveCV',
    'IsDuplicate',
  ]);
  const snapshot: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const value = row[key];
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
