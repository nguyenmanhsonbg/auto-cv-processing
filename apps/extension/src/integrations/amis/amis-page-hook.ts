import type { AmisCandidateStageChangedPayload, AmisRecruitmentRound } from '@/types/types';
import { mapAmisCandidateAttractivePersonnelResponse } from '@/integrations/amis/amis-api-mapper';
import { extractAmisJobStatusUpdate } from '@/integrations/amis/amis-job-status';
import { removeHorizontalWhitespaceBeforeNewlines } from '@/text-normalization';

const AMIS_CAPTURE_MESSAGE_TYPE = 'VCS_AMIS_SAVE_RECRUITMENT_CAPTURED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'VCS_AMIS_DIAGNOSTIC';
const AMIS_SAVE_RECRUITMENT_PATH = '/RecruitmentAPI/api/recruitment/SaveRecruitment';
const AMIS_UPDATE_RECRUITMENT_FIELD_PATH = '/recruitmentapi/api/recruitment/update-field';
const AMIS_CANDIDATE_ADDITIONAL_INFO_PATH = '/RecruitmentAPI/api/Candidate/candidate-additional-infor/';
const AMIS_CANDIDATE_SAVE_PATH = '/RecruitmentAPI/api/Candidate/save';
const AMIS_CANDIDATE_UPDATE_ROUND_PATH = '/RecruitmentAPI/api/RecruitmentDetail/updateRound';
const AMIS_CANDIDATE_ROUND_TIME_PAGING_PATH = '/RecruitmentAPI/api/RecruitmentRoundTime/paging';
const AMIS_RECRUITMENT_ROUNDS_PATHS = [
  '/RecruitmentAPI/api/recruitment/detail-round-info/',
  '/RecruitmentAPI/api/recruitment/round-period/',
  '/RecruitmentAPI/api/JobPositionRound/getAllByJobPositionID/',
] as const;
const AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE = 'VCS_AMIS_CANDIDATE_STAGE_CHANGED';
const AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE = 'VCS_AMIS_RECRUITMENT_ROUNDS_CHANGED';
const HOOK_INSTALLED_KEY = '__VCS_AMIS_SAVE_RECRUITMENT_HOOK_INSTALLED__';
const FETCH_HOOK_INSTALLED_KEY = '__VCS_AMIS_FETCH_HOOK_INSTALLED__';
const XHR_HOOK_VERSION_KEY = '__VCS_AMIS_XHR_HOOK_VERSION__';
const FETCH_HOOK_VERSION_KEY = '__VCS_AMIS_FETCH_HOOK_VERSION__';
const AMIS_PAGE_HOOK_VERSION = '2026-08-27-attractive-personnel-v1';

const hookWindow = window as Window & {
  __VCS_AMIS_SAVE_RECRUITMENT_HOOK_INSTALLED__?: boolean;
  __VCS_AMIS_FETCH_HOOK_INSTALLED__?: boolean;
  __VCS_AMIS_XHR_HOOK_VERSION__?: string;
  __VCS_AMIS_FETCH_HOOK_VERSION__?: string;
};

schedulePageHooksAfterBootstrap();

function schedulePageHooksAfterBootstrap() {
  const install = () => {
    if (hookWindow[XHR_HOOK_VERSION_KEY] !== AMIS_PAGE_HOOK_VERSION) {
      installXhrHook();
      hookWindow[HOOK_INSTALLED_KEY] = true;
      hookWindow[XHR_HOOK_VERSION_KEY] = AMIS_PAGE_HOOK_VERSION;
      publishDiagnostic('HOOK_READY', {
        details: {
          watchedTransport: 'xhr',
          trigger: 'XMLHttpRequest.loadend',
          installPhase: 'after-window-load',
          hookVersion: AMIS_PAGE_HOOK_VERSION,
        },
      });
    }

    if (hookWindow[FETCH_HOOK_VERSION_KEY] !== AMIS_PAGE_HOOK_VERSION) {
      installFetchHook();
      hookWindow[FETCH_HOOK_INSTALLED_KEY] = true;
      hookWindow[FETCH_HOOK_VERSION_KEY] = AMIS_PAGE_HOOK_VERSION;
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('load', install, { once: true });
  } else {
    window.setTimeout(install, 0);
  }
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
    const requestBody = requestUrl && (
      isAmisCandidateUpdateRoundUrl(requestUrl)
      || isAmisCandidateSaveUrl(requestUrl)
    )
      ? parseRequestJson(args[0])
      : null;

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

    if (requestUrl && isAmisCandidateAdditionalInfoUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;

        try {
          publishCandidateStage(readXhrJson(this), requestUrl);
        } catch {
          // AMIS may return a non-JSON response for an expired session.
        }
      }, { once: true });
    }

    if (requestUrl && isAmisCandidateSaveUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;

        try {
          publishCandidateAttractivePersonnel(
            readXhrJson(this),
            requestBody,
            requestUrl,
          );
        } catch {
          // AMIS may return a non-JSON response while the session is renewing.
        }
      }, { once: true });
    }

    if (requestUrl && isAmisCandidateUpdateRoundUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;
        publishCandidateStagesFromUpdateRoundRequest(requestBody, requestUrl);
      }, { once: true });
    }

    if (requestUrl && isAmisCandidateRoundTimePagingUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;
        publishCandidateStagesFromRoundTimeResponse(readXhrJson(this), requestUrl);
      }, { once: true });
    }

    if (requestUrl && isAmisRecruitmentRoundsUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;

        try {
          publishRecruitmentRounds(readXhrJson(this), requestUrl);
        } catch {
          // AMIS may return a non-JSON response while the session is renewing.
        }
      }, { once: true });
    }

    if (requestUrl && isAmisUpdateRecruitmentFieldUrl(requestUrl)) {
      this.addEventListener('loadend', () => {
        if (this.status < 200 || this.status >= 300) return;
        publishJobStatusUpdate(readXhrJson(this), requestUrl);
      }, { once: true });
    }

    return Reflect.apply(originalSend, this, args);
  };
}

function installFetchHook() {
  const originalFetch = window.fetch?.bind(window);
  if (!originalFetch) return;

  window.fetch = function fetchWithAmisInspection(
    this: Window,
    ...args: Parameters<typeof fetch>
  ) {
    const requestUrl = getRequestUrl(args[0] instanceof Request ? args[0].url : args[0]);
    const requestBodyPromise = requestUrl && (
      isAmisCandidateUpdateRoundUrl(requestUrl)
      || isAmisCandidateSaveUrl(requestUrl)
    )
      ? readFetchRequestBody(args)
      : null;

    if (!requestUrl || !isTrackedFetchUrl(requestUrl)) {
      return originalFetch(...args);
    }

    const responsePromise = originalFetch(...args);
    return responsePromise.then((response) => {
      if (response.ok) {
        inspectTrackedFetchResponse(response, requestUrl, requestBodyPromise);
      }
      return response;
    });
  };
}

function inspectTrackedFetchResponse(
  response: Response,
  requestUrl: string,
  requestBodyPromise: Promise<unknown> | null,
) {
  if (isAmisCandidateSaveUrl(requestUrl)) {
    void response.clone().text()
      .then((text) => {
        const responseJson = parseJsonText(text);
        if (!requestBodyPromise) {
          publishCandidateAttractivePersonnel(responseJson, null, requestUrl);
          return;
        }

        void requestBodyPromise.then((requestBody) => {
          publishCandidateAttractivePersonnel(responseJson, requestBody, requestUrl);
        });
      })
      .catch(() => undefined);
    return;
  }

  if (isAmisCandidateAdditionalInfoUrl(requestUrl)) {
    void response.clone().text()
      .then((text) => publishCandidateStage(parseJsonText(text), requestUrl))
      .catch(() => undefined);
    return;
  }

  if (isAmisCandidateUpdateRoundUrl(requestUrl)) {
    void requestBodyPromise?.then((requestBody) => {
      publishCandidateStagesFromUpdateRoundRequest(requestBody, requestUrl);
    });
    return;
  }

  if (isAmisCandidateRoundTimePagingUrl(requestUrl)) {
    void response.clone().text()
      .then((text) => publishCandidateStagesFromRoundTimeResponse(parseJsonText(text), requestUrl))
      .catch(() => undefined);
    return;
  }

  if (isAmisRecruitmentRoundsUrl(requestUrl)) {
    void response.clone().text()
      .then((text) => publishRecruitmentRounds(parseJsonText(text), requestUrl))
      .catch(() => undefined);
    return;
  }

  void response.clone().text()
    .then((text) => publishJobStatusUpdate(parseJsonText(text), requestUrl))
    .catch(() => undefined);
}

function isTrackedFetchUrl(url: string) {
  return isAmisCandidateSaveUrl(url)
    || isAmisCandidateAdditionalInfoUrl(url)
    || isAmisCandidateUpdateRoundUrl(url)
    || isAmisCandidateRoundTimePagingUrl(url)
    || isAmisRecruitmentRoundsUrl(url)
    || isAmisUpdateRecruitmentFieldUrl(url);
}

function publishCandidateAttractivePersonnel(
  responseJson: unknown,
  requestPayload: unknown,
  requestUrl: string,
) {
  const sourceUrl = new URL(requestUrl, window.location.origin).toString();
  const capture = mapAmisCandidateAttractivePersonnelResponse(
    responseJson,
    requestPayload,
    sourceUrl,
    window.location.href,
  );
  if (!capture) {
    publishDiagnostic('ATTRACTIVE_PERSONNEL_RESPONSE_UNMAPPED', {
      requestUrl: sourceUrl,
      details: {
        responseSuccess: isSuccessfulAmisResponse(responseJson),
        hasRequestPayload: isObject(requestPayload),
      },
    });
    return;
  }

  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: 'VCS_AMIS_CANDIDATE_ATTRACTIVE_PERSONNEL_CHANGED',
    payload: capture,
  }, window.location.origin);

  publishDiagnostic('ATTRACTIVE_PERSONNEL_CAPTURE_PUBLISHED', {
    requestUrl: sourceUrl,
    details: {
      amisRecruitmentId: capture.amisRecruitmentId,
      amisCandidateId: capture.amisCandidateId,
      attractivePersonnelId: capture.attractivePersonnelId,
    },
  });
}

function isAmisUpdateRecruitmentFieldUrl(url: string) {
  try {
    return new URL(url, window.location.origin).pathname.toLowerCase().endsWith(AMIS_UPDATE_RECRUITMENT_FIELD_PATH);
  } catch {
    return url.toLowerCase().includes(AMIS_UPDATE_RECRUITMENT_FIELD_PATH);
  }
}

function isSuccessfulAmisResponse(value: unknown) {
  if (!isObject(value)) return false;
  const success = value.Success ?? value.success;
  return success === true || success === 1 || success === 'true' || success === '1';
}

function publishJobStatusUpdate(responseJson: unknown, requestUrl: string) {
  const update = extractAmisJobStatusUpdate(responseJson);
  if (!update) return;
  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: 'VCS_AMIS_JOB_STATUS_UPDATED',
    payload: {
      ...update,
      sourceUrl: new URL(requestUrl, window.location.origin).toString(),
    },
  }, window.location.origin);
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

  const statusUpdate = extractAmisJobStatusUpdate(responseJson);

  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: AMIS_CAPTURE_MESSAGE_TYPE,
    payload: {
      ...capture,
      ...(statusUpdate?.amisStatus !== undefined
        ? { amisStatus: statusUpdate.amisStatus }
        : {}),
    },
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

function publishCandidateStage(responseJson: unknown, requestUrl: string) {
  const stage = mapAmisCandidateStageResponse(
    responseJson,
    new URL(requestUrl, window.location.origin).toString(),
    window.location.href,
  );
  if (!stage) return;

  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
    payload: stage,
  }, window.location.origin);
}

function publishCandidateStagesFromUpdateRoundRequest(requestJson: unknown, requestUrl: string) {
  const stages = mapAmisCandidateStageRequest(
    requestJson,
    new URL(requestUrl, window.location.origin).toString(),
    window.location.href,
  );

  for (const stage of stages) {
    window.postMessage({
      source: 'vcs-recruitment-extension',
      type: AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
      payload: stage,
    }, window.location.origin);
  }
}

function publishCandidateStagesFromRoundTimeResponse(responseJson: unknown, requestUrl: string) {
  const stages = mapAmisCandidateStageRoundTimeResponse(
    responseJson,
    new URL(requestUrl, window.location.origin).toString(),
    window.location.href,
  );

  for (const stage of stages) {
    window.postMessage({
      source: 'vcs-recruitment-extension',
      type: AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
      payload: stage,
    }, window.location.origin);
  }
}

function publishRecruitmentRounds(responseJson: unknown, requestUrl: string) {
  const capture = mapAmisRecruitmentRoundsResponse(responseJson, requestUrl, window.location.href);
  if (!capture) return;

  window.postMessage({
    source: 'vcs-recruitment-extension',
    type: AMIS_RECRUITMENT_ROUNDS_CHANGED_MESSAGE_TYPE,
    payload: capture,
  }, window.location.origin);
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
    | 'CAPTURE_PUBLISHED'
    | 'ATTRACTIVE_PERSONNEL_RESPONSE_UNMAPPED'
    | 'ATTRACTIVE_PERSONNEL_CAPTURE_PUBLISHED',
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

function isAmisCandidateSaveUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_SAVE_PATH.toLowerCase());
}

function isAmisCandidateAdditionalInfoUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_ADDITIONAL_INFO_PATH.toLowerCase());
}

function isAmisCandidateUpdateRoundUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_UPDATE_ROUND_PATH.toLowerCase());
}

function isAmisCandidateRoundTimePagingUrl(url: string) {
  return url.toLowerCase().includes(AMIS_CANDIDATE_ROUND_TIME_PAGING_PATH.toLowerCase());
}

function isAmisRecruitmentRoundsUrl(url: string) {
  const normalizedUrl = url.toLowerCase();
  return AMIS_RECRUITMENT_ROUNDS_PATHS.some((path) => normalizedUrl.includes(path.toLowerCase()));
}

function mapAmisRecruitmentRoundsResponse(
  response: unknown,
  sourceUrl: string,
  pageUrl: string,
) {
  if (!isObject(response)) return null;
  if ((response.Success ?? response.success) === false) return null;

  const responseData = response.Data ?? response.data;
  let rows: unknown = null;
  if (Array.isArray(responseData)) {
    rows = responseData;
  } else if (isObject(responseData)) {
    rows = responseData.RecruitmentRounds ?? responseData.recruitmentRounds;
  }
  if (!Array.isArray(rows)) return null;

  const rounds = rows
    .filter(isObject)
    .map((row, index) => {
      const id = cleanText(readFirst(row, [
        'RecruitmentRoundID',
        'RecruitmentRoundId',
        'recruitmentRoundId',
      ]));
      const name = cleanText(readFirst(row, [
        'RecruitmentRoundName',
        'recruitmentRoundName',
        'RoundName',
        'roundName',
      ]));
      if (!id || !name) return null;

      return {
        id,
        name,
        sortOrder: readNumber(row, ['SortOrder', 'sortOrder']) ?? index + 1,
        roundType: readNumber(row, ['RoundType', 'roundType']) ?? null,
        roundTypeId: cleanText(readFirst(row, ['RoundTypeID', 'roundTypeId'])) || null,
        color: cleanText(readFirst(row, ['RoundTypeColor', 'roundTypeColor'])) || null,
      } satisfies AmisRecruitmentRound;
    })
    .filter((round): round is AmisRecruitmentRound => Boolean(round))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (rounds.length === 0) return null;

  const pathRecruitmentId = sourceUrl.match(/\/(?:detail-round-info|round-period)\/(\d+)/i)?.[1]
    ?? new URL(sourceUrl, window.location.origin).searchParams.get('recruitmentID')
    ?? pageUrl.match(/\/recruit\/job\/detail\/(\d+)/i)?.[1];
  const responseRecruitmentId = rounds
    .map((round) => round.id)
    .length > 0
    ? cleanText(readFirst(rows.find(isObject) ?? {}, ['RecruitmentID', 'RecruitmentId', 'recruitmentId']))
    : '';
  const amisRecruitmentId = responseRecruitmentId || pathRecruitmentId || null;
  if (!amisRecruitmentId) return null;

  return {
    amisRecruitmentId,
    rounds,
    sourceUrl,
    pageUrl,
    capturedAt: new Date().toISOString(),
  };
}

function mapAmisCandidateStageResponse(
  response: unknown,
  sourceUrl: string,
  pageUrl: string,
) {
  if (!isObject(response)) return null;
  if ((response.Success ?? response.success) === false) return null;

  const responseData = response.Data ?? response.data;
  if (!isObject(responseData)) return null;

  const details = responseData.ListRecruitmentDetails ?? responseData.listRecruitmentDetails;
  if (!Array.isArray(details)) return null;

  const current = details.find((value) => isObject(value)) as Record<string, unknown> | undefined;
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

function mapAmisCandidateStageRequest(
  request: unknown,
  sourceUrl: string,
  pageUrl: string,
) {
  if (!isObject(request)) return [];

  const amisRecruitmentId = cleanText(readFirst(request, [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
  ]));
  const defaultRoundId = cleanText(readFirst(request, [
    'RecruitmentRoundID',
    'RecruitmentRoundId',
    'recruitmentRoundId',
  ]));
  const candidateIds = readAmisCandidateStageIds(readFirstValue(request, [
    'CandidateIDs',
    'CandidateIds',
    'candidateIds',
  ]));
  const roundTimeByCandidateId = readAmisCandidateStageRoundTimes(
    readFirstValue(request, ['RecruitmentRoundTimes', 'recruitmentRoundTimes']),
    candidateIds,
  );

  if (!amisRecruitmentId || candidateIds.size === 0) return [];

  return [...candidateIds].map((amisCandidateId) => {
    const roundTime = roundTimeByCandidateId.get(amisCandidateId);
    const amisRecruitmentRoundId = cleanText(readFirst(roundTime ?? {}, [
      'RecruitmentRoundID',
      'RecruitmentRoundId',
      'recruitmentRoundId',
    ])) || defaultRoundId;
    const amisRecruitmentRoundName = cleanText(readFirst(roundTime ?? {}, [
      'RecruitmentRoundName',
      'recruitmentRoundName',
    ]));

    return {
      amisRecruitmentId,
      amisCandidateId,
      amisRecruitmentRoundId: amisRecruitmentRoundId || null,
      amisRecruitmentRoundName: amisRecruitmentRoundName || null,
      reasonRemoved: null,
      amisStatus: null,
      sourceUrl,
      pageUrl,
      changedAt: new Date().toISOString(),
      isTransitionEvent: true,
    };
  });
}

function mapAmisCandidateStageRoundTimeResponse(
  response: unknown,
  sourceUrl: string,
  pageUrl: string,
) {
  if (!isObject(response)) return [];
  if ((response.Success ?? response.success) === false) return [];

  const responseData = response.Data ?? response.data;
  if (!isObject(responseData)) return [];

  const rows = readFirstValue(responseData, ['PageData', 'pageData']);
  if (!Array.isArray(rows)) return [];

  const latestByApplication = new Map<string, Record<string, unknown>>();
  for (const value of rows) {
    if (!isObject(value)) continue;

    const amisRecruitmentId = cleanText(readFirst(value, [
      'RecruitmentID',
      'RecruitmentId',
      'recruitmentId',
    ]));
    const amisCandidateId = cleanText(readFirst(value, [
      'CandidateID',
      'CandidateId',
      'candidateId',
    ]));
    const amisRecruitmentRoundId = cleanText(readFirst(value, [
      'RecruitmentRoundID',
      'RecruitmentRoundId',
      'recruitmentRoundId',
    ]));
    if (!amisRecruitmentId || !amisCandidateId || !amisRecruitmentRoundId) continue;

    const key = `${amisRecruitmentId}:${amisCandidateId}`;
    const current = latestByApplication.get(key);
    if (!current || compareAmisRoundTimeRows(value, current) > 0) {
      latestByApplication.set(key, value);
    }
  }

  return [...latestByApplication.values()].map((row) => ({
    amisRecruitmentId: cleanText(readFirst(row, ['RecruitmentID', 'RecruitmentId', 'recruitmentId'])),
    amisCandidateId: cleanText(readFirst(row, ['CandidateID', 'CandidateId', 'candidateId'])),
    amisRecruitmentRoundId: cleanText(readFirst(row, [
      'RecruitmentRoundID',
      'RecruitmentRoundId',
      'recruitmentRoundId',
    ])),
    amisRecruitmentRoundName: cleanText(readFirst(row, [
      'RecruitmentRoundName',
      'RecruitmentRound',
      'recruitmentRoundName',
    ])) || null,
    reasonRemoved: cleanText(readFirst(row, [
      'ReasonRemoved',
      'ReasonRemovedName',
      'reasonRemoved',
      'reasonRemovedName',
    ])) || null,
    // State belongs to the round-time history row, not the candidate status.
    amisStatus: null,
    sourceUrl,
    pageUrl,
    changedAt: cleanText(readFirst(row, [
      'ChangeRoundTime',
      'changeRoundTime',
      'ModifiedDate',
      'modifiedDate',
      'CreatedDate',
      'createdDate',
    ])) || new Date().toISOString(),
    isTransitionEvent: false,
  } satisfies AmisCandidateStageChangedPayload));
}

function compareAmisRoundTimeRows(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftTime = Date.parse(readFirst(left, [
    'ChangeRoundTime',
    'changeRoundTime',
    'ModifiedDate',
    'modifiedDate',
    'CreatedDate',
    'createdDate',
  ]));
  const rightTime = Date.parse(readFirst(right, [
    'ChangeRoundTime',
    'changeRoundTime',
    'ModifiedDate',
    'modifiedDate',
    'CreatedDate',
    'createdDate',
  ]));

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;

  return (readNumber(left, ['RecruitmentRoundTimeID', 'recruitmentRoundTimeId']) ?? 0)
    - (readNumber(right, ['RecruitmentRoundTimeID', 'recruitmentRoundTimeId']) ?? 0);
}

function readAmisCandidateStageIds(value: unknown) {
  const candidateIds = new Set<string>();
  const values = normalizeCandidateIdValues(value);

  for (const candidateId of values) {
    const normalizedCandidateId = cleanText(candidateId);
    if (normalizedCandidateId) candidateIds.add(normalizedCandidateId);
  }

  return candidateIds;
}

function normalizeCandidateIdValues(value: unknown): unknown[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).split(/[;,]/);
  }
  if (Array.isArray(value)) return value;
  return [];
}

function readAmisCandidateStageRoundTimes(
  value: unknown,
  candidateIds: Set<string>,
) {
  const roundTimeByCandidateId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) return roundTimeByCandidateId;

  for (const item of value) {
    if (!isObject(item)) continue;
    const candidateId = cleanText(readFirst(item, ['CandidateID', 'CandidateId', 'candidateId']));
    if (!candidateId) continue;
    candidateIds.add(candidateId);
    roundTimeByCandidateId.set(candidateId, item);
  }

  return roundTimeByCandidateId;
}

function parseRequestJson(value: unknown) {
  if (typeof value === 'string') {
    try {
      return parseJsonText(value);
    } catch {
      return null;
    }
  }

  if (value instanceof URLSearchParams) {
    return Object.fromEntries(value.entries());
  }

  return isObject(value) ? value : null;
}

function readFetchRequestBody(args: Parameters<typeof fetch>) {
  const body = args[1]?.body;
  if (body !== undefined) return Promise.resolve(parseRequestJson(body));

  const input = args[0];
  if (!(input instanceof Request)) return Promise.resolve(null);

  return input.clone().text()
    .then((text) => parseJsonText(text))
    .catch(() => null);
}

function readAmisRecruitmentId(data: Record<string, unknown>) {
  return cleanText(readFirst(data, [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
    'ID',
    'Id',
    'id',
  ]));
}

function readAmisSaveRecruitmentValues(data: Record<string, unknown>) {
  const title = cleanText(readFirst(data, ['TitleWebsite', 'titleWebsite']))
    || cleanText(readFirst(data, ['Title', 'title']))
    || cleanText(readFirst(data, ['JobPositionName', 'jobPositionName']));
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
  return {
    recruitmentId: readAmisRecruitmentId(data),
    title,
    summaryText,
    descriptionText,
    requirementText,
    benefitText,
    location,
    deadline,
  };
}

function buildAmisSaveRecruitmentSnapshot(values: ReturnType<typeof readAmisSaveRecruitmentValues>) {
  const snapshot = {
    title: values.title,
    ...(values.summaryText ? { summary: values.summaryText } : {}),
    description: values.descriptionText,
    requirements: { rawText: values.requirementText },
    ...(values.benefitText ? { benefits: { rawText: values.benefitText } } : {}),
    ...(values.location ? { location: values.location } : {}),
    ...(values.deadline ? { deadline: values.deadline } : {}),
  };
  return snapshot;
}

function getAmisSaveRecruitmentMissingFields(
  values: ReturnType<typeof readAmisSaveRecruitmentValues>,
  snapshot: ReturnType<typeof buildAmisSaveRecruitmentSnapshot>,
) {
  const missingFields: string[] = [];
  if (!values.recruitmentId) missingFields.push('AMIS recruitment id');
  if (!snapshot.title) missingFields.push('title');
  if (!snapshot.description) missingFields.push('description');
  if (!snapshot.requirements.rawText) missingFields.push('requirements');
  return missingFields;
}

function getAmisSaveRecruitmentFieldSources(
  values: ReturnType<typeof readAmisSaveRecruitmentValues>,
  snapshot: ReturnType<typeof buildAmisSaveRecruitmentSnapshot>,
) {
  const fieldSources = {
    ...(values.recruitmentId ? { amisRecruitmentId: 'SaveRecruitment.Data.RecruitmentID' } : {}),
    ...(snapshot.title ? { title: 'SaveRecruitment.Data.TitleWebsite|Title|JobPositionName' } : {}),
    ...(values.summaryText ? { summary: 'SaveRecruitment.Data.Summary' } : {}),
    ...(snapshot.description ? { description: 'SaveRecruitment.Data.Description|Summary' } : {}),
    ...(snapshot.requirements.rawText ? { requirements: 'SaveRecruitment.Data.Requirement' } : {}),
    ...(values.benefitText ? { benefits: 'SaveRecruitment.Data.Benifit' } : {}),
    ...(values.location ? { location: 'SaveRecruitment.Data.RecruitmentWorkLocations' } : {}),
    ...(values.deadline ? { deadline: 'SaveRecruitment.Data.RegistrationExpiryDate|CloseDate|ExpectedTime' } : {}),
  };
  return fieldSources;
}

function readAmisSaveRecruitmentFields(data: Record<string, unknown>) {
  const values = readAmisSaveRecruitmentValues(data);
  const snapshot = buildAmisSaveRecruitmentSnapshot(values);
  const missingFields = getAmisSaveRecruitmentMissingFields(values, snapshot);
  const fieldSources = getAmisSaveRecruitmentFieldSources(values, snapshot);
  return { recruitmentId: values.recruitmentId, snapshot, missingFields, fieldSources };
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

  const { recruitmentId, snapshot, missingFields, fieldSources } = readAmisSaveRecruitmentFields(data);
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
  return removeHorizontalWhitespaceBeforeNewlines(String(value ?? '')
    .replaceAll('\u00a0', ' ')
  )
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

function readNumber(data: Record<string, unknown>, keys: string[]) {
  const value = readFirstValue(data, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
