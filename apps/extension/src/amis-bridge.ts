import type { AmisApplicationItem, AmisCareerFetchResponse, AmisCareerItem, AmisDiagnosticEvent, AmisExtractionResult, AmisSelectedCareerResult } from './types';

(() => {

const AMIS_CAPTURE_MESSAGE_TYPE = 'VCS_AMIS_SAVE_RECRUITMENT_CAPTURED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'VCS_AMIS_DIAGNOSTIC';
const BACKGROUND_MESSAGE_TYPE = 'AMIS_RECRUITMENT_SAVED';
const BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE = 'AMIS_DIAGNOSTIC_EVENT';
const BRIDGE_INSTALLED_KEY = '__VCS_AMIS_BRIDGE_INSTALLED__';
const RECRUITMENT_CONTEXT_OBSERVER_INSTALLED_KEY = '__VCS_AMIS_RECRUITMENT_CONTEXT_OBSERVER_INSTALLED__';
const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const FETCH_AMIS_CAREERS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_CAREERS';
const FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_APPLICATIONS';
const UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE = 'VCS_UPLOAD_AMIS_CV_FILE';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_CONTEXT';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
const AMIS_CAREER_DATA_PAGING_URL = 'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/Career/data_paging';
const AMIS_CAREER_SORT = 'W3sic2VsZWN0b3IiOiAiVXNhZ2VTdGF0dXMiLCAiZGVzYyI6ICJmYWxzZSJ9LHsic2VsZWN0b3IiOiAiQ2FyZWVyTmFtZSIsICJkZXNjIjogImZhbHNlIn1d';
const RECRUITMENT_CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;
let lastRecruitmentContextCache: {
  amisRecruitmentId: string;
  amisRecruitmentRoundId: string | null;
  sourceUrl: string;
  capturedAt: number;
} | null = null;
const CAREER_LABEL_TEXT = 'Ng\u00e0nh ngh\u1ec1';
const CAREER_LABEL_TEXT_MOJIBAKE = 'NgÃ nh nghá»';

interface AmisRecruitmentFormFillPayload {
  title: string;
  positionName: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  benefits: string;
}

interface AmisRecruitmentFormFillResponse {
  ok: boolean;
  filledFields: string[];
  missingFields: string[];
  error?: string;
}

interface FetchAmisCareersMessage {
  type: typeof FETCH_AMIS_CAREERS_MESSAGE_TYPE;
  payload?: {
    organizationUnitId?: string;
  };
}

interface FetchAmisApplicationsMessage {
  type: typeof FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE;
  payload?: {
    sourceUrl?: string;
  };
}

interface AmisApplicationsFetchResponse {
  ok: boolean;
  sourceUrl: string;
  items: AmisApplicationItem[];
  rawCount: number;
  error?: string;
}

interface UploadAmisCvFileMessage {
  type: typeof UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE;
  payload: {
    files: Array<{
      fileName: string;
      mimeType: string;
      dataBase64: string;
    }>;
  };
}

interface UploadAmisCvFileResponse {
  ok: boolean;
  fileName?: string;
  fileNames?: string[];
  fileCount?: number;
  target?: string;
  error?: string;
}

interface QuillLike {
  root?: HTMLElement;
  setText?: (text: string, source?: string) => void;
  clipboard?: {
    dangerouslyPasteHTML?: (...args: unknown[]) => void;
  };
  update?: (source?: string) => void;
}

interface QuillContainer extends HTMLElement {
  __quill?: QuillLike;
}

const bridgeWindow = window as Window & {
  [BRIDGE_INSTALLED_KEY]?: boolean;
  [RECRUITMENT_CONTEXT_OBSERVER_INSTALLED_KEY]?: boolean;
};
const wasBridgeInstalled = bridgeWindow[BRIDGE_INSTALLED_KEY] === true;

if (!wasBridgeInstalled) {
  bridgeWindow[BRIDGE_INSTALLED_KEY] = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (isCaptureMessage(event.data)) {
      void chrome.runtime?.sendMessage?.({
        type: BACKGROUND_MESSAGE_TYPE,
        payload: event.data.payload,
      }).catch(() => undefined);
      return;
    }

    if (isDiagnosticMessage(event.data)) {
      sendDiagnostic(event.data.payload);
    }
  });

  chrome.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
    if (isGetSelectedCareerMessage(message)) {
      sendResponse(getSelectedCareerFromPage());
      return;
    }

    if (isGetRecruitmentContextMessage(message)) {
      sendResponse(getRecruitmentContextFromPage());
      return;
    }

    if (isFetchAmisCareersMessage(message)) {
      void fetchAmisCareers(message.payload?.organizationUnitId)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            sourceUrl: AMIS_CAREER_DATA_PAGING_URL,
            items: [],
            rawCount: 0,
            error: error instanceof Error ? error.message : 'Could not fetch AMIS careers.',
          } satisfies AmisCareerFetchResponse);
        });

      return true;
    }

    if (isFetchAmisApplicationsMessage(message)) {
      void fetchAmisApplications(message.payload?.sourceUrl)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            sourceUrl: message.payload?.sourceUrl ?? window.location.href,
            items: [],
            rawCount: 0,
            error: error instanceof Error ? error.message : 'Could not fetch AMIS applications.',
          } satisfies AmisApplicationsFetchResponse);
        });

      return true;
    }

    if (isUploadAmisCvFileMessage(message)) {
      void uploadAmisCvFile(message.payload)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not upload CV file into AMIS form.',
          } satisfies UploadAmisCvFileResponse);
        });

      return true;
    }

    if (!isFillAmisRecruitmentFormMessage(message)) return;

    void fillAmisRecruitmentForm(message.payload)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          filledFields: [],
          missingFields: [],
          error: error instanceof Error ? error.message : 'Could not fill the AMIS recruitment form.',
        } satisfies AmisRecruitmentFormFillResponse);
      });

    return true;
  });

  installSelectedCareerObserver();
}

if (!bridgeWindow[RECRUITMENT_CONTEXT_OBSERVER_INSTALLED_KEY]) {
  bridgeWindow[RECRUITMENT_CONTEXT_OBSERVER_INSTALLED_KEY] = true;
  installRecruitmentContextObserver();
}

sendDiagnostic({
  type: 'BRIDGE_READY',
  pageUrl: window.location.href,
  timestamp: new Date().toISOString(),
  frameUrl: window.location.href,
  details: {
    reused: wasBridgeInstalled,
  },
});

function sendDiagnostic(event: AmisDiagnosticEvent) {
  void chrome.runtime?.sendMessage?.({
    type: BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE,
    payload: event,
  }).catch(() => undefined);
}

function getSelectedCareerFromPage(): AmisSelectedCareerResult {
  try {
    const selectedCareerName = readSelectedCareerName();
    return {
      ok: true,
      pageUrl: window.location.href,
      ...(selectedCareerName ? { careerName: selectedCareerName } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      pageUrl: window.location.href,
      error: error instanceof Error ? error.message : 'Could not read selected AMIS career.',
    };
  }
}

function getRecruitmentContextFromPage() {
  if (isLikelyRecruitmentListPage()) {
    lastRecruitmentContextCache = null;
    return {
      ok: false,
      pageUrl: window.location.href,
      pageKind: 'LIST',
      error: 'Current AMIS page is the recruitment list, not a recruitment detail.',
    };
  }

  const urls = [
    window.location.href,
    ...getRecentRecruitmentResourceUrls(),
  ];

  for (const url of urls) {
    const context = parseRecruitmentContextFromUrl(url);
    if (context.amisRecruitmentId) {
      lastRecruitmentContextCache = {
        amisRecruitmentId: context.amisRecruitmentId,
        amisRecruitmentRoundId: context.amisRecruitmentRoundId ?? null,
        sourceUrl: url,
        capturedAt: Date.now(),
      };

      return {
        ok: true,
        pageUrl: window.location.href,
        sourceUrl: url,
        ...context,
      };
    }
  }

  if (
    lastRecruitmentContextCache
    && Date.now() - lastRecruitmentContextCache.capturedAt <= RECRUITMENT_CONTEXT_CACHE_TTL_MS
  ) {
    return {
      ok: true,
      pageUrl: window.location.href,
      sourceUrl: lastRecruitmentContextCache.sourceUrl,
      amisRecruitmentId: lastRecruitmentContextCache.amisRecruitmentId,
      amisRecruitmentRoundId: lastRecruitmentContextCache.amisRecruitmentRoundId,
    };
  }

  return {
    ok: false,
    pageUrl: window.location.href,
    pageKind: 'UNKNOWN',
    error: 'No AMIS recruitment id was found in URL or resource timing.',
  };
}

function isLikelyRecruitmentListPage() {
  const bodyText = cleanText(document.body?.innerText).toLowerCase();
  if (!bodyText) return false;

  const hasListHeading = /\btin tuyển dụng\b/i.test(bodyText) || /\btuyển dụng\b/i.test(bodyText);
  const hasListActions = bodyText.includes('thêm mới')
    || bodyText.includes('xuất khẩu tin')
    || bodyText.includes('tìm kiếm nhanh trong danh sách')
    || bodyText.includes('sắp xếp theo');
  const hasDetailActions = bodyText.includes('thêm ứng viên')
    || bodyText.includes('thêm hàng loạt')
    || bodyText.includes('lịch phỏng vấn')
    || bodyText.includes('thi tuyển trực tuyến');

  return hasListHeading && hasListActions && !hasDetailActions;
}

function getRecentRecruitmentResourceUrls() {
  const now = performance.now();
  return performance.getEntriesByType('resource')
    .filter((entry) => now - entry.startTime <= RECRUITMENT_CONTEXT_CACHE_TTL_MS)
    .map((entry) => entry.name)
    .filter((url) => /\/paging_candidate\/|recruitmentRoundID=/i.test(url))
    .reverse();
}

function parseRecruitmentContextFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const candidatePathMatch = parsedUrl.pathname.match(/\/paging_candidate\/([^/?#]+)/i);
    const jobDetailPathMatch = parsedUrl.pathname.match(/\/recruit\/job\/detail\/(\d{3,})(?:\/|$)/i);
    const genericRecruitmentMatch = parsedUrl.pathname.match(/\/(?:recruitment|tin-tuyen-dung|job)[^/]*(?:\/[^/]+)*(?:\/|%2F)(\d{3,})/i);
    const recruitmentId = candidatePathMatch?.[1]
      ?? jobDetailPathMatch?.[1]
      ?? genericRecruitmentMatch?.[1]
      ?? parsedUrl.searchParams.get('recruitmentID')
      ?? parsedUrl.searchParams.get('RecruitmentID')
      ?? parsedUrl.searchParams.get('recruitmentId')
      ?? parsedUrl.searchParams.get('id');
    const recruitmentRoundId = parsedUrl.searchParams.get('recruitmentRoundID')
      ?? parsedUrl.searchParams.get('RecruitmentRoundID')
      ?? parsedUrl.searchParams.get('recruitmentRoundId');

    return {
      amisRecruitmentId: recruitmentId,
      amisRecruitmentRoundId: recruitmentRoundId,
    };
  } catch {
    return {
      amisRecruitmentId: null,
      amisRecruitmentRoundId: null,
    };
  }
}

function installSelectedCareerObserver() {
  let lastCareerName = '';
  let timeoutId: number | undefined;

  const publishIfChanged = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      const careerName = readSelectedCareerName();
      if (careerName === lastCareerName) return;
      lastCareerName = careerName;
      void chrome.runtime?.sendMessage?.({
        type: SELECTED_CAREER_CHANGED_MESSAGE_TYPE,
        payload: {
          careerName,
          pageUrl: window.location.href,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => undefined);
    }, 250);
  };

  publishIfChanged();

  const observer = new MutationObserver(publishIfChanged);
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  window.addEventListener('focus', publishIfChanged);
  document.addEventListener('change', publishIfChanged, true);
  document.addEventListener('input', publishIfChanged, true);
  document.addEventListener('click', () => window.setTimeout(publishIfChanged, 300), true);
}

function installRecruitmentContextObserver() {
  let lastSignature = '';
  let timeoutId: number | undefined;

  const publishIfChanged = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      const context = getRecruitmentContextFromPage();
      const amisRecruitmentId = 'amisRecruitmentId' in context ? context.amisRecruitmentId : null;
      const amisRecruitmentRoundId = 'amisRecruitmentRoundId' in context ? context.amisRecruitmentRoundId : null;
      const sourceUrl = 'sourceUrl' in context ? context.sourceUrl : null;
      const signature = JSON.stringify({
        ok: context.ok,
        pageUrl: context.pageUrl,
        pageKind: context.pageKind ?? null,
        amisRecruitmentId,
        amisRecruitmentRoundId,
        sourceUrl,
      });
      if (signature === lastSignature) return;
      lastSignature = signature;

      void chrome.runtime?.sendMessage?.({
        type: RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE,
        payload: {
          ...context,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => undefined);
    }, 250);
  };

  publishIfChanged();
  const intervalId = window.setInterval(publishIfChanged, 1000);
  window.addEventListener('beforeunload', () => window.clearInterval(intervalId), { once: true });
  window.addEventListener('focus', publishIfChanged);
  window.addEventListener('hashchange', publishIfChanged);
  window.addEventListener('popstate', publishIfChanged);
  document.addEventListener('click', () => window.setTimeout(publishIfChanged, 300), true);
}

function readSelectedCareerName() {
  return readFieldValueNearLabel(CAREER_LABEL_TEXT)
    || readFieldValueNearLabel(CAREER_LABEL_TEXT_MOJIBAKE)
    || readLikelyCareerChipText();
}

function readFieldValueNearLabel(labelText: string) {
  const label = findVisibleTextElement(labelText)
    ?? findVisibleTextElement(CAREER_LABEL_TEXT)
    ?? findVisibleTextElement(CAREER_LABEL_TEXT_MOJIBAKE);
  if (!label) return '';

  const labelRect = label.getBoundingClientRect();
  const candidates = getVisibleElements<HTMLElement>('input, textarea, [role="combobox"], .dx-texteditor, .dx-dropdowneditor')
    .map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
      value: readControlText(element),
    }))
    .filter((candidate) => candidate.value)
    .filter((candidate) => candidate.rect.top >= labelRect.bottom - 8)
    .filter((candidate) => Math.abs(candidate.rect.left - labelRect.left) < 80 || candidate.rect.left >= labelRect.left - 10)
    .sort((a, b) => {
      const aDistance = Math.abs(a.rect.top - labelRect.bottom) + Math.abs(a.rect.left - labelRect.left) / 10;
      const bDistance = Math.abs(b.rect.top - labelRect.bottom) + Math.abs(b.rect.left - labelRect.left) / 10;
      return aDistance - bDistance;
    });

  const value = candidates[0]?.value ?? '';
  if (/^chọn ngành nghề$/i.test(value)) return '';
  return value;
}

function readLikelyCareerChipText() {
  const chips = getVisibleElements<HTMLElement>('.dx-tag-content, .dx-tag, [class*="tag-content"], [class*="tag"]')
    .map((element) => cleanText(element.innerText || element.textContent).replace(/[×x]\s*$/i, '').trim())
    .filter(Boolean)
    .filter((value) => !/^(phòng ban|cấp bậc|địa điểm|chọn ngành nghề|chá»n ngÃ nh nghá»)$/i.test(value));

  return chips.find((value) => /cntt|phần mềm|kinh doanh|marketing|kế toán|nhân sự|ngân hàng|điện/i.test(value)) ?? '';
}

function findVisibleTextElement(labelText: string) {
  const normalizedLabel = cleanText(labelText).toLowerCase();
  return getVisibleElements<HTMLElement>('label, span, div, p')
    .find((element) => {
      const text = cleanText(element.innerText || element.textContent);
      return text.toLowerCase() === normalizedLabel || text.toLowerCase() === `${normalizedLabel} *`;
    });
}

function readControlText(element: HTMLElement) {
  const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element
    : element.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  const value = cleanText(input?.value)
    || cleanText(input?.getAttribute('aria-label'))
    || cleanText(input?.getAttribute('title'))
    || cleanText(element.getAttribute('aria-label'))
    || cleanText(element.getAttribute('title'))
    || cleanText(element.innerText || element.textContent);

  return value
    .replace(/\+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fillAmisRecruitmentForm(
  payload: AmisRecruitmentFormFillPayload,
): Promise<AmisRecruitmentFormFillResponse> {
  await waitForElement('.dx-texteditor-input, .ql-editor.dx-htmleditor-content', 8000);

  const filledFields: string[] = [];
  const missingFields: string[] = [];
  const textInputs = getVisibleElements<HTMLInputElement>('input.dx-texteditor-input[type="text"]');

  fillTextInput(textInputs[0], payload.title, 'title', filledFields, missingFields);
  fillTextInput(textInputs[1], payload.positionName, 'position', filledFields, missingFields);

  fillTextInput(
    findTextareaByDxPlaceholder('Mô tả tóm tắt') ?? getVisibleElements<HTMLTextAreaElement>('textarea.dx-texteditor-input')[0],
    payload.summary,
    'summary',
    filledFields,
    missingFields,
  );

  fillHtmlEditorByPlaceholder(
    'Những công việc mà vị trí này phải đảm nhận',
    payload.responsibilities,
    'responsibilities',
    filledFields,
    missingFields,
  );
  fillHtmlEditorByPlaceholder(
    'Những yêu cầu mà ứng viên phải đáp ứng',
    payload.requirements,
    'requirements',
    filledFields,
    missingFields,
  );
  fillHtmlEditorByPlaceholder(
    'Những quyền lợi mà ứng viên được nhận nếu trúng tuyển',
    payload.benefits,
    'benefits',
    filledFields,
    missingFields,
  );

  return {
    ok: filledFields.length > 0,
    filledFields,
    missingFields,
    error: filledFields.length === 0 ? 'No matching AMIS recruitment form fields were found.' : undefined,
  };
}

async function fetchAmisCareers(initialOrganizationUnitId?: string): Promise<AmisCareerFetchResponse> {
  const pageSize = 25;
  const allRows: unknown[] = [];
  let organizationUnitId = cleanText(initialOrganizationUnitId);

  for (let pageIndex = 1; pageIndex <= 20; pageIndex += 1) {
    const response = await fetch(AMIS_CAREER_DATA_PAGING_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(buildCareerDataPagingPayload(pageIndex, pageSize, organizationUnitId)),
    });

    if (!response.ok) {
      throw new Error(`AMIS Career/data_paging returned HTTP ${response.status}.`);
    }

    const json = await readJsonResponse(response);
    const rows = extractRows(json);
    allRows.push(...rows);
    organizationUnitId = organizationUnitId || inferOrganizationUnitId(rows);

    if (rows.length < pageSize) break;
  }

  const items = dedupeCareers(allRows.map(mapCareerRow).filter(Boolean) as AmisCareerItem[]);
  if (items.length === 0) {
    throw new Error('AMIS career response did not contain mappable career rows.');
  }

  return {
    ok: true,
    sourceUrl: AMIS_CAREER_DATA_PAGING_URL,
    items,
    rawCount: allRows.length,
  };
}

async function fetchAmisApplications(sourceUrl?: string): Promise<AmisApplicationsFetchResponse> {
  const effectiveSourceUrl = cleanText(sourceUrl) || findLatestCandidatePagingUrl();
  if (!effectiveSourceUrl) {
    throw new Error('AMIS candidate paging URL was not found in this tab.');
  }

  const response = await fetch(effectiveSourceUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`AMIS paging_candidate returned HTTP ${response.status}.`);
  }

  const json = await readJsonResponse(response);
  const items = mapAmisApplicationsResponse(json);
  if (items.length === 0) {
    throw new Error('AMIS paging_candidate response did not contain mappable candidate rows.');
  }

  return {
    ok: true,
    sourceUrl: effectiveSourceUrl,
    items,
    rawCount: items.length,
  };
}

function findLatestCandidatePagingUrl() {
  return performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => /\/paging_candidate\/\d+/i.test(url))
    .reverse()[0] ?? '';
}

function mapAmisApplicationsResponse(response: unknown): AmisApplicationItem[] {
  const rows = extractCandidateRows(response);
  const items = rows.map(mapApplicationRow).filter(Boolean) as AmisApplicationItem[];
  return [...new Map(items.map((item) => [
    `${item.recruitmentId}:${item.recruitmentRoundId}:${getAmisApplicationIdentityId(item)}`,
    item,
  ])).values()];
}

function getAmisApplicationIdentityId(item: AmisApplicationItem) {
  return item.candidateConvertId || item.candidateId;
}

function extractCandidateRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return looksLikeCandidateRowArray(value) ? value : [];
  if (!isObject(value)) return [];

  const candidates = value.Candidates;
  if (Array.isArray(candidates) && looksLikeCandidateRowArray(candidates)) return candidates;

  for (const child of Object.values(value)) {
    const rows = extractCandidateRows(child);
    if (rows.length > 0) return rows;
  }

  return [];
}

function looksLikeCandidateRowArray(rows: unknown[]) {
  return rows.some((row) =>
    isObject(row)
    && readFirst(row, ['RecruitmentID', 'recruitmentId'])
    && readFirst(row, ['RecruitmentRoundID', 'recruitmentRoundId'])
    && readFirst(row, ['CandidateID', 'candidateId']),
  );
}

function mapApplicationRow(row: unknown): AmisApplicationItem | null {
  if (!isObject(row)) return null;

  const recruitmentId = cleanText(readFirst(row, ['RecruitmentID', 'recruitmentId']));
  const recruitmentRoundId = cleanText(readFirst(row, ['RecruitmentRoundID', 'recruitmentRoundId']));
  const candidateId = cleanText(readFirst(row, ['CandidateID', 'candidateId']));
  const candidateName = cleanText(readFirst(row, ['CandidateName', 'candidateName', 'Name', 'name']));
  const email = cleanText(readFirst(row, ['Email', 'email']));
  const mobile = cleanText(readFirst(row, ['Mobile', 'Phone', 'phone', 'mobile']));
  if (!recruitmentId || !recruitmentRoundId || !candidateId || !candidateName) return null;
  if (!email && !mobile) return null;

  const status = readNumber(row, ['Status', 'status']);

  return {
    recruitmentId,
    recruitmentRoundId,
    candidateId,
    candidateName,
    ...(cleanText(readFirst(row, ['CandidateConvertID', 'candidateConvertId'])) ? {
      candidateConvertId: cleanText(readFirst(row, ['CandidateConvertID', 'candidateConvertId'])),
    } : {}),
    ...(email ? { email } : {}),
    ...(mobile ? { mobile } : {}),
    ...(cleanText(readFirst(row, ['Birthday', 'birthday'])) ? { birthday: cleanText(readFirst(row, ['Birthday', 'birthday'])) } : {}),
    ...(cleanText(readFirst(row, ['RecruitmentRoundName', 'recruitmentRoundName'])) ? {
      recruitmentRoundName: cleanText(readFirst(row, ['RecruitmentRoundName', 'recruitmentRoundName'])),
    } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(cleanText(readFirst(row, ['ChannelName', 'channelName'])) ? { channelName: cleanText(readFirst(row, ['ChannelName', 'channelName'])) } : {}),
    ...(cleanText(readFirst(row, ['ApplyDate', 'ApplyDateOnly', 'applyDate'])) ? {
      applyDate: cleanText(readFirst(row, ['ApplyDate', 'ApplyDateOnly', 'applyDate'])),
    } : {}),
    ...(cleanText(readFirst(row, ['RecruitmentTitle', 'recruitmentTitle'])) ? {
      recruitmentTitle: cleanText(readFirst(row, ['RecruitmentTitle', 'recruitmentTitle'])),
    } : {}),
    ...(cleanText(readFirst(row, ['AttachmentCVID', 'attachmentCvId'])) ? {
      attachmentCvId: cleanText(readFirst(row, ['AttachmentCVID', 'attachmentCvId'])),
    } : {}),
    ...(cleanText(readFirst(row, ['AttachmentCVName', 'attachmentCvName'])) ? {
      attachmentCvName: cleanText(readFirst(row, ['AttachmentCVName', 'attachmentCvName'])),
    } : {}),
    rawSnapshot: sanitizeApplicationSnapshot(row),
  };
}

function sanitizeApplicationSnapshot(row: Record<string, unknown>) {
  const allowedKeys = new Set([
    'RecruitmentID',
    'RecruitmentRoundID',
    'RecruitmentRoundName',
    'Status',
    'CandidateID',
    'CandidateConvertID',
    'AttachmentCVID',
    'AttachmentCVName',
    'ChannelName',
    'ApplyDate',
    'RecruitmentTitle',
  ]);
  const snapshot: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const value = row[key];
    if (typeof value === 'string') snapshot[key] = value.length > 500 ? value.slice(0, 500) : value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) snapshot[key] = value;
  }

  return snapshot;
}

async function uploadAmisCvFile(payload: UploadAmisCvFileMessage['payload']): Promise<UploadAmisCvFileResponse> {
  const files = payload.files.map((item, index) => {
    const fileName = cleanText(item.fileName) || `clean-cv-${index + 1}.pdf`;
    const mimeType = cleanText(item.mimeType) || 'application/pdf';
    return new File([decodeBase64ToUint8Array(item.dataBase64)], fileName, { type: mimeType });
  });
  if (files.length === 0) {
    throw new Error('No clean CV files were provided.');
  }

  const input = findAmisCvFileInput();
  const dropTarget = findAmisCvDropTarget(input);

  if (!input && !dropTarget) {
    throw new Error('AMIS CV upload field was not found. Open the "Thêm ứng viên" modal first.');
  }

  const dataTransfer = new DataTransfer();
  for (const file of files) {
    dataTransfer.items.add(file);
  }

  const deliveredTargets: string[] = [];
  if (input) {
    assignFilesToInput(input, dataTransfer.files);
    dispatchFileInputEvents(input);
    deliveredTargets.push('file-input');
  }

  if (dropTarget) {
    dispatchDropEvents(dropTarget, dataTransfer);
    deliveredTargets.push('drop-target');
  }

  return {
    ok: true,
    fileName: files[0]?.name,
    fileNames: files.map((file) => file.name),
    fileCount: files.length,
    target: deliveredTargets.join('+') || undefined,
  };
}

function decodeBase64ToUint8Array(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function findAmisCvFileInput() {
  const modalRoots = findVisibleModalRoots();
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const scopedInputs = modalRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]')));
  const candidates = [...scopedInputs, ...inputs].filter((input, index, array) => array.indexOf(input) === index);

  return candidates
    .map((input) => ({
      input,
      score: scoreAmisCvFileInput(input),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.input
    ?? candidates[0]
    ?? null;
}

function findAmisCvDropTarget(input: HTMLInputElement | null) {
  if (input) {
    const target = input.closest<HTMLElement>(
      '.dx-fileuploader, .dx-fileuploader-wrapper, .dx-fileuploader-input-wrapper, '
      + '.dx-fileuploader-input-container, [class*="upload"], [class*="Upload"]',
    );
    if (target) return target;
  }

  const uploadText = findVisibleTextElement('Kéo thả hoặc bấm vào đây để tải CV lên')
    ?? findVisibleTextElement('tải CV lên')
    ?? findVisibleTextElement('file .doc');

  return uploadText?.closest<HTMLElement>(
    '.dx-fileuploader, .dx-fileuploader-wrapper, .dx-fileuploader-input-wrapper, '
    + '.dx-fileuploader-input-container, [class*="upload"], [class*="Upload"], [role="button"], div',
  )
    ?? null;
}

function scoreAmisCvFileInput(input: HTMLInputElement) {
  const accept = cleanText(input.accept).toLowerCase();
  const name = cleanText(input.name).toLowerCase();
  const id = cleanText(input.id).toLowerCase();
  const className = cleanText(input.className).toLowerCase();
  const contextText = cleanText(input.closest('form, .dx-popup-content, .modal, [role="dialog"], body')?.textContent).toLowerCase();
  let score = 0;

  if (!accept) score += 1;
  if (accept.includes('pdf')) score += 6;
  if (accept.includes('doc')) score += 6;
  if (accept.includes('image') || accept.includes('jpg') || accept.includes('jpeg') || accept.includes('png')) score += 2;
  if (name.includes('cv') || id.includes('cv') || className.includes('cv')) score += 8;
  if (contextText.includes('cv')) score += 5;
  if (contextText.includes('tải cv') || contextText.includes('tải lên tệp') || contextText.includes('file .doc')) score += 5;
  if (contextText.includes('thêm ứng viên')) score += 4;
  if (input.multiple) score += 1;

  return score;
}

function findVisibleModalRoots() {
  return getVisibleElements<HTMLElement>('.dx-popup-wrapper, .dx-overlay-wrapper, [role="dialog"], .modal, .ant-modal, .v-modal')
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });
}

function dispatchFileInputEvents(input: HTMLInputElement) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function assignFilesToInput(input: HTMLInputElement, files: FileList) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
  if (descriptor?.set) {
    descriptor.set.call(input, files);
    return;
  }

  input.files = files;
}

function dispatchDropEvents(target: HTMLElement, dataTransfer: DataTransfer) {
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }
}

function buildCareerDataPagingPayload(pageIndex: number, pageSize: number, organizationUnitId: string) {
  return {
    PageSize: pageSize,
    PageIndex: pageIndex,
    Sort: AMIS_CAREER_SORT,
    Filter: '',
    QuickSearch: {
      SearchValue: '',
      Columns: ['CareerName'],
    },
    CustomParam: {
      OrganizationUnitID: organizationUnitId,
      IsOrgInactive: false,
    },
  };
}

function inferOrganizationUnitId(rows: unknown[]) {
  for (const row of rows) {
    if (!isObject(row)) continue;
    const organizationUnitId = cleanText(readFirst(row, ['OrganizationUnitID', 'organizationUnitID', 'organizationUnitId']));
    if (organizationUnitId) return organizationUnitId;
  }

  return '';
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  const cleaned = text.trim().replace(/^\uFEFF/, '').replace(/^\)\]\}',?\s*/, '');
  if (!cleaned) return null;

  return JSON.parse(cleaned) as unknown;
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

  for (const key of [
    'Data',
    'data',
    'Items',
    'items',
    'Rows',
    'rows',
    'PageData',
    'pageData',
    'Records',
    'records',
  ]) {
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
  const usageStatus = readNumber(row, ['UsageStatus', 'usageStatus']);
  const parentAmisCareerId = cleanText(readFirst(row, [
    'ParentID',
    'ParentId',
    'parentID',
    'parentId',
    'ParentCareerID',
    'ParentCareerId',
    'parentCareerId',
  ]));
  const sortOrder = readNumber(row, [
    'SortOrder',
    'sortOrder',
    'OrderIndex',
    'orderIndex',
    'OrderNo',
    'orderNo',
  ]);

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
    isActive: usageStatus === undefined
      ? readBoolean(row, ['IsActive', 'isActive'], true)
      : usageStatus === 1,
    rawSnapshot: sanitizeCareerSnapshot(row),
  };
}

function dedupeCareers(items: AmisCareerItem[]) {
  return [...new Map(items.map((item) => [item.amisCareerId, item])).values()];
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

function fillTextInput(
  element: HTMLInputElement | HTMLTextAreaElement | undefined,
  value: string,
  fieldName: string,
  filledFields: string[],
  missingFields: string[],
) {
  if (!value.trim()) return;
  if (!element) {
    missingFields.push(fieldName);
    return;
  }

  setNativeTextValue(element, value);
  dispatchEditableEvents(element);
  filledFields.push(fieldName);
}

function fillHtmlEditorByPlaceholder(
  placeholder: string,
  value: string,
  fieldName: string,
  filledFields: string[],
  missingFields: string[],
) {
  if (!value.trim()) return;

  const editor = findHtmlEditorByPlaceholder(placeholder);
  if (!editor) {
    missingFields.push(fieldName);
    return;
  }

  fillHtmlEditor(editor, value);
  filledFields.push(fieldName);
}

function setNativeTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function fillHtmlEditor(editor: HTMLElement, value: string) {
  const html = textToParagraphHtml(value);
  const quill = findQuillInstance(editor);
  let filledWithQuill = false;

  if (quill?.clipboard?.dangerouslyPasteHTML) {
    try {
      quill.setText?.('', 'silent');
      quill.clipboard.dangerouslyPasteHTML(0, html, 'api');
      quill.update?.('api');
      filledWithQuill = true;
    } catch {
      quill.setText?.('', 'silent');
      quill.clipboard.dangerouslyPasteHTML(html, 'api');
      quill.update?.('api');
      filledWithQuill = true;
    }
  }

  if (!filledWithQuill) {
    editor.innerHTML = html;
  }

  editor.classList.remove('ql-blank');
  dispatchEditableEvents(editor);
}

function dispatchEditableEvents(element: HTMLElement) {
  element.focus();
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.textContent,
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function findQuillInstance(editor: HTMLElement): QuillLike | undefined {
  const container = editor.closest('.ql-container') as QuillContainer | null;
  return container?.__quill;
}

function findTextareaByDxPlaceholder(placeholder: string) {
  const textAreas = getVisibleElements<HTMLTextAreaElement>('textarea.dx-texteditor-input');
  return textAreas.find((textarea) => {
    const container = textarea.closest('.dx-texteditor');
    const placeholderElement = container?.querySelector<HTMLElement>('[data-dx_placeholder]');
    return placeholderElement?.dataset.dx_placeholder?.includes(placeholder);
  });
}

function findHtmlEditorByPlaceholder(placeholder: string) {
  return getVisibleElements<HTMLElement>('.ql-editor.dx-htmleditor-content[contenteditable="true"]')
    .find((editor) => editor.dataset.placeholder?.includes(placeholder));
}

function getVisibleElements<T extends HTMLElement>(selector: string) {
  return Array.from(document.querySelectorAll<T>(selector))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && !element.closest('[aria-hidden="true"], .dx-state-invisible');
    });
}

function textToParagraphHtml(value: string) {
  const paragraphs = value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '<p><br></p>';
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function waitForElement(selector: string, timeoutMs: number) {
  if (document.querySelector(selector)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('AMIS recruitment form fields were not found before timeout.'));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function isCaptureMessage(value: unknown): value is {
  source: 'vcs-recruitment-extension';
  type: typeof AMIS_CAPTURE_MESSAGE_TYPE;
  payload: AmisExtractionResult;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'vcs-recruitment-extension'
    && (value as { type?: unknown }).type === AMIS_CAPTURE_MESSAGE_TYPE
    && isAmisExtractionResult((value as { payload?: unknown }).payload);
}

function isDiagnosticMessage(value: unknown): value is {
  source: 'vcs-recruitment-extension';
  type: typeof AMIS_DIAGNOSTIC_MESSAGE_TYPE;
  payload: AmisDiagnosticEvent;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'vcs-recruitment-extension'
    && (value as { type?: unknown }).type === AMIS_DIAGNOSTIC_MESSAGE_TYPE
    && isAmisDiagnosticEvent((value as { payload?: unknown }).payload);
}

function isFillAmisRecruitmentFormMessage(value: unknown): value is {
  type: typeof FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE;
  payload: AmisRecruitmentFormFillPayload;
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { title?: unknown }).title === 'string'
    && typeof (payload as { positionName?: unknown }).positionName === 'string'
    && typeof (payload as { summary?: unknown }).summary === 'string'
    && typeof (payload as { responsibilities?: unknown }).responsibilities === 'string'
    && typeof (payload as { requirements?: unknown }).requirements === 'string'
    && typeof (payload as { benefits?: unknown }).benefits === 'string';
}

function isFetchAmisCareersMessage(value: unknown): value is FetchAmisCareersMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FETCH_AMIS_CAREERS_MESSAGE_TYPE;
}

function isFetchAmisApplicationsMessage(value: unknown): value is FetchAmisApplicationsMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === FETCH_AMIS_APPLICATIONS_MESSAGE_TYPE;
}

function isUploadAmisCvFileMessage(value: unknown): value is UploadAmisCvFileMessage {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === UPLOAD_AMIS_CV_FILE_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && Array.isArray((payload as { files?: unknown }).files)
    && (payload as { files: unknown[] }).files.every((file) =>
      typeof file === 'object'
      && file !== null
      && typeof (file as { fileName?: unknown }).fileName === 'string'
      && typeof (file as { mimeType?: unknown }).mimeType === 'string'
      && typeof (file as { dataBase64?: unknown }).dataBase64 === 'string',
    );
}

function isGetSelectedCareerMessage(value: unknown): value is {
  type: typeof GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE;
}

function isGetRecruitmentContextMessage(value: unknown): value is {
  type: typeof GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE;
}

function isAmisExtractionResult(value: unknown): value is AmisExtractionResult {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'AMIS_SAVE_RECRUITMENT_API'
    && typeof (value as { url?: unknown }).url === 'string';
}

function isAmisDiagnosticEvent(value: unknown): value is AmisDiagnosticEvent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
    && typeof (value as { timestamp?: unknown }).timestamp === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

})();
