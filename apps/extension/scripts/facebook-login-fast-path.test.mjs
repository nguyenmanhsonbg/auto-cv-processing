import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const orchestratorSource = await readFile(
  new URL('../src/features/facebook/facebook-publish-orchestrator.ts', import.meta.url),
  'utf8',
);

test('already-authenticated Facebook sessions use the c_user cookie before opening a probe tab', () => {
  const ensureStart = orchestratorSource.indexOf('export async function ensureFacebookSession');
  const ensureEnd = orchestratorSource.indexOf('/**', ensureStart);
  const ensureSource = orchestratorSource.slice(ensureStart, ensureEnd);
  const cookieReadIndex = ensureSource.indexOf('readFacebookSessionExternalId()');
  const probeTabIndex = ensureSource.indexOf("openTab('https://www.facebook.com/', false)");

  assert.ok(ensureStart >= 0, 'ensureFacebookSession should exist');
  assert.ok(ensureEnd > ensureStart, 'ensureFacebookSession should have a bounded source section');
  assert.ok(cookieReadIndex >= 0, 'the cookie fast path should read c_user');
  assert.ok(probeTabIndex > cookieReadIndex, 'the probe tab should only open after the cookie fast path misses');
  assert.match(
    ensureSource,
    /if \(cookieExternalId\) \{[\s\S]*?ready:\s*true[\s\S]*?facebookExternalId:\s*cookieExternalId[\s\S]*?return fastStatus;/,
    'a valid c_user cookie should return an authenticated session without opening Facebook',
  );
});

test('c_user is accepted only when it is a numeric Facebook account id', () => {
  const helperStart = orchestratorSource.indexOf('async function readFacebookSessionExternalId');
  const helperEnd = orchestratorSource.indexOf('\n}\n', helperStart) + 3;
  const helperSource = orchestratorSource.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0, 'the c_user helper should exist');
  assert.match(helperSource, /name:\s*'c_user'/);
  assert.match(helperSource, /\/\^\\d\+\$\//);
  assert.match(helperSource, /return null/);
});

test('interactive login watches c_user before the slow DOM/profile fallback', () => {
  const loginRedirectIndex = orchestratorSource.indexOf(
    "await chrome.tabs?.update(tab.id, { url: 'https://www.facebook.com/login', active: true });",
  );
  const loginLoopEnd = orchestratorSource.indexOf('\n    throw new Error(status.message', loginRedirectIndex);
  const loginSource = orchestratorSource.slice(loginRedirectIndex, loginLoopEnd);
  const cookieWaitIndex = loginSource.indexOf('waitForFacebookSessionCookie');
  const fixedSleepIndex = loginSource.indexOf('await sleep(2_000)');

  assert.ok(loginRedirectIndex >= 0, 'the interactive login redirect should exist');
  assert.ok(loginLoopEnd > loginRedirectIndex, 'the interactive login section should be bounded');
  assert.ok(cookieWaitIndex >= 0, 'interactive login should wait for the session cookie');
  assert.ok(
    fixedSleepIndex < 0 || cookieWaitIndex < fixedSleepIndex,
    'cookie detection should happen before the old fixed two-second probe delay',
  );
  assert.match(
    loginSource,
    /waitForFacebookSessionCookie\(tab\.id\)[\s\S]*?ready:\s*true[\s\S]*?facebookExternalId:/,
    'a newly authenticated session should return the cookie identity without profile navigation',
  );
});

test('session cookie polling does not require the Facebook tab to finish loading', () => {
  const helperStart = orchestratorSource.indexOf('async function waitForFacebookSessionCookie');
  const helperEnd = orchestratorSource.indexOf('\n}\n', helperStart) + 3;
  const helperSource = orchestratorSource.slice(helperStart, helperEnd);
  const sessionReaderStart = orchestratorSource.indexOf('async function readFacebookSessionCookieForTab');
  const sessionReaderEnd = orchestratorSource.indexOf('\n}\n', sessionReaderStart) + 3;
  const sessionReaderSource = orchestratorSource.slice(sessionReaderStart, sessionReaderEnd);

  assert.ok(helperStart >= 0, 'the interactive cookie polling helper should exist');
  assert.ok(sessionReaderStart >= 0, 'the tab-aware session cookie reader should exist');
  assert.match(sessionReaderSource, /readFacebookSessionExternalId\(\)/);
  assert.match(sessionReaderSource, /chrome\.tabs\?\.get/);
  assert.match(helperSource, /readFacebookSessionCookieForTab\(tabId\)/);
  assert.doesNotMatch(helperSource, /waitForTabComplete/);
});

test('batch publishing defers authentication until the target group tab is open', () => {
  const publishStart = orchestratorSource.indexOf('export async function publishFacebookPlan');
  const publishEnd = orchestratorSource.indexOf('\n  for (let index = 0;', publishStart);
  const preflightSource = orchestratorSource.slice(publishStart, publishEnd);
  const targetStart = orchestratorSource.indexOf('async function publishTargetInFreshTab');
  const targetEnd = orchestratorSource.indexOf('\nasync function reportAllTargetsFailed', targetStart);
  const targetSource = orchestratorSource.slice(targetStart, targetEnd);

  assert.ok(publishStart >= 0, 'publishFacebookPlan should exist');
  assert.ok(publishEnd > publishStart, 'publishFacebookPlan preflight section should be bounded');
  assert.doesNotMatch(
    preflightSource,
    /ensureFacebookSession\(/,
    'batch publishing should not perform a standalone auth tab check before opening a group',
  );
  assert.match(
    targetSource,
    /(?:const|let) tab = await openTab\(targetUrl, false\);[\s\S]*?ensureFacebookLoginInTab\(tab\.id/,
    'the group tab should own the auth check',
  );
  assert.match(
    targetSource,
    /ensureFacebookLoginInTab\(tab\.id[\s\S]*?closeFacebookPublishTabSafely\(tab\.id\)[\s\S]*?openTab\(targetUrl, false\)/,
    'the temporary login tab should close before the publish tab is reopened',
  );
});

test('group-tab authentication uses the fast cookie path after interactive login', () => {
  const authStart = orchestratorSource.indexOf('export async function ensureFacebookLoginInTab');
  const authEnd = orchestratorSource.indexOf('\nexport async function verifyFacebookGroupPostingEligibility', authStart);
  const authSource = orchestratorSource.slice(authStart, authEnd);

  assert.ok(authStart >= 0, 'ensureFacebookLoginInTab should exist');
  assert.ok(authEnd > authStart, 'ensureFacebookLoginInTab should have a bounded source section');
  assert.match(authSource, /waitForFacebookSessionCookie\(tabId\)/);
  assert.match(authSource, /readFacebookSessionCookieForTab\(tabId\)/);
  assert.doesNotMatch(
    authSource,
    /await sleep\(2_000\)[\s\S]*?waitForFacebookSessionCookie\(tabId\)/,
    'cookie detection should not be placed after the fixed two-second fallback delay',
  );
});
