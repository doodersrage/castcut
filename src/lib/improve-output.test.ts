import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import * as improveOutput from "./improve-output";

function fakeEntry(patch: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id: "g1",
    promptId: "p1",
    prompt: "a portrait",
    model: "qwen-image-edit-2511-lightning-8",
    tool: "compose",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: Date.now(),
    images: [{ filename: "out.png", subfolder: "", type: "output" }],
    queueQualityProfile: "final",
    sessionActiveLoraIds: ["skin", "anypose"],
    ...patch,
  } as ComfyGalleryEntry;
}

let originalWindow: unknown;
let store: Map<string, string>;

function currentWindow(): { location: { href: string } } {
  return (globalThis as unknown as { window: { location: { href: string } } }).window;
}

function storedPayload(key: string): Record<string, unknown> | undefined {
  const raw = store.get(key);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
}

beforeEach(() => {
  originalWindow = (globalThis as { window?: unknown }).window;
  store = new Map();
  const storageImpl = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: storageImpl,
      localStorage: storageImpl,
      dispatchEvent: () => undefined,
      location: { href: "" },
    },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("improve-output", () => {
  describe("startImproveFromResult", () => {
    it("saves a result-panel handoff and navigates to the improve path", () => {
      improveOutput.startImproveFromResult({
        prompt: "a cat",
        model: "flux-dev",
        tool: "generate",
      });
      assert.equal(currentWindow().location.href, "/refine?from=gallery&improve=1");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.source, "gallery");
      assert.equal(payload?.galleryEntryId, "result-panel");
      assert.equal(payload?.prompt, "a cat");
      assert.equal(payload?.target, "refine");
      assert.equal(
        payload?.improveIntent,
        "Improve fidelity, composition, and prompt alignment while preserving subject identity and scene intent."
      );
      // No parentHistoryId given, so no lineage-parent record should be written.
      assert.equal(store.has("prompt-lineage-parent-v1"), false);
    });

    it("also records lineage when a parentHistoryId is given", () => {
      improveOutput.startImproveFromResult({ prompt: "a cat", parentHistoryId: "h1" });
      assert.equal(store.has("prompt-lineage-parent-v1"), true);
      const lineage = storedPayload("prompt-lineage-parent-v1");
      assert.equal(lineage?.parentHistoryId, "h1");
      assert.equal(lineage?.sourcePrompt, "a cat");
    });
  });

  describe("startRefineFromResult", () => {
    it("saves a refine handoff and navigates to the plain refine path", () => {
      improveOutput.startRefineFromResult({ prompt: "x", model: "flux-dev" });
      assert.equal(currentWindow().location.href, "/refine?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.target, "refine");
    });
  });

  describe("startEditToolFromResult (via its exported wrappers)", () => {
    it("forces flux-inpaint for inpaint/outpaint even when a different model was passed", () => {
      improveOutput.startInpaintFromResult({ prompt: "x", model: "qwen-image-2512" });
      assert.equal(currentWindow().location.href, "/inpaint?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.model, "flux-inpaint");
    });

    it("leaves flux-inpaint untouched when it was already the model", () => {
      improveOutput.startOutpaintFromResult({ prompt: "x", model: "flux-inpaint" });
      assert.equal(currentWindow().location.href, "/outpaint?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.model, "flux-inpaint");
    });

    it("passes the model through unchanged for targets that don't prefer flux-inpaint", () => {
      improveOutput.startComposeFromResult({ prompt: "x", model: "qwen-image-2512" });
      assert.equal(currentWindow().location.href, "/compose?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.model, "qwen-image-2512");
    });
  });

  describe("startRefineFromHistoryEntry", () => {
    it("saves a history-sourced handoff and always records lineage", () => {
      improveOutput.startRefineFromHistoryEntry({ id: "h1", prompt: "x", model: "m", tool: "t" });
      assert.equal(currentWindow().location.href, "/refine?from=gallery");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.source, "history");
      assert.equal(payload?.historyId, "h1");
      assert.equal(storedPayload("prompt-lineage-parent-v1")?.parentHistoryId, "h1");
    });
  });

  describe("gallery-entry handoffs", () => {
    it("startInpaintFromGalleryEntry forces flux-inpaint and builds from the entry", () => {
      improveOutput.startInpaintFromGalleryEntry(fakeEntry({ model: "qwen-image-2512" }));
      assert.equal(currentWindow().location.href, "/inpaint?from=gallery");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.model, "flux-inpaint");
      assert.equal(payload?.galleryEntryId, "g1");
      assert.equal(payload?.target, "inpaint");
    });

    it("startAnatomyRepairFromGalleryEntry uses the anatomy-repair builder and path", () => {
      improveOutput.startAnatomyRepairFromGalleryEntry(fakeEntry());
      assert.equal(currentWindow().location.href, "/inpaint?from=gallery&anatomy=1");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.anatomyRepair, true);
      assert.equal(payload?.model, "flux-inpaint");
    });

    for (const [fn, target, path] of [
      ["startComposeFromGalleryEntry", "compose", "/compose?from=gallery"],
      ["startControlNetFromGalleryEntry", "controlnet", "/controlnet?from=gallery"],
      ["startVideoFromGalleryEntry", "video", "/video?from=gallery"],
      ["startRoleplayFromGalleryEntry", "roleplay", "/story?from=gallery"],
      ["startBackgroundFromGalleryEntry", "background", "/background?from=gallery"],
      ["startMeshFromGalleryEntry", "mesh", "/mesh?from=gallery"],
      ["startImagePromptFromGalleryEntry", "imagePrompt", "/image-prompt?from=gallery"],
    ] as const) {
      it(`${fn} builds an 'open' handoff for target ${target} and navigates to ${path}`, () => {
        (improveOutput as unknown as Record<string, (entry: ComfyGalleryEntry) => void>)[fn](
          fakeEntry()
        );
        assert.equal(currentWindow().location.href, path);
        const payload = storedPayload("gallery-handoff-v1");
        assert.equal(payload?.target, target);
        assert.equal(payload?.handoffMode, "open");
      });
    }

    it("startReeditInpaintFromGalleryEntry builds a reedit handoff and forces flux-inpaint", () => {
      improveOutput.startReeditInpaintFromGalleryEntry(fakeEntry({ model: "qwen-image-2512" }));
      assert.equal(currentWindow().location.href, "/inpaint?from=gallery");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.handoffMode, "reedit");
      assert.equal(payload?.model, "flux-inpaint");
    });

    it("startReeditComposeFromGalleryEntry builds a reedit handoff without forcing a model", () => {
      improveOutput.startReeditComposeFromGalleryEntry(fakeEntry({ model: "qwen-image-2512" }));
      assert.equal(currentWindow().location.href, "/compose?from=gallery");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.handoffMode, "reedit");
      assert.equal(payload?.model, "qwen-image-2512");
    });

    it("startRefineFromGalleryEntry also restores the entry's LoRA/settings stack to the session", () => {
      // Exercises applyGalleryStackToSession(entry, { toast: false }) alongside the handoff save.
      improveOutput.startRefineFromGalleryEntry(fakeEntry());
      assert.equal(currentWindow().location.href, "/refine?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.target, "refine");
    });

    it("startImproveFromGalleryEntry defaults the improve intent and restores the session stack", () => {
      improveOutput.startImproveFromGalleryEntry(fakeEntry());
      assert.equal(currentWindow().location.href, "/refine?from=gallery&improve=1");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(
        payload?.improveIntent,
        "Improve fidelity, composition, and prompt alignment while preserving subject identity and scene intent."
      );
    });

    it("startImproveFromGalleryEntry trims and uses a custom improve intent when given", () => {
      improveOutput.startImproveFromGalleryEntry(fakeEntry(), { intent: "  fix the hands  " });
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.improveIntent, "fix the hands");
    });
  });

  describe("prompt editor handoffs", () => {
    it("startPromptEditorFromResult saves a result-panel handoff with hints", () => {
      improveOutput.startPromptEditorFromResult({ prompt: "x", hints: "be concise" });
      assert.equal(currentWindow().location.href, "/prompt?from=gallery");
      const payload = storedPayload("gallery-handoff-v1");
      assert.equal(payload?.target, "promptEditor");
      assert.equal(payload?.hints, "be concise");
    });

    it("startPromptEditorFromHistoryEntry navigates to the history-flavored prompt path", () => {
      improveOutput.startPromptEditorFromHistoryEntry({ id: "h1", prompt: "x" });
      assert.equal(currentWindow().location.href, "/prompt?from=history");
      assert.equal(storedPayload("gallery-handoff-v1")?.source, "history");
    });

    it("startPromptEditorFromGalleryEntry builds from the entry and navigates to the gallery prompt path", () => {
      improveOutput.startPromptEditorFromGalleryEntry(fakeEntry());
      assert.equal(currentWindow().location.href, "/prompt?from=gallery");
      assert.equal(storedPayload("gallery-handoff-v1")?.target, "promptEditor");
    });
  });
});
