import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

test('job description filter keeps ARCHIVED and presents it as Đóng', async () => {
  const component = await readFile(
    resolve(scriptDirectory, '../src/features/posting/JobPostingPanel.tsx'),
    'utf8',
  );
  const styles = await readFile(
    resolve(scriptDirectory, '../src/app/styles.css'),
    'utf8',
  );

  assert.match(component, /\{ value: 'ARCHIVED', label: 'Đóng' \}/);
  assert.match(component, /normalized === 'ARCHIVED'[\s\S]*?label: 'Đóng'[\s\S]*?className: 'is-archived'/);
  assert.match(component, /status: value/);
  assert.match(component, /onLoadJobDescriptions\(\s*token,\s*jobDescriptionPagination\.page - 1,\s*\{\s*status: jobDescriptionStatusFilter\s*\},\s*\)/);
  assert.match(component, /onLoadJobDescriptions\(\s*token,\s*page,\s*\{\s*status: jobDescriptionStatusFilter\s*\},\s*\)/);
  assert.match(component, /onLoadJobDescriptions\(\s*token,\s*jobDescriptionPagination\.page \+ 1,\s*\{\s*status: jobDescriptionStatusFilter\s*\},\s*\)/);
  assert.match(component, /Không tìm thấy JD phù hợp\./);
  assert.match(styles, /\.jd-status-badge\.is-archived\s*\{[\s\S]*?color:\s*#262626;[\s\S]*?background:\s*#d4d4d4;[\s\S]*?font-size:\s*14px;/);
});
