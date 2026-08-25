import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const candidateCardPath = new URL('../src/components/candidates/CandidateCard.tsx', import.meta.url);
const stylesPath = new URL('../src/app/styles.css', import.meta.url);
const candidateCard = fs.readFileSync(candidateCardPath, 'utf8');
const styles = fs.readFileSync(stylesPath, 'utf8');

test('candidate contact details use dedicated design styles', () => {
  assert.match(candidateCard, /className="cv-candidate-contact"/);
  assert.match(candidateCard, /className="cv-candidate-applied-date"/);
  assert.match(styles, /\.cv-candidate-main span[^{}]*\.cv-candidate-contact[^{}]*\{/);

  const contactRule = styles.match(/\.cv-candidate-contact\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(contactRule, /color:\s*#525252/i);
  assert.match(contactRule, /font-family:\s*Inter,\s*sans-serif/i);
  assert.match(contactRule, /font-size:\s*11px/i);
  assert.match(contactRule, /font-weight:\s*400/i);
  assert.match(contactRule, /line-height:\s*16\.5px/i);

  const appliedDateRule = styles.match(/\.cv-candidate-main \.cv-candidate-applied-date\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(appliedDateRule, /color:\s*#525252/i);
  assert.match(appliedDateRule, /font-size:\s*11px/i);
  assert.match(appliedDateRule, /font-weight:\s*400/i);
  assert.match(appliedDateRule, /line-height:\s*16\.5px/i);
});

test('candidate name uses the requested typography and color', () => {
  const nameRule = styles.match(/\.cv-candidate-main strong\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(nameRule, /color:\s*#0b1c30/i);
  assert.match(nameRule, /font-family:\s*Inter,\s*sans-serif/i);
  assert.match(nameRule, /font-size:\s*16px/i);
  assert.match(nameRule, /font-weight:\s*700/i);
  assert.match(nameRule, /line-height:\s*20px/i);
});
