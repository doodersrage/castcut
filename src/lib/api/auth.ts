import { apiError } from '@/lib/api/response';

function getConfiguredApiToken(): string | undefined {
  return process.env.PROMPT_API_TOKEN?.trim() || undefined;
}

function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function extractBearerOrHeaderToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) {
      return token;
    }
  }

  const headerToken = request.headers.get('x-prompt-api-token')?.trim();
  return headerToken || undefined;
}

/**
 * Same-origin browser UI may call the API without a bearer token.
 * Cross-origin callers (and non-browser clients) must send PROMPT_API_TOKEN when configured.
 */
export function isTrustedSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  const site = request.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') {
    return true;
  }

  // Embedded browsers / automation often omit Origin + Sec-Fetch-Site but still
  // send Referer for same-tab fetches (e.g. Cursor IDE browser login).
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  // Non-browser clients (curl, ComfyUI nodes) omit Origin/Sec-Fetch-Site.
  // Those must authenticate when a token is configured.
  return false;
}

/**
 * Returns an error response when the request is not authorized.
 * Returns null when the request may proceed.
 */
export function authorizeApiRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return null;
  }

  const expected = getConfiguredApiToken();
  if (!expected) {
    return null;
  }

  const provided = extractBearerOrHeaderToken(request);
  if (provided && timingSafeEqualString(provided, expected)) {
    return null;
  }

  if (isTrustedSameOriginRequest(request)) {
    return null;
  }

  return apiError(
    'Unauthorized. Set Authorization: Bearer <PROMPT_API_TOKEN> (or X-Prompt-Api-Token).',
    401
  );
}

export function isApiAuthConfigured(): boolean {
  return Boolean(getConfiguredApiToken());
}
