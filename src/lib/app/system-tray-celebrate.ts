export type SystemTrayCelebrateKind = 'job' | 'download';

export type SystemTrayCelebrateDetail = {
  kind: SystemTrayCelebrateKind;
  at: number;
};

export const SYSTEM_TRAY_CELEBRATE_EVENT = 'system-tray-celebrate';

let lastAt = 0;

/** Fire a particle burst at the system tray corner. */
export function celebrateSystemTray(kind: SystemTrayCelebrateKind = 'job'): void {
  if (typeof window === 'undefined') {
    return;
  }
  const now = Date.now();
  if (now - lastAt < 400) {
    return;
  }
  lastAt = now;
  window.dispatchEvent(
    new CustomEvent<SystemTrayCelebrateDetail>(SYSTEM_TRAY_CELEBRATE_EVENT, {
      detail: { kind, at: now },
    })
  );
}

export function __resetSystemTrayCelebrateForTests(): void {
  lastAt = 0;
}
