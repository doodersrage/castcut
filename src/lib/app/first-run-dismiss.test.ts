import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const removeBrowserKey = mock.fn((_key: string) => {});
const writeBrowserValue = mock.fn((_key: string, _value: unknown) => {});
mock.module("../storage/browser-storage", { namedExports: { removeBrowserKey, writeBrowserValue } });

function installWindowStub() {
  const hadWindow = "window" in globalThis;
  const original = hadWindow ? (globalThis as unknown as { window: unknown }).window : undefined;
  const dispatched: Event[] = [];
  (globalThis as unknown as { window: unknown }).window = {
    dispatchEvent: (event: Event) => {
      dispatched.push(event);
      return true;
    },
  };
  return {
    dispatched,
    restore: () => {
      if (hadWindow) {
        (globalThis as unknown as { window: unknown }).window = original;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).window;
      }
    },
  };
}

describe("first-run-dismiss", async () => {
  const {
    FIRST_QUEUE_SETUP_DISMISS_KEY,
    FIRST_QUEUE_SETUP_RESET_EVENT,
    SETUP_READINESS_DISMISS_KEY,
    dismissSetupReadinessBanner,
    dismissFirstRunSetupSurfaces,
    resetFirstRunSetupSurfaces,
  } = await import("./first-run-dismiss");

  describe("SSR guards (no window)", () => {
    it("every export is a no-op without touching storage", () => {
      assert.equal(typeof window, "undefined");
      writeBrowserValue.mock.resetCalls();
      removeBrowserKey.mock.resetCalls();

      dismissSetupReadinessBanner();
      dismissFirstRunSetupSurfaces();
      resetFirstRunSetupSurfaces();

      assert.equal(writeBrowserValue.mock.calls.length, 0);
      assert.equal(removeBrowserKey.mock.calls.length, 0);
    });
  });

  describe("with a window (browser)", () => {
    it("dismissSetupReadinessBanner writes the readiness dismiss key to true", () => {
      const win = installWindowStub();
      writeBrowserValue.mock.resetCalls();
      dismissSetupReadinessBanner();
      win.restore();

      assert.equal(writeBrowserValue.mock.calls.length, 1);
      assert.deepEqual(writeBrowserValue.mock.calls[0]?.arguments, [SETUP_READINESS_DISMISS_KEY, true]);
    });

    it("dismissFirstRunSetupSurfaces writes both the queue-setup and readiness dismiss keys", () => {
      const win = installWindowStub();
      writeBrowserValue.mock.resetCalls();
      dismissFirstRunSetupSurfaces();
      win.restore();

      assert.deepEqual(writeBrowserValue.mock.calls.map(call => call.arguments), [
        [FIRST_QUEUE_SETUP_DISMISS_KEY, true],
        [SETUP_READINESS_DISMISS_KEY, true],
      ]);
    });

    it("resetFirstRunSetupSurfaces removes both keys and dispatches the reset event", () => {
      const win = installWindowStub();
      removeBrowserKey.mock.resetCalls();
      resetFirstRunSetupSurfaces();
      win.restore();

      assert.deepEqual(removeBrowserKey.mock.calls.map(call => call.arguments[0]), [
        FIRST_QUEUE_SETUP_DISMISS_KEY,
        SETUP_READINESS_DISMISS_KEY,
      ]);
      assert.equal(win.dispatched.length, 1);
      assert.equal(win.dispatched[0]?.type, FIRST_QUEUE_SETUP_RESET_EVENT);
    });
  });
});
