import { dismissFirstRunSetupSurfaces, resetFirstRunSetupSurfaces } from './first-run-dismiss';

export { FIRST_QUEUE_SETUP_DISMISS_KEY, FIRST_QUEUE_SETUP_RESET_EVENT } from './first-run-dismiss';

export function dismissFirstQueueSetupModal(): void {
  dismissFirstRunSetupSurfaces();
}

/** Clear dismiss flag and ask the modal to re-open on next queue intent / immediately. */
export function resetFirstQueueSetupModal(): void {
  resetFirstRunSetupSurfaces();
}
