import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const getComfyUiBaseUrl = mock.fn((_runtime?: unknown) => "http://mock-comfy:8188");
mock.module("./client", { namedExports: { getComfyUiBaseUrl } });

const stripEmptyComfyUiRuntime = mock.fn((runtime?: { apiUrl?: string }) => runtime);
mock.module("./config", { namedExports: { stripEmptyComfyUiRuntime } });

function installFetchStub(behavior: "ok" | "not-ok" | "throws") {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (behavior === "throws") {
      throw new Error("network down");
    }
    return { ok: behavior === "ok" };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("freeComfyUiMemoryServer", async () => {
  const { freeComfyUiMemoryServer } = await import("./free-server");

  it("returns true when the /free request succeeds", async () => {
    const stub = installFetchStub("ok");
    const result = await freeComfyUiMemoryServer();
    stub.restore();
    assert.equal(result, true);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]?.url, "http://mock-comfy:8188/free");
    assert.equal(stub.calls[0]?.init?.method, "POST");
  });

  it("returns false when the /free request is not ok", async () => {
    const stub = installFetchStub("not-ok");
    const result = await freeComfyUiMemoryServer();
    stub.restore();
    assert.equal(result, false);
  });

  it("returns false (never throws) when fetch itself throws", async () => {
    const stub = installFetchStub("throws");
    const result = await freeComfyUiMemoryServer();
    stub.restore();
    assert.equal(result, false);
  });

  it("passes a trailing-slash-stripped comfyUrl through to the base URL resolver", async () => {
    getComfyUiBaseUrl.mock.mockImplementationOnce(() => "http://custom-host:1234///");
    const stub = installFetchStub("ok");
    await freeComfyUiMemoryServer("http://custom-host:1234");
    stub.restore();
    assert.equal(stub.calls[0]?.url, "http://custom-host:1234/free");
  });
});
