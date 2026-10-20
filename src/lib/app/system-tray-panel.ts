/**
 * Header / sidebar jobs chips open the SystemTray's jobs panel. On desktop the tray shows no
 * floating card until asked (it covered page content in every corner, UI review 2026-10-15).
 */
export const SYSTEM_TRAY_PANEL_EVENT = 'castcut:system-tray-panel';

export type SystemTrayPanelAnchor = 'top' | 'bottom';

export function openSystemTrayPanel(anchor: SystemTrayPanelAnchor): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYSTEM_TRAY_PANEL_EVENT, { detail: { anchor } }));
}
