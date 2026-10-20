import { readBrowserString, writeBrowserString } from '../storage/browser-storage';
import { markOnboardingSetDensity } from '../app/onboarding-hooks';

export type UiDensity = 'comfortable' | 'compact';

const KEY = 'comfy-ui-density-v1';

export function loadUiDensity(): UiDensity {
  if (typeof window === 'undefined') {
    return 'comfortable';
  }
  return readBrowserString(KEY) === 'compact' ? 'compact' : 'comfortable';
}

export function saveUiDensity(density: UiDensity): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserString(KEY, density);
  document.documentElement.dataset.density = density;
  if (density === 'compact') {
    markOnboardingSetDensity();
  }
}

export function applyUiDensity(): void {
  if (typeof window === 'undefined') {
    return;
  }
  document.documentElement.dataset.density = loadUiDensity();
}
