import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let toastPreferenceEnabled = true;
const loadToastPreferenceEnabled = mock.fn(() => toastPreferenceEnabled);
const rememberToastPreference = mock.fn((_enabled: boolean) => {});
const pushSystemTrayMessage = mock.fn((input: Record<string, unknown>) => `tray-${String(input.text)}`);
mock.module('./system-tray-messages', {
  namedExports: { loadToastPreferenceEnabled, rememberToastPreference, pushSystemTrayMessage },
});

afterEach(() => {
  toastPreferenceEnabled = true;
  loadToastPreferenceEnabled.mock.resetCalls();
  rememberToastPreference.mock.resetCalls();
  pushSystemTrayMessage.mock.resetCalls();
});

describe('app-toast', async () => {
  const {
    pushAppToast,
    toastBulkQueueSummary,
    toastHeldMax,
    toastQueueOutcome,
  } = await import('./app-toast');

  describe('pushAppToast', () => {
    it('is a notice in the tray store, with the same fields', () => {
      pushAppToast({ text: 'Saved!', tone: 'success', href: '/gallery', ttlMs: 1000 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.deepEqual(call, { text: 'Saved!', tone: 'success', href: '/gallery', ttlMs: 1000 });
    });
  });

  describe('toastQueueOutcome', () => {
    it('uses success tone, /gallery href, and a 5000ms ttl on success', () => {
      toastQueueOutcome({ ok: true, text: 'Queued 3 jobs' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'success');
      assert.equal(call.href, '/gallery');
      assert.equal(call.ttlMs, 5000);
    });

    it('uses danger tone, /queue href, and stays until dismissed on failure', () => {
      toastQueueOutcome({ ok: false, text: 'Queue failed' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'danger');
      assert.equal(call.href, '/queue');
      assert.equal(call.ttlMs, 0);
    });

    it('uses the given href/ttlMs/actionLabel/actionEvent when provided', () => {
      toastQueueOutcome({
        ok: true,
        text: 'Done',
        href: '/custom',
        ttlMs: 1234,
        actionLabel: 'Undo',
        actionEvent: 'undo-event',
      });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.href, '/custom');
      assert.equal(call.ttlMs, 1234);
      assert.equal(call.actionLabel, 'Undo');
      assert.equal(call.actionEvent, 'undo-event');
    });
  });

  describe('toastHeldMax', () => {
    it('uses warning tone, /queue href, and a 14000ms ttl', () => {
      toastHeldMax({ text: 'Jobs held' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'warning');
      assert.equal(call.href, '/queue');
      assert.equal(call.ttlMs, 14_000);
      assert.equal(call.text, 'Jobs held');
    });

    it('appends a count in parentheses when count > 1', () => {
      toastHeldMax({ text: 'Jobs held', count: 3 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.text, 'Jobs held (3)');
    });

    it('does not append a count when count is 1 or absent', () => {
      toastHeldMax({ text: 'Jobs held', count: 1 });
      assert.equal(
        (pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>).text,
        'Jobs held'
      );
    });
  });

  describe('toastBulkQueueSummary', () => {
    it('routes to a failure-toned outcome when there are failures', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 2, failed: 1 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'danger');
      assert.match(call.text as string, /Batch · 2 queued · 1 failed/);
    });

    it('routes to a warning-toned message when nothing was queued and nothing failed', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 0, failed: 0 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'warning');
      assert.equal(call.href, '/gallery');
    });

    it('routes to a success-toned outcome when items were queued with no failures', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 5, failed: 0 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'success');
    });

    it('includes the skipped count in the text when given', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 3, failed: 0, skipped: 2 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.text, 'Batch · 3 queued · 2 skipped · 0 failed');
    });
  });
});
