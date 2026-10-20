import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySessionLoraSelection,
  type LoraLibraryEntry,
} from "../lora/stack";
import {
  formatModelLoraMap,
  mergeSessionLoraIdsByModel,
  parseModelLoraMap,
  resolveEffectiveSessionLoraIds,
  resolveLoraIdsForModelSelection,
  resolveModelDefaultLoraIds,
  setSessionLoraIdsForModel,
} from "./lora-map";

describe("model lora map", () => {
  it("merges session LoRA picks with overlay winning, including shorter stacks", () => {
    assert.deepEqual(
      mergeSessionLoraIdsByModel(
        { "flux-dev": ["a", "b", "c"], "wan-video": ["motion"] },
        { "flux-dev": ["a", "b"] },
      ),
      { "flux-dev": ["a", "b"], "wan-video": ["motion"] },
    );
    assert.deepEqual(
      mergeSessionLoraIdsByModel({ "flux-dev": ["a", "b"] }, { "flux-dev": [] }),
      { "flux-dev": [] },
    );
  });

  it("parses and formats modelId=id1,id2 lines including empty values", () => {
    const map = parseModelLoraMap(
      "# comment\nwan-video=skin,motion\nflux-dev=\nqwen-image-2512:detail",
    );
    assert.equal(map["wan-video"], "skin,motion");
    assert.equal(map["flux-dev"], "");
    assert.equal(map["qwen-image-2512"], "detail");

    const formatted = formatModelLoraMap(map);
    assert.match(formatted, /wan-video=skin,motion/);
    assert.match(formatted, /flux-dev=$/m);
    assert.match(formatted, /qwen-image-2512=detail/);
  });

  it("resolves mapped ids, empty stack, and missing keys", () => {
    const map = {
      "wan-video": "skin, motion",
      "flux-dev": "",
    };
    assert.deepEqual(resolveModelDefaultLoraIds("wan-video", map), [
      "skin",
      "motion",
    ]);
    assert.deepEqual(resolveModelDefaultLoraIds("flux-dev", map), []);
    assert.equal(resolveModelDefaultLoraIds("unknown", map), undefined);
    assert.equal(resolveModelDefaultLoraIds("wan-video", undefined), undefined);
  });

  it("prefers per-model session over map, and defaults to none selected", () => {
    const library: LoraLibraryEntry[] = [
      {
        id: "skin",
        label: "Skin",
        triggerPhrase: "",
        tokenValue: "skin.safetensors",
        enabled: false,
      },
      {
        id: "motion",
        label: "Motion",
        triggerPhrase: "",
        tokenValue: "motion.safetensors",
        enabled: true,
      },
      {
        id: "detail",
        label: "Detail",
        triggerPhrase: "",
        tokenValue: "detail.safetensors",
        enabled: true,
      },
    ];
    const map = { "wan-video": "skin,motion" };

    const sessionWins = resolveEffectiveSessionLoraIds(
      ["detail"],
      "wan-video",
      map,
      { "wan-video": ["detail"] },
    );
    assert.deepEqual(sessionWins, ["detail"]);
    assert.deepEqual(
      applySessionLoraSelection(library, sessionWins)
        .filter((entry) => entry.enabled)
        .map((entry) => entry.id),
      ["detail"],
    );

    const mapWins = resolveEffectiveSessionLoraIds(
      undefined,
      "wan-video",
      map,
    );
    assert.deepEqual(mapWins, ["skin", "motion"]);
    assert.deepEqual(
      applySessionLoraSelection(library, mapWins)
        .filter((entry) => entry.enabled)
        .map((entry) => entry.id),
      ["skin", "motion"],
    );

    const libraryEnabled = resolveEffectiveSessionLoraIds(
      undefined,
      "unknown-model",
      map,
    );
    assert.deepEqual(libraryEnabled, []);
    assert.deepEqual(
      applySessionLoraSelection(library, libraryEnabled)
        .filter((entry) => entry.enabled !== false)
        .map((entry) => entry.id),
      [],
    );
  });

  it("switches and stores LoRA picks per model without leaking across models", () => {
    const map = {
      "wan-video": "skin,motion",
      "flux-dev": "detail",
    };
    let byModel = setSessionLoraIdsForModel(undefined, "wan-video", ["skin"]);

    assert.deepEqual(
      resolveLoraIdsForModelSelection("wan-video", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["skin"],
    );
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["detail"],
    );

    byModel = setSessionLoraIdsForModel(byModel, "flux-dev", []);
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      [],
    );
    // wan-video pick preserved
    assert.deepEqual(
      resolveLoraIdsForModelSelection("wan-video", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["skin"],
    );

    // Clear flux override → fall back to map
    byModel = setSessionLoraIdsForModel(byModel, "flux-dev", undefined);
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["detail"],
    );

    // Klein Base keeps Realistic Detail + Ultra Real even if the session stack was cleared
    // or a stale map only lists Realistic Detail.
    byModel = setSessionLoraIdsForModel(byModel, "flux-2-klein-9b", []);
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-2-klein-9b", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: {
          ...map,
          "flux-2-klein-9b": "klein-realistic-detail",
        },
      }),
      ["klein-realistic-detail", "klein-ultra-real-v4"],
    );

    // Sticky global session must not override another model's map when byModel has entries
    assert.deepEqual(
      resolveEffectiveSessionLoraIds(
        ["skin"],
        "flux-dev",
        map,
        byModel,
      ),
      ["detail"],
    );

    // Untouched model with no map entry → empty system default
    assert.deepEqual(
      resolveLoraIdsForModelSelection("some-other-model", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
        sessionActiveLoraIds: ["skin"],
      }),
      [],
    );
  });
});

describe("model-lora-map session strength overrides", () => {
  it("prefers per-model overrides over legacy global", async () => {
    const {
      resolveEffectiveSessionLoraStrengthOverrides,
    } = await import("./lora-map");
    const resolved = resolveEffectiveSessionLoraStrengthOverrides(
      "flux-dev",
      { skin: { strengthModel: 0.2, strengthClip: 0.2 } },
      {
        "flux-dev": { skin: { strengthModel: 0.8, strengthClip: 0.9 } },
      },
    );
    assert.deepEqual(resolved, {
      skin: { strengthModel: 0.8, strengthClip: 0.9 },
    });
  });

  it("falls back to legacy global when by-model map is empty", async () => {
    const {
      resolveEffectiveSessionLoraStrengthOverrides,
    } = await import("./lora-map");
    const resolved = resolveEffectiveSessionLoraStrengthOverrides(
      "flux-dev",
      { skin: { strengthModel: 0.55, strengthClip: 0.7 } },
      {},
    );
    assert.deepEqual(resolved, {
      skin: { strengthModel: 0.55, strengthClip: 0.7 },
    });
  });

  it("writes and clears per-model override entries", async () => {
    const {
      hasSessionLoraStrengthOverridesForModel,
      setSessionLoraStrengthOverridesForModel,
    } = await import("./lora-map");
    const next = setSessionLoraStrengthOverridesForModel(undefined, "qwen-image-2512", {
      detail: { strengthModel: 0.6, strengthClip: 0.6 },
    });
    assert.equal(hasSessionLoraStrengthOverridesForModel(next, "qwen-image-2512"), true);
    const cleared = setSessionLoraStrengthOverridesForModel(next, "qwen-image-2512", {});
    assert.equal(hasSessionLoraStrengthOverridesForModel(cleared, "qwen-image-2512"), false);
  });
});
