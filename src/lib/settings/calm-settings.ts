import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

const KEY = 'comfy-calm-ui-v1';

export function loadCalmUi(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return readBrowserString(KEY) === '1' || readBrowserString(KEY) === 'true';
}

export function saveCalmUi(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserString(KEY, enabled ? '1' : '0');
  document.documentElement.dataset.calm = enabled ? 'true' : 'false';
}

export function applyCalmUi(): void {
  if (typeof window === 'undefined') {
    return;
  }
  document.documentElement.dataset.calm = loadCalmUi() ? 'true' : 'false';
}
