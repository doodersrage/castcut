import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildComfyQueueDeletePayload,
  deleteComfyQueuePrompt,
  freeComfyUiMemory,
  interruptComfyUiQueue,
  cancelComfyUiJob,
  deleteComfyHistoryPrompts,
  restartComfyUi,
} from "./queue-control";

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(
  handler: (call: FetchCall) => { ok: boolean; body: unknown },
): FetchCall[] {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: typeof fetch }).fetch = (async (
    url: string,
    init?: RequestInit,
  ) => {
    const call = { url, init };
    calls.push(call);
    const { ok, body } = handler(call);
    return {
      ok,
      status: ok ? 200 : 502,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return calls;
}

describe("buildComfyQueueDeletePayload", () => {
  it("builds a delete array from a single promptId", () => {
    assert.deepEqual(buildComfyQueueDeletePayload({ promptId: "abc-123" }), {
      delete: ["abc-123"],
    });
  });

  it("trims the promptId", () => {
    assert.deepEqual(buildComfyQueueDeletePayload({ promptId: "  abc-123  " }), {
      delete: ["abc-123"],
    });
  });

  it("omits delete when promptId is empty", () => {
    assert.deepEqual(buildComfyQueueDeletePayload({}), {});
  });

  it("includes clear alongside delete when both are set", () => {
    assert.deepEqual(
      buildComfyQueueDeletePayload({ promptId: "abc-123", clear: true }),
      { delete: ["abc-123"], clear: true },
    );
  });

  it("supports clear-only payloads", () => {
    assert.deepEqual(buildComfyQueueDeletePayload({ clear: true }), {
      clear: true,
    });
  });

  it("does not set clear when false", () => {
    assert.deepEqual(
      buildComfyQueueDeletePayload({ promptId: "abc-123", clear: false }),
      { delete: ["abc-123"] },
    );
  });
});

describe("deleteComfyQueuePrompt", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts promptId, comfyUrl, and clear to the delete route", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    const result = await deleteComfyQueuePrompt({
      promptId: "abc-123",
      comfyUrl: "http://127.0.0.1:8188",
      clear: false,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/comfyui/queue/delete");
    assert.equal(calls[0]!.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      promptId: "abc-123",
      comfyUrl: "http://127.0.0.1:8188",
      clear: false,
    });
  });

  it("surfaces the server error message on failure", async () => {
    stubFetch(() => ({ ok: false, body: { error: "ComfyUI queue delete failed: HTTP 502" } }));

    const result = await deleteComfyQueuePrompt({ promptId: "abc-123" });

    assert.equal(result.ok, false);
    assert.equal(result.error, "ComfyUI queue delete failed: HTTP 502");
  });

  it("returns a generic error when fetch throws", async () => {
    (globalThis as { fetch?: typeof fetch }).fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const result = await deleteComfyQueuePrompt({ promptId: "abc-123" });

    assert.equal(result.ok, false);
    assert.equal(result.error, "network down");
  });
});

describe("interruptComfyUiQueue", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("omits comfyUrl from the body when not provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await interruptComfyUiQueue();

    assert.equal(calls[0]!.url, "/api/comfyui/interrupt");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {});
  });

  it("scopes the interrupt to a pooled host when comfyUrl is provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await interruptComfyUiQueue("http://10.0.0.5:8188");

    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      comfyUrl: "http://10.0.0.5:8188",
    });
  });

  it("includes promptId when interrupting a specific job", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await interruptComfyUiQueue("http://10.0.0.5:8188", "prompt-1");

    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      comfyUrl: "http://10.0.0.5:8188",
      promptId: "prompt-1",
    });
  });
});

describe("cancelComfyUiJob", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts promptId and history prune to the cancel route", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await cancelComfyUiJob({
      promptId: "abc-123",
      comfyUrl: "http://127.0.0.1:8188",
      deleteHistory: true,
    });

    assert.equal(calls[0]!.url, "/api/comfyui/cancel");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      promptId: "abc-123",
      comfyUrl: "http://127.0.0.1:8188",
      deleteHistory: true,
    });
  });
});

describe("deleteComfyHistoryPrompts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts prompt ids to the history route", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await deleteComfyHistoryPrompts({
      promptIds: ["a", "b"],
      comfyUrl: "http://127.0.0.1:8188",
    });

    assert.equal(calls[0]!.url, "/api/comfyui/history");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      promptIds: ["a", "b"],
      comfyUrl: "http://127.0.0.1:8188",
    });
  });
});

describe("freeComfyUiMemory", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("omits comfyUrl from the body when not provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await freeComfyUiMemory();

    assert.equal(calls[0]!.url, "/api/comfyui/free");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {});
  });

  it("scopes the free to a pooled host when comfyUrl is provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await freeComfyUiMemory("http://10.0.0.5:8188");

    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      comfyUrl: "http://10.0.0.5:8188",
    });
  });

  it("surfaces the server error message on failure", async () => {
    stubFetch(() => ({ ok: false, body: { error: "ComfyUI free failed: HTTP 502" } }));

    const result = await freeComfyUiMemory();

    assert.equal(result.ok, false);
    assert.equal(result.error, "ComfyUI free failed: HTTP 502");
  });
});

describe("restartComfyUi", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("omits comfyUrl from the body when not provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await restartComfyUi();

    assert.equal(calls[0]!.url, "/api/comfyui/restart");
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {});
  });

  it("scopes the restart to a pooled host when comfyUrl is provided", async () => {
    const calls = stubFetch(() => ({ ok: true, body: { ok: true } }));

    await restartComfyUi("http://10.0.0.5:8188");

    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), {
      comfyUrl: "http://10.0.0.5:8188",
    });
  });

  it("surfaces a missing-manager error from the server", async () => {
    stubFetch(() => ({
      ok: false,
      body: {
        error: "ComfyUI has no restart API on this host. Install ComfyUI-Manager (reboot) or restart the ComfyUI process, then refresh LoRA inventory.",
        missingManager: true,
      },
    }));

    const result = await restartComfyUi();

    assert.equal(result.ok, false);
    assert.equal(result.missingManager, true);
    assert.match(result.error ?? "", /ComfyUI-Manager/);
  });
});
