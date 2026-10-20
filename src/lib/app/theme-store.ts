import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

/** Stored preference: Auto follows the OS; Light/Dark override it. */
export type AppTheme = 'auto' | 'light' | 'dark';
export type ResolvedAppTheme = 'light' | 'dark';

const KEY = 'comfy-app-theme-v1';
export const APP_THEME_CHANGED_EVENT = 'comfy-app-theme-changed';

let systemListenerCleanup: (() => void) | null = null;

function emitThemeChanged(theme: AppTheme): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(APP_THEME_CHANGED_EVENT, { detail: { theme } }));
}

export function parseAppTheme(raw: string | null | undefined): AppTheme {
  if (!raw) {
    return 'auto';
  }
  const value = raw.replace(/^"|"$/g, '');
  if (value === 'light' || value === 'dark' || value === 'auto') {
    return value;
  }
  return 'auto';
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveAppTheme(
  preference: AppTheme,
  prefersDark: boolean = systemPrefersDark()
): ResolvedAppTheme {
  if (preference === 'light') {
    return 'light';
  }
  if (preference === 'dark') {
    return 'dark';
  }
  return prefersDark ? 'dark' : 'light';
}

export function loadAppTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'auto';
  }
  return parseAppTheme(readBrowserString(KEY));
}

function paintResolvedTheme(resolved: ResolvedAppTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function syncSystemThemeListener(preference: AppTheme): void {
  if (systemListenerCleanup) {
    systemListenerCleanup();
    systemListenerCleanup = null;
  }
  if (typeof window === 'undefined' || preference !== 'auto') {
    return;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    paintResolvedTheme(resolveAppTheme('auto', media.matches));
  };
  media.addEventListener('change', onChange);
  systemListenerCleanup = () => media.removeEventListener('change', onChange);
}

export function applyAppTheme(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const preference = loadAppTheme();
  paintResolvedTheme(resolveAppTheme(preference));
  syncSystemThemeListener(preference);
}

export function saveAppTheme(theme: AppTheme): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserString(KEY, theme);
  applyAppTheme();
  emitThemeChanged(theme);
}

/** Keep Auto mode in sync with OS changes; call from a client mount effect. */
export function subscribeSystemTheme(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  applyAppTheme();
  return () => {
    if (systemListenerCleanup) {
      systemListenerCleanup();
      systemListenerCleanup = null;
    }
  };
}
