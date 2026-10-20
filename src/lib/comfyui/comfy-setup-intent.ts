import { readBrowserValue, writeBrowserValue } from '../browser-storage';

const COMFY_QUEUE_INTENT_KEY = 'comfy-queue-intent-v1';

export const COMFY_QUEUE_INTENT_EVENT = 'prompt-studio:queue-intent';

export function markComfyQueueIntent(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(COMFY_QUEUE_INTENT_KEY, true);
  window.dispatchEvent(new Event(COMFY_QUEUE_INTENT_EVENT));
}

export function hasComfyQueueIntent(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return readBrowserValue<boolean>(COMFY_QUEUE_INTENT_KEY) === true;
}
