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
const SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE = 'VCS_SELECT_AMIS_CANDIDATE_SOURCE';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const GET_AMIS_RECRUITMENT_CONTEXT_MESSAGE_TYPE = 'VCS_GET_AMIS_RECRUITMENT_CONTEXT';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const RECRUITMENT_CONTEXT_CHANGED_MESSAGE_TYPE = 'AMIS_RECRUITMENT_CONTEXT_CHANGED';
const AMIS_CAREER_DATA_PAGING_URL = 'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/Career/data_paging';
const AMIS_CAREER_SORT = 'W3sic2VsZWN0b3IiOiAiVXNhZ2VTdGF0dXMiLCAiZGVzYyI6ICJmYWxzZSJ9LHsic2VsZWN0b3IiOiAiQ2FyZWVyTmFtZSIsICJkZXNjIjogImZhbHNlIn1d';
const RECRUITMENT_CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;
const BRIDGE_WINDOW_MESSAGE_LISTENER_KEY = '__VCS_AMIS_BRIDGE_WINDOW_MESSAGE_LISTENER__';
const BRIDGE_RUNTIME_MESSAGE_LISTENER_KEY = '__VCS_AMIS_BRIDGE_RUNTIME_MESSAGE_LISTENER__';
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
    waitForCandidateForm?: boolean;
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

interface SelectAmisCandidateSourceMessage {
  type: typeof SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE;
  payload: {
    sourceName: string;
  };
}

interface SelectAmisCandidateSourceResponse {
  ok: boolean;
  sourceName?: string;
  sourceId?: string;
  code?: AmisCandidateSourceErrorCode;
  diagnostics?: AmisDropdownSelectionDiagnostics;
  error?: string;
}

type AmisCandidateSourceErrorCode =
  | 'AMIS_SOURCE_FIELD_NOT_FOUND'
  | 'AMIS_SOURCE_CONTROL_NOT_FOUND'
  | 'AMIS_SOURCE_DROPDOWN_NOT_OPENED'
  | 'AMIS_SOURCE_POPUP_NOT_FOUND'
  | 'AMIS_SOURCE_OPTION_NOT_FOUND'
  | 'AMIS_SOURCE_OPTION_NOT_CLICKED'
  | 'AMIS_SOURCE_VALUE_NOT_CONFIRMED';

interface AmisDropdownSelectionDiagnostics {
  fieldFound: boolean;
  formScrollPasses: number;
  controlFound: boolean;
  dropdownOpened: boolean;
  popupFound: boolean;
  searchInputFound: boolean;
  searchInputLocation: 'FIELD' | 'POPUP' | null;
  searchQuery: string;
  optionScrollPasses: number;
  visibleOptionLabels: string[];
  sourceOptionFound: boolean;
  sourceOptionClicked: boolean;
  confirmedFieldValue: string;
  selectionAttempts: number;
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
  [BRIDGE_WINDOW_MESSAGE_LISTENER_KEY]?: (event: MessageEvent) => void;
  [BRIDGE_RUNTIME_MESSAGE_LISTENER_KEY]?: (
    message: unknown,
    sender: ChromeMessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void;
};
const wasBridgeInstalled = bridgeWindow[BRIDGE_INSTALLED_KEY] === true;

const previousWindowMessageListener = bridgeWindow[BRIDGE_WINDOW_MESSAGE_LISTENER_KEY];
if (previousWindowMessageListener) {
  window.removeEventListener('message', previousWindowMessageListener);
}

const previousRuntimeMessageListener = bridgeWindow[BRIDGE_RUNTIME_MESSAGE_LISTENER_KEY];
if (previousRuntimeMessageListener) {
  chrome.runtime?.onMessage.removeListener?.(previousRuntimeMessageListener);
}

const windowMessageListener = (event: MessageEvent) => {
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
};

const runtimeMessageListener = (
  message: unknown,
  _sender: ChromeMessageSender,
  sendResponse: (response?: unknown) => void,
) => {
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

    if (isSelectAmisCandidateSourceMessage(message)) {
      void selectAmisCandidateSource(message.payload)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            ...(error instanceof AmisDropdownSelectionError
              ? { code: error.code, diagnostics: error.diagnostics }
              : {}),
            error: error instanceof Error ? error.message : 'Could not select the AMIS candidate source.',
          } satisfies SelectAmisCandidateSourceResponse);
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
};

window.addEventListener('message', windowMessageListener);
chrome.runtime?.onMessage.addListener(runtimeMessageListener);
bridgeWindow[BRIDGE_WINDOW_MESSAGE_LISTENER_KEY] = windowMessageListener;
bridgeWindow[BRIDGE_RUNTIME_MESSAGE_LISTENER_KEY] = runtimeMessageListener;
bridgeWindow[BRIDGE_INSTALLED_KEY] = true;

if (!wasBridgeInstalled) {
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
    const recruitmentId = candidatePathMatch?.[1]
      ?? jobDetailPathMatch?.[1]
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
  if (element instanceof HTMLSelectElement) {
    return cleanText(element.selectedOptions[0]?.textContent);
  }

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
  const channelName = cleanText(readFirst(row, [
    'ChannelName',
    'channelName',
    'RecruitmentChannelName',
    'recruitmentChannelName',
    'SourceCandidateName',
    'sourceCandidateName',
    'SourceName',
    'sourceName',
  ]));
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
    ...(readNumber(row, ['RecruitmentChannelID', 'recruitmentChannelId']) !== undefined ? {
      recruitmentChannelId: readNumber(row, ['RecruitmentChannelID', 'recruitmentChannelId']),
    } : {}),
    ...(channelName ? { channelName } : {}),
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
    'RecruitmentChannelID',
    'RecruitmentChannelName',
    'SourceCandidateName',
    'SourceName',
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

  let input = findAmisCvFileInput();
  let dropTarget = findAmisCvDropTarget(input);

  if (!input && !dropTarget) {
    openAmisDocumentUploadForm();
    await waitForAmisUploadTarget(8000);
    input = findAmisCvFileInput();
    dropTarget = findAmisCvDropTarget(input);
  }

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

  if (payload.waitForCandidateForm !== false) {
    await waitForAmisCandidateFormToPopulate(12_000);
  }

  return {
    ok: true,
    fileName: files[0]?.name,
    fileNames: files.map((file) => file.name),
    fileCount: files.length,
    target: deliveredTargets.join('+') || undefined,
  };
}

async function selectAmisCandidateSource(
  payload: SelectAmisCandidateSourceMessage['payload'],
): Promise<SelectAmisCandidateSourceResponse> {
  const sourceName = cleanText(payload.sourceName);
  if (!sourceName) throw new Error('AMIS candidate source name is required.');

  const diagnostics = createAmisDropdownSelectionDiagnostics();
  await waitForAmisCandidateFormToSettle(8000);

  let lastError: AmisDropdownSelectionError | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    resetAmisDropdownSelectionDiagnostics(diagnostics);
    diagnostics.selectionAttempts = attempt;
    try {
      const selected = await selectAmisDropdownOption({
        fieldLabel: 'Nguồn ứng viên',
        optionText: sourceName,
        diagnostics,
      });
      return {
        ok: true,
        sourceName: selected.optionText,
        sourceId: selected.optionId || undefined,
        diagnostics,
      };
    } catch (error) {
      if (!(error instanceof AmisDropdownSelectionError)) throw error;
      lastError = error;
      if (attempt >= 2 || !isRetryableAmisSourceSelectionError(error.code)) throw error;
      await closeOpenAmisDropdown();
      await waitForAmisCandidateFormToSettle(5000);
    }
  }

  throw lastError ?? new Error('Could not select the AMIS candidate source.');
}

class AmisDropdownSelectionError extends Error {
  constructor(
    readonly code: AmisCandidateSourceErrorCode,
    message: string,
    readonly diagnostics: AmisDropdownSelectionDiagnostics,
  ) {
    super(message);
    this.name = 'AmisDropdownSelectionError';
  }
}

interface AmisDropdownField {
  label: HTMLElement;
  root: HTMLElement;
  control: HTMLElement;
  trigger: HTMLElement;
  nativeSelect: HTMLSelectElement | null;
}

interface SelectAmisDropdownOptionParams {
  fieldLabel: string;
  optionText: string;
  optionId?: string;
  diagnostics: AmisDropdownSelectionDiagnostics;
}

function createAmisDropdownSelectionDiagnostics(): AmisDropdownSelectionDiagnostics {
  return {
    fieldFound: false,
    formScrollPasses: 0,
    controlFound: false,
    dropdownOpened: false,
    popupFound: false,
    searchInputFound: false,
    searchInputLocation: null,
    searchQuery: '',
    optionScrollPasses: 0,
    visibleOptionLabels: [],
    sourceOptionFound: false,
    sourceOptionClicked: false,
    confirmedFieldValue: '',
    selectionAttempts: 0,
  };
}

function resetAmisDropdownSelectionDiagnostics(diagnostics: AmisDropdownSelectionDiagnostics) {
  diagnostics.fieldFound = false;
  diagnostics.formScrollPasses = 0;
  diagnostics.controlFound = false;
  diagnostics.dropdownOpened = false;
  diagnostics.popupFound = false;
  diagnostics.searchInputFound = false;
  diagnostics.searchInputLocation = null;
  diagnostics.searchQuery = '';
  diagnostics.optionScrollPasses = 0;
  diagnostics.visibleOptionLabels = [];
  diagnostics.sourceOptionFound = false;
  diagnostics.sourceOptionClicked = false;
  diagnostics.confirmedFieldValue = '';
}

async function selectAmisDropdownOption(params: SelectAmisDropdownOptionParams) {
  const { fieldLabel, optionText, optionId, diagnostics } = params;
  const targetKey = normalizeAmisUiText(optionText);
  let field = await waitForAmisDropdownField(fieldLabel, diagnostics, 10000);
  if (!field) {
    const code = diagnostics.fieldFound
      ? 'AMIS_SOURCE_CONTROL_NOT_FOUND'
      : 'AMIS_SOURCE_FIELD_NOT_FOUND';
    throwAmisDropdownSelectionError(
      code,
      diagnostics.fieldFound
        ? `Found the AMIS "${fieldLabel}" label but could not locate its dropdown control.`
        : `AMIS field "${fieldLabel}" was not found. Open the "Thêm ứng viên" form first.`,
      diagnostics,
    );
  }

  const currentValue = readAmisDropdownFieldValue(field);
  diagnostics.confirmedFieldValue = currentValue;
  if (normalizeAmisUiText(currentValue) === targetKey) {
    return { optionText: currentValue || optionText, optionId: '' };
  }

  if (field.nativeSelect) {
    const option = await waitForAmisNativeSelectOption(field.nativeSelect, targetKey, optionId, 5000);
    if (!option) {
      throwAmisDropdownSelectionError(
        'AMIS_SOURCE_OPTION_NOT_FOUND',
        `AMIS source "${optionText}" is not available for the current unit.`,
        diagnostics,
      );
    }

    diagnostics.sourceOptionFound = true;
    field.nativeSelect.value = option.value;
    field.nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
    field.nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    diagnostics.sourceOptionClicked = true;
    const confirmedValue = await waitForAmisDropdownValue(fieldLabel, targetKey, diagnostics, 4000);
    return {
      optionText: confirmedValue || cleanText(option.textContent) || optionText,
      optionId: cleanText(option.value),
    };
  }

  field = findAmisDropdownField(fieldLabel) ?? field;
  const popupSnapshot = new Set(getVisibleAmisDropdownPopups());
  let popup = isAmisDropdownExpanded(field)
    ? findPopupLinkedToAmisDropdown(field, popupSnapshot, popupSnapshot)
    : null;

  if (!popup) {
    try {
      field.trigger.scrollIntoView({ block: 'center', inline: 'nearest' });
      field.trigger.focus({ preventScroll: true });
      field.trigger.click();
    } catch {
      throwAmisDropdownSelectionError(
        'AMIS_SOURCE_DROPDOWN_NOT_OPENED',
        `Could not open the AMIS "${fieldLabel}" dropdown.`,
        diagnostics,
      );
    }
    popup = await waitForAmisDropdownPopup(field, popupSnapshot, 3000);
  }

  diagnostics.dropdownOpened = isAmisDropdownExpanded(field) || Boolean(popup);
  if (!diagnostics.dropdownOpened) {
    throwAmisDropdownSelectionError(
      'AMIS_SOURCE_DROPDOWN_NOT_OPENED',
      `AMIS did not open the "${fieldLabel}" dropdown.`,
      diagnostics,
    );
  }
  if (!popup) {
    throwAmisDropdownSelectionError(
      'AMIS_SOURCE_POPUP_NOT_FOUND',
      `AMIS opened "${fieldLabel}", but its option popup could not be identified.`,
      diagnostics,
    );
  }

  diagnostics.popupFound = true;
  const searchQuery = getAmisDropdownSearchQuery(optionText);
  const searchInput = findAmisDropdownFilterInput(field, popup);
  diagnostics.searchQuery = searchQuery;
  if (searchInput) {
    diagnostics.searchInputFound = true;
    diagnostics.searchInputLocation = searchInput.location;
    typeIntoAmisDropdownFilter(searchInput.element, searchQuery);
    await waitForAmisDomUpdate(popup, 800);
  }

  // Filtering can replace the DevExtreme popup node. Re-resolve the field and
  // popup after the query so option scanning always uses the current DOM.
  field = findAmisDropdownField(fieldLabel) ?? field;
  const refreshedPopups = new Set(getVisibleAmisDropdownPopups());
  popup = findPopupLinkedToAmisDropdown(field, refreshedPopups, popupSnapshot) ?? popup;

  const option = await waitForAmisDropdownOption({
    popup,
    field,
    optionText,
    optionId,
    diagnostics,
    timeoutMs: 15000,
  });
  if (!option) {
    throwAmisDropdownSelectionError(
      'AMIS_SOURCE_OPTION_NOT_FOUND',
      `AMIS source "${optionText}" was not found after scanning the dropdown list.`,
      diagnostics,
    );
  }

  diagnostics.sourceOptionFound = true;
  const selectedOptionText = cleanText(option.innerText || option.textContent) || optionText;
  const selectedOptionId = readAmisCandidateSourceOptionId(option);
  try {
    if (!option.isConnected) {
      throw new Error('The AMIS option was re-rendered before it could be selected.');
    }
    option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const clickTarget = option;
    clickTarget.click();
    diagnostics.sourceOptionClicked = true;

    // DevExtreme normally handles the bubbling click above. Some AMIS builds
    // bind the selection handler to the list item pointer sequence instead,
    // so only replay a real mouse sequence when the first click did not update
    // the displayed value and the option popup is still open.
    await waitForAmisDomUpdate(field.root, 180);
    if (
      normalizeAmisUiText(readAmisDropdownFieldValue(field)) !== targetKey
      && option.getAttribute('aria-selected') !== 'true'
      && option.isConnected
      && getVisibleAmisDropdownPopups().length > 0
    ) {
      dispatchAmisPointerClick(clickTarget);
    }
  } catch {
    throwAmisDropdownSelectionError(
      'AMIS_SOURCE_OPTION_NOT_CLICKED',
      `AMIS source "${optionText}" was found but could not be selected.`,
      diagnostics,
    );
  }

  const confirmedValue = await waitForAmisDropdownValue(fieldLabel, targetKey, diagnostics, 5000);
  return {
    optionText: confirmedValue || selectedOptionText,
    optionId: selectedOptionId,
  };
}

function throwAmisDropdownSelectionError(
  code: AmisCandidateSourceErrorCode,
  message: string,
  diagnostics: AmisDropdownSelectionDiagnostics,
): never {
  throw new AmisDropdownSelectionError(code, message, {
    ...diagnostics,
    visibleOptionLabels: [...diagnostics.visibleOptionLabels],
  });
}

function isRetryableAmisSourceSelectionError(code: AmisCandidateSourceErrorCode) {
  return code === 'AMIS_SOURCE_FIELD_NOT_FOUND'
    || code === 'AMIS_SOURCE_CONTROL_NOT_FOUND'
    || code === 'AMIS_SOURCE_DROPDOWN_NOT_OPENED'
    || code === 'AMIS_SOURCE_POPUP_NOT_FOUND'
    || code === 'AMIS_SOURCE_OPTION_NOT_CLICKED'
    || code === 'AMIS_SOURCE_VALUE_NOT_CONFIRMED';
}

async function waitForAmisDropdownField(
  fieldLabel: string,
  diagnostics: AmisDropdownSelectionDiagnostics,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const formRoot = findAmisCandidateFormRoot();
    const label = formRoot ? findAmisDropdownLabel(formRoot, fieldLabel) : null;
    diagnostics.fieldFound = diagnostics.fieldFound || Boolean(label);
    if (label) {
      label.scrollIntoView({ block: 'center', inline: 'nearest' });
      await waitForAmisDomUpdate(formRoot ?? document.body, 120);
      const field = findAmisDropdownField(fieldLabel);
      if (field) {
        diagnostics.controlFound = true;
        return field;
      }
    }

    if (advanceAmisCandidateFormScroll()) diagnostics.formScrollPasses += 1;
    await waitForAmisDomUpdate(formRoot ?? document.body, 140);
  }
  return null;
}

function findAmisDropdownField(fieldLabel: string): AmisDropdownField | null {
  const formRoot = findAmisCandidateFormRoot();
  if (!formRoot) return null;
  const label = findAmisDropdownLabel(formRoot, fieldLabel);
  if (!label) return null;

  const labelRect = label.getBoundingClientRect();
  const labelFor = cleanText(label.getAttribute('for'));
  const labelledControl = labelFor ? document.getElementById(labelFor) as HTMLElement | null : null;
  const exactAmisSourceControl = normalizeAmisUiText(fieldLabel) === 'nguonungvien'
    ? findAmisCandidateSourceControl(formRoot, label, labelRect)
    : null;
  const nearbyRoots: HTMLElement[] = [];
  let ancestor: HTMLElement | null = label.parentElement;
  for (let depth = 0; depth < 4 && ancestor && formRoot.contains(ancestor); depth += 1) {
    nearbyRoots.push(ancestor);
    ancestor = ancestor.parentElement;
  }
  const nearbyControls = nearbyRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(
    'select, [role="combobox"], [aria-haspopup="listbox"], .dx-selectbox, .dx-dropdowneditor',
  )));
  const controls = [
    ...(labelledControl ? [labelledControl] : []),
    ...nearbyControls,
    ...Array.from(formRoot.querySelectorAll<HTMLElement>(
      'select, [role="combobox"], [aria-haspopup="listbox"], .dx-selectbox, .dx-dropdowneditor',
    )),
  ]
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .filter((element) => !element.closest('[aria-hidden="true"], .dx-state-invisible'))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .filter(({ rect }) => rect.top >= labelRect.top - 8 && rect.top <= labelRect.bottom + 120)
    .filter(({ rect }) => rect.right >= labelRect.left - 20 && rect.left <= labelRect.right + 240)
    .sort((left, right) =>
      scoreAmisDropdownControl(right.element, right.rect, labelRect, nearbyControls, labelledControl)
      - scoreAmisDropdownControl(left.element, left.rect, labelRect, nearbyControls, labelledControl),
    );
  const matchedControl = exactAmisSourceControl ?? controls[0]?.element ?? null;
  if (!matchedControl) return null;

  const nativeSelect = matchedControl instanceof HTMLSelectElement ? matchedControl : null;
  const dropdownRoot = matchedControl.matches('.dx-dropdowneditor, .dx-selectbox')
    ? matchedControl
    : matchedControl.closest<HTMLElement>('.dx-dropdowneditor, .dx-selectbox');
  const root = dropdownRoot ?? matchedControl;
  const control = dropdownRoot ?? matchedControl;
  const trigger = root.querySelector<HTMLElement>('.dx-dropdowneditor-button')
    ?? (control.matches('[aria-haspopup="listbox"], [role="combobox"]') ? control : null)
    ?? root.querySelector<HTMLElement>('[aria-haspopup="listbox"], [role="combobox"]')
    ?? control;
  return { label, root, control, trigger, nativeSelect };
}

function findAmisCandidateSourceControl(
  formRoot: HTMLElement,
  label: HTMLElement,
  labelRect: DOMRect,
) {
  const labelRow = label.closest<HTMLElement>('.dup-row, .m-row, [class*="row"]')
    ?? label.parentElement;

  return Array.from(document.querySelectorAll<HTMLElement>('dx-select-box.dx-selectbox, .dx-selectbox'))
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .filter((element) => !element.closest('[aria-hidden="true"], .dx-state-invisible'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .filter((element) => {
      const displayExpression = normalizeAmisUiText(element.getAttribute('displayexpr'));
      const placeholder = element.querySelector<HTMLElement>('[data-dx_placeholder]')
        ?.getAttribute('data-dx_placeholder');
      return displayExpression === 'sourcecandidatename'
        || normalizeAmisUiText(placeholder).includes('chonnguonungvien');
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      let score = 0;
      if (formRoot.contains(element)) score += 1000;
      if (labelRow?.contains(element)) score += 500;
      score -= Math.abs(rect.top - labelRect.bottom);
      score -= Math.abs(rect.left - labelRect.left) / 4;
      return { element, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.element
    ?? null;
}

function findAmisDropdownLabel(formRoot: HTMLElement, fieldLabel: string) {
  const targetKey = normalizeAmisUiText(fieldLabel);
  return Array.from(formRoot.querySelectorAll<HTMLElement>('label, span, div, p'))
    .filter((element) => !element.closest('[aria-hidden="true"], .dx-state-invisible'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .find((element) => normalizeAmisUiText(element.innerText || element.textContent) === targetKey)
    ?? null;
}

function scoreAmisDropdownControl(
  element: HTMLElement,
  rect: DOMRect,
  labelRect: DOMRect,
  nearbyControls: HTMLElement[],
  labelledControl: HTMLElement | null,
) {
  let score = 0;
  if (element === labelledControl || Boolean(labelledControl && element.contains(labelledControl))) score += 500;
  if (nearbyControls.includes(element)) score += 120;
  if (element.matches('.dx-dropdowneditor, .dx-selectbox')) score += 30;
  if (element.matches('[role="combobox"], [aria-haspopup="listbox"]')) score += 20;
  if (element instanceof HTMLSelectElement) score += 15;
  score -= Math.abs(rect.left - labelRect.left) / 2;
  score -= Math.abs(rect.top - labelRect.bottom) / 4;
  return score;
}

function readAmisDropdownFieldValue(field: AmisDropdownField) {
  if (field.nativeSelect) return cleanText(field.nativeSelect.selectedOptions[0]?.textContent);
  const inputs = Array.from(field.root.querySelectorAll<HTMLInputElement>(
    'input.dx-texteditor-input, input.dx-dropdowneditor-input, [role="combobox"] input',
  ))
    .filter((input) => input.type !== 'hidden')
    .filter((input) => !input.closest('[aria-hidden="true"], .dx-state-invisible'))
    .filter((input) => {
      const rect = input.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  const inputValue = inputs.map((input) => cleanText(input.value)).find(Boolean);
  if (inputValue) return inputValue;

  const selectedOption = Array.from(field.root.querySelectorAll<HTMLElement>(
    '[role="option"][aria-selected="true"], .dx-item[aria-selected="true"]',
  ))
    .filter((option) => !option.closest('[aria-hidden="true"], .dx-state-invisible'))
    .map((option) => cleanText(option.innerText || option.textContent))
    .find(Boolean);
  if (selectedOption) return selectedOption;

  return cleanText(field.root.querySelector<HTMLElement>('.dx-selectbox-text')?.innerText);
}

function dispatchAmisPointerClick(element: HTMLElement) {
  const eventInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  }
  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(new PointerEvent('pointerup', eventInit));
  }
  element.dispatchEvent(new MouseEvent('click', eventInit));
  // DevExtreme's delegated list handler is commonly wired to its synthetic
  // dxclick event rather than the browser click event.
  element.dispatchEvent(new MouseEvent('dxclick', eventInit));
}

async function waitForAmisNativeSelectOption(
  select: HTMLSelectElement,
  targetKey: string,
  optionId: string | undefined,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const option = Array.from(select.options).find((item) =>
      (optionId && cleanText(item.value) === optionId)
      || normalizeAmisUiText(item.textContent) === targetKey,
    );
    if (option) return option;
    await waitForAmisDomUpdate(select, 120);
  }
  return null;
}

function isAmisDropdownExpanded(field: AmisDropdownField) {
  return [field.root, field.control, field.trigger, ...Array.from(field.root.querySelectorAll<HTMLElement>('[aria-expanded]'))]
    .some((element) => element.getAttribute('aria-expanded') === 'true');
}

function getVisibleAmisDropdownPopups() {
  return getVisibleElements<HTMLElement>(
    '.dx-dropdowneditor-overlay, .dx-selectbox-popup, .dx-overlay-content, '
    + '.dx-overlay-wrapper, .dx-popup-wrapper, [role="listbox"], .dx-list',
  )
    .filter((root) => isElementInsideViewport(root))
    .filter((root) => root.matches('[role="listbox"], .dx-list')
      || Boolean(root.querySelector('[role="listbox"], .dx-list, [role="option"], .dx-list-item')))
    .filter((root, index, roots) => !roots.some((candidate, candidateIndex) =>
      candidateIndex !== index
      && candidate.contains(root)
      && candidate.matches('.dx-overlay-wrapper, .dx-popup-wrapper'),
    ));
}

function findPopupLinkedToAmisDropdown(
  field: AmisDropdownField,
  candidates: Set<HTMLElement> | HTMLElement[],
  previousPopups: Set<HTMLElement>,
) {
  const popupCandidates = Array.from(candidates);
  const controlledIds = [field.root, field.control, field.trigger, ...Array.from(field.root.querySelectorAll<HTMLElement>('*'))]
    .flatMap((element) => [element.getAttribute('aria-controls'), element.getAttribute('aria-owns')])
    .flatMap((value) => cleanText(value).split(/\s+/))
    .filter(Boolean);
  const linked = controlledIds
    .map((id) => document.getElementById(id))
    .find((element): element is HTMLElement => Boolean(element && popupCandidates.some((popup) =>
      popup === element || popup.contains(element) || element.contains(popup),
    )));
  if (linked) {
    return linked.closest<HTMLElement>(
      '.dx-dropdowneditor-overlay, .dx-selectbox-popup, .dx-overlay-content, '
      + '.dx-overlay-wrapper, .dx-popup-wrapper, .dx-popup, .dx-overlay',
    ) ?? linked;
  }

  return popupCandidates
    .map((popup) => ({
      popup,
      isNew: previousPopups.has(popup) ? 0 : 1,
      zIndex: Number.parseInt(window.getComputedStyle(popup).zIndex || '0', 10) || 0,
    }))
    .sort((left, right) => right.isNew - left.isNew || right.zIndex - left.zIndex)[0]?.popup
    ?? null;
}

async function waitForAmisDropdownPopup(
  field: AmisDropdownField,
  previousPopups: Set<HTMLElement>,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidates = getVisibleAmisDropdownPopups();
    const popup = findPopupLinkedToAmisDropdown(field, candidates, previousPopups);
    if (popup) return popup;
    await waitForAmisDomUpdate(document.body, 100);
  }
  return null;
}

function findAmisDropdownSearchInput(popup: HTMLElement) {
  return Array.from(popup.querySelectorAll<HTMLInputElement>('input'))
    .filter((input) => {
      const rect = input.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !input.disabled && !input.readOnly;
    })
    .find((input) => input.type === 'search'
      || Boolean(input.closest('.dx-searchbox'))
      || /timkiem|search/.test(normalizeAmisUiText(
        input.placeholder || input.getAttribute('aria-label') || '',
      )))
    ?? null;
}

function findAmisDropdownFilterInput(field: AmisDropdownField, popup: HTMLElement) {
  const fieldInput = Array.from(field.root.querySelectorAll<HTMLInputElement>(
    'input.dx-texteditor-input, input.dx-dropdowneditor-input, [role="combobox"] input',
  ))
    .filter(isEditableVisibleAmisInput)
    .find((input) => input.type !== 'search' || input.closest('.dx-selectbox, .dx-dropdowneditor'));

  if (fieldInput) return { element: fieldInput, location: 'FIELD' as const };

  const popupInput = findAmisDropdownSearchInput(popup);
  return popupInput ? { element: popupInput, location: 'POPUP' as const } : null;
}

function isEditableVisibleAmisInput(input: HTMLInputElement) {
  const rect = input.getBoundingClientRect();
  return rect.width > 0
    && rect.height > 0
    && input.type !== 'hidden'
    && !input.disabled
    && !input.readOnly
    && input.getAttribute('aria-readonly') !== 'true'
    && !input.closest('[aria-hidden="true"], .dx-state-invisible');
}

function getAmisDropdownSearchQuery(optionText: string) {
  const cleaned = cleanText(optionText);
  return cleaned.split(/\s+/).filter(Boolean)[0] ?? cleaned;
}

async function waitForAmisDropdownOption(params: {
  popup: HTMLElement;
  field: AmisDropdownField;
  optionText: string;
  optionId?: string;
  diagnostics: AmisDropdownSelectionDiagnostics;
  timeoutMs: number;
}) {
  const { popup, field, optionText, optionId, diagnostics, timeoutMs } = params;
  const targetKey = normalizeAmisUiText(optionText);
  const deadline = Date.now() + timeoutMs;
  let stablePasses = 0;

  while (Date.now() < deadline && stablePasses < 3) {
    // AMIS can render the complete option collection in the open popup while
    // only a subset is inside the scroll viewport. Search the rendered DOM
    // first so a valid source is not lost when DevExtreme's simulated scroll
    // does not update native scrollTop.
    const renderedOptions = getAmisDropdownOptions(popup);
    const renderedMatch = findMatchingAmisDropdownOption(renderedOptions, targetKey, optionId);
    if (renderedMatch) return renderedMatch;

    const options = getVisibleAmisDropdownOptions(popup);
    recordAmisDropdownOptionLabels(options, diagnostics);
    const matched = findMatchingAmisDropdownOption(options, targetKey, optionId);
    if (matched) return matched;

    const beforeSignature = getAmisDropdownOptionSignature(options);
    diagnostics.optionScrollPasses += 1;
    const advanced = await advanceAmisDropdownOptionList(popup, field, beforeSignature);
    const nextSignature = getAmisDropdownOptionSignature(getVisibleAmisDropdownOptions(popup));
    stablePasses = advanced || nextSignature !== beforeSignature ? 0 : stablePasses + 1;
  }
  return null;
}

function getAmisDropdownOptions(popup: HTMLElement) {
  return Array.from(popup.querySelectorAll<HTMLElement>(
    '[role="option"], .dx-list-item, li, [class*="option"], [class*="Option"]',
  ))
    .filter((element) => !element.closest('[aria-hidden="true"], .dx-state-invisible'))
    .map((element) => element.closest<HTMLElement>('[role="option"], .dx-list-item, li') ?? element)
    .filter((element, index, elements) => elements.indexOf(element) === index);
}

function getVisibleAmisDropdownOptions(popup: HTMLElement) {
  const popupRect = popup.getBoundingClientRect();
  return getAmisDropdownOptions(popup)
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && rect.bottom > popupRect.top
        && rect.top < popupRect.bottom;
    })
}

function findMatchingAmisDropdownOption(
  options: HTMLElement[],
  targetKey: string,
  optionId?: string,
) {
  return options.find((option) => {
    if (optionId && readAmisCandidateSourceOptionId(option) === optionId) return true;
    return normalizeAmisUiText(option.innerText || option.textContent) === targetKey;
  }) ?? null;
}

function recordAmisDropdownOptionLabels(
  options: HTMLElement[],
  diagnostics: AmisDropdownSelectionDiagnostics,
) {
  for (const option of options) {
    const label = cleanText(option.innerText || option.textContent);
    if (!label || diagnostics.visibleOptionLabels.includes(label)) continue;
    if (diagnostics.visibleOptionLabels.length >= 60) break;
    diagnostics.visibleOptionLabels.push(label);
  }
}

function getAmisDropdownOptionSignature(options: HTMLElement[]) {
  return options.map((option) => normalizeAmisUiText(option.innerText || option.textContent)).join('|');
}

async function advanceAmisDropdownOptionList(
  popup: HTMLElement,
  field: AmisDropdownField,
  beforeSignature: string,
) {
  const scrollables = [popup, ...Array.from(popup.querySelectorAll<HTMLElement>(
    '[role="listbox"], .dx-scrollable-container, .dx-scrollview, .dx-list',
  ))]
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .filter((element) => element.clientHeight > 40)
    .sort((left, right) =>
      (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight),
    );

  for (const scrollable of scrollables) {
    const previousScrollTop = scrollable.scrollTop;
    const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
    if (maxScrollTop <= 4 || previousScrollTop >= maxScrollTop - 2) continue;
    const deltaY = Math.max(120, Math.floor(scrollable.clientHeight * 0.8));
    scrollable.scrollTop = Math.min(maxScrollTop, previousScrollTop + deltaY);
    scrollable.dispatchEvent(new Event('scroll', { bubbles: true }));
    scrollable.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY,
    }));
    const changed = await waitForAmisDropdownOptionChange(popup, beforeSignature, 650);
    if (changed) return true;
  }

  const options = getVisibleAmisDropdownOptions(popup);
  const wheelTarget = options.at(-1) ?? popup;
  const deltaY = Math.max(160, Math.floor(popup.getBoundingClientRect().height * 0.8));
  wheelTarget.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
  }));
  field.trigger.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'PageDown',
    code: 'PageDown',
  }));
  field.trigger.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    key: 'PageDown',
    code: 'PageDown',
  }));
  return waitForAmisDropdownOptionChange(popup, beforeSignature, 650);
}

async function waitForAmisDropdownOptionChange(
  popup: HTMLElement,
  previousSignature: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await waitForAmisDomUpdate(popup, 80);
    const signature = getAmisDropdownOptionSignature(getVisibleAmisDropdownOptions(popup));
    if (signature && signature !== previousSignature) return true;
  }
  return false;
}

async function waitForAmisDropdownValue(
  fieldLabel: string,
  targetKey: string,
  diagnostics: AmisDropdownSelectionDiagnostics,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let confirmedSince = 0;
  while (Date.now() < deadline) {
    const field = findAmisDropdownField(fieldLabel);
    const value = field ? readAmisDropdownFieldValue(field) : '';
    diagnostics.confirmedFieldValue = value;
    if (normalizeAmisUiText(value) === targetKey) {
      if (!confirmedSince) confirmedSince = Date.now();
      if (Date.now() - confirmedSince >= 1_500) return value;
    } else {
      confirmedSince = 0;
    }
    await waitForAmisDomUpdate(findAmisCandidateFormRoot() ?? document.body, 100);
  }

  throwAmisDropdownSelectionError(
    'AMIS_SOURCE_VALUE_NOT_CONFIRMED',
    'AMIS did not keep the selected candidate source after the form update.',
    diagnostics,
  );
}

function typeIntoAmisDropdownFilter(input: HTMLInputElement, value: string) {
  input.focus({ preventScroll: true });
  input.select();
  setNativeTextValue(input, '');
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'deleteContentBackward',
    data: null,
  }));

  for (const character of value) {
    const key = character.toUpperCase();
    const code = character === ' ' ? 'Space' : `Key${key}`;
    const eventInit: KeyboardEventInit = {
      bubbles: true,
      cancelable: true,
      key: character,
      code,
    };
    input.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    input.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: character,
    }));
    setNativeTextValue(input, `${input.value}${character}`);
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: character,
    }));
    input.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitForAmisCandidateFormToSettle(timeoutMs: number) {
  const formRoot = findAmisCandidateFormRoot();
  if (!formRoot) return;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastSignature = getAmisCandidateFormSignature(formRoot);
  let lastChangedAt = startedAt;
  while (Date.now() < deadline) {
    await waitForAmisDomUpdate(formRoot, 150);
    const currentRoot = findAmisCandidateFormRoot() ?? formRoot;
    const signature = getAmisCandidateFormSignature(currentRoot);
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastChangedAt = Date.now();
    }
    if (Date.now() - startedAt >= 1600 && Date.now() - lastChangedAt >= 850) return;
  }
}

async function waitForAmisCandidateFormToPopulate(timeoutMs: number) {
  const formRoot = findAmisCandidateFormRoot();
  if (!formRoot) return;

  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const initialSignature = getAmisCandidateFormSignature(formRoot);
  let parsedProfileObserved = false;

  while (Date.now() < deadline) {
    await waitForAmisDomUpdate(formRoot, 180);
    const currentRoot = findAmisCandidateFormRoot() ?? formRoot;
    const currentSignature = getAmisCandidateFormSignature(currentRoot);
    const profileValueCount = getAmisCandidateProfileValueCount(currentRoot);

    if (currentSignature !== initialSignature) parsedProfileObserved = true;
    if (parsedProfileObserved && profileValueCount > 0) {
      await waitForAmisCandidateFormToSettle(Math.min(4_000, deadline - Date.now()));
      return;
    }
  }

  await waitForAmisCandidateFormToSettle(2_000);
}

function getAmisCandidateProfileValueCount(formRoot: HTMLElement) {
  return Array.from(formRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  ))
    .filter((element) => element instanceof HTMLTextAreaElement || element.type !== 'file')
    .filter((element) => element.type !== 'hidden' && element.type !== 'search')
    .filter((element) => !element.closest('[aria-hidden="true"], .dx-state-invisible'))
    .filter((element) => cleanText(element.value).length > 0)
    .length;
}

function getAmisCandidateFormSignature(formRoot: HTMLElement) {
  const values = Array.from(formRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .slice(0, 30)
    .map((element) => cleanText(element.value))
    .join('|');
  return `${formRoot.scrollHeight}:${cleanText(formRoot.textContent).length}:${values}`;
}

function waitForAmisDomUpdate(root: Node, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      resolve();
    };
    const observer = new MutationObserver(finish);
    const timeoutId = window.setTimeout(finish, timeoutMs);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
  });
}

function isElementInsideViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

async function closeOpenAmisDropdown() {
  if (getVisibleAmisDropdownPopups().length === 0) return;
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape',
    code: 'Escape',
  }));
  await waitForAmisDomUpdate(document.body, 150);
}

function findAmisCandidateFormRoot() {
  const heading = getVisibleElements<HTMLElement>('h1, h2, h3, h4, span, div')
    .find((element) => normalizeAmisUiText(element.innerText || element.textContent) === 'themungvien');
  if (!heading) {
    return findVisibleModalRoots()
      .find((root) => normalizeAmisUiText(root.innerText || root.textContent).includes('themungvien'))
      ?? null;
  }

  let root: HTMLElement | null = heading;
  for (let depth = 0; depth < 10 && root; depth += 1) {
    const rect = root.getBoundingClientRect();
    const hasSaveButton = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
      .some((element) => normalizeAmisUiText(element.innerText || element.textContent) === 'luu');
    const hasSourceField = Array.from(root.querySelectorAll<HTMLElement>('label, span, div, p'))
      .some((element) => normalizeAmisUiText(element.innerText || element.textContent) === 'nguonungvien');
    const hasCandidateFormMarkers = root.matches(
      '.popup, .popup-container, .popup-content, .form, .infor-candidate, .right-content, '
      + '[class*="popup"], [class*="candidate"]',
    ) || Boolean(root.querySelector(
      '.popup, .popup-container, .popup-content, .form, .infor-candidate, .right-content, '
      + '.import-cv, input[type="file"]',
    ));
    if (rect.width >= 300 && rect.height >= 180 && (hasSaveButton || hasSourceField || hasCandidateFormMarkers)) {
      return root;
    }
    root = root.parentElement;
  }

  return heading.closest<HTMLElement>(
    '.dx-popup-wrapper, .dx-overlay-wrapper, [role="dialog"], .modal, .ant-modal, .v-modal, '
    + '.popup, .popup-container, .popup-content, .form, .infor-candidate, .right-content',
  );
}

function advanceAmisCandidateFormScroll() {
  const formRoot = findAmisCandidateFormRoot();
  if (!formRoot) return false;

  const heading = getVisibleElements<HTMLElement>('h1, h2, h3, h4, span, div')
    .find((element) => normalizeAmisUiText(element.innerText || element.textContent) === 'themungvien');
  const headingRect = heading?.getBoundingClientRect() ?? formRoot.getBoundingClientRect();
  const scrollables = [formRoot, ...Array.from(formRoot.querySelectorAll<HTMLElement>('*'))]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 250
        && rect.height >= 180
        && rect.left <= headingRect.right
        && rect.right >= headingRect.left
        && element.scrollHeight > element.clientHeight + 40;
    })
    .sort((left, right) =>
      (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight),
    );

  for (const scrollable of scrollables) {
    const previousScrollTop = scrollable.scrollTop;
    const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
    if (previousScrollTop >= maxScrollTop - 2) continue;

    scrollable.scrollTop = Math.min(
      maxScrollTop,
      previousScrollTop + Math.max(240, Math.floor(scrollable.clientHeight * 0.75)),
    );
    if (scrollable.scrollTop <= previousScrollTop + 1) continue;

    scrollable.dispatchEvent(new Event('scroll', { bubbles: true }));
    return true;
  }

  return false;
}

function readAmisCandidateSourceOptionId(option: HTMLElement) {
  for (const attribute of ['data-id', 'data-value', 'data-key', 'data-item-id', 'value']) {
    const value = cleanText(option.getAttribute(attribute));
    if (value) return value;
  }

  const valueElement = option.querySelector<HTMLElement>('[data-id], [data-value], [data-key], [value]');
  if (!valueElement) return '';
  for (const attribute of ['data-id', 'data-value', 'data-key', 'value']) {
    const value = cleanText(valueElement.getAttribute(attribute));
    if (value) return value;
  }

  return '';
}

function openAmisDocumentUploadForm() {
  const uploadButton = getVisibleElements<HTMLElement>('button, [role="button"], a, span, div')
    .find((element) => {
      const text = cleanText(element.innerText || element.textContent).toLowerCase();
      return text === '\u0074\u1ea3\u0069 \u006c\u00ea\u006e \u0074\u00e0\u0069 \u006c\u0069\u1ec7\u0075'
        || text.includes('\u0074\u1ea3\u0069 \u006c\u00ea\u006e \u0074\u00e0\u0069 \u006c\u0069\u1ec7\u0075');
    });

  if (!uploadButton) {
    throw new Error('AMIS document upload button was not found.');
  }

  uploadButton.click();
}

function waitForAmisUploadTarget(timeoutMs: number) {
  const currentInput = findAmisCvFileInput();
  if (currentInput || findAmisCvDropTarget(currentInput)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('AMIS document upload form did not open in time.'));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const input = findAmisCvFileInput();
      if (!input && !findAmisCvDropTarget(input)) return;
      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
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

function normalizeAmisUiText(value: unknown) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
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

function isSelectAmisCandidateSourceMessage(value: unknown): value is SelectAmisCandidateSourceMessage {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === SELECT_AMIS_CANDIDATE_SOURCE_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { sourceName?: unknown }).sourceName === 'string';
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
