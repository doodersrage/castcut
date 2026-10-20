import { removeBrowserKey, writeBrowserValue } from '../storage/browser-storage';

export const FIRST_QUEUE_SETUP_DISMISS_KEY = 'comfy-first-queue-setup-dismiss-v1';
export const FIRST_QUEUE_SETUP_RESET_EVENT = 'comfy-first-queue-setup-reset';
export const SETUP_READINESS_DISMISS_KEY = 'comfy-setup-readiness-dismiss-v1';

export function dismissSetupReadinessBanner(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(SETUP_READINESS_DISMISS_KEY, true);
}

/** Clear first-queue modal + readiness banner together (heal / first render). */
export function dismissFirstRunSetupSurfaces(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(FIRST_QUEUE_SETUP_DISMISS_KEY, true);
  writeBrowserValue(SETUP_READINESS_DISMISS_KEY, true);
}

export function resetFirstRunSetupSurfaces(): void {
  if (typeof window === 'undefined') {
    return;
  }
  removeBrowserKey(FIRST_QUEUE_SETUP_DISMISS_KEY);
  removeBrowserKey(SETUP_READINESS_DISMISS_KEY);
  window.dispatchEvent(new Event(FIRST_QUEUE_SETUP_RESET_EVENT));
}
