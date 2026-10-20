import { featureForPath, type AppFeatureId } from '../auth/features';
import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

const KEY = 'comfy-last-tool-route-v1';

const BLOCKED_PREFIXES = ['/login', '/forbidden', '/api'];

const FALLBACK_LANDING_CANDIDATES = [
  '/dashboard',
  '/',
  '/gallery',
  '/queue',
  '/profile',
  '/settings',
] as const;

function isAllowedRoute(href: string): boolean {
  const path = (href.split('?')[0] || '/').trim() || '/';
  if (BLOCKED_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  return path.startsWith('/');
}

function routeAllowedForFeatures(href: string, allowed: AppFeatureId[] | 'all'): boolean {
  const feature = featureForPath(href.split('?')[0] || '/');
  if (!feature) {
    return true;
  }
  if (allowed === 'all') {
    return true;
  }
  return allowed.includes(feature);
}

/** Whether a deep link is allowed for the user's feature set (nav, onboarding, palette). */
export function isRouteAllowedForFeatures(href: string, allowed: AppFeatureId[] | 'all'): boolean {
  return routeAllowedForFeatures(href, allowed);
}

/**
 * Pick a post-login destination the user can actually open.
 * Order: explicit `?next=` → remembered tool → safe fallbacks.
 */
export function resolveLandingRoute(input: {
  explicitNext?: string | null;
  remembered?: string | null;
  allowedFeatures?: AppFeatureId[] | 'all' | null;
}): string {
  const allowed = input.allowedFeatures ?? 'all';
  const candidates = [input.explicitNext, input.remembered, ...FALLBACK_LANDING_CANDIDATES];

  for (const candidate of candidates) {
    const href = candidate?.trim();
    if (!href || !isAllowedRoute(href)) {
      continue;
    }
    if (routeAllowedForFeatures(href, allowed)) {
      return href;
    }
  }

  return '/';
}

export function saveLastToolRoute(href: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = href.trim();
  if (!isAllowedRoute(trimmed)) {
    return;
  }
  writeBrowserString(KEY, trimmed);
}

export function loadLastToolRoute(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = readBrowserString(KEY)?.trim();
  if (!value || !isAllowedRoute(value)) {
    return null;
  }
  return value;
}

export function clearLastToolRoute(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserString(KEY, '');
}
