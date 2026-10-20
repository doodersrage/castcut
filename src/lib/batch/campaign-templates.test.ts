import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CampaignTemplate } from "./campaign-templates";

const state: { store: CampaignTemplate[] | null } = { store: null };
const readBrowserValue = mock.fn(<T>(_key: string): T | null => state.store as unknown as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  state.store = value as CampaignTemplate[];
});
mock.module("../storage/browser-storage", { namedExports: { readBrowserValue, writeBrowserValue } });

// A plain `state.store` read after `state.store = null` narrows to the literal `null` type,
// which trips a TS quirk where `null?.length` reports "Property does not exist on type
// 'never'". Routing every read through a function call sidesteps the narrowing entirely.
function currentStore(): CampaignTemplate[] | null {
  return state.store;
}

function withWindow<T>(fn: () => T): T {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    return fn();
  } finally {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  }
}

describe("campaign-templates", async () => {
  const {
    loadCampaignTemplates,
    saveCampaignTemplates,
    upsertCampaignTemplate,
    deleteCampaignTemplate,
    CAMPAIGN_TEMPLATES_KEY,
  } = await import("./campaign-templates");

  it("returns an empty array with no window, without touching storage", () => {
    // @ts-expect-error ensure no window is present
    delete globalThis.window;
    const before = readBrowserValue.mock.calls.length;
    assert.deepEqual(loadCampaignTemplates(), []);
    assert.equal(readBrowserValue.mock.calls.length, before);
  });

  it("loads templates from storage when a window is present", () => {
    state.store = [
      {
        id: "t1",
        name: "Existing",
        target: "topics",
        count: 3,
        queueToComfyUi: false,
        createdAt: 1,
      },
    ];
    withWindow(() => {
      assert.deepEqual(loadCampaignTemplates(), currentStore());
    });
  });

  it("falls back to an empty array when storage throws", () => {
    readBrowserValue.mock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    withWindow(() => {
      assert.deepEqual(loadCampaignTemplates(), []);
    });
  });

  it("does nothing when saving with no window", () => {
    state.store = null;
    // @ts-expect-error ensure no window is present
    delete globalThis.window;
    saveCampaignTemplates([
      { id: "x", name: "X", target: "random-scene", count: 1, queueToComfyUi: true, createdAt: 1 },
    ]);
    assert.equal(currentStore(), null);
  });

  it("caps saved templates at 24 entries", () => {
    state.store = null;
    const many: CampaignTemplate[] = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      name: `Name ${i}`,
      target: "random-scene",
      count: 1,
      queueToComfyUi: false,
      createdAt: i,
    }));
    withWindow(() => {
      saveCampaignTemplates(many);
    });
    assert.equal(currentStore()?.length, 24);
  });

  it("upserts a new template with a generated id and createdAt, inserted first", () => {
    state.store = [
      { id: "old", name: "Old", target: "topics", count: 2, queueToComfyUi: false, createdAt: 1 },
    ];
    const created = withWindow(() =>
      upsertCampaignTemplate({
        name: "  New Template  ",
        target: "random-scene",
        count: 99,
        queueToComfyUi: true,
      })
    );
    assert.equal(created.name, "New Template");
    assert.equal(created.count, 12); // clamped to max 12
    assert.equal(typeof created.id, "string");
    assert.ok(created.id.length > 0);
    assert.equal(currentStore()?.[0]?.id, created.id);
    assert.equal(currentStore()?.length, 2);
  });

  it("upserts in place when the id already exists", () => {
    state.store = [
      { id: "a", name: "A", target: "topics", count: 2, queueToComfyUi: false, createdAt: 1 },
      { id: "b", name: "B", target: "topics", count: 2, queueToComfyUi: false, createdAt: 2 },
    ];
    withWindow(() =>
      upsertCampaignTemplate({
        id: "b",
        name: "B updated",
        target: "topics",
        count: 5,
        queueToComfyUi: true,
        createdAt: 2,
      })
    );
    assert.equal(currentStore()?.length, 2);
    assert.equal(currentStore()?.[1]?.name, "B updated");
  });

  it("clamps count to a minimum of 1", () => {
    state.store = [];
    const created = withWindow(() =>
      upsertCampaignTemplate({ name: "Low", target: "topics", count: -5, queueToComfyUi: false })
    );
    assert.equal(created.count, 1);
  });

  it("deletes a template by id", () => {
    state.store = [
      { id: "a", name: "A", target: "topics", count: 2, queueToComfyUi: false, createdAt: 1 },
      { id: "b", name: "B", target: "topics", count: 2, queueToComfyUi: false, createdAt: 2 },
    ];
    withWindow(() => deleteCampaignTemplate("a"));
    assert.deepEqual(currentStore()?.map(t => t.id), ["b"]);
  });

  it("exposes the storage key constant", () => {
    assert.equal(CAMPAIGN_TEMPLATES_KEY, "prompt-campaign-templates-v1");
  });
});
