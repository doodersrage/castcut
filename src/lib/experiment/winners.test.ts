import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ExperimentWinnerRecord } from "./winners";

const state: { store: Record<string, ExperimentWinnerRecord> | null; throwOnRead: boolean } = {
  store: null,
  throwOnRead: false,
};
// Read state.store through this getter, not a direct property read, to avoid a tsc control-flow
// quirk: reading `obj.prop?.x` shortly after `obj.prop = null` narrows the property to the
// literal `null` type and errors with "does not exist on type 'never'" (see the same workaround
// in campaign-templates.test.ts, comfyui-workflow-presets.test.ts, comfyui-websocket.test.ts).
function currentStore(): Record<string, ExperimentWinnerRecord> | null {
  return state.store;
}
const readBrowserValue = mock.fn(<T>(): T | null => {
  if (state.throwOnRead) {
    throw new Error("storage broken");
  }
  return (state.store as unknown as T) ?? null;
});
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  state.store = value as Record<string, ExperimentWinnerRecord>;
});
mock.module("../storage/browser-storage", { namedExports: { readBrowserValue, writeBrowserValue } });

function installWindowStub() {
  const hadWindow = "window" in globalThis;
  const original = hadWindow ? (globalThis as unknown as { window: unknown }).window : undefined;
  const dispatched: Event[] = [];
  (globalThis as unknown as { window: unknown }).window = {
    dispatchEvent: (event: Event) => {
      dispatched.push(event);
      return true;
    },
  };
  return {
    dispatched,
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

describe("experiment-winners", async () => {
  const {
    EXPERIMENT_WINNERS_KEY,
    EXPERIMENT_WINNERS_UPDATED_EVENT,
    loadExperimentWinners,
    markExperimentWinner,
    clearExperimentWinner,
    resolveExperimentWinnerEntry,
  } = await import("./winners");

  describe("SSR guards (no window)", () => {
    it("loadExperimentWinners returns {} without touching storage", () => {
      assert.equal(typeof window, "undefined");
      state.store = { g: { groupId: "g", entryId: "e", markedAt: 1 } };
      readBrowserValue.mock.resetCalls();
      const result = loadExperimentWinners();
      assert.deepEqual(result, {});
      assert.equal(readBrowserValue.mock.calls.length, 0);
      state.store = null;
    });

    it("markExperimentWinner and clearExperimentWinner are no-ops", () => {
      writeBrowserValue.mock.resetCalls();
      markExperimentWinner("g1", "e1");
      clearExperimentWinner("g1");
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });
  });

  describe("with a window (browser)", () => {
    it("loadExperimentWinners returns {} when nothing is stored", () => {
      const win = installWindowStub();
      state.store = null;
      assert.deepEqual(loadExperimentWinners(), {});
      win.restore();
    });

    it("loadExperimentWinners returns {} when storage throws", () => {
      const win = installWindowStub();
      state.throwOnRead = true;
      assert.deepEqual(loadExperimentWinners(), {});
      state.throwOnRead = false;
      win.restore();
    });

    it("loadExperimentWinners passes through a stored record map", () => {
      const win = installWindowStub();
      state.store = { g1: { groupId: "g1", entryId: "e1", markedAt: 5 } };
      assert.deepEqual(loadExperimentWinners(), state.store);
      win.restore();
    });

    it("markExperimentWinner writes a new winner keyed by groupId and dispatches the update event", () => {
      const win = installWindowStub();
      state.store = null;
      markExperimentWinner("group-a", "entry-a");
      win.restore();

      const store = currentStore();
      assert.equal(store?.["group-a"]?.groupId, "group-a");
      assert.equal(store?.["group-a"]?.entryId, "entry-a");
      assert.equal(typeof store?.["group-a"]?.markedAt, "number");
      assert.equal(win.dispatched.length, 1);
      assert.equal(win.dispatched[0]?.type, EXPERIMENT_WINNERS_UPDATED_EVENT);
    });

    it("markExperimentWinner overwrites an existing winner for the same groupId", () => {
      const win = installWindowStub();
      state.store = { "group-a": { groupId: "group-a", entryId: "old", markedAt: 1 } };
      markExperimentWinner("group-a", "new-entry");
      win.restore();
      assert.equal(state.store?.["group-a"]?.entryId, "new-entry");
    });

    it("clearExperimentWinner removes a groupId's winner and dispatches the update event", () => {
      const win = installWindowStub();
      state.store = {
        "group-a": { groupId: "group-a", entryId: "e", markedAt: 1 },
        "group-b": { groupId: "group-b", entryId: "e2", markedAt: 2 },
      };
      clearExperimentWinner("group-a");
      win.restore();
      assert.equal("group-a" in (state.store ?? {}), false);
      assert.equal("group-b" in (state.store ?? {}), true);
      assert.equal(win.dispatched.length, 1);
      assert.equal(win.dispatched[0]?.type, EXPERIMENT_WINNERS_UPDATED_EVENT);
    });

    it("exposes the storage key constant used by other durable-sync consumers", () => {
      assert.equal(EXPERIMENT_WINNERS_KEY, "comfy-experiment-winners-v1");
    });
  });

  describe("resolveExperimentWinnerEntry", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function entry(id: string, prompt: string): any {
      return { id, prompt };
    }

    it("returns null for an empty entries array", () => {
      assert.equal(resolveExperimentWinnerEntry([]), null);
    });

    it("returns the first entry when the prompt has no normalizable group id", () => {
      const entries = [entry("only", "   ")];
      assert.equal(resolveExperimentWinnerEntry(entries), entries[0]);
    });

    it("returns the first entry when there is no stored winner for the group", () => {
      const win = installWindowStub();
      state.store = null;
      const entries = [entry("first", "a shared prompt"), entry("second", "a shared prompt")];
      const resolved = resolveExperimentWinnerEntry(entries);
      win.restore();
      assert.equal(resolved, entries[0]);
    });

    it("returns the first entry when the stored winner id is not among the entries", () => {
      const win = installWindowStub();
      state.store = { "a shared prompt": { groupId: "a shared prompt", entryId: "missing-id", markedAt: 1 } };
      const entries = [entry("first", "a shared prompt"), entry("second", "a shared prompt")];
      const resolved = resolveExperimentWinnerEntry(entries);
      win.restore();
      assert.equal(resolved, entries[0]);
    });

    it("returns the crowned entry when its id matches the stored winner", () => {
      const win = installWindowStub();
      state.store = { "a shared prompt": { groupId: "a shared prompt", entryId: "second", markedAt: 1 } };
      const entries = [entry("first", "a shared prompt"), entry("second", "a shared prompt")];
      const resolved = resolveExperimentWinnerEntry(entries);
      win.restore();
      assert.equal(resolved, entries[1]);
    });
  });
});
