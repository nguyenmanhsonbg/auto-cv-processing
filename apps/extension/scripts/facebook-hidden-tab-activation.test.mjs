import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const orchestratorSource = await readFile(
  new URL('../src/features/facebook/facebook-publish-orchestrator.ts', import.meta.url),
  'utf8',
);

function readFunctionSource(functionSignature, nextFunctionSignature) {
  const start = orchestratorSource.indexOf(functionSignature);
  const end = orchestratorSource.indexOf(nextFunctionSignature, start);
  assert.ok(start >= 0, `${functionSignature} should exist`);
  assert.ok(end > start, `${nextFunctionSignature} should follow ${functionSignature}`);
  return orchestratorSource.slice(start, end);
}

test('background publish coordinate fallback dispatches input without bringing the hidden tab to front', () => {
  const functionSource = readFunctionSource(
    'async function clickTabCoordinatePoint(',
    'async function clickTabCoordinatePointOnAttachedDebugger',
  );

  assert.match(functionSource, /Input\.dispatchMouseEvent/);
  assert.doesNotMatch(functionSource, /Page\.bringToFront/);
});

test('background publish recovery coordinate click does not bring the hidden tab to front', () => {
  const functionSource = readFunctionSource(
    'async function clickTabCoordinatePointOnAttachedDebugger(',
    'function randomDelay(',
  );

  assert.match(functionSource, /Input\.dispatchMouseEvent/);
  assert.doesNotMatch(functionSource, /Page\.bringToFront/);
});
