import { readBrowserValue, removeBrowserKey, writeBrowserValue } from '../storage/browser-storage';

/**
 * First-run setup surfaces share one dismiss: the dashboard checklist's setup steps (the owner),
 * the first-queue modal and the per-tool readiness banner. "Not now" or "Dismiss" on any of them
 * clears all three, so a new player isn't asked the same thing again on the next page.
 */
export const FIRST_QUEUE_SETUP_DISMISS_KEY = 'comfy-first-queue-setup-dismiss-v1';
export const FIRST_QUEUE_SETUP_RESET_EVENT = 'comfy-first-queue-setup-reset';
export const SETUP_READINESS_DISMISS_KEY = 'comfy-setup-readiness-dismiss-v1';
/** Fired when the setup surfaces are dismissed, so the mounted ones hide too. */
export const FIRST_RUN_SETUP_DISMISSED_EVENT = 'comfy-first-run-setup-dismissed';

function notify(type: string): void {
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(type));
  }
}

/** Kept for callers that only meant the banner: it clears every setup surface now. */
export function dismissSetupReadinessBanner(): void {
  dismissFirstRunSetupSurfaces();
}

/** Clear every first-run setup surface together (any dismiss, a heal, a first render). */
export function dismissFirstRunSetupSurfaces(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(FIRST_QUEUE_SETUP_DISMISS_KEY, true);
  writeBrowserValue(SETUP_READINESS_DISMISS_KEY, true);
  notify(FIRST_RUN_SETUP_DISMISSED_EVENT);
}

/** Whether the player dismissed setup on any surface (either flag counts for all). */
export function isFirstRunSetupDismissed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    readBrowserValue<boolean>(FIRST_QUEUE_SETUP_DISMISS_KEY) === true ||
    readBrowserValue<boolean>(SETUP_READINESS_DISMISS_KEY) === true
  );
}

export function resetFirstRunSetupSurfaces(): void {
  if (typeof window === 'undefined') {
    return;
  }
  removeBrowserKey(FIRST_QUEUE_SETUP_DISMISS_KEY);
  removeBrowserKey(SETUP_READINESS_DISMISS_KEY);
  notify(FIRST_QUEUE_SETUP_RESET_EVENT);
}
