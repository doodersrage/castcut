import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const buildComfyQueueDeletePayload = mock.fn((input: { promptId?: string }) => ({
  delete: input.promptId ? [input.promptId] : undefined,
}));
mock.module("./queue-control", { namedExports: { buildComfyQueueDeletePayload } });

const deleteComfyUiHistoryItems = mock.fn(async (_base: string, _ids: string[]) => {});
mock.module("./status", { namedExports: { deleteComfyUiHistoryItems } });

type FetchBehavior = "ok" | "not-ok" | "throw";

function installFetchStub(behaviorForUrl: (url: string) => FetchBehavior) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string) => {
    calls.push(url);
    const behavior = behaviorForUrl(url);
    if (behavior === "throw") {
      throw new Error("network down");
    }
    return { ok: behavior === "ok", status: behavior === "ok" ? 200 : 500 };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("cancelComfyUiJobOnHost", async () => {
  const { cancelComfyUiJobOnHost } = await import("./job-cancel");

  it("rejects a blank prompt id without making any request", async () => {
    const stub = installFetchStub(() => "ok");
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "  " });
    stub.restore();
    assert.deepEqual(result, { ok: false, error: "Missing prompt id." });
    assert.equal(stub.calls.length, 0);
  });

  it("succeeds when interrupt and queue delete both succeed", async () => {
    const stub = installFetchStub(() => "ok");
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host/", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: true });
    assert.ok(stub.calls.some(url => url === "http://host/api/jobs/p1/cancel"));
    assert.ok(stub.calls.some(url => url === "http://host/interrupt"));
    assert.ok(stub.calls.some(url => url === "http://host/queue"));
  });

  it("succeeds when only interrupt succeeds", async () => {
    const stub = installFetchStub(url => (url.endsWith("/interrupt") ? "ok" : "not-ok"));
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: true });
  });

  it("succeeds when only the queue delete succeeds", async () => {
    const stub = installFetchStub(url => (url.endsWith("/queue") ? "ok" : "not-ok"));
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: true });
  });

  it("fails when both interrupt and queue delete fail", async () => {
    const stub = installFetchStub(url => (url.endsWith("/cancel") ? "ok" : "not-ok"));
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: false, error: "ComfyUI cancel failed." });
  });

  it("tolerates the legacy /api/jobs/.../cancel endpoint throwing (older ComfyUI)", async () => {
    const stub = installFetchStub(url => (url.includes("/api/jobs/") ? "throw" : "ok"));
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: true });
  });

  it("treats a network throw on interrupt/queue as a failed request, not a crash", async () => {
    const stub = installFetchStub(() => "throw");
    const result = await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    stub.restore();
    assert.deepEqual(result, { ok: false, error: "ComfyUI cancel failed." });
  });

  it("prunes history when deleteHistory is set, and skips it otherwise", async () => {
    const stub = installFetchStub(() => "ok");
    const before = deleteComfyUiHistoryItems.mock.calls.length;
    await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1" });
    assert.equal(deleteComfyUiHistoryItems.mock.calls.length, before);

    await cancelComfyUiJobOnHost({ baseUrl: "http://host", promptId: "p1", deleteHistory: true });
    stub.restore();
    assert.equal(deleteComfyUiHistoryItems.mock.calls.length, before + 1);
    assert.deepEqual(deleteComfyUiHistoryItems.mock.calls[before]?.arguments, [
      "http://host",
      ["p1"],
    ]);
  });
});
