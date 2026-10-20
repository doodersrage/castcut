import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

export type AmbientIntensity = 'off' | 'subtle' | 'normal' | 'vivid';

const KEY = 'comfy-ambient-intensity-v1';

export function loadAmbientIntensity(): AmbientIntensity {
  if (typeof window === 'undefined') {
    return 'subtle';
  }
  const value = readBrowserString(KEY);
  if (value === 'off' || value === 'subtle' || value === 'normal' || value === 'vivid') {
    return value;
  }
  return 'subtle';
}

export function saveAmbientIntensity(value: AmbientIntensity): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserString(KEY, value);
  document.documentElement.dataset.ambient = value;
}

export function applyAmbientIntensity(): void {
  if (typeof window === 'undefined') {
    return;
  }
  document.documentElement.dataset.ambient = loadAmbientIntensity();
}
