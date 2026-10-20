import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

// notification-center.ts's pushNotification() also fires a fire-and-forget
// `void import('./system-tray-messages').then(...)` toast. We can't
// intercept that dynamic import's own `../storage/browser-storage` usage separately
// from notification-center's static import of the same module (Node's
// mock.module intercepts by resolved specifier, not by importer), so our
// browser-storage mock below also supplies the readBrowserString stub that
// system-tray-messages.ts's loadToastPreferenceEnabled() needs, to keep
// that side effect from throwing. window.setTimeout is stubbed as a no-op
// so the toast's auto-dismiss timer never actually schedules a real timer.
type Store = Record<string, unknown>;
let store: Store = {};
const readBrowserValue = mock.fn(<T,>(key: string) => (key in store ? (store[key] as T) : undefined));
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  store[key] = value;
});
const readBrowserString = mock.fn((_key: string) => null as string | null);
const writeBrowserString = mock.fn((_key: string, _value: string) => {});
mock.module('../storage/browser-storage', {
  namedExports: { readBrowserValue, writeBrowserValue, readBrowserString, writeBrowserString },
});

describe('notification-center', async () => {
  const {
    NOTIFICATIONS_UPDATED,
    loadNotifications,
    pushNotification,
    markNotificationRead,
    markAllNotificationsRead,
    unreadNotificationCount,
  } = await import('./notification-center');

  const events: Event[] = [];
  const onEvent = (event: Event) => events.push(event);
  let fakeWindow: EventTarget & { setTimeout: (...args: unknown[]) => number };

  beforeEach(() => {
    store = {};
    readBrowserValue.mock.resetCalls();
    writeBrowserValue.mock.resetCalls();
    events.length = 0;
    fakeWindow = Object.assign(new EventTarget(), { setTimeout: () => 0 });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    fakeWindow.addEventListener(NOTIFICATIONS_UPDATED, onEvent);
  });

  afterEach(() => {
    fakeWindow.removeEventListener(NOTIFICATIONS_UPDATED, onEvent);
    delete (globalThis as { window?: unknown }).window;
  });

  it('loadNotifications returns an empty array when nothing is stored', () => {
    assert.deepEqual(loadNotifications(), []);
  });

  it('pushNotification prepends a new entry with generated id/at/read fields and dispatches the update event', () => {
    pushNotification({ title: 'Job done', body: 'render finished', kind: 'job' });
    const all = loadNotifications();
    assert.equal(all.length, 1);
    assert.equal(all[0]!.title, 'Job done');
    assert.equal(all[0]!.body, 'render finished');
    assert.equal(all[0]!.kind, 'job');
    assert.equal(all[0]!.read, false);
    assert.ok(all[0]!.id.length > 0);
    assert.ok(typeof all[0]!.at === 'number');
    assert.equal(events.length, 1);
  });

  it('pushNotification keeps only the most recent 50 entries', () => {
    for (let i = 0; i < 55; i += 1) {
      pushNotification({ title: `note-${i}`, kind: 'system' });
    }
    const all = loadNotifications();
    assert.equal(all.length, 50);
    assert.equal(all[0]!.title, 'note-54');
  });

  it('markNotificationRead flips read on the matching entry only', () => {
    pushNotification({ title: 'a', kind: 'system' });
    pushNotification({ title: 'b', kind: 'system' });
    const [second, first] = loadNotifications();
    markNotificationRead(first!.id);
    const after = loadNotifications();
    assert.equal(after.find(entry => entry.id === first!.id)!.read, true);
    assert.equal(after.find(entry => entry.id === second!.id)!.read, false);
  });

  it('markAllNotificationsRead flips read on every entry', () => {
    pushNotification({ title: 'a', kind: 'system' });
    pushNotification({ title: 'b', kind: 'webhook' });
    markAllNotificationsRead();
    assert.ok(loadNotifications().every(entry => entry.read));
  });

  it('unreadNotificationCount counts only unread entries', () => {
    pushNotification({ title: 'a', kind: 'system' });
    pushNotification({ title: 'b', kind: 'system' });
    const [, first] = loadNotifications();
    markNotificationRead(first!.id);
    assert.equal(unreadNotificationCount(), 1);
  });

  it('unreadNotificationCount is 0 when there are no notifications', () => {
    assert.equal(unreadNotificationCount(), 0);
  });
});
