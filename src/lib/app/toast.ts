import {
  loadToastPreferenceEnabled,
  pushSystemTrayMessage,
  rememberToastPreference,
  type SystemTrayMessageTone,
} from './system-tray-messages';

export { loadToastPreferenceEnabled, rememberToastPreference };

/**
 * Convenience wrappers over the tray's notice store (`system-tray-messages.ts`). This file used
 * to keep its own parallel toast list, and the tray stacked both.
 */
export type AppToastTone = SystemTrayMessageTone;

/** A plain notice in the system tray (fades after `ttlMs`; 0 = stays until dismissed). */
export function pushAppToast(input: {
  text: string;
  tone?: AppToastTone;
  href?: string;
  ttlMs?: number;
}): string | null {
  return pushSystemTrayMessage(input);
}

/** Convenience for Comfy queue / requeue outcomes — shown in the system tray. */
export function toastQueueOutcome(input: {
  ok: boolean;
  text: string;
  href?: string;
  actionLabel?: string;
  actionEvent?: string;
  ttlMs?: number;
}): string | null {
  return pushSystemTrayMessage({
    text: input.text,
    tone: input.ok ? 'success' : 'danger',
    href: input.href ?? (input.ok ? '/gallery' : '/queue'),
    actionLabel: input.actionLabel,
    actionEvent: input.actionEvent,
    // Failures stay until dismissed — a 9s fade hid the Retry button before people saw it.
    ttlMs: input.ttlMs ?? (input.ok ? 5000 : 0),
  });
}

/** Sticky warning when Max jobs are parked until ComfyUI is idle. */
export function toastHeldMax(input: { text: string; count?: number }): string | null {
  const countNote = typeof input.count === 'number' && input.count > 1 ? ` (${input.count})` : '';
  return pushSystemTrayMessage({
    text: `${input.text.trim()}${countNote}`,
    tone: 'warning',
    href: '/queue',
    ttlMs: 14_000,
  });
}

/** One summary message for bulk gallery/queue ops (avoids per-item noise). */
export function toastBulkQueueSummary(input: {
  label: string;
  queued: number;
  failed: number;
  skipped?: number;
}): string | null {
  const skippedPart = typeof input.skipped === 'number' ? ` · ${input.skipped} skipped` : '';
  const text = `${input.label} · ${input.queued} queued${skippedPart} · ${input.failed} failed`;
  if (input.failed > 0) {
    return toastQueueOutcome({ ok: false, text, href: '/queue' });
  }
  if (input.queued === 0) {
    return pushSystemTrayMessage({
      text,
      tone: 'warning',
      href: '/gallery',
      ttlMs: 7000,
    });
  }
  return toastQueueOutcome({ ok: true, text, href: '/queue' });
}
