const AMIS_CAPTURE_MESSAGE_TYPE = 'VCS_AMIS_SAVE_RECRUITMENT_CAPTURED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'VCS_AMIS_DIAGNOSTIC';
const AMIS_SAVE_RECRUITMENT_PATH = '/RecruitmentAPI/api/recruitment/SaveRecruitment';
const HOOK_INSTALLED_KEY = '__VCS_AMIS_SAVE_RECRUITMENT_HOOK_INSTALLED__';

const hookWindow = window as Window & {
  __VCS_AMIS_SAVE_RECRUITMENT_HOOK_INSTALLED__?: boolean;
};

if (!hookWindow[HOOK_INSTALLED_KEY]) {
  hookWindow[HOOK_INSTALLED_KEY] = true;
  installXhrHook();
  publishDiagnostic('HOOK_READY', {
    details: {
      watchedTransport: 'xhr',
      trigger: 'XMLHttpRequest.loadend',
    },
  });
}

function installXhrHook() {
  const xhrPrototype = window.XMLHttpRequest?.prototype as XMLHttpRequest & {
    open: (...args: unknown[]) => void;
    send: (...args: unknown[]) => void;
  } | undefined;
  if (!xhrPrototype) return;

  const originalOpen = xhrPrototype.open;
  const originalSend = xhrPrototype.send;

  xhrPrototype.open = function openWithAmisCapture(this: HookedXMLHttpRequest, ...args: unknown[]) {
    const [method, url] = args;
    this.__vcsAmisRequestMethod = typeof method === 'string' ? method : undefined;
    this.__vcsAmisRequestUrl = getRequestUrl(url);

    return Reflect.apply(originalOpen, this, args);
  };

  xhrPrototype.send = function sendWithAmisCapture(this: HookedXMLHttpRequest, ...args: unknown[]) {
    const requestUrl = this.__vcsAmisRequestUrl;
    if (requestUrl && isAmisSaveRecruitmentUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        publishDiagnostic('SAVE_XHR_RESPONSE_SEEN', {
          requestUrl,
          details: {
            transport: 'xhr',
            trigger: 'XMLHttpRequest.loadend',
            method: this.__vcsAmisRequestMethod,
            status: this.status,
            responseType: this.responseType || 'text',
          },
        });

        if (this.status < 200 || this.status >= 300) {
          publishDiagnostic('SAVE_RESPONSE_HTTP_ERROR', {
            requestUrl,
            details: {
              transport: 'xhr',
              status: this.status,
            },
          });
          return;
        }

        try {
          const json = readXhrJson(this);
          if (json === null) {
            publishDiagnostic('SAVE_RESPONSE_EMPTY', {
              requestUrl,
              details: {
                transport: 'xhr',
                status: this.status,
                responseType: this.responseType || 'text',
              },
            });
          }

          publishCapture(json, requestUrl);
        } catch (error) {
          publishDiagnostic('SAVE_RESPONSE_READ_FAILED', {
            requestUrl,
            details: {
              transport: 'xhr',
              message: error instanceof Error ? error.message : 'Could not read JSON response.',
            },
          });
        }
      }, { once: true });
    }

    return Reflect.apply(originalSend, this, args);
  };
}

function publishCapture(responseJson: unknown, requestUrl: string) {
  const capture = mapAmisSaveRecruitmentResponse(
    responseJson,
    new URL(requestUrl, window.location.origin).toString(),
    window.location.href,
  );

  if (!capture) {
    publishDiagnostic('SAVE_RESPONSE_UNMAPPED', {
      requestUrl,
      details: describePayloadShape(responseJson),
    });
    return;
  }

  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: AMIS_CAPTURE_MESSAGE_TYPE,
    payload: capture,
  }, window.location.origin);

  publishDiagnostic('CAPTURE_PUBLISHED', {
    requestUrl,
    details: {
      confidence: capture.confidence,
      missingFields: capture.missingFields,
      hasSnapshot: Boolean(capture.snapshot),
      hasAmisRecruitmentId: Boolean(capture.amisRecruitmentId),
    },
  });
}

function publishDiagnostic(
      type:
    | 'HOOK_READY'
    | 'SAVE_REQUEST_SEEN'
    | 'SAVE_XHR_RESPONSE_SEEN'
    | 'SAVE_RESPONSE_EMPTY'
    | 'SAVE_RESPONSE_READ_FAILED'
    | 'SAVE_RESPONSE_HTTP_ERROR'
    | 'SAVE_RESPONSE_UNMAPPED'
    | 'CAPTURE_PUBLISHED',
  event: {
    requestUrl?: string;
    details?: Record<string, unknown>;
  } = {},
) {
  window.setTimeout(() => {
    window.postMessage({
      source: 'vcs-recruitment-extension',
      type: AMIS_DIAGNOSTIC_MESSAGE_TYPE,
      payload: {
        type,
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
        requestUrl: event.requestUrl,
        details: event.details,
      },
    }, window.location.origin);
  }, 0);
}

function getRequestUrl(input: unknown) {
  if (typeof input === 'string') return new URL(input, window.location.origin).toString();
  if (input instanceof URL) return input.toString();

  return undefined;
}

function readXhrJson(xhr: XMLHttpRequest) {
  if (xhr.responseType === 'json') {
    return xhr.response ?? null;
  }

  if (xhr.responseType && xhr.responseType !== 'text') {
    return null;
  }

  return parseJsonText(xhr.responseText);
}

function parseJsonText(text: string) {
  const cleaned = text.trim().replace(/^\uFEFF/, '').replace(/^\)\]\}',?\s*/, '');
  if (!cleaned) return null;

  return JSON.parse(cleaned) as unknown;
}

function isAmisSaveRecruitmentUrl(url: string) {
  return url.toLowerCase().includes(AMIS_SAVE_RECRUITMENT_PATH.toLowerCase());
}

function mapAmisSaveRecruitmentResponse(
  response: unknown,
  requestUrl: string,
  pageUrl: string,
) {
  if (!isObject(response)) return null;

  const success = response.Success ?? response.success;
  if (success === false) return null;

  const data = findRecruitmentData(response);
  if (!data) return null;

  const recruitmentId = cleanText(readFirst(data, [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
    'ID',
    'Id',
    'id',
  ]));
  const summaryText = truncateText(cleanText(readFirst(data, ['Summary', 'summary'])), 500);
  const descriptionText = htmlToText(readFirst(data, ['Description', 'description']))
    || summaryText;
  const requirementText = htmlToText(readFirst(data, ['Requirement', 'Requirements', 'requirement', 'requirements']));
  const benefitText = htmlToText(readFirst(data, ['Benifit', 'Benefit', 'Benefits', 'benifit', 'benefit', 'benefits']));
  const location = extractLocation(data);
  const deadline = cleanText(readFirst(data, [
    'RegistrationExpiryDate',
    'registrationExpiryDate',
    'CloseDate',
    'closeDate',
    'ExpectedTime',
    'expectedTime',
  ])) || undefined;

  const snapshot = {
    title: cleanText(readFirst(data, ['TitleWebsite', 'titleWebsite']))
      || cleanText(readFirst(data, ['Title', 'title']))
      || cleanText(readFirst(data, ['JobPositionName', 'jobPositionName'])),
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
      title: document.title,
      markers: [
        'host:amisapp.misa.vn',
        'api:SaveRecruitment',
        `request:${new URL(requestUrl).pathname}`,
        'transport:xhr-response',
        ...('TraceID' in response ? ['trace-id-present'] : []),
        ...('ServerTime' in response ? ['server-time-present'] : []),
        'response-payload-present',
      ],
      fieldSources,
    },
  };
}

function findRecruitmentData(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || !isObject(value)) return null;

  if (isRecruitmentDataLike(value)) return value;

  const data = value.Data ?? value.data;
  if (typeof data === 'string' || typeof data === 'number') {
    return { RecruitmentID: data };
  }

  const dataResult = findRecruitmentData(data, depth + 1);
  if (dataResult) return dataResult;

  for (const key of [
    'Recruitment',
    'recruitment',
    'RecruitmentInfo',
    'recruitmentInfo',
    'Model',
    'model',
    'Entity',
    'entity',
    'Payload',
    'payload',
  ]) {
    const result = findRecruitmentData(value[key], depth + 1);
    if (result) return result;
  }

  return null;
}

function isRecruitmentDataLike(value: Record<string, unknown>) {
  return [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'TitleWebsite',
    'Title',
    'title',
    'Description',
    'description',
    'Requirement',
    'requirements',
  ].some((key) => key in value);
}

function extractLocation(data: Record<string, unknown>) {
  const locations = readFirstValue(data, [
    'RecruitmentWorkLocations',
    'recruitmentWorkLocations',
    'WorkLocations',
    'workLocations',
  ]);
  if (!Array.isArray(locations)) return undefined;

  const [firstLocation] = locations as Array<Record<string, unknown>>;
  if (!firstLocation) return undefined;
  if (Boolean(firstLocation.IsNationwide ?? firstLocation.isNationwide)) return 'Toan quoc';

  return cleanText(readFirst(firstLocation, ['WorkLocationDisplayName', 'workLocationDisplayName']))
    || cleanText(readFirst(firstLocation, ['WorkLocationName', 'workLocationName']))
    || cleanText(readFirst(firstLocation, ['Province', 'province']))
    || cleanText(readFirst(firstLocation, ['Address', 'address']))
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

function htmlToText(value: unknown) {
  const html = cleanText(value);
  if (!html) return '';

  const element = document.createElement('div');
  element.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '</p>\n')
    .replace(/<\/li>/gi, '</li>\n');

  return cleanText(element.innerText || element.textContent || '');
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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

function describePayloadShape(value: unknown) {
  if (!isObject(value)) {
    return { responseType: typeof value };
  }

  const data = value.Data ?? value.data;
  const dataObject = isObject(data) ? data : null;

  return {
    topLevelKeys: Object.keys(value).slice(0, 20),
    success: value.Success ?? value.success,
    hasData: Boolean(data),
    dataKeys: dataObject ? Object.keys(dataObject).slice(0, 30) : [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface HookedXMLHttpRequest extends XMLHttpRequest {
  __vcsAmisRequestMethod?: string;
  __vcsAmisRequestUrl?: string;
}
