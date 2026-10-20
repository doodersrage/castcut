import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type AppNotification = {
  id: string;
  at: number;
  title: string;
  body?: string;
  href?: string;
  read: boolean;
  kind: 'job' | 'webhook' | 'system';
};

const KEY = 'comfy-notification-center-v1';
const MAX = 50;
export const NOTIFICATIONS_UPDATED = 'notifications-updated';

export function loadNotifications(): AppNotification[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return readBrowserValue<AppNotification[]>(KEY) ?? [];
}

function saveNotifications(entries: AppNotification[]): void {
  writeBrowserValue(KEY, entries.slice(0, MAX));
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED));
}

export function pushNotification(input: Omit<AppNotification, 'id' | 'at' | 'read'>): void {
  const entry: AppNotification = {
    ...input,
    id: crypto.randomUUID(),
    at: Date.now(),
    read: false,
  };
  saveNotifications([entry, ...loadNotifications()]);
  void import('./system-tray-messages').then(({ pushSystemTrayMessage }) => {
    pushSystemTrayMessage({
      text: input.body ? `${input.title} — ${input.body}` : input.title,
      tone: input.kind === 'job' ? 'info' : input.kind === 'webhook' ? 'success' : 'neutral',
      href: input.href,
    });
  });
}

export function markNotificationRead(id: string): void {
  saveNotifications(
    loadNotifications().map(entry => (entry.id === id ? { ...entry, read: true } : entry))
  );
}

export function markAllNotificationsRead(): void {
  saveNotifications(loadNotifications().map(entry => ({ ...entry, read: true })));
}

export function unreadNotificationCount(): number {
  return loadNotifications().filter(entry => !entry.read).length;
}
