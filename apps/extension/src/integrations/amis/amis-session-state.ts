export interface AmisSessionStateResponse {
  ok: boolean;
  authenticated: boolean;
  sourceUrl: string;
  error?: string;
}

export function isAuthenticatedAmisSessionState(
  value: unknown,
): value is AmisSessionStateResponse {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as {
    ok?: unknown;
    authenticated?: unknown;
    sourceUrl?: unknown;
  };

  return candidate.ok === true
    && candidate.authenticated === true
    && typeof candidate.sourceUrl === 'string'
    && candidate.sourceUrl.length > 0;
}
