import type { FacebookGraphqlCollectionResult } from '@/features/facebook/facebook-group-graphql-capture';
import { sleep } from '@/lib/utils';

export interface FacebookGroupsScanRunResult {
  groups: Array<{
    targetName: string;
    targetUrl: string;
    targetExternalId: string;
  }>;
  scanComplete: boolean;
}

export function mapGraphqlScanResult(result: FacebookGraphqlCollectionResult): FacebookGroupsScanRunResult {
  return {
    groups: result.groups,
    scanComplete: result.scanComplete,
  };
}

export async function runScriptInTab<Result>(tabId: number, script: () => Result | Promise<Result>): Promise<Result> {
  const results = await chrome.scripting?.executeScript({
    target: { tabId },
    func: script,
  });
  if (!results?.length) {
    throw new Error('Không thể chạy script quét nhóm trong tab Facebook.');
  }

  return results[0].result as Result;
}

export async function closeTabSafely(tabId: number) {
  try {
    await chrome.tabs?.remove(tabId);
  } catch {
    // Intentionally ignore when tab already closed.
  }
}

export async function waitForTabComplete(tabId: number, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs?.get(tabId).catch(() => null);
    if (!tab) break;
    if (tab.status === 'complete') return;
    await sleep(350);
  }

  throw new Error('Timeout khi chờ trang Facebook tải xong.');
}

export async function collectFacebookGroupsFromPage(): Promise<FacebookGroupsScanRunResult> {
  const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const normalizeText = (value: string | null | undefined) => {
    if (!value) return null;
    return value.replace(/\s+/g, ' ').trim();
  };

  const normalizeForMatch = (value: string | null | undefined) => {
    const normalized = normalizeText(value)?.toLowerCase();
    if (!normalized) return null;
    return normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  const decodePathSegment = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const headingKeywords = [
    'nhóm bạn đã tham gia',
    'nhóm đã tham gia',
    'tất cả các nhóm bạn đã tham gia',
    'tất cả nhóm bạn đã tham gia',
    'các nhóm của bạn',
    'your joined groups',
    'groups you joined',
    'groups youve joined',
    'all groups you joined',
    "all groups you've joined",
    'joined groups',
    'your groups',
  ];

  const ignoreNameTokens = new Set([
    'bảng feed của bạn',
    'nhóm của bạn',
    'nhóm của tôi',
    'nhóm của chúng tôi',
    'news feed',
    'feed của bạn',
    'your groups',
    'your joined groups',
    'joined groups',
    'groups you joined',
    'groups youve joined',
    'xem tất cả',
    'xem nhóm',
    'see more',
    'view group',
    'open group',
    'visit group',
    'go to group',
    'xem thêm',
    'more',
  ]);

  const nameNoiseSuffixes: RegExp[] = [
    /\s*(?:[-–—|·:•]?\s*)?lần hoạt động gần nhất:?.*/i,
    /\s*(?:[-–—|·:•]?\s*)?đã tham gia gần đây.*$/i,
    /\s*(?:[-–—|·:•]?\s*)?đã tham gia.*$/i,
    /\s*xem tất cả$/i,
    /\s*-?\s*đã tham gia gần đây.*$/i,
    /\s*\(.*lần hoạt động gần nhất.*\)/i,
    /\s*[-–—|·:•]?\s*LẦN HOẠT ĐỘNG GẦN NHẤT.*$/i,
    /\s*[-–—|·:•]?\s*ĐÃ THAM GIA GẦN ĐÂY.*$/i,
    /\s*[-–—|·:•]?\s*[\w.-]+\s*-\s*\d+\s*năm trước.*$/i,
  ];

  const ignoredGroupPathSegments = new Set([
    'help',
    'create',
    'discover',
    'directory',
    'news',
    'saved',
    'settings',
    'feed',
    'group',
    'groups',
    'join',
    'join_group',
    'your_groups',
    'joined_groups',
  ]);

  const revealGroupListButtonPatterns = [
    /\bxem tất cả\b/i,
    /\bxem thêm\b/i,
    /\bsee more\b/i,
    /\bview more\b/i,
    /\bshow more\b/i,
    /\bmore\b/i,
    /\bxem toàn bộ\b/i,
    /\ball groups\b/i,
  ];

  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  const queryAnchors = (root: ParentNode) => Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[];

  const countAllGroupAnchors = (root: ParentNode) => {
    let total = 0;
    const anchors = queryAnchors(root);
    for (const anchor of anchors) {
      if (parseGroupFromUrl(anchor.href)) total += 1;
    }
    return total;
  };

  const readElementText = (element: Element | null) => {
    if (!element) return null;
    return (
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
      || ''
    ).trim();
  };

  const getNormalizedLabel = (element: Element | null) => {
    if (!element) return '';
    return normalizeForMatch(readElementText(element) || '');
  };

  const isRevealButton = (element: Element) => {
    const normalizedLabel = getNormalizedLabel(element);
    if (!normalizedLabel) return false;
    return revealGroupListButtonPatterns.some((pattern) => pattern.test(normalizedLabel));
  };

  const clickIfReveal = (element: Element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (!isVisible(element)) return false;
    if (element.getAttribute('aria-disabled') === 'true' || element.getAttribute('disabled') !== null) return false;

    try {
      element.click();
      return true;
    } catch {
      try {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      } catch {
        return false;
      }
    }
  };

  const revealHiddenListItems = (root: ParentNode) => {
    const candidates = Array.from(root.querySelectorAll('a,button,[role="button"]')) as Element[];
    let clicked = 0;
    const clickedKeys = new Set<string>();

    for (const candidate of candidates) {
      if (!isRevealButton(candidate)) continue;

      const candidateKey = getNormalizedLabel(candidate);
      if (!candidateKey || clickedKeys.has(candidateKey)) continue;
      clickedKeys.add(candidateKey);

      if (clickIfReveal(candidate)) {
        clicked += 1;
      }
    }

    return clicked;
  };

  const isSectionHeading = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return false;
    return headingKeywords.some((keyword) => {
      const normalizedKeyword = normalizeForMatch(keyword);
      if (!normalizedKeyword) return false;
      return (
        normalized === normalizedKeyword
        || normalized.startsWith(`${normalizedKeyword} `)
        || normalized.includes(` ${normalizedKeyword} `)
        || normalized.endsWith(` ${normalizedKeyword}`)
      );
    });
  };

  const isNoiseGroupName = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return true;
    return Array.from(ignoreNameTokens).some((token) => {
      const normalizedToken = normalizeForMatch(token);
      if (!normalizedToken) return false;
      return (
        normalized === normalizedToken
        || normalized.startsWith(`${normalizedToken} `)
        || normalized.endsWith(` ${normalizedToken}`)
        || normalized.includes(` ${normalizedToken} `)
      );
    });
  };

  const normalizeGroupId = (value: string | null | undefined) => {
    if (!value) return null;
    const decoded = decodePathSegment(value).trim().toLowerCase();
    if (!decoded.length) return null;
    return ignoredGroupPathSegments.has(decoded) ? null : decoded;
  };

  const parseGroupFromUrl = (rawHref: string) => {
    try {
      const parsed = new URL(rawHref, window.location.href);
      const isFacebookHost = parsed.hostname === 'facebook.com' || parsed.hostname.endsWith('.facebook.com');
      if (!isFacebookHost) return null;

      const match = parsed.pathname.match(/^\/groups\/([^/?#]+)/i);
      if (!match) return null;

      const targetExternalId = normalizeGroupId(match[1]);
      if (!targetExternalId) return null;

      return {
        targetUrl: `https://www.facebook.com/groups/${encodeURIComponent(targetExternalId)}`,
        targetExternalId,
      };
    } catch {
      return null;
    }
  };

  const sanitizeName = (rawName: string) => {
    let normalized = normalizeText(rawName) ?? '';
    for (const suffix of nameNoiseSuffixes) {
      normalized = normalized.replace(suffix, '').trim();
    }
    return normalized;
  };

  const getNameFromAnchor = (anchor: HTMLAnchorElement, fallbackTargetExternalId?: string) => {
    const rawName =
      anchor.getAttribute('aria-label')
      || anchor.getAttribute('title')
      || anchor.textContent
      || '';
    const sanitized = sanitizeName(rawName || fallbackTargetExternalId || '');
    if (!sanitized || isNoiseGroupName(sanitized)) return null;
    return sanitized.slice(0, 240);
  };

  const collectFromScope = (scope: ParentNode) => {
    const results = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string; order: number }>();
    const anchors = queryAnchors(scope);

    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      if (!isVisible(anchor)) continue;

      const parsed = parseGroupFromUrl(anchor.href);
      if (!parsed) continue;
      const targetName = getNameFromAnchor(anchor, parsed.targetExternalId);
      if (!targetName) continue;

      if (!results.has(parsed.targetExternalId)) {
        results.set(parsed.targetExternalId, {
          targetName,
          targetUrl: parsed.targetUrl,
          targetExternalId: parsed.targetExternalId,
          order: index,
        });
      }
    }

    return results;
  };

  const evaluateScope = (node: Element | null) => {
    if (!node || !isVisible(node)) return -Infinity;
    const anchors = queryAnchors(node);
    let matched = 0;
    let unmatched = 0;
    let candidateDepthPenalty = 0;

    let depthNode: Element | null = node;
    while (depthNode && depthNode.parentElement) {
      candidateDepthPenalty += 1;
      depthNode = depthNode.parentElement;
    }

    for (const anchor of anchors) {
      if (!isVisible(anchor)) continue;
      const parsed = parseGroupFromUrl(anchor.href);
      if (!parsed) continue;
      matched += 1;
      const rawName = getNameFromAnchor(anchor);
      if (!rawName) unmatched += 1;
    }

    return matched * 10 - unmatched * 2 - Math.min(candidateDepthPenalty, 20);
  };

  const findJoinedSectionRoot = () => {
    const headingCandidates = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p, a, [role="heading"]'),
    ).filter((node) => isSectionHeading(readElementText(node) || node.textContent || ''));

    let best: Element | null = null;
    let bestScore = -Infinity;

    for (const heading of headingCandidates) {
      if (!isVisible(heading)) continue;
      let node: Element | null = heading;
      for (let depth = 0; depth < 16 && node; depth += 1) {
        const score = evaluateScope(node);
        if (score > bestScore) {
          bestScore = score;
          best = node;
        }
        node = node.parentElement;
      }
    }

    if (best) {
      return best;
    }

    const navCandidates = Array.from(
      document.querySelectorAll('nav, [role="navigation"], [role="complementary"]'),
    );
    let fallback: Element | null = null;
    let fallbackScore = -Infinity;
    for (const candidate of navCandidates) {
      const score = evaluateScope(candidate);
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = candidate;
      }
    }
    return fallback;
  };

  const findJoinedSectionRootByDensity = () => {
    const candidates = Array.from(document.querySelectorAll('div, section, aside, nav, ul, ol'));
    let best: Element | null = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;

      const rect = candidate.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;

      const groupAnchors = countAllGroupAnchors(candidate);
      if (groupAnchors < 5) continue;

      const score = groupAnchors * 10 - Math.abs(rect.width - 360) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  };

  const pickScrollableHost = (scope: Element | null) => {
    if (!scope) return null;
    let current: Element | null = scope;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      if (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && current.scrollHeight > current.clientHeight + 80
        && countAllGroupAnchors(current) > 0
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return document.documentElement;
  };

  const normalizeCanonicalTitle = (raw: string | null | undefined) => {
    const normalized = normalizeText(raw);
    if (!normalized) return null;
    return normalized
      .replace(/\s*[|-]\s*(facebook|meta).*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const parseGroupPageCanonicalName = async (groupUrl: string, fallback: string) => {
    try {
      const response = await fetch(groupUrl, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) return fallback;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rawTitle =
        doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')
        || doc.querySelector('title')?.textContent
        || doc.querySelector('h1')?.textContent
        || '';
      const normalized = normalizeCanonicalTitle(rawTitle);
      if (!normalized || isNoiseGroupName(normalized)) return fallback;
      return normalized.slice(0, 240);
    } catch {
      return fallback;
    }
  };

  const shouldResolveCanonicalName = (value: string) => {
    const normalized = normalizeForMatch(value);
    if (!normalized) return true;
    if (normalizeForMatch('xem tất cả') === normalized) return true;
    if (/^[0-9]+$/.test(normalized)) return true;
    return false;
  };

  const sectionRoot = findJoinedSectionRoot();
  const fallbackSectionRoot = sectionRoot ? null : findJoinedSectionRootByDensity();
  const scanScope: ParentNode = sectionRoot ?? fallbackSectionRoot ?? document;

  const collect = () => {
    const output = collectFromScope(scanScope);
    const pageWide = collectFromScope(document);

    pageWide.forEach((group, key) => {
      if (!output.has(key)) output.set(key, group);
    });

    return output;
  };

  const collected = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string; order: number }>(
    collect(),
  );
  const scrollScope = sectionRoot ?? fallbackSectionRoot;
  const scrollHost = pickScrollableHost(scrollScope instanceof Element ? scrollScope : document.documentElement);
  const scrollHosts: Element[] = [];
  const addScrollHost = (candidate: Element | null) => {
    if (!candidate || scrollHosts.includes(candidate)) return;
    scrollHosts.push(candidate);
  };

  const discoverScrollHosts = () => {
    addScrollHost(scrollHost);
    const documentHost = document.documentElement;
    if (documentHost.scrollHeight > documentHost.clientHeight + 80) {
      addScrollHost(documentHost);
    }

    for (const anchor of queryAnchors(document)) {
      if (!parseGroupFromUrl(anchor.href)) continue;

      let ancestor = anchor.parentElement;
      for (let depth = 0; depth < 12 && ancestor; depth += 1) {
        const style = window.getComputedStyle(ancestor);
        const overflowY = style.overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
          && ancestor.scrollHeight > ancestor.clientHeight + 80
        ) {
          addScrollHost(ancestor);
        }
        ancestor = ancestor.parentElement;
      }
    }
  };

  discoverScrollHosts();

  let stablePasses = 0;
  let attempts = 0;
  const previousScrollHeights = new Map<Element, number>();
  const maxAttempts = 40;

  while (attempts < maxAttempts && stablePasses < 5) {
    const beforeSize = collected.size;
    const now = collect();
    now.forEach((group, key) => {
      if (!collected.has(key)) {
        collected.set(key, group);
      }
    });

    const revealClicks = revealHiddenListItems(sectionRoot || document);
    if (revealClicks > 0) {
      await sleepMs(1000);
    }
    discoverScrollHosts();

    const afterSize = collected.size;
    const sizeChanged = afterSize > beforeSize || revealClicks > 0;
    let moved = false;
    let heightChanged = false;

    attempts += 1;

    for (const host of scrollHosts) {
      const isDocumentHost = host === document.documentElement || host === document.body;
      const beforeScrollTop = isDocumentHost ? window.scrollY : host.scrollTop;
      const beforeScrollHeight = isDocumentHost ? document.documentElement.scrollHeight : host.scrollHeight;

      if (isDocumentHost) {
        window.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      } else if (host instanceof HTMLElement) {
        host.scrollTo({ top: beforeScrollHeight, behavior: 'auto' });
      }
      await sleepMs(1_100);

      const afterScrollTop = isDocumentHost ? window.scrollY : host.scrollTop;
      const afterScrollHeight = isDocumentHost ? document.documentElement.scrollHeight : host.scrollHeight;
      const hostMoved = afterScrollTop !== beforeScrollTop || afterScrollHeight !== beforeScrollHeight;
      const previousScrollHeight = previousScrollHeights.get(host);
      const hostHeightChanged = previousScrollHeight !== undefined && afterScrollHeight !== previousScrollHeight;
      previousScrollHeights.set(host, afterScrollHeight);

      moved = moved || hostMoved;
      heightChanged = heightChanged || hostHeightChanged;
    }

    const afterScrollSize = collect().size;
    const groupsLoadedAfterScroll = afterScrollSize > afterSize;

    if (sizeChanged || groupsLoadedAfterScroll || moved || heightChanged) stablePasses = 0;
    else stablePasses += 1;
  }

  const uniqueGroups = Array.from(collected.values()).sort((left, right) => left.order - right.order);

  const canonicalized: Array<{ targetName: string; targetUrl: string; targetExternalId: string }> = [];
  const batchSize = 3;
  for (let index = 0; index < uniqueGroups.length; index += batchSize) {
    const batch = uniqueGroups.slice(index, index + batchSize);
    const resolvedBatch = await Promise.all(
      batch.map(async (group) => {
        const canonical = shouldResolveCanonicalName(group.targetName)
          ? await parseGroupPageCanonicalName(group.targetUrl, group.targetName)
          : group.targetName;
        return {
          targetName: canonical,
          targetUrl: group.targetUrl,
          targetExternalId: group.targetExternalId,
        };
      }),
    );
    canonicalized.push(...resolvedBatch);
    await sleepMs(180);
  }

  const finalGroups = new Map<string, { targetName: string; targetUrl: string; targetExternalId: string }>();
  for (const group of canonicalized) {
    if (!finalGroups.has(group.targetExternalId)) {
      finalGroups.set(group.targetExternalId, group);
    }
  }

  return {
    groups: Array.from(finalGroups.values()),
    scanComplete: stablePasses >= 5 && Boolean(scrollScope) && scrollHosts.length > 0,
  };
}
