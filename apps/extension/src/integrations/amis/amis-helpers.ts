import type {
  AmisApplicationItem,
  AmisApplicationsForRecruitment,
  AmisAutoSyncState,
  AmisCandidateSourceSelectionResponse,
  AmisCandidateStageChangedPayload,
  AmisExtractionResult,
  AmisJobSnapshot,
  AmisRecruitmentRound,
  JobDescriptionSummary,
} from '@/types/types';
import { normalizeOptionalText, truncateForMaxLength, wait } from '@/lib/utils';

export const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
export const FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_APPLICATIONS';
export const UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE = 'VCS_UPLOAD_AMIS_CV_FILE';
export const SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE = 'VCS_SELECT_AMIS_CANDIDATE_SOURCE';
export const GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_CONTEXT';
export const GET_AMIS_RECRUITMENT_ROUNDS_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_ROUNDS';
export const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
export const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';
export const AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE = 'AMIS_CANDIDATE_STAGE_CHANGED';
export const AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_ROUNDS_CHANGED';
export const GET_AMIS_CANDIDATE_FORM_STATE_MESSAGE_TYPE = 'VCS_GET_AMIS_CANDIDATE_FORM_STATE';

export const AMIS_SOURCE_NAME_BY_CHANNEL: Readonly<Record<string, string>> = {
  VCSPORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ITViec',
  LINKEDIN: 'LinkedIn',
  VIETNAMWORKS: 'VietnamWorks',
};

export async function getActiveTab() {
  const [activeTab] = (await chrome.tabs?.query({ active: true, currentWindow: true })) ?? [];

  if (!activeTab?.id) {
    throw new Error('No active tab found. Open the AMIS recruitment tab and retry.');
  }

  return {
    id: activeTab.id,
    url: activeTab.url,
  };
}

/**
 * Find an already open AMIS tab without changing the user's active tab.
 * This is used by background catalog hydration for self-service panels.
 */
export async function getAnyAmisTab() {
  const tabs = (await chrome.tabs?.query({}) ?? [])
    .filter((tab) => tab.id !== undefined && tab.url?.startsWith('https://amisapp.misa.vn/'));
  const amisTab = tabs.find((tab) => (tab as typeof tab & { active?: boolean }).active) ?? tabs[0];

  if (!amisTab?.id) {
    throw new Error('No AMIS tab found. Open an AMIS recruitment tab and retry.');
  }

  return {
    id: amisTab.id,
    url: amisTab.url,
  };
}

export async function sendMessageToAmisTab(tabId: number, message: unknown, frameId?: number) {
  if (!chrome.tabs?.sendMessage) {
    throw new Error('Chrome tabs messaging is unavailable.');
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message, frameId === undefined ? undefined : { frameId });
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;
    await injectAmisBridge(tabId);
    await wait(250);
    return chrome.tabs.sendMessage(tabId, message, frameId === undefined ? undefined : { frameId });
  }
}

export async function injectAmisBridge(tabId: number) {
  if (!chrome.scripting?.executeScript) {
    throw new Error('Cannot inject AMIS bridge because chrome.scripting is unavailable.');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['assets/amis-bridge.js'],
  });
}

export function isMissingContentScriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /receiving end does not exist|could not establish connection/i.test(message);
}

export function isLikelyAmisRecruitmentPage(url: string) {
  try {
    const parsedUrl = new URL(url);
    const target = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.toLowerCase();
    return (
      target.includes('recruitment')
      || target.includes('candidate')
      || target.includes('ung-vien')
      || target.includes('tin-tuyen-dung')
      || target.includes('tuyen-dung')
    );
  } catch {
    return false;
  }
}

export function isAmisJobInitiationPage(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname.toLowerCase() === 'amisapp.misa.vn'
      && parsedUrl.pathname.toLowerCase().includes('/job/initiation')
    );
  } catch {
    return false;
  }
}

export function normalizeAmisJobInitiationUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function parseAmisRecruitmentContextFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    const candidatePathMatch = path.match(/\/paging_candidate\/([^/?#]+)/i);
    const jobDetailPathMatch = path.match(/\/recruit\/job\/detail\/(\d{3,})(?:\/|$)/i);
    const genericRecruitmentMatch = path.match(/\/(?:recruitment|tin-tuyen-dung|job)[^/]*(?:\/|%2F)(\d{3,})/i);
    const queryRecruitmentId =
      parsedUrl.searchParams.get('recruitmentID')
      ?? parsedUrl.searchParams.get('RecruitmentID')
      ?? parsedUrl.searchParams.get('recruitmentId')
      ?? parsedUrl.searchParams.get('id');
    const queryRoundId =
      parsedUrl.searchParams.get('recruitmentRoundID')
      ?? parsedUrl.searchParams.get('RecruitmentRoundID')
      ?? parsedUrl.searchParams.get('recruitmentRoundId')
      ?? parsedUrl.searchParams.get('roundID')
      ?? parsedUrl.searchParams.get('RoundID')
      ?? parsedUrl.searchParams.get('roundId');

    return {
      amisRecruitmentId:
        candidatePathMatch?.[1]
        ?? jobDetailPathMatch?.[1]
        ?? queryRecruitmentId
        ?? genericRecruitmentMatch?.[1]
        ?? null,
      amisRecruitmentRoundId: queryRoundId,
      amisCandidateId: jobDetailPathMatch ? parsedUrl.searchParams.get('id') : null,
      sourceUrl: candidatePathMatch?.[1] ? url : null,
    };
  } catch {
    return {
      amisRecruitmentId: null,
      amisRecruitmentRoundId: null,
      amisCandidateId: null,
      sourceUrl: null,
    };
  }
}

export function buildAmisFormFillPayload(jobDescription: JobDescriptionSummary) {
  return {
    positionName: jobDescription.position?.name ?? '',
    summary: truncateForMaxLength(
      jobDescription.summary ?? jobDescription.overview ?? jobDescription.description,
      500,
    ),
    responsibilities: jobDescription.responsibilities ?? jobDescription.description,
    requirements: stringifyStructuredContent(jobDescription.requirements),
    benefits: stringifyStructuredContent(jobDescription.benefits),
  };
}

export function buildAmisJobSnapshotFromJobDescription(jobDescription: JobDescriptionSummary): AmisJobSnapshot {
  const requirements = stringifyStructuredContent(jobDescription.requirements);
  const description =
    stringifyStructuredContent(jobDescription.description)
    || stringifyStructuredContent(jobDescription.responsibilities)
    || stringifyStructuredContent(jobDescription.overview)
    || jobDescription.title;
  const summary = truncateForMaxLength(
    stringifyStructuredContent(jobDescription.summary)
    || stringifyStructuredContent(jobDescription.overview)
    || description,
    500,
  );
  const location = stringifyStructuredContent(jobDescription.department);
  const deadline = normalizeAmisSnapshotDeadline(jobDescription.applicationDeadline);

  return {
    title: jobDescription.title.trim(),
    ...(summary ? { summary } : {}),
    description,
    requirements: {
      rawText: requirements || description,
    },
    benefits: jobDescription.benefits ?? undefined,
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

export function sanitizeAmisJobSnapshotForApi(snapshot: AmisJobSnapshot): AmisJobSnapshot {
  const title = stringifyStructuredContent(snapshot.title);
  const description = stringifyStructuredContent(snapshot.description) || title;
  const summary = snapshot.summary
    ? truncateForMaxLength(stringifyStructuredContent(snapshot.summary), 500)
    : undefined;
  const rawText = stringifyStructuredContent(snapshot.requirements.rawText) || description;
  const location = stringifyStructuredContent(snapshot.location);
  const deadline = normalizeAmisSnapshotDeadline(snapshot.deadline);
  const benefits = normalizeOptionalSnapshotBenefits(snapshot.benefits);

  return {
    title,
    description,
    ...(summary ? { summary } : {}),
    requirements: {
      ...snapshot.requirements,
      rawText,
    },
    ...(benefits !== undefined ? { benefits } : {}),
    ...(location ? { location } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

export function normalizeOptionalSnapshotBenefits(value: AmisJobSnapshot['benefits']) {
  if (typeof value === 'string') {
    const normalized = stringifyStructuredContent(value);
    return normalized || undefined;
  }
  return value ?? undefined;
}

export function normalizeAmisSnapshotDeadline(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  const vietnameseDateMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (vietnameseDateMatch) {
    const [, day, month, year] = vietnameseDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
  }

  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
}

export function stringifyStructuredContent(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredContent(item))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const textValue = getPlainTextRecordValue(record);
    if (textValue !== null) return textValue;

    return Object.entries(value)
      .map(([key, item]) => {
        const content = stringifyStructuredContent(item);
        if (!content) return '';
        if (key === 'text' || key === 'rawText') return content;
        return `${formatFieldLabel(key)}:\n${content}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

export function getPlainTextRecordValue(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;

  const [key] = keys;
  if (key !== 'text' && key !== 'rawText') return null;

  const content = stringifyStructuredContent(value[key]);
  return content || null;
}

export function formatFieldLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeAmisSourceChannel(value?: string | null) {
  return (
    normalizeOptionalText(value)
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '') ?? null
  );
}

export function getAmisSourceName(sourceChannel?: string | null) {
  const normalizedChannel = normalizeAmisSourceChannel(sourceChannel);
  return normalizedChannel ? AMIS_SOURCE_NAME_BY_CHANNEL[normalizedChannel] ?? null : null;
}

export function canUploadApplicationCv(application: AmisApplicationsForRecruitment['applications'][number]) {
  return (
    Boolean(application.currentCvDocumentId)
    && application.cvSanitizeStatus?.toUpperCase() === 'SANITIZED'
    && !application.attachmentCvId
    && !application.attachmentCvName
  );
}

export function buildAmisUploadCvFileName(
  application: AmisApplicationsForRecruitment['applications'][number],
  fallbackFileName: string,
) {
  const extension = fallbackFileName.match(/\.[a-z0-9]{2,8}$/i)?.[0] ?? '.pdf';
  const identity =
    application.email
    || application.candidateName
    || application.candidateId
    || 'candidate';
  const safeIdentity =
    identity
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .toLowerCase() || 'candidate';
  const shortApplicationId = application.applicationId.replace(/-/g, '').slice(0, 8);

  return `${safeIdentity}-${shortApplicationId}${extension.toLowerCase()}`;
}

export function isAutoSyncUpdateMessage(value: unknown): value is {
  type: 'AMIS_AUTO_SYNC_STATE_UPDATED';
  payload: AmisAutoSyncState;
} {
  return (
    typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'AMIS_AUTO_SYNC_STATE_UPDATED'
    && typeof (value as { payload?: { status?: unknown } }).payload?.status === 'string'
  );
}

export function isAmisCaptureUpdatedMessage(value: unknown): value is {
  type: 'AMIS_RECRUITMENT_CAPTURE_UPDATED';
  payload: AmisExtractionResult;
  sourceTabId?: number;
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== 'AMIS_RECRUITMENT_CAPTURE_UPDATED') return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;

  return (
    typeof (payload as { status?: unknown }).status === 'string'
    && typeof (payload as { detected?: unknown }).detected === 'boolean'
    && typeof (payload as { url?: unknown }).url === 'string'
    && Array.isArray((payload as { missingFields?: unknown }).missingFields)
    && ((value as { sourceTabId?: unknown }).sourceTabId === undefined
      || typeof (value as { sourceTabId?: unknown }).sourceTabId === 'number')
  );
}

export function isRecruitmentContextChangedMessage(value: unknown): value is {
  type: typeof RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE;
  payload: {
    ok: boolean;
    pageUrl: string;
    pageKind?: string;
    amisRecruitmentId?: string;
    amisRecruitmentRoundId?: string;
    sourceUrl?: string;
    timestamp: string;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (
    (value as { type?: unknown }).type === RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { ok?: unknown }).ok === 'boolean'
    && typeof (payload as { pageUrl?: unknown }).pageUrl === 'string'
  );
}

export function isApplicationsSyncedMessage(value: unknown): value is {
  type: typeof AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
    jobPostingId: string;
    syncedCount: number;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (
    (value as { type?: unknown }).type === AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { amisRecruitmentId?: unknown }).amisRecruitmentId === 'string'
  );
}

export function isAmisCandidateStageChangedMessage(value: unknown): value is {
  type: typeof AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE;
  payload: AmisCandidateStageChangedPayload;
  sourceTabId?: number;
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE) return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;

  const stage = payload as Partial<AmisCandidateStageChangedPayload>;
  return (
    typeof stage.amisRecruitmentId === 'string'
    && typeof stage.amisCandidateId === 'string'
    && typeof stage.amisRecruitmentRoundId === 'string'
    && (stage.amisRecruitmentRoundName === null || typeof stage.amisRecruitmentRoundName === 'string')
    && (stage.amisStatus === null || typeof stage.amisStatus === 'number')
    && (stage.reasonRemoved === undefined || stage.reasonRemoved === null || typeof stage.reasonRemoved === 'string')
    && typeof stage.sourceUrl === 'string'
    && typeof stage.pageUrl === 'string'
    && typeof stage.changedAt === 'string'
    && (typeof (value as { sourceTabId?: unknown }).sourceTabId === 'undefined'
      || typeof (value as { sourceTabId?: unknown }).sourceTabId === 'number')
  );
}

export function isAmisRecruitmentRoundsChangedMessage(value: unknown): value is {
  type: typeof AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
    rounds: AmisRecruitmentRound[];
    sourceUrl: string;
    pageUrl: string;
    capturedAt: string;
  };
} {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE) return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;
  const roundsPayload = payload as {
    amisRecruitmentId?: unknown;
    rounds?: unknown;
    sourceUrl?: unknown;
    pageUrl?: unknown;
    capturedAt?: unknown;
  };

  return (
    typeof roundsPayload.amisRecruitmentId === 'string'
    && typeof roundsPayload.sourceUrl === 'string'
    && typeof roundsPayload.pageUrl === 'string'
    && typeof roundsPayload.capturedAt === 'string'
    && Array.isArray(roundsPayload.rounds)
    && roundsPayload.rounds.every(isAmisRecruitmentRound)
  );
}

export function isExtractionForRecruitment(extraction: AmisExtractionResult, recruitmentId: string) {
  return (
    extraction.detected
    && Boolean(extraction.snapshot)
    && normalizeOptionalText(extraction.amisRecruitmentId) === recruitmentId
  );
}

export function getAutoSyncStateRecruitmentId(state: AmisAutoSyncState) {
  return (
    normalizeOptionalText(state.capture?.amisRecruitmentId)
    ?? normalizeOptionalText(state.result?.amisRecruitmentId)
  );
}

export function isAmisRecruitmentContextResponse(value: unknown): value is {
  ok: boolean;
  pageUrl: string;
  pageKind?: string;
  amisRecruitmentId?: string;
  amisRecruitmentRoundId?: string;
  sourceUrl?: string;
} {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
  );
}

export function isAmisRecruitmentRoundsResponse(value: unknown): value is {
  ok: boolean;
  amisRecruitmentId: string | null;
  rounds: AmisRecruitmentRound[];
  sourceUrl: string;
  error?: string;
} {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && (typeof (value as { amisRecruitmentId?: unknown }).amisRecruitmentId === 'string'
      || (value as { amisRecruitmentId?: unknown }).amisRecruitmentId === null)
    && typeof (value as { sourceUrl?: unknown }).sourceUrl === 'string'
    && Array.isArray((value as { rounds?: unknown }).rounds)
    && (value as { rounds: unknown[] }).rounds.every(isAmisRecruitmentRound)
  );
}

export function isAmisRecruitmentRound(value: unknown): value is AmisRecruitmentRound {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
    && typeof (value as { sortOrder?: unknown }).sortOrder === 'number'
    && ((value as { roundType?: unknown }).roundType === null
      || typeof (value as { roundType?: unknown }).roundType === 'number')
    && ((value as { roundTypeId?: unknown }).roundTypeId === null
      || typeof (value as { roundTypeId?: unknown }).roundTypeId === 'string')
    && ((value as { color?: unknown }).color === null
      || typeof (value as { color?: unknown }).color === 'string')
  );
}

export function isAmisApplicationsFetchResponse(value: unknown): value is {
  ok: boolean;
  sourceUrl: string;
  items: AmisApplicationItem[];
  rawCount: number;
  error?: string;
} {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && typeof (value as { sourceUrl?: unknown }).sourceUrl === 'string'
    && Array.isArray((value as { items?: unknown }).items)
  );
}

export function isUploadAmisCvFileResponse(value: unknown): value is {
  ok: boolean;
  fileName?: string;
  fileNames?: string[];
  fileCount?: number;
  target?: string;
  error?: string;
} {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

export function isSelectAmisCandidateSourceResponse(value: unknown): value is AmisCandidateSourceSelectionResponse {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

export function isConfirmedAmisCandidateSourceSelection(value: unknown, expectedSourceName: string) {
  if (!isSelectAmisCandidateSourceResponse(value) || !value.ok) return false;
  const expectedKey = normalizeAmisSourceChannel(expectedSourceName);
  return (
    normalizeAmisSourceChannel(value.sourceName) === expectedKey
    && normalizeAmisSourceChannel(value.diagnostics?.confirmedFieldValue) === expectedKey
    && value.diagnostics?.sourceOptionFound === true
    && value.diagnostics?.sourceOptionClicked === true
  );
}

export function formatAmisCandidateSourceSelectionFailure(value: unknown) {
  if (!isSelectAmisCandidateSourceResponse(value)) {
    return ' AMIS không trả về kết quả chọn nguồn hợp lệ.';
  }

  const code = value.code ? ` [${value.code}]` : '';
  const diagnostics = value.diagnostics;
  const visibleSources = diagnostics?.visibleOptionLabels.slice(-6).join(', ') ?? '';
  const details = diagnostics
    ? ` Bước: field=${diagnostics.fieldFound ? 'ok' : 'missing'}, control=${diagnostics.controlFound ? 'ok' : 'missing'}, popup=${diagnostics.popupFound ? 'ok' : 'missing'}, search=${diagnostics.searchInputFound ? `${diagnostics.searchInputLocation ?? 'unknown'}:${diagnostics.searchQuery}` : 'fallback-option-scan'}, scroll=${diagnostics.optionScrollPasses}.`
    : '';
  const sources = visibleSources ? ` Nguồn đã thấy: ${visibleSources}.` : '';
  return `${code} ${value.error ?? 'Hãy chọn nguồn này trên AMIS trước khi lưu.'}${details}${sources}`;
}

export function isFillResponse(value: unknown): value is {
  ok: boolean;
  filledFields: string[];
  missingFields: string[];
  error?: string;
} {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && Array.isArray((value as { filledFields?: unknown }).filledFields)
    && Array.isArray((value as { missingFields?: unknown }).missingFields)
  );
}
