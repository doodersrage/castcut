import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { isMobileStudioPath, MOBILE_STUDIO_HOME } from './mobile-studio';

export const MOBILE_STUDIO_OFFER_DISMISS_KEY = 'comfy-mobile-studio-offer-dismiss-v1';
export const MOBILE_STUDIO_OFFER_MQ = '(max-width: 767px)';

export function isMobileStudioOfferDismissed(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return readBrowserValue<boolean>(MOBILE_STUDIO_OFFER_DISMISS_KEY) === true;
}

export function dismissMobileStudioOffer(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(MOBILE_STUDIO_OFFER_DISMISS_KEY, true);
}

/** True when the phone companion would help (narrow viewport, not already on /m). */
export function shouldOfferMobileStudio(pathname: string | null | undefined): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (isMobileStudioPath(pathname)) {
    return false;
  }
  if (isMobileStudioOfferDismissed()) {
    return false;
  }
  return window.matchMedia(MOBILE_STUDIO_OFFER_MQ).matches;
}

export { MOBILE_STUDIO_HOME };
