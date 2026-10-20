import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  __resetSystemTrayCelebrateForTests,
  celebrateSystemTray,
  SYSTEM_TRAY_CELEBRATE_EVENT,
} from './system-tray-celebrate';

function withMockWindow(run: (win: Window) => void): void {
  const listeners = new Map<string, Set<EventListener>>();
  const originalWindow = globalThis.window;
  const mockWindow = {
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type);
      if (!set) {
        return true;
      }
      for (const listener of set) {
        listener(event);
      }
      return true;
    },
  } as unknown as Window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: mockWindow,
  });
  try {
    run(mockWindow);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
  }
}

describe('system-tray-celebrate', () => {
  afterEach(() => {
    __resetSystemTrayCelebrateForTests();
  });

  it('dispatches a window event', () => {
    withMockWindow(win => {
      const events: string[] = [];
      const onCelebrate = () => {
        events.push('hit');
      };
      win.addEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
      celebrateSystemTray('job');
      assert.equal(events.length, 1);
      win.removeEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
    });
  });

  it('debounces rapid duplicate celebrates', () => {
    withMockWindow(win => {
      const events: string[] = [];
      const onCelebrate = () => {
        events.push('hit');
      };
      win.addEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
      celebrateSystemTray('job');
      celebrateSystemTray('download');
      assert.equal(events.length, 1);
      win.removeEventListener(SYSTEM_TRAY_CELEBRATE_EVENT, onCelebrate);
    });
  });
});
