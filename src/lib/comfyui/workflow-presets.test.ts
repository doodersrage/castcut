import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyWorkflowPreset } from "./workflow-presets";

// Reads go through a `currentStore()` getter rather than the bare property to sidestep a TS
// control-flow quirk: reading `state.store?.length` right after `state.store = null` narrows the
// property to the literal `null` type and tsc reports "Property 'length' does not exist on type
// 'never'" (reproduced and documented in the batch-3 campaign-templates.test.ts commit).
const state: { store: ComfyWorkflowPreset[] | null } = { store: null };
function currentStore(): ComfyWorkflowPreset[] | null {
  return state.store;
}

const readBrowserValue = mock.fn(<T>(_key: string): T | null => state.store as unknown as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  state.store = value as ComfyWorkflowPreset[];
});
mock.module("../storage/browser-storage", { namedExports: { readBrowserValue, writeBrowserValue } });

function withWindow<T>(fn: () => T): T {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    return fn();
  } finally {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  }
}

describe("comfyui-workflow-presets", async () => {
  const {
    loadComfyWorkflowPresets,
    saveComfyWorkflowPresets,
    upsertComfyWorkflowPreset,
    findComfyWorkflowPreset,
    deleteComfyWorkflowPreset,
    COMFY_WORKFLOW_PRESETS_KEY,
  } = await import("./workflow-presets");

  it("returns an empty array with no window, without touching storage", () => {
    // @ts-expect-error ensure no window is present
    delete globalThis.window;
    const before = readBrowserValue.mock.calls.length;
    assert.deepEqual(loadComfyWorkflowPresets(), []);
    assert.equal(readBrowserValue.mock.calls.length, before);
  });

  it("falls back to an empty array when storage throws", () => {
    readBrowserValue.mock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    withWindow(() => {
      assert.deepEqual(loadComfyWorkflowPresets(), []);
    });
  });

  it("does nothing when saving with no window", () => {
    state.store = null;
    // @ts-expect-error ensure no window is present
    delete globalThis.window;
    saveComfyWorkflowPresets([
      { id: "x", name: "X", createdAt: 1, workflowJson: "{}" },
    ]);
    assert.equal(currentStore(), null);
  });

  it("upserts a new preset with a generated id/createdAt and default tokens, inserted first", () => {
    state.store = [
      { id: "old", name: "Old", createdAt: 1, workflowJson: "{}" },
    ];
    const created = withWindow(() =>
      upsertComfyWorkflowPreset({
        name: "  New Preset  ",
        workflowJson: "  {\"nodes\":[]}  ",
      })
    );
    assert.equal(created.name, "New Preset");
    assert.equal(created.workflowJson, '{"nodes":[]}');
    assert.equal(created.positiveToken, "{{POSITIVE}}");
    assert.equal(created.negativeToken, "{{NEGATIVE}}");
    assert.equal(typeof created.id, "string");
    assert.ok(created.id.length > 0);
    assert.equal(currentStore()?.[0]?.id, created.id);
    assert.equal(currentStore()?.length, 2);
  });

  it("upserts in place when the id already exists, preserving explicit tokens", () => {
    state.store = [
      { id: "a", name: "A", createdAt: 1, workflowJson: "{}" },
      { id: "b", name: "B", createdAt: 2, workflowJson: "{}" },
    ];
    withWindow(() =>
      upsertComfyWorkflowPreset({
        id: "b",
        name: "B updated",
        workflowJson: "{}",
        positiveToken: "{{POS}}",
        negativeToken: "{{NEG}}",
        createdAt: 2,
      })
    );
    assert.equal(currentStore()?.length, 2);
    assert.equal(currentStore()?.[1]?.name, "B updated");
    assert.equal(currentStore()?.[1]?.positiveToken, "{{POS}}");
    assert.equal(currentStore()?.[1]?.negativeToken, "{{NEG}}");
  });

  it("caps saved presets at 24 entries", () => {
    state.store = Array.from({ length: 24 }, (_, i) => ({
      id: `id-${i}`,
      name: `Name ${i}`,
      createdAt: i,
      workflowJson: "{}",
    }));
    withWindow(() =>
      upsertComfyWorkflowPreset({ name: "Newest", workflowJson: "{}" })
    );
    assert.equal(currentStore()?.length, 24);
  });

  it("finds a preset by id, or undefined when absent", () => {
    state.store = [{ id: "a", name: "A", createdAt: 1, workflowJson: "{}" }];
    withWindow(() => {
      assert.equal(findComfyWorkflowPreset("a")?.name, "A");
      assert.equal(findComfyWorkflowPreset("missing"), undefined);
    });
  });

  it("deletes a preset by id", () => {
    state.store = [
      { id: "a", name: "A", createdAt: 1, workflowJson: "{}" },
      { id: "b", name: "B", createdAt: 2, workflowJson: "{}" },
    ];
    withWindow(() => deleteComfyWorkflowPreset("a"));
    assert.deepEqual(currentStore()?.map(p => p.id), ["b"]);
  });

  it("exposes the storage key constant", () => {
    assert.equal(COMFY_WORKFLOW_PRESETS_KEY, "comfyui-workflow-presets-v1");
  });
});
