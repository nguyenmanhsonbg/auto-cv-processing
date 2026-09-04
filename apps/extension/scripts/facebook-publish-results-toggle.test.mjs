import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sidePanelSource = await readFile(new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url), 'utf8');
const appSidePanelSource = await readFile(new URL('../src/app/side-panel.tsx', import.meta.url), 'utf8');
const facebookManagerSource = await readFile(new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url), 'utf8');
const iconsSource = await readFile(new URL('../src/assets/icons/side-panel-icons.tsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/app/styles.css', import.meta.url), 'utf8');

test('result toggle icons use the same 16px SVG coordinate system', () => {
  const downIcon = iconsSource.match(/(?:export\s+)?function ChevronDownIcon\([\s\S]*?\r?\n}\r?\n/);
  const upIcon = iconsSource.match(/(?:export\s+)?function ChevronUpIcon\([\s\S]*?\r?\n}\r?\n/);

  assert.ok(downIcon, 'ChevronDownIcon should exist');
  assert.ok(upIcon, 'ChevronUpIcon should exist');
  assert.match(downIcon[0], /viewBox="0 0 16 16"/);
  assert.match(upIcon[0], /viewBox="0 0 16 16"/);
  assert.doesNotMatch(upIcon[0], /viewBox="0 0 24 24"/);
});

test('result toggle shows the requested action direction', () => {
  assert.match(sidePanelSource, /\{isFacebookResultsExpanded \? <ChevronDownIcon \/> : <ChevronUpIcon \/>\}/);
});

test('result toggle has a stable button box and distinct hover state', () => {
  const toggleCss = stylesSource.match(/\.facebook-publish-results-toggle \{[\s\S]*?\r?\n}\r?\n/);
  const hoverCss = stylesSource.match(/\.facebook-publish-results-toggle:hover \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(toggleCss, 'result toggle CSS should exist');
  assert.ok(hoverCss, 'result toggle hover CSS should exist');
  assert.match(toggleCss[0], /border:\s*1px solid transparent/);
  assert.match(toggleCss[0], /padding:\s*0/);
  assert.match(toggleCss[0], /line-height:\s*0/);
  assert.match(hoverCss[0], /border-color:\s*#a7f3d0/);
  assert.match(hoverCss[0], /background:\s*#ecfdf5/);
});

test('Facebook publish makes the result panel visible before publishing starts', () => {
  const executeStart = facebookManagerSource.indexOf('const executeFacebookPublish = useCallback');
  const configStart = facebookManagerSource.indexOf('const facebookConfig = useMemo', executeStart);

  assert.ok(executeStart >= 0, 'executeFacebookPublish should exist');
  assert.ok(configStart > executeStart, 'facebookConfig should follow executeFacebookPublish');

  const executeSource = facebookManagerSource.slice(executeStart, configStart);
  assert.match(
    executeSource,
    /setFacebookPublishResultsVisible\(true\)/,
    'the result panel must be opened when the publish plan starts',
  );
});

test('background Facebook progress also opens the result panel', () => {
  const progressStart = appSidePanelSource.indexOf('if (isFacebookPublishProgressUpdateMessage(message))');
  const applicationsStart = appSidePanelSource.indexOf('if (isApplicationsSyncedMessage(message))', progressStart);

  assert.ok(progressStart >= 0, 'Facebook progress messages should be handled');
  assert.ok(applicationsStart > progressStart, 'the progress handler should finish before the next message branch');

  const progressHandlerSource = appSidePanelSource.slice(progressStart, applicationsStart);
  assert.match(
    progressHandlerSource,
    /facebook\.setFacebookPublishResultsVisible\(true\)/,
    'background progress must make the result panel visible',
  );
});

test('authenticated posting workspace stays mounted while sync is running', () => {
  assert.match(
    appSidePanelSource,
    /const showAuthenticatedWorkspace = Boolean\(user && token\)\s*&& state !== 'AUTH_LOADING'\s*&& state !== 'AUTH_REQUIRED'\s*&& state !== 'PASSWORD_CHANGE_REQUIRED'/,
    'the authenticated workspace should remain available outside auth-only states',
  );
  assert.match(
    appSidePanelSource,
    /\{showAuthenticatedWorkspace && \(user\?\.role === 'FREELANCER' \|\| user\?\.role === 'INTERNAL'\) && token \?/,
    'freelancer/internal workspace should remain mounted during sync',
  );
  assert.match(
    appSidePanelSource,
    /\) : showAuthenticatedWorkspace && user \?/,
    'the recruiter workspace should remain mounted during sync',
  );
});

test('Facebook result panel renders only the channel and selected group statuses', () => {
  const panelStart = sidePanelSource.indexOf('function renderFacebookPublishResultsPanel()');
  const panelEnd = sidePanelSource.indexOf('\n  function renderRuntimePanels', panelStart);

  assert.ok(panelStart >= 0, 'Facebook result panel renderer should exist');
  assert.ok(panelEnd > panelStart, 'Facebook result panel renderer should have a bounded body');

  const panelSource = sidePanelSource.slice(panelStart, panelEnd);
  assert.doesNotMatch(panelSource, /publish-result-metrics-grid/);
  assert.doesNotMatch(panelSource, /otherChannelPostings\.map/);
  assert.match(panelSource, /facebook-publish-results-list/);
  assert.match(panelSource, /facebook-publish-result-row/);
});

test('Facebook accepted submission is rendered as posted instead of stuck in progress', () => {
  assert.match(sidePanelSource, /isFacebookResultPendingReview/);
  assert.match(sidePanelSource, /const statusLabel = isAcceptedSubmission\s*\?\s*'Đã đăng'/s);
  assert.match(sidePanelSource, /const channelStatusLabel = isAcceptedSubmissionOnly\s*\?\s*'Đã đăng'/s);
});

test('Facebook result status typography follows the result design', () => {
  const groupRowCss = stylesSource.match(/\.facebook-publish-result-row \{[\s\S]*?\r?\n}\r?\n/);
  const groupStateCss = stylesSource.match(/\.facebook-publish-result-state \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(groupRowCss, 'Facebook group result row CSS should exist');
  assert.ok(groupStateCss, 'Facebook group result status CSS should exist');
  assert.match(groupRowCss[0], /font-size:\s*12px/);
  assert.match(groupRowCss[0], /font-weight:\s*400/);
  assert.match(groupRowCss[0], /line-height:\s*18px/);
  assert.match(groupStateCss[0], /font-size:\s*10px/);
  assert.match(groupStateCss[0], /font-weight:\s*700/);
  assert.match(groupStateCss[0], /line-height:\s*15px/);
});
