import type { ComfyGalleryEntry } from './comfyui-gallery';
import { galleryEntryPrimaryViewUrl } from './comfyui-gallery';
import { isGalleryEntryHidden } from './gallery-adult-check';

export function isComfyNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestComfyNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isComfyNotificationSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
}

export function notifyComfyJobComplete(entry: ComfyGalleryEntry): void {
  if (!isComfyNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  // A still the adult-appearance gate holds or withheld never shows as the icon.
  const preview = isGalleryEntryHidden(entry) ? null : galleryEntryPrimaryViewUrl(entry);
  const body = entry.prompt.length > 140 ? `${entry.prompt.slice(0, 140)}…` : entry.prompt;

  try {
    const notification = new Notification('ComfyUI job completed', {
      body,
      icon: preview ?? undefined,
      tag: entry.promptId,
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = '/gallery';
    };
  } catch {
    // ignore notification failures
  }
}
