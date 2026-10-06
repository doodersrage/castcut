import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const setComfyLivePreviewUrl = mock.fn(
  (_promptId: string, _url: string | null, _options?: { alsoKeys?: string[] }) => {}
);
mock.module("./comfyui-live-preview-store", { namedExports: { setComfyLivePreviewUrl } });

type FetchCall = { url: string; init: RequestInit };

function installFetchStub(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  // @ts-expect-error test stub
  globalThis.fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function installWindowStub(extra?: Record<string, unknown>) {
  const hadWindow = "window" in globalThis;
  const original = hadWindow ? (globalThis as unknown as { window: unknown }).window : undefined;
  (globalThis as unknown as { window: unknown }).window = { ...extra };
  return {
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

function ndjsonResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function openNdjsonResponse(): {
  response: Response;
  push: (line: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    response: new Response(stream, { status: 200 }),
    push: (line: string) => controllerRef.enqueue(encoder.encode(`${line}\n`)),
    close: () => controllerRef.close(),
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe("comfyui-websocket", async () => {
  const {
    createComfyUiClientId,
    normalizeComfyUrlForWs,
    subscribeComfyUiWebSocket,
    openComfyPreviewSocketBeforeQueue,
  } = await import("./comfyui-websocket");

  describe("createComfyUiClientId", () => {
    it("returns a non-empty id without dashes and is unique across calls", () => {
      const a = createComfyUiClientId();
      const b = createComfyUiClientId();
      assert.ok(a.length > 0);
      assert.ok(!a.includes("-"));
      assert.notEqual(a, b);
    });
  });

  describe("normalizeComfyUrlForWs", () => {
    it("rewrites localhost to 127.0.0.1 and defaults to http", () => {
      assert.equal(normalizeComfyUrlForWs("localhost:8188"), "http://127.0.0.1:8188");
    });

    it("strips trailing slashes while keeping an explicit scheme", () => {
      assert.equal(normalizeComfyUrlForWs("http://localhost:8188/"), "http://127.0.0.1:8188");
    });

    it("preserves a non-localhost host, scheme, and port", () => {
      assert.equal(normalizeComfyUrlForWs("https://example.com:1234"), "https://example.com:1234");
    });

    it("adds http:// to a bare host with no scheme", () => {
      assert.equal(normalizeComfyUrlForWs("192.168.1.5"), "http://192.168.1.5");
    });

    it("falls back to the raw trimmed string when URL parsing fails", () => {
      assert.equal(normalizeComfyUrlForWs("  not a url ::: garbage  "), "not a url ::: garbage");
    });
  });

  describe("subscribeComfyUiWebSocket (SSR — no window)", () => {
    it("returns an inert stub subscription and never touches fetch", async () => {
      assert.equal(typeof window, "undefined");
      const stub = installFetchStub(() => ndjsonResponse(['{"type":"ready"}']));
      const sub = subscribeComfyUiWebSocket({ clientId: "ssr-1", onProgress: () => {} });
      assert.equal(sub.clientId, "ssr-1");
      await sub.ready;
      assert.equal(stub.calls.length, 0);
      assert.doesNotThrow(() => sub.setPromptId("p1"));
      assert.doesNotThrow(() => sub.close());
      stub.restore();
    });

    it("generates a clientId when none is provided", () => {
      const sub = subscribeComfyUiWebSocket({ onProgress: () => {} });
      assert.ok(sub.clientId.length > 0);
    });
  });

  describe("subscribeComfyUiWebSocket (browser — window defined)", () => {
    it("fetches the live bridge with the expected request shape and resolves ready", async () => {
      const win = installWindowStub();
      const stub = installFetchStub(() => ndjsonResponse(['{"type":"ready"}']));
      const sub = subscribeComfyUiWebSocket({ clientId: "c1", onProgress: () => {} });
      await sub.ready;
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].url, "/api/comfyui/live?clientId=c1");
      assert.equal(stub.calls[0].init.method, "GET");
      assert.equal(stub.calls[0].init.credentials, "same-origin");
      assert.equal(stub.calls[0].init.cache, "no-store");
      assert.equal((stub.calls[0].init.headers as Record<string, string>).Accept, "application/x-ndjson");
      sub.close();
      stub.restore();
      win.restore();
    });

    it("includes a comfyUrl hint in the query string when provided", async () => {
      const win = installWindowStub();
      const stub = installFetchStub(() => ndjsonResponse(['{"type":"ready"}']));
      const sub = subscribeComfyUiWebSocket({
        clientId: "c2",
        comfyUrl: "http://example:8188",
        onProgress: () => {},
      });
      await sub.ready;
      assert.equal(stub.calls[0].url, "/api/comfyui/live?clientId=c2&comfyUrl=http%3A%2F%2Fexample%3A8188");
      sub.close();
      stub.restore();
      win.restore();
    });

    it("shares a single live session and one fetch call across subscribers with the same clientId", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const events1: unknown[] = [];
      const events2: unknown[] = [];
      const sub1 = subscribeComfyUiWebSocket({ clientId: "shared-1", onProgress: e => events1.push(e) });
      const sub2 = subscribeComfyUiWebSocket({ clientId: "shared-1", onProgress: e => events2.push(e) });
      assert.equal(stub.calls.length, 1);

      bridge.push('{"type":"ready"}');
      await sub1.ready;
      await sub2.ready;

      sub1.setPromptId("p-shared");
      bridge.push('{"type":"progress","promptId":"p-shared","value":1,"max":10}');
      await flushMicrotasks();

      assert.equal(events1.length, 1);
      assert.equal(events2.length, 1);
      assert.deepEqual(events1[0], {
        promptId: "p-shared",
        node: undefined,
        status: "progress",
        value: 1,
        max: 10,
        message: undefined,
      });

      sub1.close();
      sub2.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("emits a preview event immediately when the promptId is already known", async () => {
      const win = installWindowStub();
      const base64Png = Buffer.from("hello").toString("base64");
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);
      setComfyLivePreviewUrl.mock.resetCalls();

      const events: import("./comfyui-websocket").ComfyUiWebSocketProgress[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "preview-1",
        promptId: "p-known",
        onProgress: e => events.push(e),
      });
      bridge.push('{"type":"ready"}');
      await sub.ready;

      bridge.push(`{"type":"preview","mimeType":"image/png","base64":"${base64Png}"}`);
      await flushMicrotasks();

      assert.equal(events.length, 1);
      assert.equal(events[0].status, "preview");
      assert.equal(events[0].promptId, "p-known");
      assert.ok(events[0].previewUrl && events[0].previewUrl.length > 0);
      assert.equal(setComfyLivePreviewUrl.mock.calls.length, 1);
      assert.equal(setComfyLivePreviewUrl.mock.calls[0].arguments[0], "p-known");
      assert.deepEqual(setComfyLivePreviewUrl.mock.calls[0].arguments[2], { alsoKeys: ["preview-1"] });

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("buffers a preview event until setPromptId is called, then flushes it", async () => {
      const win = installWindowStub();
      const base64Png = Buffer.from("buffered").toString("base64");
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);
      setComfyLivePreviewUrl.mock.resetCalls();

      const events: unknown[] = [];
      const sub = subscribeComfyUiWebSocket({ clientId: "preview-2", onProgress: e => events.push(e) });
      bridge.push('{"type":"ready"}');
      await sub.ready;

      bridge.push(`{"type":"preview","mimeType":"image/png","base64":"${base64Png}"}`);
      await flushMicrotasks();
      assert.equal(events.length, 0);
      assert.equal(setComfyLivePreviewUrl.mock.calls.length, 0);

      sub.setPromptId("p-late");
      assert.equal(events.length, 1);
      assert.equal((events[0] as { promptId: string }).promptId, "p-late");
      assert.equal(setComfyLivePreviewUrl.mock.calls.length, 1);

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("drops a progress event whose promptId does not match the subscribed promptId", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const events: unknown[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "filter-1",
        promptId: "p-mine",
        onProgress: e => events.push(e),
      });
      bridge.push('{"type":"ready"}');
      await sub.ready;

      bridge.push('{"type":"progress","promptId":"p-other","value":5}');
      await flushMicrotasks();
      assert.equal(events.length, 0);

      bridge.push('{"type":"progress","promptId":"p-mine","value":5}');
      await flushMicrotasks();
      assert.equal(events.length, 1);

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("delivers an error event to onError listeners and still resolves ready", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const errors: string[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "err-1",
        onProgress: () => {},
        onError: message => errors.push(message),
      });
      bridge.push('{"type":"error","message":"kaboom"}');
      await sub.ready;
      assert.deepEqual(errors, ["kaboom"]);

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("uses a default error message when the error event has no message", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const errors: string[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "err-2",
        onProgress: () => {},
        onError: message => errors.push(message),
      });
      bridge.push('{"type":"error"}');
      await sub.ready;
      assert.deepEqual(errors, ["ComfyUI live bridge error"]);

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("tolerates malformed NDJSON lines and still processes valid ones after them", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const events: unknown[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "malformed-1",
        promptId: "p-ok",
        onProgress: e => events.push(e),
      });
      bridge.push('{"type":"ready"}');
      await sub.ready;
      bridge.push("not json at all {{{");
      bridge.push('{"type":"progress","promptId":"p-ok","value":9}');
      await flushMicrotasks();
      assert.equal(events.length, 1);

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });

    it("notifies onError with the server's JSON error detail on a non-ok response", async () => {
      const win = installWindowStub();
      const stub = installFetchStub(() => new Response(JSON.stringify({ error: "bad request" }), { status: 500 }));

      const errors: string[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "http-err-1",
        onProgress: () => {},
        onError: message => errors.push(message),
      });
      await sub.ready;
      assert.deepEqual(errors, ["bad request"]);

      sub.close();
      stub.restore();
      win.restore();
    });

    it("falls back to the generic status message when the error body is not JSON (the text() fallback can't run: the body was already consumed by the failed json() read)", async () => {
      // Verified against the real Response/Body implementation: once response.json() throws on
      // invalid JSON, the body stream is already consumed, so the code's own `catch` fallback to
      // response.text() always rejects with "Body is unusable" and is swallowed by
      // `.catch(() => '')` -- detail ends up '' and the generic "Live bridge failed (status)"
      // message is used instead, even though the raw body text ("server exploded") was never JSON.
      const win = installWindowStub();
      const stub = installFetchStub(() => new Response("server exploded", { status: 502 }));

      const errors: string[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "http-err-2",
        onProgress: () => {},
        onError: message => errors.push(message),
      });
      await sub.ready;
      assert.deepEqual(errors, ["Live bridge failed (502)"]);

      sub.close();
      stub.restore();
      win.restore();
    });

    it("falls back to a generic status message when there is no error detail", async () => {
      const win = installWindowStub();
      const stub = installFetchStub(() => new Response("{}", { status: 503 }));

      const errors: string[] = [];
      const sub = subscribeComfyUiWebSocket({
        clientId: "http-err-3",
        onProgress: () => {},
        onError: message => errors.push(message),
      });
      await sub.ready;
      assert.deepEqual(errors, ["Live bridge failed (503)"]);

      sub.close();
      stub.restore();
      win.restore();
    });

    it("decrements refCount on close and only tears down the shared session once the last subscriber leaves", async () => {
      const win = installWindowStub();
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);

      const sub1 = subscribeComfyUiWebSocket({ clientId: "refcount-1", onProgress: () => {} });
      const sub2 = subscribeComfyUiWebSocket({ clientId: "refcount-1", onProgress: () => {} });
      const sub3 = subscribeComfyUiWebSocket({ clientId: "refcount-1", onProgress: () => {} });
      assert.equal(stub.calls.length, 1);
      const signal = stub.calls[0].init.signal as AbortSignal;

      sub1.close();
      sub1.close(); // idempotent: double-close must not double-decrement
      assert.equal(signal.aborted, false);

      sub2.close();
      assert.equal(signal.aborted, false);

      // A subscriber joining before the last one leaves must still share the session.
      const sub2b = subscribeComfyUiWebSocket({ clientId: "refcount-1", onProgress: () => {} });
      assert.equal(stub.calls.length, 1);

      sub3.close();
      sub2b.close();
      assert.equal(signal.aborted, true);

      bridge.close();
      stub.restore();
      win.restore();
    });

    it("revokes a still-buffered preview URL when the last subscriber closes", async () => {
      const win = installWindowStub();
      const base64Png = Buffer.from("never-flushed").toString("base64");
      const bridge = openNdjsonResponse();
      const stub = installFetchStub(() => bridge.response);
      const revoke = mock.method(URL, "revokeObjectURL");

      const sub = subscribeComfyUiWebSocket({ clientId: "revoke-1", onProgress: () => {} });
      bridge.push('{"type":"ready"}');
      await sub.ready;
      bridge.push(`{"type":"preview","mimeType":"image/png","base64":"${base64Png}"}`);
      await flushMicrotasks();

      sub.close();
      assert.equal(revoke.mock.calls.length, 1);

      bridge.close();
      revoke.mock.restore();
      stub.restore();
      win.restore();
    });

    it("opens a fresh session (and issues a new fetch) once the previous stream for that clientId has finished", async () => {
      const win = installWindowStub();
      const stub = installFetchStub(() => ndjsonResponse(['{"type":"ready"}']));

      const sub1 = subscribeComfyUiWebSocket({ clientId: "reopen-1", onProgress: () => {} });
      await sub1.ready;
      await flushMicrotasks();
      await flushMicrotasks();

      const sub2 = subscribeComfyUiWebSocket({ clientId: "reopen-1", onProgress: () => {} });
      await sub2.ready;
      assert.equal(stub.calls.length, 2);

      sub2.close();
      stub.restore();
      win.restore();
    });
  });

  describe("live stream cap", () => {
    it("holds at most MAX_LIVE_STREAMS streams open and starts a waiting one when a slot frees", async () => {
      const { MAX_LIVE_STREAMS } = await import("./comfyui-websocket");
      const win = installWindowStub();
      // Streams stay open until aborted, like the real bridge.
      const stub = installFetchStub(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const subs = Array.from({ length: MAX_LIVE_STREAMS + 2 }, (_, index) =>
        subscribeComfyUiWebSocket({ clientId: `cap-${index}`, onProgress: () => {} })
      );
      assert.equal(stub.calls.length, MAX_LIVE_STREAMS);
      // Waiting sessions never block queueing.
      await subs[MAX_LIVE_STREAMS].ready;

      subs[0].close();
      await flushMicrotasks();
      assert.equal(stub.calls.length, MAX_LIVE_STREAMS + 1);
      assert.equal(stub.calls.at(-1)?.url, `/api/comfyui/live?clientId=cap-${MAX_LIVE_STREAMS}`);

      // A waiting session closed before its turn is dropped, not started.
      subs[MAX_LIVE_STREAMS + 1].close();
      subs[1].close();
      await flushMicrotasks();
      assert.equal(stub.calls.length, MAX_LIVE_STREAMS + 1);

      for (const sub of subs) sub.close();
      await flushMicrotasks();
      stub.restore();
      win.restore();
    });

    it("gives a slot to the job ComfyUI is running, even one queued after the first three", async () => {
      // ComfyUI runs by queue number, not in the order a Day queued: the 5th still can run while
      // the first three hold every stream (user report, 2026-10-06: no progress, no preview).
      const { MAX_LIVE_STREAMS, noteComfyLiveJobState } = await import("./comfyui-websocket");
      const win = installWindowStub();
      const stub = installFetchStub(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const subs = Array.from({ length: MAX_LIVE_STREAMS + 2 }, (_, index) =>
        subscribeComfyUiWebSocket({ clientId: `hot-${index}`, onProgress: () => {} })
      );
      assert.equal(stub.calls.length, MAX_LIVE_STREAMS);
      noteComfyLiveJobState("hot-0", "pending", 3);
      noteComfyLiveJobState("hot-1", "pending", 4);
      noteComfyLiveJobState("hot-2", "pending", 2);

      // hot-4 starts running: hot-1 (furthest back) gives up its stream, hot-4 gets one.
      noteComfyLiveJobState("hot-4", "running");
      await flushMicrotasks();
      await flushMicrotasks();
      assert.equal(stub.calls.length, MAX_LIVE_STREAMS + 1);
      assert.equal(stub.calls.at(-1)?.url, "/api/comfyui/live?clientId=hot-4");
      assert.equal(stub.calls[1]?.init.signal?.aborted, true);

      // The next job in line also gets one; a running or next-in-line stream is never taken.
      noteComfyLiveJobState("hot-3", "pending", 1);
      await flushMicrotasks();
      await flushMicrotasks();
      assert.equal(stub.calls.at(-1)?.url, "/api/comfyui/live?clientId=hot-3");
      noteComfyLiveJobState("hot-1", "running");
      await flushMicrotasks();
      await flushMicrotasks();
      assert.equal(stub.calls.at(-1)?.url, "/api/comfyui/live?clientId=hot-1");
      const urls = stub.calls.map(call => call.url);
      // hot-4 (running) and hot-3 (next) kept theirs.
      const open = stub.calls.filter(call => !call.init.signal?.aborted).map(call => call.url);
      assert.ok(open.includes("/api/comfyui/live?clientId=hot-4"), urls.join(" "));
      assert.ok(open.includes("/api/comfyui/live?clientId=hot-3"), urls.join(" "));
      assert.ok(open.length <= MAX_LIVE_STREAMS);

      for (const sub of subs) sub.close();
      await flushMicrotasks();
      stub.restore();
      win.restore();
    });
  });

  describe("openComfyPreviewSocketBeforeQueue", () => {
    it("resolves once the underlying bridge becomes ready", async () => {
      const win = installWindowStub({ setTimeout: mock.fn(() => 0) });
      const stub = installFetchStub(() => ndjsonResponse(['{"type":"ready"}']));

      const sub = await openComfyPreviewSocketBeforeQueue({ clientId: "queue-1" });
      assert.equal(sub.clientId, "queue-1");

      sub.close();
      stub.restore();
      win.restore();
    });

    it("gives up waiting after the fallback timeout and still returns the subscription", async () => {
      // Read the captured timer through an opaque getter rather than a plain `let` re-read: tsc
      // narrows a `let x = null` variable to the literal `null` type at its declaration site, and
      // an optional/non-null read of it later (even after assert.ok) then errors with "does not
      // exist on type 'never'" -- the same tsc control-flow quirk documented in
      // campaign-templates.test.ts and comfyui-workflow-presets.test.ts. The getter indirection
      // breaks that narrowing chain.
      const state: { scheduled: { fn: () => void; ms: number } | null } = { scheduled: null };
      const currentScheduled = (): { fn: () => void; ms: number } | null => state.scheduled;
      const fakeSetTimeout = mock.fn((fn: () => void, ms: number) => {
        state.scheduled = { fn, ms };
        return 0;
      });
      const win = installWindowStub({ setTimeout: fakeSetTimeout });
      const bridge = openNdjsonResponse(); // never sends "ready"
      const stub = installFetchStub(() => bridge.response);

      const pending = openComfyPreviewSocketBeforeQueue({ clientId: "queue-2" });
      await flushMicrotasks();
      const scheduled = currentScheduled();
      assert.ok(scheduled);
      assert.equal(scheduled.ms, 2500);

      scheduled.fn();
      const sub = await pending;
      assert.equal(sub.clientId, "queue-2");

      sub.close();
      bridge.close();
      stub.restore();
      win.restore();
    });
  });
});
