import { readBrowserString, writeBrowserString } from './browser-storage';

/**
 * The one store for transient notices in the system tray. `app-toast.ts` is a set of
 * convenience wrappers over it — there used to be a second, parallel toast store and the tray
 * stacked both lists. The persistent inbox (`notification-center.ts`) also surfaces here.
 *
 * React reads it with `useSyncExternalStore(subscribeSystemTrayMessages,
 * getSystemTrayMessagesSnapshot, …)`; the window event stays for non-React listeners.
 */

export type SystemTrayMessageTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type SystemTrayMessage = {
  id: string;
  text: string;
  tone: SystemTrayMessageTone;
  href?: string;
  /** Secondary CTA label (e.g. Retry). */
  actionLabel?: string;
  /** CustomEvent / window name dispatched on action click. */
  actionEvent?: string;
  /** No auto-dismiss — stays until the user closes it (failures). */
  sticky?: boolean;
  at: number;
};

export const SYSTEM_TRAY_MESSAGES_EVENT = 'system-tray-messages';

const MAX_VISIBLE = 4;
const DEFAULT_TTL_MS = 6500;
const EMPTY: readonly SystemTrayMessage[] = Object.freeze([]);

let messages: readonly SystemTrayMessage[] = EMPTY;
const listeners = new Set<() => void>();

/** A copy, newest first. */
export function getSystemTrayMessages(): SystemTrayMessage[] {
  return [...messages];
}

/** Stable reference until the list changes — for `useSyncExternalStore`. */
export function getSystemTrayMessagesSnapshot(): readonly SystemTrayMessage[] {
  return messages;
}

export function getSystemTrayMessagesServerSnapshot(): readonly SystemTrayMessage[] {
  return EMPTY;
}

export function subscribeSystemTrayMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setMessages(next: readonly SystemTrayMessage[]): void {
  messages = next.length === 0 ? EMPTY : next;
  for (const listener of listeners) {
    listener();
  }
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(SYSTEM_TRAY_MESSAGES_EVENT, { detail: getSystemTrayMessages() })
  );
}

export function pushSystemTrayMessage(input: {
  text: string;
  tone?: SystemTrayMessageTone;
  href?: string;
  actionLabel?: string;
  actionEvent?: string;
  /** 0 = sticky until dismissed. */
  ttlMs?: number;
}): string | null {
  const text = input.text.trim();
  if (!text || typeof window === 'undefined') {
    return null;
  }
  if (!loadToastPreferenceEnabled()) {
    return null;
  }
  const tone = input.tone ?? 'neutral';
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  const id = crypto.randomUUID();
  const entry: SystemTrayMessage = {
    id,
    text,
    tone,
    href: input.href,
    ...(input.actionLabel?.trim() && input.actionEvent?.trim()
      ? { actionLabel: input.actionLabel.trim(), actionEvent: input.actionEvent.trim() }
      : {}),
    ...(ttl <= 0 ? { sticky: true } : {}),
    at: Date.now(),
  };
  // The same notice again (a retry loop failing the same way) replaces the old one.
  const rest = messages.filter(message => message.text !== text || message.tone !== tone);
  setMessages([entry, ...rest].slice(0, MAX_VISIBLE));
  if (ttl > 0) {
    window.setTimeout(() => {
      dismissSystemTrayMessage(id);
    }, ttl);
  }
  return id;
}

export function dismissSystemTrayMessage(id: string): void {
  const next = messages.filter(message => message.id !== id);
  if (next.length !== messages.length) {
    setMessages(next);
  }
}

export function clearSystemTrayMessages(): void {
  if (messages.length === 0) {
    return;
  }
  setMessages(EMPTY);
}

export function rememberToastPreference(enabled: boolean): void {
  writeBrowserString('comfy-app-toast-enabled-v1', enabled ? '1' : '0');
}

export function loadToastPreferenceEnabled(): boolean {
  const value = readBrowserString('comfy-app-toast-enabled-v1');
  return value !== '0';
}
