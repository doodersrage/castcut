import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

mock.module("server-only", { defaultExport: {}, namedExports: {} });

const getComfyUiBaseUrl = mock.fn((_runtime?: unknown) => "http://mock-comfy:8188");
mock.module("./comfyui-client", { namedExports: { getComfyUiBaseUrl } });

const stripEmptyComfyUiRuntime = mock.fn((runtime?: { apiUrl?: string }) => runtime);
mock.module("./comfyui-config", { namedExports: { stripEmptyComfyUiRuntime } });

const parseComfyPreviewBinary = mock.fn(
  (
    _data: ArrayBuffer | ArrayBufferView
  ): { mimeType: "image/jpeg" | "image/png"; bytes: Uint8Array; promptId?: string } | null => null
);
mock.module("./comfyui-preview-binary", { namedExports: { parseComfyPreviewBinary } });

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  url: string;
  sent: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  emit(type: string, event: unknown) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
}

// @ts-expect-error test stub
globalThis.WebSocket = FakeWebSocket;

describe("comfyui-live-bridge", async () => {
  const { subscribeComfyLiveBridge } = await import("./comfyui-live-bridge");

  it("throws for a blank clientId", () => {
    assert.throws(
      () => subscribeComfyLiveBridge({ clientId: "  ", onEvent: () => {} }),
      /clientId is required/
    );
  });

  it("opens a websocket to the resolved comfy host and publishes a ready event on open", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({
      clientId: "client-a",
      onEvent: e => events.push(e),
    });
    const socket = FakeWebSocket.instances.at(-1)!;
    assert.equal(socket.url, "ws://mock-comfy:8188/ws?clientId=client-a");

    socket.open();
    assert.deepEqual(events, [{ type: "ready", comfyUrl: "http://mock-comfy:8188", clientId: "client-a" }]);
    assert.equal(socket.sent.length, 1);
    assert.match(socket.sent[0]!, /"type":"feature_flags"/);

    handle.close();
  });

  it("reuses the existing session for the same clientId while the socket is open", () => {
    const events1: unknown[] = [];
    const handle1 = subscribeComfyLiveBridge({ clientId: "client-b", onEvent: e => events1.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    const instancesBefore = FakeWebSocket.instances.length;

    const events2: unknown[] = [];
    const handle2 = subscribeComfyLiveBridge({ clientId: "client-b", onEvent: e => events2.push(e) });
    assert.equal(FakeWebSocket.instances.length, instancesBefore); // no new socket created
    // Already-ready session immediately replays a ready event to the new subscriber.
    assert.deepEqual(events2, [{ type: "ready", comfyUrl: "http://mock-comfy:8188", clientId: "client-b" }]);

    handle1.close();
    handle2.close();
  });

  it("opens a new socket after the previous session's socket has fully closed", () => {
    const handle1 = subscribeComfyLiveBridge({ clientId: "client-c", onEvent: () => {} });
    const socket1 = FakeWebSocket.instances.at(-1)!;
    socket1.open();
    handle1.close(); // drops the only subscriber -> session removed, socket closed

    const instancesBefore = FakeWebSocket.instances.length;
    const handle2 = subscribeComfyLiveBridge({ clientId: "client-c", onEvent: () => {} });
    assert.equal(FakeWebSocket.instances.length, instancesBefore + 1);
    handle2.close();
  });

  it("parses a fast-path 'progress' text frame into a progress event", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-d", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("message", {
      data: '{"type":"progress","data":{"value":3,"max":10,"node":"KSampler"}}',
    });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      type: "progress",
      status: "progress",
      promptId: undefined,
      node: "KSampler",
      value: 3,
      max: 10,
      message: "Step 3/10 (30%) · node KSampler",
    });
    handle.close();
  });

  it("parses a fast-path 'executing' frame with a node as 'executing', and without one as 'finished'", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-e", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("message", { data: '{"type":"executing","data":{"node":"KSampler"}}' });
    socket.emit("message", { data: '{"type":"executing","data":{"node":null}}' });

    assert.equal((events[0] as { status: string }).status, "executing");
    assert.equal((events[1] as { status: string }).status, "finished");
    handle.close();
  });

  it("parses a fast-path 'execution_error' frame into an error-status progress event", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-f", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("message", {
      data: '{"type":"execution_error","data":{"exception_message":"boom"}}',
    });

    assert.deepEqual(events[0], {
      type: "progress",
      status: "error",
      promptId: undefined,
      message: "ComfyUI error: boom",
    });
    handle.close();
  });

  it("says how many steps ComfyUI reused from its cache ('execution_cached')", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-cache", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;
    socket.emit("message", {
      data: JSON.stringify({ type: "execution_cached", data: { prompt_id: "pc", nodes: ["1", "2", "3"] } }),
    });
    socket.emit("message", {
      data: JSON.stringify({
        type: "progress_state",
        data: { prompt_id: "pc", nodes: { "8": { state: "running", value: 2, max: 8, real_node_id: "8" } } },
      }),
    });
    assert.equal(events.length, 1);
    assert.equal((events[0] as { message: string }).message, "Step 2/8 (25%) · node 8 · 3 steps reused");
    handle.close();
  });

  it("falls through to the full JSON parser for a 'progress_state' frame", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-g", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("message", {
      data: JSON.stringify({
        type: "progress_state",
        data: {
          prompt_id: "p1",
          nodes: {
            "1": { state: "pending" },
            "2": { state: "running", value: 4, max: 8, real_node_id: "2" },
          },
        },
      }),
    });

    assert.deepEqual(events[0], {
      type: "progress",
      status: "progress",
      promptId: "p1",
      node: "2",
      value: 4,
      max: 8,
      message: "Step 4/8 (50%) · node 2",
    });
    handle.close();
  });

  it("ignores an unparseable text frame instead of throwing", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-h", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    assert.doesNotThrow(() => socket.emit("message", { data: "not json at all, no braces" }));
    assert.equal(events.length, 0);
    handle.close();
  });

  it("parses a binary frame into a preview event via parseComfyPreviewBinary", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-i", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    parseComfyPreviewBinary.mock.mockImplementationOnce(() => ({
      mimeType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
      promptId: "p9",
    }));
    socket.emit("message", { data: new ArrayBuffer(16) });

    assert.equal(events.length, 1);
    const event = events[0] as { type: string; mimeType: string; promptId?: string };
    assert.equal(event.type, "preview");
    assert.equal(event.mimeType, "image/jpeg");
    assert.equal(event.promptId, "p9");
    handle.close();
  });

  it("publishes an error event when the socket errors", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-j", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("error", {});
    assert.deepEqual(events[0], {
      type: "error",
      message: "ComfyUI WebSocket error (http://mock-comfy:8188)",
    });
    handle.close();
  });

  it("publishes a closed error event when the socket closes while subscribers remain", () => {
    const events: unknown[] = [];
    const handle = subscribeComfyLiveBridge({ clientId: "client-k", onEvent: e => events.push(e) });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    events.length = 0;

    socket.emit("close", {});
    assert.deepEqual(events[0], { type: "error", message: "ComfyUI WebSocket closed" });
    handle.close();
  });

  it("removes the subscriber and closes the socket when the last subscriber disconnects", () => {
    const handle = subscribeComfyLiveBridge({ clientId: "client-l", onEvent: () => {} });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();

    handle.close();
    assert.equal(socket.readyState, FakeWebSocket.CLOSED);
  });
});
