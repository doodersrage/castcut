import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyObjectInfoCachePayload } from "./comfyui-object-info-cache";

// listHealComfyUrls is intentionally not covered here: every line of its body is a call-time
// `await import(...)` of a different module (comfyui-host-ready, comfyui-settings,
// settings-cache, oom-retry), which mock.module cannot reliably intercept under this project's
// tsx-based test runner (see prior batches' notes), and running it for real would hit
// settings-cache/localStorage and a real network retry lookup. The other four exported
// functions below route their testable branches through statically-imported, mockable
// dependencies (fetchComfyObjectInfoCached, the workflow-node-type-audit helpers) and are
// covered for real.
const fetchComfyObjectInfoCached = mock.fn(
  async (_input?: { comfyUrl?: string; forceRefresh?: boolean }): Promise<ComfyObjectInfoCachePayload | null> =>
    null
);
mock.module("./comfyui-object-info-cache", { namedExports: { fetchComfyObjectInfoCached } });

function installFetchStub(
  handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> } | "throw"
) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const result = handler(url, init);
    if (result === "throw") {
      throw new Error("network down");
    }
    return result;
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("comfyui-manager-install-client", async () => {
  const {
    requestComfyManagerInstall,
    installMissingWorkflowNodePacks,
    resolveMissingNodeTypesForJob,
    tryInstallMissingNodesFromIssues,
  } = await import("./comfyui-manager-install-client");

  describe("requestComfyManagerInstall", () => {
    it("returns an empty install with no fetch call for an empty/blank node type list", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await requestComfyManagerInstall({ nodeTypes: ["  ", ""] });
      stub.restore();
      assert.deepEqual(result, {
        ok: true,
        installed: [],
        unresolved: [],
        restartRequested: false,
        message: "",
      });
      assert.equal(stub.calls.length, 0);
    });

    it("dedupes and trims node types before sending them", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ installed: ["NodeA"], unresolved: [] }),
      }));
      await requestComfyManagerInstall({ nodeTypes: [" NodeA ", "NodeA", "NodeA"] });
      stub.restore();
      const body = JSON.parse(stub.calls[0]?.init?.body as string);
      assert.deepEqual(body.nodeTypes, ["NodeA"]);
    });

    it("reports installed and still-missing node types on success without a restart", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ installed: ["NodeA"], unresolved: ["NodeB"], restartNeeded: false }),
      }));
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA", "NodeB"] });
      stub.restore();
      assert.equal(result.ok, true);
      assert.equal(result.restartRequested, false);
      assert.match(result.message, /Installed NodeA\./);
      assert.match(result.message, /Still missing: NodeB\./);
    });

    it("does not restart a busy ComfyUI: says to restart once its queue is empty", async () => {
      const stub = installFetchStub(url =>
        url.includes("/api/comfyui/restart")
          ? {
              ok: false,
              json: async () => ({
                error: "ComfyUI has 2 jobs running or waiting — restart it when its queue is empty.",
                busy: true,
              }),
            }
          : { ok: true, json: async () => ({ installed: ["NodeA"], unresolved: [], restartNeeded: true }) }
      );
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA"] });
      stub.restore();
      assert.equal(result.ok, true);
      assert.equal(result.restartRequested, false);
      assert.match(result.message, /Installed NodeA\./);
      assert.match(result.message, /restart it when its queue is empty/);
    });

    it("points at installing ComfyUI-Manager when the server reports it is missing", async () => {
      const stub = installFetchStub(() => ({
        ok: false,
        json: async () => ({ missingManager: true }),
      }));
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA"] });
      stub.restore();
      assert.equal(result.ok, false);
      assert.equal(result.missingManager, true);
      assert.match(result.message, /Install ComfyUI-Manager to auto-install packs\./);
    });

    it("appends a security_level hint when the server error mentions it", async () => {
      const stub = installFetchStub(() => ({
        ok: false,
        json: async () => ({ error: "security_level blocked this" }),
      }));
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA"] });
      stub.restore();
      assert.match(result.message, /security_level blocked this/);
      assert.match(result.message, /ComfyUI-Manager security_level may be blocking installs\./);
    });

    it("uses a default message when the response is not ok and carries no error", async () => {
      const stub = installFetchStub(() => ({ ok: false, json: async () => ({}) }));
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA", "NodeB"] });
      stub.restore();
      assert.match(result.message, /Could not install missing nodes: NodeA, NodeB\./);
    });

    it("returns a failure result (not a throw) when fetch itself throws", async () => {
      const stub = installFetchStub(() => "throw");
      const result = await requestComfyManagerInstall({ nodeTypes: ["NodeA"] });
      stub.restore();
      assert.equal(result.ok, false);
      assert.deepEqual(result.unresolved, ["NodeA"]);
      assert.match(result.message, /network down/);
    });
  });

  describe("installMissingWorkflowNodePacks", () => {
    it("reports a not-readable-object_info failure when there are no known node types", async () => {
      fetchComfyObjectInfoCached.mock.mockImplementationOnce(async () => null);
      const result = await installMissingWorkflowNodePacks("http://my-comfy:8188");
      assert.equal(result.ok, false);
      assert.match(result.message, /Could not read object_info from http:\/\/my-comfy:8188/);
    });

    it("falls back to a heal-failure message when fetching object_info throws", async () => {
      fetchComfyObjectInfoCached.mock.mockImplementationOnce(async () => {
        throw new Error("host unreachable");
      });
      const result = await installMissingWorkflowNodePacks("http://my-comfy:8188");
      assert.equal(result.ok, false);
      assert.match(result.message, /Could not heal http:\/\/my-comfy:8188: host unreachable/);
    });
  });

  describe("resolveMissingNodeTypesForJob", () => {
    it("extracts missing node types from the status message when there is no workflow json", async () => {
      const result = await resolveMissingNodeTypesForJob({
        statusMessage: 'unknown node type: SomeCustomNode',
      });
      assert.deepEqual(result, ["SomeCustomNode"]);
    });

    it("merges workflow-derived missing types with message-derived ones", async () => {
      fetchComfyObjectInfoCached.mock.mockImplementationOnce(async () => ({
        nodeTypes: new Set(["KSampler"]),
      }) as unknown as ComfyObjectInfoCachePayload);
      const workflowJson = JSON.stringify({
        "1": { class_type: "KSampler" },
        "2": { class_type: "CustomUpscaler" },
      });
      const result = await resolveMissingNodeTypesForJob({
        workflowJson,
        statusMessage: 'unknown node type: FromMessageNode',
      });
      assert.deepEqual([...result].sort(), ["CustomUpscaler", "FromMessageNode"]);
    });

    it("falls back to message-derived types when object_info has no node types", async () => {
      fetchComfyObjectInfoCached.mock.mockImplementationOnce(async () => null);
      const result = await resolveMissingNodeTypesForJob({
        workflowJson: JSON.stringify({ "1": { class_type: "KSampler" } }),
        statusMessage: 'unknown node type: FromMessageNode',
      });
      assert.deepEqual(result, ["FromMessageNode"]);
    });
  });

  describe("tryInstallMissingNodesFromIssues", () => {
    it("returns null when no issues reference a missing node type", async () => {
      const result = await tryInstallMissingNodesFromIssues({ issues: [{ message: "all good" }] });
      assert.equal(result, null);
    });

    it("requests an install for node types collected from issues", async () => {
      const stub = installFetchStub(() => ({
        ok: true,
        json: async () => ({ installed: ["WeirdNode"], unresolved: [] }),
      }));
      const result = await tryInstallMissingNodesFromIssues({
        issues: [{ classType: "WeirdNode" }],
      });
      stub.restore();
      assert.ok(result);
      assert.equal(result?.ok, true);
      const body = JSON.parse(stub.calls[0]?.init?.body as string);
      assert.deepEqual(body.nodeTypes, ["WeirdNode"]);
    });
  });
});
