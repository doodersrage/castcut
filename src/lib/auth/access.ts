import { featureForPath, type AppFeatureId } from './features';
import { readSessionFromRequest } from './session';
import { resolveUserIdFromApiKey } from './api-keys';
import { findUserById, isAuthEnabled, userCanAccessFeature } from './store';
import type { AuthUser } from './types';

export function isPublicAuthPath(pathname: string): boolean {
  const path = pathname.split('?')[0] ?? pathname;
  return (
    path === '/login' ||
    path === '/forbidden' ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/session' ||
    path === '/api/auth/profile' ||
    path === '/api/auth/totp/verify' ||
    path === '/api/shared-presets' ||
    path === '/api/health'
  );
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim() || undefined;
  }
  return request.headers.get('x-prompt-api-token')?.trim() || undefined;
}

export function resolveRequestUser(request: Request): AuthUser | null {
  const session = readSessionFromRequest(request);
  if (session) {
    return findUserById(session.userId);
  }

  const token = extractBearerToken(request);
  const userId = resolveUserIdFromApiKey(token);
  if (userId) {
    return findUserById(userId);
  }

  return null;
}

export function authorizeAppRequest(request: Request):
  | {
      ok: true;
      user: AuthUser | null;
      authEnabled: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  const authEnabled = isAuthEnabled();
  if (!authEnabled) {
    return { ok: true, user: null, authEnabled: false };
  }

  const pathname = new URL(request.url).pathname;
  if (isPublicAuthPath(pathname)) {
    return { ok: true, user: resolveRequestUser(request), authEnabled: true };
  }

  const user = resolveRequestUser(request);
  if (!user || !user.enabled) {
    return { ok: false, status: 401, error: 'Sign in required.' };
  }

  const feature = featureForPath(pathname);
  if (!userCanAccessFeature(user, feature)) {
    const label = feature ?? 'resource';
    return { ok: false, status: 403, error: `Access to ${label} is blocked for your account.` };
  }

  return { ok: true, user, authEnabled: true };
}

export function canAccessFeature(
  allowed: AppFeatureId[] | 'all' | null | undefined,
  feature: AppFeatureId
): boolean {
  if (!allowed) {
    return true;
  }
  if (allowed === 'all') {
    return true;
  }
  if (allowed.includes(feature)) {
    return true;
  }
  // Legacy grants: Story (roleplay) included the Film loop before `play` split out.
  if (feature === 'play' && allowed.includes('roleplay')) {
    return true;
  }
  return false;
}

export function pathAllowedForFeatures(pathname: string, allowed: AppFeatureId[] | 'all'): boolean {
  const feature = featureForPath(pathname);
  if (!feature) {
    return true;
  }
  return canAccessFeature(allowed, feature);
}
