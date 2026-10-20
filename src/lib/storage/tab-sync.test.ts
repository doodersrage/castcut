import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { broadcastTabSync, subscribeTabSync } from "./tab-sync";

// tab-sync.ts's getChannel() caches a single module-level BroadcastChannel
// singleton the first time window/document/BroadcastChannel are all
// available. The real Node BroadcastChannel keeps the event loop alive
// until closed, and this module exposes no way to close its singleton, so
// tests must never construct a real one (it would hang `node --test`
// indefinitely). A minimal fake stands in for BroadcastChannel instead -
// it is plain synchronous JS with no timers/handles, so it can't hang
// anything, and it still lets the wiring (postMessage/addEventListener/
// removeEventListener calls) be asserted directly.
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly name: string;
  readonly posted: unknown[] = [];
  readonly listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
  closed = false;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    this.posted.push(data);
  }

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }
}

describe("tab-sync without a browser (no window/document/BroadcastChannel)", () => {
  it("broadcastTabSync is a silent no-op", () => {
    assert.doesNotThrow(() => broadcastTabSync({ type: "gallery-updated" }));
  });

  it("subscribeTabSync returns a no-op unsubscribe function and never invokes the handler", () => {
    const unsub = subscribeTabSync(() => {
      throw new Error("handler should never fire without a browser channel");
    });
    assert.equal(typeof unsub, "function");
    assert.doesNotThrow(() => unsub());
  });
});

describe("tab-sync wired to a (fake) BroadcastChannel", () => {
  let originalWindow: unknown;
  let originalDocument: unknown;
  let originalBroadcastChannel: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    originalDocument = (globalThis as { document?: unknown }).document;
    originalBroadcastChannel = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    FakeBroadcastChannel.instances.length = 0;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: FakeBroadcastChannel,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: originalBroadcastChannel,
    });
  });

  it("broadcastTabSync posts the message on the channel, and subscribeTabSync wires/unwires a listener", () => {
    broadcastTabSync({ type: "history-updated" });
    // getChannel() lazily creates and caches a single channel with the module's
    // fixed name the first time it's called with a working browser environment.
    assert.equal(FakeBroadcastChannel.instances.length, 1);
    const channel = FakeBroadcastChannel.instances[0]!;
    assert.equal(channel.name, "comfy-prompt-studio-sync-v1");
    assert.deepEqual(channel.posted, [{ type: "history-updated" }]);

    const received: unknown[] = [];
    const unsub = subscribeTabSync(msg => {
      received.push(msg);
    });
    // subscribeTabSync reuses the cached channel rather than creating a new one.
    assert.equal(FakeBroadcastChannel.instances.length, 1);
    assert.equal(channel.listeners.get("message")?.size, 1);

    const [listener] = channel.listeners.get("message")!;
    listener!({ data: { type: "settings-updated" } });
    assert.deepEqual(received, [{ type: "settings-updated" }]);

    // A message event with no `type` on its data is ignored.
    listener!({ data: {} });
    assert.deepEqual(received, [{ type: "settings-updated" }]);

    unsub();
    assert.equal(channel.listeners.get("message")?.size, 0);
  });
});
