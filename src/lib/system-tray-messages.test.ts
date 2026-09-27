import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let toastPreference: string | null = null;
mock.module('./browser-storage', {
  namedExports: {
    readBrowserString: () => toastPreference,
    writeBrowserString: (_key: string, value: string) => {
      toastPreference = value;
    },
  },
});

type FakeWindow = {
  dispatchEvent: (event: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  events: { type: string; detail: unknown }[];
  timers: { fn: () => void; ms: number }[];
};

function installWindow(): FakeWindow {
  const events: { type: string; detail: unknown }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const fakeWindow: FakeWindow = {
    events,
    timers,
    dispatchEvent: (event: unknown) => {
      const e = event as { type: string; detail: unknown };
      events.push({ type: e.type, detail: e.detail });
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  return fakeWindow;
}

describe('system tray messages (the one notice store)', async () => {
  const {
    SYSTEM_TRAY_MESSAGES_EVENT,
    clearSystemTrayMessages,
    dismissSystemTrayMessage,
    getSystemTrayMessages,
    getSystemTrayMessagesSnapshot,
    pushSystemTrayMessage,
    subscribeSystemTrayMessages,
  } = await import('./system-tray-messages');

  afterEach(() => {
    clearSystemTrayMessages();
    toastPreference = null;
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns null without a window, for blank text, or when notices are muted', () => {
    assert.equal(pushSystemTrayMessage({ text: 'hi' }), null);
    installWindow();
    assert.equal(pushSystemTrayMessage({ text: '   ' }), null);
    toastPreference = '0';
    assert.equal(pushSystemTrayMessage({ text: 'hello' }), null);
  });

  it('pushes newest first, keeps four, and emits the window event', () => {
    const win = installWindow();
    for (const text of ['one', 'two', 'three', 'four', 'five']) {
      pushSystemTrayMessage({ text });
    }
    assert.deepEqual(
      getSystemTrayMessages().map(message => message.text),
      ['five', 'four', 'three', 'two']
    );
    assert.equal(win.events[0]!.type, SYSTEM_TRAY_MESSAGES_EVENT);
  });

  it('fades after the TTL, and a 0 TTL is sticky', () => {
    const win = installWindow();
    pushSystemTrayMessage({ text: 'fades' });
    assert.equal(win.timers[0]!.ms, 6500);
    pushSystemTrayMessage({ text: 'stays', tone: 'danger', ttlMs: 0 });
    assert.equal(win.timers.length, 1);
    assert.equal(getSystemTrayMessages()[0]!.sticky, true);
    win.timers[0]!.fn();
    assert.deepEqual(
      getSystemTrayMessages().map(message => message.text),
      ['stays']
    );
  });

  it('replaces a repeat of the same notice instead of stacking it', () => {
    installWindow();
    pushSystemTrayMessage({ text: 'Queue failed', tone: 'danger', ttlMs: 0 });
    const second = pushSystemTrayMessage({ text: 'Queue failed', tone: 'danger', ttlMs: 0 });
    assert.equal(getSystemTrayMessages().length, 1);
    assert.equal(getSystemTrayMessages()[0]!.id, second);
  });

  it('gives useSyncExternalStore a stable snapshot and notifies subscribers', () => {
    installWindow();
    let calls = 0;
    const unsubscribe = subscribeSystemTrayMessages(() => {
      calls += 1;
    });
    const empty = getSystemTrayMessagesSnapshot();
    assert.equal(getSystemTrayMessagesSnapshot(), empty);
    const id = pushSystemTrayMessage({ text: 'x', ttlMs: 0 })!;
    const after = getSystemTrayMessagesSnapshot();
    assert.notEqual(after, empty);
    assert.equal(getSystemTrayMessagesSnapshot(), after);
    dismissSystemTrayMessage('missing');
    assert.equal(calls, 1);
    dismissSystemTrayMessage(id);
    assert.equal(calls, 2);
    unsubscribe();
    pushSystemTrayMessage({ text: 'y' });
    assert.equal(calls, 2);
  });
});
