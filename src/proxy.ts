import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  checkRateLimit,
  isHighVolumeMediaRoute,
  mediaRateLimitMax,
  rateLimitClientKey,
} from '@/lib/api-rate-limit';
import { resolveUserIdFromApiKey } from '@/lib/auth/api-keys';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, listGroups } from '@/lib/auth/store';
import { checkUserRateLimit } from '@/lib/user-quotas';
import { logApiUsage } from '@/lib/api-usage-log';
import { authorizeAppRequest } from '@/lib/auth/access';

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

function extractToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) {
      return token;
    }
  }
  return request.headers.get('x-prompt-api-token')?.trim() || undefined;
}

function isTrustedSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  const site = request.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') {
    return true;
  }
  // Embedded browsers (Cursor IDE) often omit Origin + Sec-Fetch-Site on fetch.
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  return false;
}

// Matches ONLY the shared PROMPT_API_TOKEN secret. This gate decides whether
// authorizeAppRequest() (which enforces user.enabled and blocked-feature checks)
// gets skipped entirely, so it must never also accept a personal (`pt_`) API key —
// otherwise a disabled or feature-blocked user could keep full access via their own
// key whenever an operator has PROMPT_API_TOKEN configured. Personal-key holders
// still authenticate fine through authorizeAppRequest()'s own resolveRequestUser().
function hasValidServiceToken(request: NextRequest): boolean {
  const expected = process.env.PROMPT_API_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const provided = extractToken(request);
  if (!provided) {
    return false;
  }
  return timingSafeEqualString(provided, expected);
}

export function proxy(request: NextRequest) {
  const started = Date.now();
  const path = request.nextUrl.pathname;
  const clientKey = rateLimitClientKey(request);
  const isApiRoute = path.startsWith('/api/');

  if (isApiRoute) {
    const session = readSessionFromRequest(request);
    const apiKeyUserId = resolveUserIdFromApiKey(extractToken(request));
    const user =
      session && !apiKeyUserId
        ? findUserById(session.userId)
        : apiKeyUserId
          ? findUserById(apiKeyUserId)
          : null;
    const limit = isHighVolumeMediaRoute(path)
      ? checkRateLimit(clientKey, path, mediaRateLimitMax())
      : user && user.enabled
        ? checkUserRateLimit({
            user,
            groups: listGroups(),
            clientKey,
            path,
          })
        : checkRateLimit(clientKey, path);
    if (!limit.allowed) {
      logApiUsage({
        at: started,
        method: request.method,
        path,
        status: 429,
        durationMs: Date.now() - started,
        clientKey,
        rateLimited: true,
      });
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(limit.retryAfterSec),
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const expected = process.env.PROMPT_API_TOKEN?.trim();
    if (expected && request.method !== 'OPTIONS') {
      const provided = extractToken(request);
      const userKeyOk = provided?.startsWith('pt_') && resolveUserIdFromApiKey(provided);
      if (!provided || (!timingSafeEqualString(provided, expected) && !userKeyOk)) {
        if (!isTrustedSameOrigin(request)) {
          logApiUsage({
            at: started,
            method: request.method,
            path,
            status: 401,
            durationMs: Date.now() - started,
            clientKey,
          });
          return NextResponse.json(
            {
              error:
                'Unauthorized. Set Authorization: Bearer <PROMPT_API_TOKEN> (or X-Prompt-Api-Token).',
            },
            {
              status: 401,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Prompt-Api-Token',
              },
            }
          );
        }
      }
    }
  }

  if (!hasValidServiceToken(request)) {
    const authResult = authorizeAppRequest(request);
    if (!authResult.ok) {
      if (isApiRoute) {
        logApiUsage({
          at: started,
          method: request.method,
          path,
          status: authResult.status,
          durationMs: Date.now() - started,
          clientKey,
        });
        return NextResponse.json(
          { error: authResult.error },
          {
            status: authResult.status,
            headers: { 'Access-Control-Allow-Origin': '*' },
          }
        );
      }

      if (authResult.status === 403) {
        return NextResponse.redirect(new URL('/forbidden', request.url));
      }

      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();
  if (isApiRoute) {
    logApiUsage({
      at: started,
      method: request.method,
      path,
      status: 200,
      durationMs: Date.now() - started,
      clientKey,
    });
  }
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest-mobile.json|icons|sw.js|sw-gallery.js|wildcards|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
