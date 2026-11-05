/**
 * A desktop notification when a long job finishes (2026-11-05): a clip tool or Make it 30 s runs
 * 15–30 minutes, and the in-app alert waits unseen in another tab. The same switch and permission
 * as a finished render's (Settings → ComfyUI → "Notify when ComfyUI jobs complete",
 * comfyui/notifications.ts).
 */

import { loadComfyUiSettings } from '../comfyui/settings';

/** Show it when the switch is on and the browser allows it; a click brings Castcut back. */
export function notifyDesktop(input: { title: string; body?: string; href?: string }): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!loadComfyUiSettings().notifyOnComplete) return;
  try {
    const shown = new Notification(input.title, {
      body: input.body,
      tag: `castcut-${input.title}`,
    });
    shown.onclick = () => {
      window.focus();
      if (input.href && window.location.pathname !== input.href.split('?')[0]) {
        // Plain lib code with no router; a system-notification click may land on any page.
        window.location.href = input.href;
      }
      shown.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker: the in-app alert stays.
  }
}
