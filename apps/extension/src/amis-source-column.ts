const AMIS_SOURCE_COLUMN_DATA_MESSAGE_TYPE = 'VCS_GET_AMIS_SOURCE_COLUMN_DATA';
const SOURCE_COLUMN_CONTROLLER_KEY = '__VCS_AMIS_SOURCE_COLUMN_CONTROLLER__';
const SOURCE_COLUMN_LAYER_ATTRIBUTE = 'data-vcs-source-column';
const SOURCE_COLUMN_SPAN_ATTRIBUTE = 'data-vcs-source-column-span';
const SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE = 'data-vcs-source-column-table-width';
const SOURCE_COLUMN_STYLE_ATTRIBUTE = 'data-vcs-source-column-style';
const SOURCE_COLUMN_STYLE_ID = 'vcs-amis-source-column-styles';
const SOURCE_COLUMN_WIDTH_PX = 150;
const ROUTE_CHECK_INTERVAL_MS = 750;
const RECONCILE_DEBOUNCE_MS = 100;
const AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE = 'AMIS_APPLICATIONS_SYNCED';

interface AmisSourceColumnItem {
  applicationId: string;
  candidateName: string;
  email: string | null;
  mobile: string | null;
  sourceChannel: string | null;
}

interface AmisSourceColumnDataRequest {
  type: typeof AMIS_SOURCE_COLUMN_DATA_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
  };
}

interface AmisSourceColumnDataResponse {
  ok: boolean;
  amisRecruitmentId: string;
  items: AmisSourceColumnItem[];
  error?: string;
}

interface SourceLookup {
  byEmail: Map<string, AmisSourceColumnItem | null>;
  byMobile: Map<string, AmisSourceColumnItem | null>;
  byName: Map<string, AmisSourceColumnItem | null>;
}

interface AmisSourceColumnController {
  dispose: () => void;
}

interface WindowWithSourceColumnController extends Window {
  [SOURCE_COLUMN_CONTROLLER_KEY]?: AmisSourceColumnController;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  VCSPORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ITViec',
  LINKEDIN: 'LinkedIn',
  VIETNAMWORKS: 'VietnamWorks',
};

function installAmisSourceColumnController() {
  if (!isTopFrame()) return;

  const controllerWindow = window as WindowWithSourceColumnController;
  controllerWindow[SOURCE_COLUMN_CONTROLLER_KEY]?.dispose();

  const controller = createController();
  controllerWindow[SOURCE_COLUMN_CONTROLLER_KEY] = controller;
}

function createController(): AmisSourceColumnController {
  let disposed = false;
  let activeRecruitmentId: string | null = null;
  let sourceLookup: SourceLookup = createEmptyLookup();
  let requestSequence = 0;
  let reconcileTimeoutId: number | undefined;
  let routeIntervalId: number | undefined;
  let observedGrid: HTMLElement | null = null;
  let observedScrollContainer: HTMLElement | null = null;
  let gridScrollHandler: (() => void) | null = null;
  const runtimeMessageHandler = (message: unknown) => {
    if (!isAmisApplicationsSyncedMessage(message)) return;
    if (!activeRecruitmentId || message.payload.amisRecruitmentId !== activeRecruitmentId) return;

    requestSequence += 1;
    void loadSourceLookup(activeRecruitmentId, requestSequence);
  };

  const mutationObserver = new MutationObserver((mutations) => {
    if (mutations.length > 0 && mutations.every(isOwnMutation)) return;
    scheduleReconcile();
  });

  const checkRouteAndReconcile = () => {
    if (disposed) return;

    const recruitmentId = getAmisRecruitmentId(window.location.href);
    if (recruitmentId !== activeRecruitmentId) {
      activeRecruitmentId = recruitmentId;
      sourceLookup = createEmptyLookup();
      requestSequence += 1;

      if (recruitmentId) {
        void loadSourceLookup(recruitmentId, requestSequence);
      }
    }

    scheduleReconcile();
  };

  const onRouteEvent = () => {
    window.setTimeout(checkRouteAndReconcile, 0);
  };

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', onRouteEvent);
  window.addEventListener('hashchange', onRouteEvent);
  window.addEventListener('resize', scheduleReconcile);
  window.addEventListener('scroll', scheduleReconcile, true);
  document.addEventListener('click', onRouteEvent, true);
  chrome.runtime?.onMessage?.addListener(runtimeMessageHandler);
  routeIntervalId = window.setInterval(checkRouteAndReconcile, ROUTE_CHECK_INTERVAL_MS);

  checkRouteAndReconcile();

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestSequence += 1;
      mutationObserver.disconnect();
      window.clearInterval(routeIntervalId);
      window.clearTimeout(reconcileTimeoutId);
      window.removeEventListener('popstate', onRouteEvent);
      window.removeEventListener('hashchange', onRouteEvent);
      window.removeEventListener('resize', scheduleReconcile);
      window.removeEventListener('scroll', scheduleReconcile, true);
      document.removeEventListener('click', onRouteEvent, true);
      chrome.runtime?.onMessage?.removeListener?.(runtimeMessageHandler);
      detachGridScrollListener();
      removeInjectedSourceColumnElements();
    },
  };

  function scheduleReconcile() {
    if (disposed || reconcileTimeoutId !== undefined) return;
    reconcileTimeoutId = window.setTimeout(() => {
      reconcileTimeoutId = undefined;
      reconcileGrid();
    }, RECONCILE_DEBOUNCE_MS);
  }

  async function loadSourceLookup(recruitmentId: string, sequence: number) {
    const response = await requestSourceData(recruitmentId);
    if (disposed || sequence !== requestSequence || recruitmentId !== activeRecruitmentId) return;

    sourceLookup = response?.ok && response.amisRecruitmentId === recruitmentId
      ? buildSourceLookup(response.items)
      : createEmptyLookup();
    scheduleReconcile();
  }

  function reconcileGrid() {
    if (disposed) return;

    if (!activeRecruitmentId) {
      detachGridScrollListener();
      removeInjectedSourceColumnElements();
      return;
    }

    const grid = findCandidateGrid();
    if (!grid) {
      detachGridScrollListener();
      removeInjectedSourceColumnElements();
      return;
    }

    attachGridScrollListener(grid);
    renderSourceColumn(grid, sourceLookup);
  }

  function attachGridScrollListener(grid: HTMLElement) {
    if (observedGrid === grid) return;

    detachGridScrollListener();
    observedGrid = grid;
    observedScrollContainer = grid.querySelector<HTMLElement>(
      '.dx-datagrid-rowsview .dx-scrollable-container',
    );
    if (!observedScrollContainer) return;

    gridScrollHandler = () => scheduleReconcile();
    observedScrollContainer.addEventListener('scroll', gridScrollHandler, { passive: true });
  }

  function detachGridScrollListener() {
    if (observedScrollContainer && gridScrollHandler) {
      observedScrollContainer.removeEventListener('scroll', gridScrollHandler);
    }
    observedGrid = null;
    observedScrollContainer = null;
    gridScrollHandler = null;
  }
}

async function requestSourceData(amisRecruitmentId: string) {
  const message: AmisSourceColumnDataRequest = {
    type: AMIS_SOURCE_COLUMN_DATA_MESSAGE_TYPE,
    payload: { amisRecruitmentId },
  };

  try {
    const response = await chrome.runtime?.sendMessage?.(message);
    return isSourceColumnDataResponse(response) ? response : null;
  } catch {
    return null;
  }
}

function findCandidateGrid() {
  const host = document.querySelector<HTMLElement>('dx-data-grid.candidate-datagrid');
  if (host) return host;

  return document.querySelector<HTMLElement>('.candidate-grid .dx-datagrid');
}

function renderSourceColumn(grid: HTMLElement, sourceLookup: SourceLookup) {
  removeInjectedSourceColumnElements();
  ensureSourceColumnStyles();

  const tables = findCandidateGridTables(grid);
  if (!tables.scrollableHeader || !tables.scrollableBody) return;
  const expandedScrollableTableWidth = getExpandedScrollableTableWidth(tables.scrollableBody);

  const sourceByRowIndex = new Map<string, string>();
  for (const row of getDataRows(tables.scrollableBody)) {
    const rowIndex = row.getAttribute('aria-rowindex');
    if (!rowIndex) continue;
    sourceByRowIndex.set(rowIndex, getSourceLabel(findSourceForRow(row, sourceLookup)));
  }

  addSourceColumnToTable(
    tables.scrollableHeader,
    'header',
    sourceByRowIndex,
    expandedScrollableTableWidth,
  );
  addSourceColumnToTable(
    tables.scrollableBody,
    'body',
    sourceByRowIndex,
    expandedScrollableTableWidth,
  );
  if (tables.fixedHeader) {
    addSourceColumnToTable(tables.fixedHeader, 'header', sourceByRowIndex, null);
  }
  if (tables.fixedBody) {
    addSourceColumnToTable(tables.fixedBody, 'body', sourceByRowIndex, null);
  }
}

function findCandidateGridTables(grid: HTMLElement) {
  const headerTables = Array.from(grid.querySelectorAll<HTMLTableElement>(
    '.dx-datagrid-headers table',
  ));
  const bodyTables = Array.from(grid.querySelectorAll<HTMLTableElement>(
    '.dx-datagrid-rowsview table',
  ));

  return {
    scrollableHeader: headerTables.find((table) => !table.closest('.dx-datagrid-content-fixed')) ?? null,
    fixedHeader: headerTables.find((table) => Boolean(table.closest('.dx-datagrid-content-fixed'))) ?? null,
    scrollableBody: bodyTables.find((table) => (
      !table.closest('.dx-datagrid-content-fixed') && Boolean(table.closest('.dx-scrollable-content'))
    )) ?? null,
    fixedBody: bodyTables.find((table) => Boolean(table.closest('.dx-datagrid-content-fixed'))) ?? null,
  };
}

function addSourceColumnToTable(
  table: HTMLTableElement,
  tablePart: 'header' | 'body',
  sourceByRowIndex: Map<string, string>,
  expandedScrollableTableWidth: number | null,
) {
  const isFixedTable = Boolean(table.closest('.dx-datagrid-content-fixed'));
  const headerRow = table.querySelector<HTMLTableRowElement>('tbody > tr.dx-header-row');
  const actionCell = headerRow?.querySelector<HTMLTableCellElement>('.dx-command-edit')
    ?? table.querySelector<HTMLTableCellElement>(
      'tbody > tr.dx-data-row .dx-command-edit, tbody > tr.dx-freespace-row .dx-command-edit',
    );
  const actionColumnIndex = actionCell
    ? Array.from(actionCell.parentElement?.children ?? []).indexOf(actionCell)
    : -1;
  const colGroup = table.querySelector<HTMLElement>('colgroup');
  if (colGroup) {
    const sourceCol = document.createElement('col');
    sourceCol.setAttribute(SOURCE_COLUMN_LAYER_ATTRIBUTE, 'true');
    sourceCol.style.width = `${SOURCE_COLUMN_WIDTH_PX}px`;
    const insertIndex = isFixedTable
      ? Math.max(0, colGroup.children.length - 1)
      : actionColumnIndex >= 0 ? actionColumnIndex : colGroup.children.length;
    colGroup.insertBefore(sourceCol, colGroup.children[insertIndex] ?? null);
  }

  if (isFixedTable) {
    expandFixedTableSpans(table);
    return;
  }

  if (expandedScrollableTableWidth !== null) {
    setScrollableTableWidth(table, expandedScrollableTableWidth);
  }

  if (tablePart === 'header' && headerRow) {
    const sourceHeader = document.createElement('td');
    sourceHeader.className = 'vcs-amis-source-column-header dx-cell-focus-disabled';
    sourceHeader.setAttribute(SOURCE_COLUMN_LAYER_ATTRIBUTE, 'true');
    sourceHeader.setAttribute('role', 'columnheader');
    sourceHeader.setAttribute('aria-label', 'Cột Nguồn');
    sourceHeader.setAttribute('aria-colindex', getSourceColumnAriaIndex(actionCell));
    sourceHeader.textContent = 'Nguồn';
    insertBeforeActionCell(headerRow, sourceHeader);
    return;
  }

  for (const row of getBodyRows(table)) {
    const sourceCell = document.createElement('td');
    sourceCell.className = 'vcs-amis-source-column-cell';
    sourceCell.setAttribute(SOURCE_COLUMN_LAYER_ATTRIBUTE, 'true');
    sourceCell.setAttribute('role', 'gridcell');
    sourceCell.setAttribute('aria-colindex', getSourceColumnAriaIndex(actionCell));
    sourceCell.setAttribute('aria-rowindex', row.getAttribute('aria-rowindex') ?? '');
    sourceCell.textContent = row.matches('.dx-data-row')
      ? sourceByRowIndex.get(row.getAttribute('aria-rowindex') ?? '') ?? ''
      : '';
    insertBeforeActionCell(row, sourceCell);
  }
}

function expandFixedTableSpans(table: HTMLTableElement) {
  table.querySelectorAll<HTMLTableCellElement>('td[colspan]').forEach((cell) => {
    if (cell.hasAttribute(SOURCE_COLUMN_SPAN_ATTRIBUTE)) return;

    cell.colSpan += 1;
    cell.setAttribute(SOURCE_COLUMN_SPAN_ATTRIBUTE, 'true');
  });
}

function measureTableWidth(table: HTMLTableElement) {
  return Math.max(
    Math.ceil(table.getBoundingClientRect().width),
    table.scrollWidth,
    ...Array.from(table.querySelectorAll<HTMLElement>('colgroup > col'))
      .map((column) => Math.ceil(column.getBoundingClientRect().width)),
  );
}

function getExpandedScrollableTableWidth(table: HTMLTableElement) {
  const scrollContainer = table.closest<HTMLElement>('.dx-scrollable-container');
  const visibleWidth = scrollContainer?.clientWidth ?? table.parentElement?.clientWidth ?? 0;
  const currentWidth = measureTableWidth(table);

  return currentWidth > visibleWidth + 1
    ? currentWidth + SOURCE_COLUMN_WIDTH_PX
    : null;
}

function setScrollableTableWidth(table: HTMLTableElement, expandedWidth: number) {
  if (!table.hasAttribute(SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE)) {
    table.setAttribute(SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE, JSON.stringify({
      width: table.style.width,
      minWidth: table.style.minWidth,
    }));
  }

  table.style.width = `${expandedWidth}px`;
  table.style.minWidth = `${expandedWidth}px`;
}

function getDataRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody > tr.dx-data-row'));
}

function getBodyRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>(
    'tbody > tr.dx-data-row, tbody > tr.dx-freespace-row',
  ));
}

function insertBeforeActionCell(row: HTMLTableRowElement, cell: HTMLTableCellElement) {
  const actionCell = row.querySelector<HTMLTableCellElement>('.dx-command-edit');
  row.insertBefore(cell, actionCell ?? null);
}

function getSourceColumnAriaIndex(actionCell: HTMLTableCellElement | null) {
  return actionCell?.getAttribute('aria-colindex') ?? '';
}

function removeInjectedSourceColumnElements() {
  document.querySelectorAll<HTMLTableCellElement>(
    `[${SOURCE_COLUMN_SPAN_ATTRIBUTE}="true"]`,
  ).forEach((cell) => {
    cell.colSpan = Math.max(1, cell.colSpan - 1);
    cell.removeAttribute(SOURCE_COLUMN_SPAN_ATTRIBUTE);
  });

  document.querySelectorAll<HTMLTableElement>(
    `[${SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE}]`,
  ).forEach((table) => {
    try {
      const originalStyle = JSON.parse(
        table.getAttribute(SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE) ?? '{}',
      ) as { width?: unknown; minWidth?: unknown };
      table.style.width = typeof originalStyle.width === 'string' ? originalStyle.width : '';
      table.style.minWidth = typeof originalStyle.minWidth === 'string' ? originalStyle.minWidth : '';
    } catch {
      table.style.width = '';
      table.style.minWidth = '';
    }
    table.removeAttribute(SOURCE_COLUMN_TABLE_WIDTH_ATTRIBUTE);
  });

  document.querySelectorAll(`[${SOURCE_COLUMN_LAYER_ATTRIBUTE}="true"]`).forEach((element) => {
    element.remove();
  });
}

function ensureSourceColumnStyles() {
  if (document.getElementById(SOURCE_COLUMN_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SOURCE_COLUMN_STYLE_ID;
  style.setAttribute(SOURCE_COLUMN_STYLE_ATTRIBUTE, 'true');
  style.textContent = `
    .vcs-amis-source-column-header,
    .vcs-amis-source-column-cell {
      box-sizing: border-box;
      overflow: hidden;
      font-family: inherit;
      color: #212529;
      background: inherit;
      padding: 0 12px;
      border-bottom: 1px solid #e5e7eb;
      white-space: nowrap;
      text-overflow: ellipsis;
      text-align: left;
      font-size: 13px;
    }
    .vcs-amis-source-column-header {
      background: #f7f8fa;
      color: #1f2937;
      font-weight: 600;
    }
    .vcs-amis-source-column-cell {
      min-width: ${SOURCE_COLUMN_WIDTH_PX}px;
      width: ${SOURCE_COLUMN_WIDTH_PX}px;
    }
  `;
  document.head.appendChild(style);
}

function isOwnMutation(mutation: MutationRecord) {
  if (mutation.type !== 'childList') return false;

  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
  return nodes.length > 0 && nodes.every((node) => (
    node instanceof Element && (
      node.matches(`[${SOURCE_COLUMN_LAYER_ATTRIBUTE}="true"]`)
      || node.matches(`#${SOURCE_COLUMN_STYLE_ID}`)
    )
  ));
}

function isAmisApplicationsSyncedMessage(value: unknown): value is {
  type: typeof AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE;
  payload: { amisRecruitmentId: string };
} {
  if (typeof value !== 'object' || value === null) return false;
  const payload = (value as { payload?: unknown }).payload;
  return (value as { type?: unknown }).type === AMIS_APPLICATIONS_SYNCED_MESSAGE_TYPE
    && typeof payload === 'object'
    && payload !== null
    && typeof (payload as { amisRecruitmentId?: unknown }).amisRecruitmentId === 'string';
}

function findSourceForRow(row: HTMLElement, sourceLookup: SourceLookup) {
  const email = normalizeEmail(readRowEmail(row));
  if (email && sourceLookup.byEmail.has(email)) return sourceLookup.byEmail.get(email) ?? null;

  const mobile = normalizeMobile(readRowMobile(row));
  if (mobile && sourceLookup.byMobile.has(mobile)) return sourceLookup.byMobile.get(mobile) ?? null;

  const name = normalizeIdentity(readRowName(row));
  if (name && sourceLookup.byName.has(name)) return sourceLookup.byName.get(name) ?? null;

  return null;
}

function readRowName(row: HTMLElement) {
  const titledName = row.querySelector<HTMLElement>('.column-user-name [title]')?.getAttribute('title');
  if (titledName) return titledName;

  const nameElement = row.querySelector<HTMLElement>('.column-user-name');
  return nameElement?.innerText.replace(/\bMỚI\b/gi, '').trim() ?? '';
}

function readRowEmail(row: HTMLElement) {
  const emailFromTitle = Array.from(row.querySelectorAll<HTMLElement>('[title]'))
    .map((element) => element.getAttribute('title') ?? '')
    .find((value) => /@/.test(value));
  if (emailFromTitle) return emailFromTitle;

  return row.innerText.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? '';
}

function readRowMobile(row: HTMLElement) {
  const values = row.innerText.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  return values.sort((a, b) => normalizeMobile(b).length - normalizeMobile(a).length)[0] ?? '';
}

function buildSourceLookup(items: AmisSourceColumnItem[]): SourceLookup {
  const lookup = createEmptyLookup();
  for (const item of items) {
    addLookupValue(lookup.byEmail, normalizeEmail(item.email), item);
    addLookupValue(lookup.byMobile, normalizeMobile(item.mobile), item);
    addLookupValue(lookup.byName, normalizeIdentity(item.candidateName), item);
  }
  return lookup;
}

function createEmptyLookup(): SourceLookup {
  return {
    byEmail: new Map(),
    byMobile: new Map(),
    byName: new Map(),
  };
}

function addLookupValue(
  lookup: Map<string, AmisSourceColumnItem | null>,
  key: string,
  item: AmisSourceColumnItem,
) {
  if (!key) return;
  if (!lookup.has(key)) {
    lookup.set(key, item);
    return;
  }

  const existing = lookup.get(key);
  if (!existing || existing.applicationId !== item.applicationId) lookup.set(key, null);
}

function getSourceLabel(item: AmisSourceColumnItem | null) {
  if (!item?.sourceChannel?.trim()) return '';

  const normalized = normalizeSource(item.sourceChannel);
  return SOURCE_LABELS[normalized] ?? item.sourceChannel.trim();
}

function normalizeSource(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeMobile(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getAmisRecruitmentId(url: string) {
  try {
    return new URL(url).pathname.match(/\/recruit\/job\/detail\/(\d+)(?:\/|$)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isTopFrame() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function isSourceColumnDataResponse(value: unknown): value is AmisSourceColumnDataResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<AmisSourceColumnDataResponse>;
  return typeof response.ok === 'boolean'
    && typeof response.amisRecruitmentId === 'string'
    && Array.isArray(response.items)
    && response.items.every((item) => (
      typeof item === 'object'
      && item !== null
      && typeof (item as AmisSourceColumnItem).applicationId === 'string'
      && typeof (item as AmisSourceColumnItem).candidateName === 'string'
      && (typeof (item as AmisSourceColumnItem).email === 'string' || (item as AmisSourceColumnItem).email === null)
      && (typeof (item as AmisSourceColumnItem).mobile === 'string' || (item as AmisSourceColumnItem).mobile === null)
      && (typeof (item as AmisSourceColumnItem).sourceChannel === 'string' || (item as AmisSourceColumnItem).sourceChannel === null)
    ));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  installAmisSourceColumnController();
}
