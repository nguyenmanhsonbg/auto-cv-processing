import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMIS_RECRUITMENT_REFRESH_CAPTURED_MESSAGE_TYPE,
  createAmisRefreshCaptureMessage,
  isAmisRefreshCaptureMessage,
} from './amis-helpers.ts';
import type { AmisExtractionResult } from '@/types/types';

const capture: AmisExtractionResult = {
  status: 'AMIS_PAGE_DETECTED',
  detected: true,
  source: 'AMIS_DETAIL_API',
  confidence: 'HIGH',
  url: 'https://amisapp.misa.vn/recruit/job/detail/46657',
  amisRecruitmentId: '46657',
  snapshot: {
    title: 'Frontend Engineer',
    description: 'Build frontend experiences.',
    requirements: { rawText: 'React' },
  },
  missingFields: [],
  warnings: [],
  evidence: {
    host: 'amisapp.misa.vn',
    markers: ['api:recruitment/detail-info'],
    fieldSources: {},
  },
};

test('builds a refresh capture message with its source AMIS tab', () => {
  const message = createAmisRefreshCaptureMessage(capture, 42);

  assert.equal(message.type, AMIS_RECRUITMENT_REFRESH_CAPTURED_MESSAGE_TYPE);
  assert.equal(message.sourceTabId, 42);
  assert.deepEqual(message.payload, capture);
  assert.equal(isAmisRefreshCaptureMessage(message), true);
});

test('rejects a refresh capture message without a source tab', () => {
  assert.equal(isAmisRefreshCaptureMessage({
    type: AMIS_RECRUITMENT_REFRESH_CAPTURED_MESSAGE_TYPE,
    payload: capture,
  }), false);
});
