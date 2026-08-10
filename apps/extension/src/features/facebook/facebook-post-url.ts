export type FacebookGroupPostPathType = 'posts' | 'pending_posts';

export interface FacebookGroupPostUrlParts {
  groupId: string;
  postId: string;
  pathType: FacebookGroupPostPathType;
  url: string;
}

export function parseFacebookGroupPostUrl(value: string | null | undefined): FacebookGroupPostUrlParts | null {
  const rawUrl = value?.trim();
  if (!rawUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

  const directMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts|permalink)\/([^/?#]+)\/?$/i);
  if (directMatch) {
    const [, rawGroupId, rawPathType, postId] = directMatch;
    const groupId = decodeURIComponent(rawGroupId).trim();
    const pathType = normalizeFacebookGroupPostPathType(rawPathType);
    if (!groupId || !postId) return null;

    return {
      groupId,
      postId,
      pathType,
      url: buildFacebookGroupPostUrl(groupId, postId, pathType),
    };
  }

  const groupId = readFacebookGroupId(parsedUrl);
  const postId = readFacebookPostId(parsedUrl);
  if (!groupId || !postId) return null;

  return {
    groupId,
    postId,
    pathType: 'posts',
    url: buildFacebookGroupPostUrl(groupId, postId, 'posts'),
  };
}

export function buildFacebookGroupPostUrl(
  groupId: string,
  postId: string,
  pathType: FacebookGroupPostPathType,
) {
  const encodedGroupId = encodeURIComponent(groupId.trim());
  const normalizedPostId = postId.trim();
  const suffix = pathType === 'posts' ? '/' : '';
  return `https://www.facebook.com/groups/${encodedGroupId}/${pathType}/${normalizedPostId}${suffix}`;
}

export function getValidFacebookGroupPostUrl(value: string | null | undefined) {
  return parseFacebookGroupPostUrl(value)?.url ?? null;
}

function normalizeFacebookGroupPostPathType(value: string): FacebookGroupPostPathType {
  return value.toLowerCase() === 'pending_posts' ? 'pending_posts' : 'posts';
}

function readFacebookGroupId(parsedUrl: URL) {
  const groupPathMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
  const groupPathId = groupPathMatch?.[1] ? decodeURIComponent(groupPathMatch[1]).trim() : '';
  if (groupPathId) return groupPathId;

  return firstNumericSearchParam(parsedUrl, ['id', 'group_id', 'groupid']);
}

function readFacebookPostId(parsedUrl: URL) {
  return firstFacebookPostIdSearchParam(parsedUrl, [
    'story_fbid',
    'fbid',
    'multi_permalinks',
    'post_id',
    'postid',
  ]);
}

function firstFacebookPostIdSearchParam(parsedUrl: URL, names: string[]) {
  for (const name of names) {
    const value = parsedUrl.searchParams.get(name);
    const match = value?.match(/(?:\d{5,}|pfbid[a-z0-9]+)/i);
    if (match?.[0]) return match[0];
  }

  return null;
}

function firstNumericSearchParam(parsedUrl: URL, names: string[]) {
  for (const name of names) {
    const value = parsedUrl.searchParams.get(name);
    const match = value?.match(/\d{5,}/);
    if (match?.[0]) return match[0];
  }

  return null;
}
