import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const store = new Map<string, unknown>();
const readBrowserValue = mock.fn(<T>(key: string): T | null => (store.get(key) as T) ?? null);
const writeBrowserValue = mock.fn((key: string, value: unknown) => {
  store.set(key, value);
});
mock.module("../browser-storage", { namedExports: { readBrowserValue, writeBrowserValue } });

describe("comfy-setup-intent", async () => {
  const { markComfyQueueIntent, hasComfyQueueIntent, COMFY_QUEUE_INTENT_EVENT } = await import(
    "./comfy-setup-intent"
  );

  it("does nothing and returns false with no window", () => {
    // @ts-expect-error ensure no window is present
    delete globalThis.window;
    const before = writeBrowserValue.mock.calls.length;
    markComfyQueueIntent();
    assert.equal(writeBrowserValue.mock.calls.length, before);
    assert.equal(hasComfyQueueIntent(), false);
  });

  it("stores the intent flag and dispatches the intent event when a window is present", () => {
    const dispatched: string[] = [];
    const fakeWindow = {
      dispatchEvent: (event: { type: string }) => {
        dispatched.push(event.type);
        return true;
      },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    // @ts-expect-error minimal Event stub for a Node test environment
    globalThis.Event = class Event {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };

    markComfyQueueIntent();

    assert.deepEqual(dispatched, [COMFY_QUEUE_INTENT_EVENT]);
    assert.equal(hasComfyQueueIntent(), true);

    // @ts-expect-error test cleanup
    delete globalThis.window;
  });
});
