import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const settings = { notifyOnComplete: false };
mock.module('../comfyui/settings', {
  namedExports: { loadComfyUiSettings: () => settings },
});

describe('desktop notifications for long jobs', async () => {
  const shown: string[] = [];
  class FakeNotification {
    static permission = 'default';
    onclick: (() => void) | null = null;
    constructor(title: string) {
      shown.push(title);
    }
    close() {}
  }
  Object.assign(globalThis, { window: { Notification: FakeNotification }, Notification: FakeNotification });
  const { notifyDesktop } = await import('./desktop-notify');

  it('follows the render notifications’ switch and permission', () => {
    notifyDesktop({ title: 'no permission' });
    FakeNotification.permission = 'granted';
    notifyDesktop({ title: 'switch off' });
    settings.notifyOnComplete = true;
    notifyDesktop({ title: 'Restyle is done' });
    assert.deepEqual(shown, ['Restyle is done']);
  });
});
