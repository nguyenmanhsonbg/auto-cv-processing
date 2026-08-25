import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managerSource = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);
const panelSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);
const previewModalSource = await readFile(
  new URL('../src/components/facebook/FacebookPreviewModal.tsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

test('image removal stays enabled when the Facebook attachment limit is reached', () => {
  assert.match(
    managerSource,
    /const facebookImageUploadDisabled = isFacebookImageReading;/,
  );
  assert.match(
    managerSource,
    /const facebookImageAddDisabled = facebookImageAttachments\.length >= FACEBOOK_MAX_IMAGE_ATTACHMENTS\s*\n\s*\|\| isFacebookImageReading;/,
  );
  assert.match(panelSource, /disabled=\{facebookImageUploadDisabled\}[\s\S]*?onClearFacebookImageAttachment\(index\)/);
  assert.match(previewModalSource, /disabled=\{facebookImageUploadDisabled\}[\s\S]*?onClearImageAttachment\(index\)/);
});

test('the two-image composer layout has no unused third column', () => {
  assert.match(
    previewModalSource,
    /className=\{`facebook-composer-image-library\$\{imageCount === FACEBOOK_MAX_IMAGE_ATTACHMENTS \? ' is-full' : ''\}`\}/,
  );
  assert.match(
    stylesSource,
    /\.facebook-composer-image-library\.is-full\s*\{[\s\S]*?width: min\(100%, 408px\);/,
  );
  assert.match(
    stylesSource,
    /\.facebook-composer-image-library\.is-full \.facebook-composer-image-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
});
