import type { AmisExtractionResult, AmisJobSnapshot } from '@/types/types';
import { removeHorizontalWhitespaceBeforeNewlines } from '@/text-normalization';

function readValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
}

function cleanText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function htmlToText(value: unknown) {
  const html = cleanText(value);
  if (!html) return '';

  const container = document.createElement('div');
  container.innerHTML = html;
  return removeHorizontalWhitespaceBeforeNewlines((container.innerText || container.textContent || '')
    .replaceAll('\r', ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLocation(value: unknown) {
  if (!Array.isArray(value)) return '';
  const firstLocation = value.find((item): item is Record<string, unknown> => (
    typeof item === 'object' && item !== null
  ));
  if (!firstLocation) return '';
  if (firstLocation.IsNationwide === true) return 'Toan quoc';

  return cleanText(
    firstLocation.WorkLocationDisplayName
    ?? firstLocation.WorkLocationName
    ?? firstLocation.Province
    ?? firstLocation.Address,
  );
}

function normalizeDeadline(value: unknown) {
  const normalized = cleanText(value);
  if (!normalized) return undefined;
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized)) return normalized;

  const dateMatch = normalized.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
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

function buildSnapshotFields(recruitment: Record<string, unknown>) {
  const summary = cleanText(readValue(recruitment, ['Summary']));
  const description = htmlToText(readValue(recruitment, ['Description'])) || summary;
  const requirements = htmlToText(readValue(recruitment, ['Requirement']));
  const benefits = htmlToText(readValue(recruitment, ['Benifit', 'Benefit']));
  const title = cleanText(readValue(recruitment, [
    'TitleWebsite',
    'Title',
    'JobPositionName',
  ]));
  const location = extractLocation(readValue(recruitment, ['RecruitmentWorkLocations']));
  const deadline = normalizeDeadline(readValue(recruitment, [
    'RegistrationExpiryDate',
    'CloseDate',
    'ExpectedTime',
  ]));

  return {
    title,
    benefits,
    location,
    deadline,
    snapshot: {
      title,
      ...(summary ? { summary: summary.slice(0, 500) } : {}),
      description,
      requirements: { rawText: requirements },
      ...(benefits ? { benefits: { rawText: benefits } } : {}),
      ...(location ? { location } : {}),
      ...(deadline ? { deadline } : {}),
    } satisfies AmisJobSnapshot,
  };
}

async function fetchRecruitmentDetail(recruitmentId: string) {
  const response = await fetch(
    `/recruitment/APIS/g1/RecruitmentAPI/api/recruitment/detail-info/${encodeURIComponent(recruitmentId)}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    return {
      recruitment: null,
      traceId: undefined,
      failureMessage: `AMIS detail API returned HTTP ${response.status}.`,
    };
  }

  const envelope = await response.json() as {
    Success?: boolean;
    Data?: { Recruitment?: Record<string, unknown> | null } | null;
    TraceID?: string;
  };
  const recruitment = envelope.Data?.Recruitment;
  return {
    recruitment: envelope.Success && recruitment ? recruitment : null,
    traceId: envelope.TraceID,
    failureMessage: 'AMIS detail API did not return a recruitment.',
  };
}

function getMissingFields(responseRecruitmentId: string, snapshot: AmisJobSnapshot) {
  const fields = [] as string[];
  if (!responseRecruitmentId) fields.push('AMIS recruitment id');
  if (!snapshot.title) fields.push('title');
  if (!snapshot.description) fields.push('description');
  if (!snapshot.requirements.rawText) fields.push('requirements');
  return fields;
}

export async function extractAmisJobFromDetailApi(
  amisRecruitmentId: string,
): Promise<AmisExtractionResult> {
  const pageUrl = window.location.href;
  const host = window.location.hostname;
  const missingFields = ['AMIS recruitment id', 'title', 'description', 'requirements'];

  try {
    if (host !== 'amisapp.misa.vn') {
      return buildFailure('Current page is not an AMIS page.');
    }

    const normalizedRecruitmentId = cleanText(amisRecruitmentId);
    if (!normalizedRecruitmentId) {
      return buildFailure('AMIS recruitment id is empty.');
    }

    const detail = await fetchRecruitmentDetail(normalizedRecruitmentId);
    if (!detail.recruitment) return buildFailure(detail.failureMessage);

    const { recruitment, traceId } = detail;

    const responseRecruitmentId = cleanText(readValue(recruitment, [
      'RecruitmentID',
      'RecruitmentId',
      'recruitmentId',
    ]));
    if (responseRecruitmentId && responseRecruitmentId !== normalizedRecruitmentId) {
      return buildFailure('AMIS detail API returned a different recruitment id.');
    }

    const snapshotFields = buildSnapshotFields(recruitment);
    const { snapshot, benefits, location, deadline } = snapshotFields;
    const resolvedMissingFields = getMissingFields(responseRecruitmentId, snapshot);

    return {
      status: 'AMIS_PAGE_DETECTED',
      detected: true,
      source: 'AMIS_DETAIL_API',
      confidence: resolvedMissingFields.length === 0 ? 'HIGH' : 'LOW',
      url: pageUrl,
      ...(responseRecruitmentId ? { amisRecruitmentId: responseRecruitmentId } : {}),
      snapshot,
      missingFields: resolvedMissingFields,
      warnings: [
        ...(resolvedMissingFields.length > 0
          ? [`Missing required fields: ${resolvedMissingFields.join(', ')}.`]
          : []),
        'Snapshot was mapped from the AMIS recruitment detail response.',
      ],
      evidence: {
        host,
        title: document.title,
        markers: [
          'host:amisapp.misa.vn',
          'api:recruitment/detail-info',
          ...(traceId ? ['trace-id-present'] : []),
        ],
        fieldSources: {
          amisRecruitmentId: 'detail-info.Recruitment.RecruitmentID',
          title: 'detail-info.Recruitment.TitleWebsite|Title|JobPositionName',
          description: 'detail-info.Recruitment.Description|Summary',
          requirements: 'detail-info.Recruitment.Requirement',
          ...(benefits ? { benefits: 'detail-info.Recruitment.Benifit|Benefit' } : {}),
          ...(location ? { location: 'detail-info.Recruitment.RecruitmentWorkLocations' } : {}),
          ...(deadline ? { deadline: 'detail-info.Recruitment.RegistrationExpiryDate|CloseDate|ExpectedTime' } : {}),
        },
      },
    };
  } catch (error) {
    return buildFailure(error instanceof Error ? error.message : 'AMIS detail API extraction failed.');
  }

  function buildFailure(message: string): AmisExtractionResult {
    return {
      status: 'EXTRACTION_FAILED',
      detected: false,
      source: 'AMIS_DETAIL_API',
      confidence: 'LOW',
      url: pageUrl,
      missingFields,
      warnings: [message],
      evidence: {
        host,
        title: document.title,
        markers: ['api:recruitment/detail-info'],
        fieldSources: {},
      },
    };
  }

}
