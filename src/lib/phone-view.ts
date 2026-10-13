import { isMobileStudioPath, toMobileStudioHref } from './mobile-studio';

/**
 * Phones open the phone app (/m) on their own: a desk page asked for by a phone browser is sent
 * to its /m twin. Choosing Desk on the phone is remembered in this cookie (the proxy reads it, so
 * it is a cookie, not browser storage); Phone view clears it.
 */
export const VIEW_COOKIE = 'castcut-view';
const DESK_VIEW = 'desk';

/** Phone browsers. iPads (which say "Macintosh") and tablets keep the desk. */
export function isPhoneUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? '';
  return /iPhone|iPod|Windows Phone/i.test(ua) || /Android.*Mobile/i.test(ua);
}

/** Where a phone's request for a desk page goes instead, or null to serve it as asked. */
export function phoneViewRedirect(input: {
  pathname: string;
  search: string;
  userAgent: string | null | undefined;
  viewCookie: string | null | undefined;
}): string | null {
  if (input.viewCookie === DESK_VIEW || !isPhoneUserAgent(input.userAgent)) return null;
  const { pathname, search } = input;
  if (isMobileStudioPath(pathname)) return null;
  if (pathname === '/') return `/m/film${search}`;
  const next = toMobileStudioHref(`${pathname}${search}`);
  return isMobileStudioPath(next) ? next : null;
}

/** Desk on the phone: stay on desk pages until Phone view is picked. */
export function chooseDeskView(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${VIEW_COOKIE}=${DESK_VIEW}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Phone view: phones open /m again. */
export function choosePhoneView(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${VIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
