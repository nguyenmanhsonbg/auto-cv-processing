import assert from 'node:assert/strict';
import test from 'node:test';
import {
  withFacebookImageAttachments,
} from './facebook-image-utils';

const basePlan = {
  jobPostingId: 'posting-1',
  content: 'DevOps Engineer',
  targets: [],
  delay: { minMs: 0, maxMs: 0 },
};

const image = (fileName: string) => ({
  type: 'IMAGE' as const,
  source: 'LOCAL_UPLOAD' as const,
  fileName,
  mimeType: 'image/jpeg',
  size: 128,
  dataUrl: `data:image/jpeg;base64,${fileName}`,
});

test('manual Facebook publish plan carries locally stored images into the orchestrator', () => {
  const result = withFacebookImageAttachments(basePlan, [image('meow.jpg')]);

  assert.deepEqual(result.attachments, [image('meow.jpg')]);
  assert.equal(result.jobPostingId, basePlan.jobPostingId);
  assert.equal(result.content, basePlan.content);
});

test('explicit publish-plan images are preserved over locally stored images', () => {
  const explicitImage = image('backend.jpg');
  const result = withFacebookImageAttachments(
    { ...basePlan, attachments: [explicitImage] },
    [image('meow.jpg')],
  );

  assert.deepEqual(result.attachments, [explicitImage]);
});
