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

  const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts)\/(\d+)\/?$/i);
  if (!match) return null;

  const [, rawGroupId, rawPathType, postId] = match;
  const groupId = decodeURIComponent(rawGroupId).trim();
  const pathType = rawPathType.toLowerCase() as FacebookGroupPostPathType;
  if (!groupId || !postId) return null;

  return {
    groupId,
    postId,
    pathType,
    url: buildFacebookGroupPostUrl(groupId, postId, pathType),
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
