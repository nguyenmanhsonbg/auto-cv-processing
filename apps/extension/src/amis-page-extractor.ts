import type { AmisExtractionResult } from './types';

export function extractAmisJobFromPage(): AmisExtractionResult {
  type FieldValue = {
    value: string;
    source: string;
  };

  type FieldSources = Record<string, string>;

  const MAX_SHORT_TEXT = 300;
  const MAX_LONG_TEXT = 8000;

  try {
    const pageUrl = window.location.href;
    const host = window.location.hostname;
    const title = document.title;
    const markerResult = detectPageContext(host, title);
    const fieldSources: FieldSources = {};

    if (!markerResult.detected) {
      return {
        status: 'UNSUPPORTED_PAGE',
        detected: false,
        source: 'DOM_HEURISTIC',
        confidence: 'LOW',
        url: pageUrl,
        missingFields: ['AMIS recruitment id', 'title', 'description', 'requirements'],
        warnings: [
          'Current page does not look like a supported AMIS recruitment screen.',
        ],
        evidence: {
          host,
          title,
          markers: markerResult.markers,
          fieldSources,
        },
      };
    }

    const amisRecruitmentId = extractRecruitmentId(pageUrl, fieldSources);
    const extractedTitle =
      findFieldByKeywords([
        'tieu de tin',
        'ten tin',
        'ten vi tri',
        'vi tri tuyen dung',
        'chuc danh',
        'job title',
        'title',
        'position',
      ], 'title', fieldSources, MAX_SHORT_TEXT)
      ?? findHeadingTitle(fieldSources);
    const description = findFieldByKeywords([
      'mo ta cong viec',
      'mo ta',
      'noi dung cong viec',
      'job description',
      'description',
      'responsibilities',
    ], 'description', fieldSources, MAX_LONG_TEXT);
    const summary = findFieldByKeywords([
      'mo ta tom tat',
      'tom tat cong viec',
      'summary',
      'job summary',
    ], 'summary', fieldSources, 500);
    const requirements = findFieldByKeywords([
      'yeu cau cong viec',
      'yeu cau ung vien',
      'yeu cau',
      'requirements',
      'job requirements',
      'qualification',
      'qualifications',
    ], 'requirements', fieldSources, MAX_LONG_TEXT);
    const benefits = findFieldByKeywords([
      'quyen loi',
      'che do',
      'phuc loi',
      'benefits',
      'welfare',
    ], 'benefits', fieldSources, 4000);
    const location = findFieldByKeywords([
      'dia diem',
      'noi lam viec',
      'location',
      'workplace',
    ], 'location', fieldSources, MAX_SHORT_TEXT);
    const deadline = findFieldByKeywords([
      'han nop',
      'han ung tuyen',
      'deadline',
      'expiry',
      'expired',
    ], 'deadline', fieldSources, MAX_SHORT_TEXT);
    const normalizedDeadline = deadline?.value ? normalizeDeadline(deadline.value) : undefined;

    const snapshot = {
      title: extractedTitle?.value ?? '',
      ...(summary?.value ? { summary: summary.value } : {}),
      description: description?.value ?? '',
      requirements: {
        rawText: requirements?.value ?? '',
      },
      ...(benefits?.value ? { benefits: { rawText: benefits.value } } : {}),
      ...(location?.value ? { location: location.value } : {}),
      ...(normalizedDeadline ? { deadline: normalizedDeadline } : {}),
    };

    const missingFields: string[] = [];
    if (!amisRecruitmentId) missingFields.push('AMIS recruitment id');
    if (!snapshot.title) missingFields.push('title');
    if (!snapshot.description) missingFields.push('description');
    if (!snapshot.requirements.rawText) missingFields.push('requirements');

    const warnings = buildWarnings(missingFields, fieldSources, Boolean(deadline?.value && !normalizedDeadline));
    const confidence = getConfidence(missingFields, fieldSources, markerResult.markers);

    return {
      status: 'AMIS_PAGE_DETECTED',
      detected: true,
      source: 'DOM_HEURISTIC',
      confidence,
      url: pageUrl,
      ...(amisRecruitmentId ? { amisRecruitmentId } : {}),
      snapshot,
      missingFields,
      warnings,
      evidence: {
        host,
        title,
        markers: markerResult.markers,
        fieldSources,
      },
    };
  } catch (error) {
    return {
      status: 'EXTRACTION_FAILED',
      detected: false,
      source: 'DOM_HEURISTIC',
      confidence: 'LOW',
      url: window.location.href,
      missingFields: ['AMIS recruitment id', 'title', 'description', 'requirements'],
      warnings: [
        error instanceof Error ? error.message : 'AMIS extraction failed.',
      ],
      evidence: {
        host: window.location.hostname,
        title: document.title,
        markers: [],
        fieldSources: {},
      },
    };
  }

  function detectPageContext(hostname: string, pageTitle: string) {
    const pageText = normalizeText([
      pageTitle,
      document.body?.innerText.slice(0, 20000) ?? '',
    ].join('\n'));
    const normalizedHost = normalizeText(hostname);
    const markers: string[] = [];

    if (normalizedHost.includes('amis')) markers.push('host:amis');
    if (normalizeText(pageTitle).includes('amis')) markers.push('title:amis');

    [
      ['text:tuyen-dung', 'tuyen dung'],
      ['text:tin-tuyen-dung', 'tin tuyen dung'],
      ['text:vi-tri-tuyen-dung', 'vi tri tuyen dung'],
      ['text:mo-ta-cong-viec', 'mo ta cong viec'],
      ['text:yeu-cau-cong-viec', 'yeu cau cong viec'],
      ['text:job-description', 'job description'],
      ['text:recruitment', 'recruitment'],
    ].forEach(([marker, keyword]) => {
      if (pageText.includes(keyword)) markers.push(marker);
    });

    const hasAmisMarker = markers.some((marker) => marker.includes('amis'));
    const hasRecruitmentMarker = markers.some((marker) => !marker.includes('amis'));

    return {
      detected: hasAmisMarker && hasRecruitmentMarker,
      markers,
    };
  }

  function extractRecruitmentId(pageUrl: string, fieldSources: FieldSources) {
    const parsedUrl = new URL(pageUrl);
    const paramNames = [
      'recruitmentId',
      'recruitment_id',
      'amisRecruitmentId',
      'jobId',
      'job_id',
      'postingId',
      'posting_id',
      'vacancyId',
      'vacancy_id',
      'id',
    ];

    for (const name of paramNames) {
      const value = cleanId(parsedUrl.searchParams.get(name));
      if (value) {
        fieldSources.amisRecruitmentId = `url query: ${name}`;
        return value;
      }
    }

    const domId = findIdInDom(fieldSources);
    if (domId) return domId;

    const pathCandidate = parsedUrl.pathname
      .split('/')
      .reverse()
      .map((part) => cleanId(decodeURIComponent(part)))
      .find((part) => part !== undefined);

    if (pathCandidate) {
      fieldSources.amisRecruitmentId = 'url path segment';
      return pathCandidate;
    }

    return undefined;
  }

  function findIdInDom(fieldSources: FieldSources) {
    const selector = [
      '[data-amis-id]',
      '[data-recruitment-id]',
      '[data-job-id]',
      '[data-id]',
      'input[name*="recruit" i]',
      'input[name*="job" i]',
      'input[name="id" i]',
      'input[id*="recruit" i]',
      'input[id*="job" i]',
      'input[id="id" i]',
    ].join(',');

    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rawValue =
        element.getAttribute('data-amis-id')
        ?? element.getAttribute('data-recruitment-id')
        ?? element.getAttribute('data-job-id')
        ?? element.getAttribute('data-id')
        ?? (element instanceof HTMLInputElement ? element.value : null);
      const value = cleanId(rawValue);
      if (value) {
        fieldSources.amisRecruitmentId = domSource(element);
        return value;
      }
    }

    return undefined;
  }

  function cleanId(value: string | null) {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 120) return undefined;
    if (isGenericIdCandidate(trimmed)) return undefined;

    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f-]{13,}$/i.test(trimmed);
    const looksLikeNumericId = /^\d{4,}$/.test(trimmed);
    const looksLikeCode = /^(?=.*\d)[A-Z0-9][A-Z0-9_-]{5,}$/i.test(trimmed);
    return looksLikeUuid || looksLikeNumericId || looksLikeCode ? trimmed : undefined;
  }

  function isGenericIdCandidate(value: string) {
    return [
      'amis',
      'app',
      'create',
      'detail',
      'edit',
      'hrm',
      'job',
      'job-postings',
      'jobs',
      'recruitment',
      'recruitments',
      'tuyen-dung',
      'vacancy',
      'vacancies',
    ].includes(normalizeText(value));
  }

  function findFieldByKeywords(
    keywords: string[],
    fieldName: string,
    fieldSources: FieldSources,
    maxLength: number,
  ): FieldValue | undefined {
    const byControl = findControlByKeyword(keywords, fieldName, fieldSources, maxLength);
    if (byControl) return byControl;

    const bySection = findSectionByKeyword(keywords, fieldName, fieldSources, maxLength);
    if (bySection) return bySection;

    return undefined;
  }

  function findControlByKeyword(
    keywords: string[],
    fieldName: string,
    fieldSources: FieldSources,
    maxLength: number,
  ): FieldValue | undefined {
    const controls = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'));

    for (const control of controls) {
      const descriptor = normalizeText([
        control.getAttribute('aria-label') ?? '',
        control.getAttribute('placeholder') ?? '',
        control.getAttribute('name') ?? '',
        control.getAttribute('id') ?? '',
        findAssociatedLabel(control),
        findNearbyLabel(control),
      ].join(' '));

      if (!keywords.some((keyword) => descriptor.includes(keyword))) continue;

      const value = trimText(readControlValue(control), maxLength);
      if (!value) continue;

      fieldSources[fieldName] = domSource(control);
      return {
        value,
        source: fieldSources[fieldName],
      };
    }

    return undefined;
  }

  function findSectionByKeyword(
    keywords: string[],
    fieldName: string,
    fieldSources: FieldSources,
    maxLength: number,
  ): FieldValue | undefined {
    const candidates = Array.from(document.querySelectorAll('label, legend, h1, h2, h3, h4, h5, strong, b, span, div, p'))
      .filter((element) => {
        const text = normalizeText(element.textContent ?? '');
        return text.length > 0 && text.length < 120 && keywords.some((keyword) => text.includes(keyword));
      });

    for (const candidate of candidates) {
      const value = trimText(readSectionValue(candidate), maxLength);
      if (!value) continue;

      fieldSources[fieldName] = domSource(candidate);
      return {
        value,
        source: fieldSources[fieldName],
      };
    }

    return undefined;
  }

  function findHeadingTitle(fieldSources: FieldSources): FieldValue | undefined {
    for (const heading of Array.from(document.querySelectorAll('h1, h2'))) {
      const value = trimText(heading.textContent ?? '', MAX_SHORT_TEXT);
      if (!value || isGenericHeading(value)) continue;

      fieldSources.title = domSource(heading);
      return {
        value,
        source: fieldSources.title,
      };
    }

    return undefined;
  }

  function readControlValue(control: Element) {
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      return control.value;
    }

    return (control as HTMLElement).innerText ?? control.textContent ?? '';
  }

  function readSectionValue(labelElement: Element) {
    const directControl = findControlNear(labelElement);
    if (directControl) return readControlValue(directControl);

    const container = findReadableContainer(labelElement);
    if (!container) return '';

    const labelText = normalizeText(labelElement.textContent ?? '');
    const lines = ((container as HTMLElement).innerText ?? container.textContent ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => normalizeText(line) !== labelText);

    return lines.join('\n');
  }

  function findControlNear(labelElement: Element) {
    const labeledControl = getControlFromLabel(labelElement);
    if (labeledControl) return labeledControl;

    const parent = labelElement.closest('label, .form-group, .form-item, .field, .row, .col, div');
    const parentControl = parent?.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
    if (parentControl && parentControl !== labelElement) return parentControl;

    let sibling = labelElement.nextElementSibling;
    for (let index = 0; sibling && index < 4; index += 1) {
      if (matchesControl(sibling)) return sibling;
      const nested = sibling.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
      if (nested) return nested;
      sibling = sibling.nextElementSibling;
    }

    return undefined;
  }

  function findReadableContainer(labelElement: Element) {
    let sibling = labelElement.nextElementSibling;
    for (let index = 0; sibling && index < 4; index += 1) {
      const text = trimText((sibling as HTMLElement).innerText ?? sibling.textContent ?? '', MAX_LONG_TEXT);
      if (text && !isLikelyNavigationText(text)) return sibling;
      sibling = sibling.nextElementSibling;
    }

    return labelElement.parentElement;
  }

  function findAssociatedLabel(control: Element) {
    if (control.id) {
      const label = document.querySelector(`label[for="${cssEscape(control.id)}"]`);
      if (label?.textContent) return label.textContent;
    }

    const wrapperLabel = control.closest('label');
    return wrapperLabel?.textContent ?? '';
  }

  function getControlFromLabel(labelElement: Element) {
    if (!(labelElement instanceof HTMLLabelElement)) return undefined;
    if (labelElement.control) return labelElement.control;
    return labelElement.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]') ?? undefined;
  }

  function findNearbyLabel(control: Element) {
    const parent = control.parentElement;
    const grandparent = parent?.parentElement;
    return [
      parent?.querySelector('label, .label, [class*="label" i]')?.textContent ?? '',
      grandparent?.querySelector('label, .label, [class*="label" i]')?.textContent ?? '',
      control.previousElementSibling?.textContent ?? '',
    ].join(' ');
  }

  function matchesControl(element: Element) {
    return element.matches('input, textarea, [contenteditable="true"], [role="textbox"]');
  }

  function trimText(value: string, maxLength: number) {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, maxLength)
      .trim();
  }

  function normalizeText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function domSource(element: Element) {
    const parts = [element.tagName.toLowerCase()];
    const name = element.getAttribute('name');
    const id = element.getAttribute('id');
    const dataId = element.getAttribute('data-id');
    const ariaLabel = element.getAttribute('aria-label');

    if (id) parts.push(`#${id.slice(0, 60)}`);
    if (name) parts.push(`[name="${name.slice(0, 60)}"]`);
    if (dataId) parts.push('[data-id]');
    if (ariaLabel) parts.push(`[aria-label="${ariaLabel.slice(0, 60)}"]`);

    return parts.join('');
  }

  function isGenericHeading(value: string) {
    const normalized = normalizeText(value);
    return [
      'tuyen dung',
      'tin tuyen dung',
      'thong tin chung',
      'chi tiet tin tuyen dung',
      'recruitment',
      'job posting',
    ].includes(normalized);
  }

  function isLikelyNavigationText(value: string) {
    const normalized = normalizeText(value);
    return normalized.includes('dang tin')
      && normalized.includes('huy')
      && normalized.includes('luu')
      && normalized.length < 300;
  }

  function buildWarnings(
    missingFields: string[],
    fieldSources: FieldSources,
    hasUnusableDeadline: boolean,
  ) {
    const warnings: string[] = [];

    if (missingFields.length > 0) {
      warnings.push(`Missing required fields: ${missingFields.join(', ')}.`);
    }

    if (!fieldSources.amisRecruitmentId) {
      warnings.push('AMIS recruitment id was not found in URL or stable DOM attributes.');
    }

    if (hasUnusableDeadline) {
      warnings.push('Deadline was found but omitted because it was not a confirmed ISO date.');
    }

    warnings.push('Extractor used DOM heuristics because AMIS selectors/API are not finalized.');

    return warnings;
  }

  function normalizeDeadline(value: string) {
    const compact = value.trim();
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(compact)) return compact;

    const dateMatch = compact.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
    if (!dateMatch) return undefined;

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) return undefined;

    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');
  }

  function getConfidence(
    missingFields: string[],
    fieldSources: FieldSources,
    markers: string[],
  ) {
    const extractedFieldCount = Object.keys(fieldSources).length;

    if (missingFields.length === 0 && extractedFieldCount >= 4 && markers.length >= 3) {
      return 'HIGH';
    }

    if (missingFields.length <= 1 && extractedFieldCount >= 3) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  function cssEscape(value: string) {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(value);
    }

    return value.replace(/["\\]/g, '\\$&');
  }
}
