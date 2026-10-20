/** Desktop Tauri shell — set at spawn (`PROMPT_DESKTOP`) and desktop Next builds. */

export const DESKTOP_SHELL_ENV = 'PROMPT_DESKTOP';
export const DESKTOP_SHELL_PUBLIC_ENV = 'NEXT_PUBLIC_PROMPT_DESKTOP';

function flagEnabled(value: string | undefined | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function isDesktopShellServer(): boolean {
  return flagEnabled(process.env[DESKTOP_SHELL_ENV]);
}

export function isDesktopShellClient(): boolean {
  return flagEnabled(process.env[DESKTOP_SHELL_PUBLIC_ENV]);
}
