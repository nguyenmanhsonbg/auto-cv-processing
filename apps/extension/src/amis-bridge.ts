import type { AmisCareerFetchResponse, AmisCareerItem, AmisDiagnosticEvent, AmisExtractionResult, AmisSelectedCareerResult } from './types';

const AMIS_CAPTURE_MESSAGE_TYPE = 'VCS_AMIS_SAVE_RECRUITMENT_CAPTURED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'VCS_AMIS_DIAGNOSTIC';
const BACKGROUND_MESSAGE_TYPE = 'AMIS_RECRUITMENT_SAVED';
const BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE = 'AMIS_DIAGNOSTIC_EVENT';
const FILL_AMIS_RECRUITMENT_FORM_MESSAGE_TYPE = 'VCS_FILL_AMIS_RECRUITMENT_FORM';
const FETCH_AMIS_CAREERS_MESSAGE_TYPE = 'VCS_FETCH_AMIS_CAREERS';
const GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE = 'VCS_GET_AMIS_SELECTED_CAREER';
const SELECTED_CAREER_CHANGED_MESSAGE_TYPE = 'AMIS_SELECTED_CAREER_CHANGED';
const AMIS_CAREER_DATA_PAGING_URL = 'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/Career/data_paging';
const AMIS_CAREER_SORT = 'W3sic2VsZWN0b3IiOiAiVXNhZ2VTdGF0dXMiLCAiZGVzYyI6ICJmYWxzZSJ9LHsic2VsZWN0b3IiOiAiQ2FyZWVyTmFtZSIsICJkZXNjIjogImZhbHNlIn1d';
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

sendDiagnostic({
  type: 'BRIDGE_READY',
  pageUrl: window.location.href,
  timestamp: new Date().toISOString(),
  frameUrl: window.location.href,
});
installSelectedCareerObserver();

function sendDiagnostic(event: AmisDiagnosticEvent) {
  void chrome.runtime?.sendMessage?.({
    type: BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE,
    payload: event,
  }).catch(() => undefined);
}

function getSelectedCareerFromPage(): AmisSelectedCareerResult {
  try {
    const careerName = readFieldValueNearLabel('Ngành nghề');
    return {
      ok: true,
      pageUrl: window.location.href,
      ...(careerName ? { careerName } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      pageUrl: window.location.href,
      error: error instanceof Error ? error.message : 'Could not read selected AMIS career.',
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

function isGetSelectedCareerMessage(value: unknown): value is {
  type: typeof GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === GET_AMIS_SELECTED_CAREER_MESSAGE_TYPE;
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
