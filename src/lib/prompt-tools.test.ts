import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintPrompt } from "./prompt-diagnostics";
import { fixPromptRules } from "./prompt-fix";
import { mergeLocationExclusions } from "./location-exclusions";
import { buildOutfitFromLockedWardrobeId } from "./clothing-catalog";
import { buildNegativePrompt } from "./negative-prompt-builder";
import { applyPromptTemplate, getPromptTemplate } from "./prompt-templates";
import { getSportPreset, sportPresetsForMode } from "./sport-presets";
import { formatPromptPair, modelUsesNegativePrompt } from "./prompt-pair";
import { buildRegenerateUrl } from "./regenerate-url";
import { migrateLegacyToolSettings, type ToolSettingsCache } from "./settings-cache";
import { buildMatrixAxes } from "./variation-matrix";
import { applyTagAssistToSelection } from "./tag-assist";
import { applyLockedLocation } from "./locked-location";
import { applyLockedVariationSeed } from "./locked-variation-seed";
import { composeScenePrompt } from "./scene-composer";
import { parseStudioBackupFile } from "./studio-backup";
import { compactPromptToLimit } from "./compact-prompt";
import {
  filterHistoryEntries,
  uniqueHistoryTags,
  uniqueHistoryTools,
} from "./history-filter";
import {
  buildScenePresetShareUrl,
  buildShareableSceneParams,
  parseScenePresetFromSearch,
} from "./scene-preset-url";
import {
  buildPromptSidecar,
  parsePromptSidecar,
  sidecarQueueParams,
  sidecarRequeueContext,
} from "./prompt-sidecar";
import { previewWorkflowInjection } from "./comfyui-workflow-preview";
import { comfyUiJobStatusLabel, formatComfyUiJobStatusLine } from "./comfyui-job-status";
import { validateWorkflowJson, stripEmptyComfyUiRuntime, injectWorkflowPlaceholders } from "./comfyui-config";
import { extractImagesFromOutputs } from "./comfyui-outputs";
import {
  buildGalleryLightboxPlaylist,
  filterComfyGalleryEntries,
  formatGallerySlideshowInterval,
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryPlaybackIndex,
  normalizeGallerySlideshowIntervalMs,
  paginateGalleryEntries,
  resolveGalleryLightboxOpenIndex,
  resolveGalleryPageSize,
  resolveGallerySlideshowTransition,
  resolveGallerySlideshowTransitionMs,
  sortGalleryEntries,
} from "./comfyui-gallery";
import { parsePetHints } from "./pet-hints";
import {
  buildPetPresetBlock,
  countPetPresetSelections,
  normalizePetPresetOptions,
} from "./pet-options";
import { getPetPreset, PET_PRESETS } from "./pet-presets";
import { buildRandomPetSeed } from "./pet-scene-pools";
import {
  buildFantasyPresetBlock,
  countFantasyPresetSelections,
  getFantasyShotFramingLine,
  normalizeFantasyPresetOptions,
  resolveFantasyFocus,
  resolveFantasyShotFraming,
} from "./fantasy-options";
import { getFantasyPreset, FANTASY_PRESETS } from "./fantasy-presets";
import {
  buildRandomFantasySeed,
  fantasyFocusIncludesPeople,
} from "./fantasy-scene-pools";
import { listServerWorkflowPaths } from "./comfyui-server-workflows";
import {
  DEFAULT_COMFYUI_SETTINGS,
  comfyUiSettingsToRuntime,
} from "./comfyui-settings";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import { createScenePreset } from "./scene-presets";
import { createUserTemplate } from "./user-templates";
import { diffPromptWords } from "./prompt-diff";
import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { parseSettingHint } from "./hint-location";
import {
  buildRandomTopicPhrase,
  buildTemplateTopicList,
  normalizeTopicPhrase,
} from "./specialized/scene-pools";

describe("lintPrompt", () => {
  it("flags gravel + velodrome conflicts", () => {
    const result = lintPrompt({
      hints: "gravel cyclist duo race",
      prompt: "Two cyclists sprint on a velodrome banking turn in gravel kits.",
    });
    assert.ok(
      result.issues.some((issue) => issue.code === "cycling.gravel_velodrome"),
    );
  });

  it("flags missing cycling helmets", () => {
    const result = lintPrompt({
      hints: "road cyclist criterium",
      prompt: "A cyclist in white kit sprints through a wet corner.",
    });
    assert.ok(
      result.issues.some((issue) => issue.code === "cycling.missing_helmet"),
    );
  });

  it("infers gravel discipline from hints", () => {
    const result = lintPrompt({
      hints: "two female gravel cyclists racing on doubletrack",
      prompt:
        "On the left and right, two women in gravel kits with helmets charge a muddy fire road.",
    });
    assert.equal(result.inferred.sport, "cycling");
    assert.equal(result.inferred.cyclingDiscipline, "gravel");
    assert.equal(result.inferred.duoMode, true);
  });

  it("does not infer duo from lighting or object counts in the prompt", () => {
    const result = lintPrompt({
      hints: "beautiful woman in mini dress and tall heels",
      prompt:
        "A stunning woman stands near the forefront of a shallow studio space lit by two soft box speedlights from frame left, wearing a cropped wrap dress and stiletto heels.",
    });
    assert.equal(result.inferred.duoMode, false);
    assert.equal(result.inferred.peopleCount, null);
  });

  it("does not treat pair of shoes as a duo hint", () => {
    const result = lintPrompt({
      hints: "portrait of a woman in a pair of heels",
      prompt: "A woman in a red dress wears a pair of stiletto heels.",
    });
    assert.equal(result.inferred.duoMode, false);
  });
});

describe("fixPromptRules", () => {
  it("adds cycling helmets to bare-head prompts", () => {
    const result = fixPromptRules({
      hints: "gravel cyclist duo race",
      prompt:
        "On the left, a woman in white kit sprints; on the right, a rival in blue kit.",
    });
    assert.match(result.prompt, /helmet/i);
    assert.ok(result.changes.some((change) => change.code === "cycling.add_helmet"));
  });
});

describe("location exclusions", () => {
  it("merges recent and blocked locations without duplicates", () => {
    const merged = mergeLocationExclusions(
      ["Tokyo rooftop", "neon alley"],
      ["neon alley", "velodrome banking turn"],
    );
    assert.equal(merged.length, 3);
  });
});

describe("locked wardrobe", () => {
  it("builds outfit from catalog id", () => {
    const outfit = buildOutfitFromLockedWardrobeId("outfit-low-rise-rose-cycling-kit", {
      gender: "any",
      contexts: ["athletic"],
      athleticSport: "cycling",
    });
    assert.ok(outfit);
    assert.match(outfit!.summary, /helmet/i);
  });
});

describe("negative and templates", () => {
  it("builds cycling negatives", () => {
    const prompt = buildNegativePrompt({ sport: "cycling" });
    assert.match(prompt, /helmet|dress/i);
  });

  it("builds running negatives with bottom coverage", () => {
    const prompt = buildNegativePrompt({ sport: "running", soloSubject: true });
    assert.match(prompt, /missing running shorts|split screen/i);
    assert.match(prompt, /second person|wrong gender/i);
  });

  it("fills template slots", () => {
    const template = getPromptTemplate("duo-sport-race");
    assert.ok(template);
    const filled = applyPromptTemplate(template!.template, {
      gender: "women",
      sport: "gravel cycling",
      competition: "race",
      location: "a muddy doubletrack",
    });
    assert.match(filled, /women/i);
    assert.match(filled, /doubletrack/i);
  });

  it("loads sport presets", () => {
    const preset = getSportPreset("gravel-duo-race");
    assert.ok(preset?.duo);
    assert.match(preset!.hints, /gravel/i);
  });
});

describe("prompt pair export", () => {
  it("includes negative section for qwen models", () => {
    const text = formatPromptPair({
      positive: "A cyclist sprints.",
      negative: "blurry, watermark",
      model: "qwen-image-2512",
    });
    assert.match(text, /# Positive/);
    assert.match(text, /# Negative/);
    assert.match(text, /watermark/);
  });

  it("notes classic flux ignores negatives; Klein Base uses CFG negatives", () => {
    assert.equal(modelUsesNegativePrompt("flux-2-klein"), true);
    assert.equal(modelUsesNegativePrompt("flux-2-klein-9b"), true);
    assert.equal(modelUsesNegativePrompt("flux-2-klein-9b-distilled"), false);
    assert.equal(modelUsesNegativePrompt("flux-dev"), false);
    const text = formatPromptPair({
      positive: "Portrait in rain.",
      negative: "blurry",
      model: "flux-dev",
    });
    assert.match(text, /ignores negatives/i);
    const kleinText = formatPromptPair({
      positive: "Portrait in rain.",
      negative: "plastic skin",
      model: "flux-2-klein-9b",
    });
    assert.match(kleinText, /# Negative/);
    assert.match(kleinText, /plastic skin/);
  });
});

describe("regenerate url", () => {
  it("routes duo history to character page with duo mode", () => {
    const url = buildRegenerateUrl({
      id: "1",
      tool: "duo",
      prompt: "Two cyclists race.",
      hints: "gravel duo race",
      model: "qwen-image-2512",
      timestamp: Date.now(),
    });
    assert.match(url, /^\/character\?/);
    assert.match(url, /mode=duo/);
    assert.match(url, /hints=gravel/);
  });

  it("routes character entries to character page", () => {
    const url = buildRegenerateUrl({
      id: "2",
      tool: "character",
      prompt: "A woman on a rooftop.",
      hints: "young woman, rooftop",
      model: "qwen-image-2512",
      timestamp: Date.now(),
    });
    assert.match(url, /^\/character\?/);
    assert.match(url, /mode=solo/);
  });

  it("routes random scene history to generate with random source", () => {
    const url = buildRegenerateUrl({
      id: "3",
      tool: "randomScene",
      prompt: "A foggy pier at dawn.",
      hints: "noir",
      model: "qwen-image-2512",
      timestamp: Date.now(),
    });
    assert.match(url, /^\/\?/);
    assert.match(url, /source=random/);
    assert.match(url, /hints=noir/);
  });
});

describe("legacy tool settings migration", () => {
  it("merges duo cache into character with duo mode", () => {
    const { tools, changed } = migrateLegacyToolSettings({
      character: { hints: "solo hint", sceneMode: "solo" },
      duo: {
        hints: "duo hint",
        sportPresetId: "gravel-duo",
        teamKit: true,
      },
    } as ToolSettingsCache);

    assert.equal(changed, true);
    assert.equal(tools.character?.sceneMode, "duo");
    assert.equal(tools.character?.hints, "duo hint");
    assert.equal(tools.character?.sportPresetId, "gravel-duo");
    assert.equal(tools.character?.teamKit, true);
    assert.equal("duo" in tools, false);
  });

  it("merges compose cache into character with compose mode", () => {
    const { tools, changed } = migrateLegacyToolSettings({
      compose: {
        hints: "cyclists racing",
        subjectMode: "duo",
        composeStyle: "inline",
        mood: "tense",
      },
    } as ToolSettingsCache);

    assert.equal(changed, true);
    assert.equal(tools.character?.sceneMode, "compose");
    assert.equal(tools.character?.composeSubjectMode, "duo");
    assert.equal(tools.character?.composeStyle, "inline");
    assert.equal(tools.character?.mood, "tense");
    assert.equal("compose" in tools, false);
  });

  it("merges random scene cache into generate with random source", () => {
    const { tools, changed } = migrateLegacyToolSettings({
      generate: { mode: "positive" },
      randomScene: {
        genre: "noir",
        includePeople: false,
        wildness: 80,
      },
    } as ToolSettingsCache);

    assert.equal(changed, true);
    assert.equal(tools.generate?.generateSource, "random");
    assert.equal(tools.generate?.genre, "noir");
    assert.equal(tools.generate?.includePeople, false);
    assert.equal(tools.generate?.wildness, 80);
    assert.equal("randomScene" in tools, false);
  });

  it("leaves cache unchanged when no legacy keys exist", () => {
    const input = {
      character: { hints: "solo" },
      generate: { generateSource: "keywords" as const },
    };
    const { tools, changed } = migrateLegacyToolSettings(input);
    assert.equal(changed, false);
    assert.deepEqual(tools, input);
  });
});

describe("variation matrix", () => {
  it("builds row by column cells", () => {
    const cells = buildMatrixAxes({
      axisRow: "variation",
      axisCol: "location",
      rowCount: 2,
      colCount: 2,
      recentLocations: ["forest", "beach"],
    });
    assert.equal(cells.length, 4);
    assert.ok(cells[0].rowLabel.startsWith("Var "));
    assert.equal(cells[0].colLabel, "forest");
  });
});

describe("tag assist", () => {
  it("wraps selected text with emphasis syntax", () => {
    const result = applyTagAssistToSelection("neon alley, cat", 12, 15, "emphasis");
    assert.match(result.nextValue, /\(cat:1\.2\)/);
  });
});

describe("locked location", () => {
  it("appends location hint when missing", () => {
    const merged = applyLockedLocation("young woman, long hair", "Tokyo rooftop at night");
    assert.match(merged!, /location:\s*Tokyo rooftop at night/i);
  });

  it("preserves explicit location in hints", () => {
    const merged = applyLockedLocation("location: neon alley", "Tokyo rooftop");
    assert.match(merged!, /location:\s*neon alley/i);
    assert.doesNotMatch(merged!, /Tokyo rooftop/);
  });
});

describe("sport preset modes", () => {
  it("filters solo presets", () => {
    const solo = sportPresetsForMode("solo");
    assert.ok(solo.every((preset) => !preset.duo));
    assert.ok(solo.some((preset) => preset.id === "gravel-solo"));
    assert.ok(solo.some((preset) => preset.id === "marathon-solo"));
    assert.ok(solo.some((preset) => preset.id === "trail-run-solo"));
  });

  it("filters running duo presets", () => {
    const duo = sportPresetsForMode("duo");
    const running = duo.filter((preset) => preset.category === "running");
    assert.equal(running.length, 4);
    assert.ok(running.some((preset) => preset.id === "running-duo"));
  });
});

describe("scene composer", () => {
  it("merges background and subject in layered mode", () => {
    const merged = composeScenePrompt({
      backgroundPrompt: "A misty pine forest at dawn.",
      subjectPrompt: "Two cyclists sprint through mud.",
      style: "layered",
    });
    assert.match(merged, /Two cyclists/);
    assert.match(merged, /misty pine forest/i);
  });
});

describe("locked variation seed", () => {
  it("uses locked seed when provided", () => {
    assert.equal(
      applyLockedVariationSeed("random roll", "pinned seed phrase"),
      "pinned seed phrase",
    );
  });
});

describe("regenerate url seed", () => {
  it("includes seed param for reproducible regenerate", () => {
    const url = buildRegenerateUrl({
      id: "3",
      tool: "duo",
      prompt: "Race prompt",
      hints: "gravel duo",
      model: "qwen-image-2512",
      timestamp: Date.now(),
      metadata: { seed: "velodrome banking, wet pavement" },
    });
    assert.match(url, /seed=/);
  });
});

describe("studio backup", () => {
  it("parses valid backup json", () => {
    const backup = parseStudioBackupFile(
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        history: [],
        locationBlocklist: ["velodrome"],
        settings: { shared: { model: "qwen-image-2512", detail: "balanced" }, tools: {} },
        scenePresets: [
          {
            id: "preset-1",
            name: "Night gravel",
            createdAt: Date.now(),
            hints: "gravel duo at night",
          },
        ],
      }),
    );
    assert.equal(backup.version, 1);
    assert.deepEqual(backup.locationBlocklist, ["velodrome"]);
    assert.equal(backup.scenePresets?.[0]?.name, "Night gravel");
  });

  it("parses v2 backup with comfyui extras", () => {
    const backup = parseStudioBackupFile(
      JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        history: [],
        locationBlocklist: [],
        settings: { shared: { model: "qwen-image-2512", detail: "balanced" }, tools: {} },
        comfyUiSettings: { useServerDefaults: false, apiUrl: "http://127.0.0.1:8188" },
        comfyGallery: [
          {
            id: "g1",
            promptId: "p1",
            prompt: "test",
            comfyUrl: "http://127.0.0.1:8188",
            status: "completed",
            queuedAt: 1,
            images: [],
          },
        ],
        comfyWorkflowPresets: [
          {
            id: "w1",
            name: "Default",
            createdAt: 1,
            workflowJson: '{"6":{"inputs":{"text":"{{POSITIVE}}"}}}',
          },
        ],
      }),
    );
    assert.equal(backup.version, 2);
    if (backup.version === 2) {
      assert.equal(backup.comfyUiSettings?.apiUrl, "http://127.0.0.1:8188");
      assert.equal(backup.comfyGallery?.length, 1);
      assert.equal(backup.comfyWorkflowPresets?.[0]?.name, "Default");
    }
  });

  it("parses studio backup v3 extras", () => {
    const backup = parseStudioBackupFile(
      JSON.stringify({
        version: 3,
        exportedAt: new Date().toISOString(),
        history: [],
        locationBlocklist: [],
        settings: { shared: { model: "qwen-image-2512", detail: "balanced" }, tools: {} },
        avoidedTokens: ["velodrome"],
        promptProjects: [{ id: "p1", name: "Campaign A", createdAt: 1 }],
        activeProjectId: "p1",
      }),
    );
    assert.equal(backup.version, 3);
    if (backup.version === 3) {
      assert.deepEqual(backup.avoidedTokens, ["velodrome"]);
      assert.equal(backup.promptProjects?.[0]?.name, "Campaign A");
      assert.equal(backup.activeProjectId, "p1");
    }
  });
});

describe("compactPromptToLimit", () => {
  it("trims prompts longer than model detail limit", () => {
    const longPrompt = `${"A detailed gravel race scene with mud and rain. ".repeat(40)}`.trim();
    const result = compactPromptToLimit(longPrompt, "qwen-image-2512", "concise");
    assert.ok(result.afterChars <= result.maxChars);
    assert.ok(result.afterChars < result.beforeChars);
  });
});

describe("history filter", () => {
  const sample: PromptHistoryEntry[] = [
    {
      id: "1",
      tool: "duo",
      prompt: "A",
      model: "qwen-image-2512",
      timestamp: 1,
      favorite: true,
      rating: 5,
    },
    {
      id: "2",
      tool: "character",
      prompt: "B",
      model: "flux-2-klein",
      timestamp: 2,
      rating: 2,
    },
  ];

  it("filters favorites and tools", () => {
    const filtered = filterHistoryEntries(sample, {
      favoritesOnly: true,
      tool: "duo",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "1");
  });

  it("lists unique tools", () => {
    assert.deepEqual(uniqueHistoryTools(sample), ["character", "duo"]);
  });

  it("filters by tag", () => {
    const withTags: PromptHistoryEntry[] = [
      {
        id: "1",
        tool: "duo",
        prompt: "a",
        model: "qwen-image-2512",
        timestamp: 1,
        tags: ["race", "night"],
      },
      {
        id: "2",
        tool: "duo",
        prompt: "b",
        model: "qwen-image-2512",
        timestamp: 2,
        tags: ["portrait"],
      },
    ];
    assert.equal(filterHistoryEntries(withTags, { tag: "night" }).length, 1);
    assert.deepEqual(uniqueHistoryTags(withTags), ["night", "portrait", "race"]);
  });
});

describe("scene presets", () => {
  it("creates preset with shared locks", () => {
    const preset = createScenePreset({
      name: "Pinned kit",
      hints: "gravel sprint",
      sharedLocks: {
        lockedWardrobeId: "gravel-kit-01",
        lockedLocation: "forest doubletrack",
      },
    });
    assert.equal(preset.name, "Pinned kit");
    assert.ok(preset.id);
    assert.equal(preset.sharedLocks?.lockedLocation, "forest doubletrack");
  });
});

describe("user templates", () => {
  it("creates custom template entries", () => {
    const template = createUserTemplate({
      name: "Night race",
      template: "two cyclists racing at {{location}}",
    });
    assert.equal(template.label, "Night race");
    assert.match(template.id, /^user-/);
  });
});

describe("prompt diff", () => {
  it("marks changed words", () => {
    const diff = diffPromptWords(
      "two gravel cyclists racing",
      "two gravel cyclists racing with helmets",
    );
    assert.equal(diff.changed, true);
    assert.ok(diff.segments.some((segment) => segment.type === "add"));
  });
});

describe("scene preset share URL", () => {
  it("round-trips shareable scene params", () => {
    const params = buildShareableSceneParams({
      hints: "gravel sprint at dusk",
      sportPresetId: "gravel-duo",
      shared: {
        lockedWardrobeId: "kit-01",
        lockedLocation: "forest doubletrack",
        lockedVariationSeed: "seed-abc",
      },
    });
    const url = buildScenePresetShareUrl("/character", params, { mode: "duo" });
    const parsed = parseScenePresetFromSearch(url.slice(url.indexOf("?")));
    assert.deepEqual(parsed, params);
  });

  it("round-trips pet and fantasy preset ids", () => {
    const params = buildShareableSceneParams({
      hints: "golden retriever on a trail",
      petPresetId: "dog-action",
      fantasyPresetId: "spellblade",
      shared: {},
    });
    const encoded = buildScenePresetShareUrl("/pet", params);
    const parsed = parseScenePresetFromSearch(encoded.slice(encoded.indexOf("?")));
    assert.equal(parsed?.petPresetId, "dog-action");
    assert.equal(parsed?.fantasyPresetId, "spellblade");
  });
});

describe("prompt sidecar", () => {
  it("builds versioned sidecar payload", () => {
    const sidecar = buildPromptSidecar({
      positive: "Two cyclists racing",
      model: "qwen-image-2512",
      tool: "duo",
      hints: "gravel sprint",
      comfyNode: "TextEncodeQwenImage",
    });
    assert.equal(sidecar.version, 1);
    assert.equal(sidecar.positive, "Two cyclists racing");
    assert.equal(sidecar.tool, "duo");
    assert.ok(sidecar.exportedAt);
  });

  it("parses valid sidecar files", () => {
    const sidecar = parsePromptSidecar(
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        positive: "Two cyclists racing",
        model: "qwen-image-2512",
        negative: "blurry",
        hints: "gravel duo",
      }),
    );
    assert.equal(sidecar.positive, "Two cyclists racing");
    assert.equal(sidecar.negative, "blurry");
  });

  it("rejects invalid sidecar files", () => {
    assert.throws(() => parsePromptSidecar("{}"));
  });

  it("extracts queue params and image URLs from gallery sidecar metadata", () => {
    const sidecar = buildPromptSidecar({
      positive: "Inpaint the sky",
      model: "flux-inpaint",
      tool: "inpaint",
      metadata: {
        comfyUrl: "http://127.0.0.1:8188",
        queueParams: {
          seed: "42",
          inputImageFilename: "source.png",
          maskImageFilename: "mask.png",
        },
        sourceImageUrl: "/api/comfyui/view?filename=source.png",
        maskImageUrl: "/api/comfyui/view?filename=mask.png",
        queueQualityProfile: "final",
      },
    });
    assert.deepEqual(sidecarQueueParams(sidecar)?.seed, "42");
    const requeue = sidecarRequeueContext(sidecar);
    assert.equal(requeue.queueParams?.inputImageFilename, "source.png");
    assert.equal(requeue.queueQualityProfile, "final");
    assert.match(requeue.sourceImageUrl ?? "", /source\.png/);
    assert.match(requeue.maskImageUrl ?? "", /mask\.png/);
  });
});

describe("comfyui workflow preview", () => {
  it("previews placeholder injection without queueing", () => {
    const preview = previewWorkflowInjection({
      prompt: "Two cyclists racing",
      negativePrompt: "blurry",
      params: {
        seed: "999",
        width: "768",
        height: "512",
        cfg: "6",
        steps: "24",
      },
      comfy: {
        workflowJson: JSON.stringify({
          "3": {
            class_type: "KSampler",
            inputs: { seed: "{{SEED}}", steps: "{{STEPS}}", cfg: "{{CFG}}" },
          },
          "5": {
            class_type: "EmptyLatentImage",
            inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}" },
          },
          "6": {
            class_type: "CLIPTextEncode",
            inputs: { text: "{{POSITIVE}}", clip: ["4", 0] },
          },
          "7": {
            class_type: "CLIPTextEncode",
            inputs: { text: "{{NEGATIVE}}", clip: ["4", 0] },
          },
        }),
      },
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.replacements?.positive, 1);
    assert.equal(preview.replacements?.negative, 1);
    assert.equal(preview.resolvedParams?.seed, "999");
    assert.match(preview.workflowJson ?? "", /Two cyclists racing/);
  });

  it("returns preflight issues for unresolved checkpoint tokens", () => {
    const preview = previewWorkflowInjection({
      prompt: "Portrait",
      comfy: {
        workflowJson: JSON.stringify({
          "4": {
            class_type: "CheckpointLoaderSimple",
            inputs: { ckpt_name: "{{CHECKPOINT}}" },
          },
          "6": {
            class_type: "CLIPTextEncode",
            inputs: { text: "{{POSITIVE}}", clip: ["4", 1] },
          },
        }),
      },
    });

    assert.equal(preview.ok, true);
    assert.equal(
      preview.preflightIssues?.some(
        (issue) => issue.severity === "error" && issue.message.includes("CHECKPOINT"),
      ),
      true,
    );
  });

  it("previews {{PROMPT}} alias tokens", () => {
    const preview = previewWorkflowInjection({
      prompt: "Sunset over mountains",
      comfy: {
        workflowJson: JSON.stringify({
          "6": {
            class_type: "CLIPTextEncode",
            inputs: { text: "{{PROMPT}}", clip: ["4", 0] },
          },
        }),
      },
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.replacements?.positive, 1);
    assert.match(preview.workflowJson ?? "", /Sunset over mountains/);
  });

  it("previews CLIP node fallback when placeholders are missing", () => {
    const preview = previewWorkflowInjection({
      prompt: "Portrait in soft light",
      negativePrompt: "blurry",
      comfy: {
        workflowJson: JSON.stringify({
          "6": {
            class_type: "CLIPTextEncode",
            _meta: { title: "Positive Prompt" },
            inputs: { text: "a photo of a cat", clip: ["4", 0] },
          },
          "7": {
            class_type: "CLIPTextEncode",
            _meta: { title: "Negative Prompt" },
            inputs: { text: "low quality", clip: ["4", 0] },
          },
        }),
      },
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.replacements?.positive, 1);
    assert.equal(preview.replacements?.negative, 1);
    assert.match(preview.workflowJson ?? "", /Portrait in soft light/);
    assert.match(preview.workflowJson ?? "", /blurry/);
  });
});

describe("comfyui workflow config", () => {
  const sampleWorkflow = JSON.stringify({
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{POSITIVE}}", clip: ["4", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{NEGATIVE}}", clip: ["4", 0] },
    },
  });

  it("validates API workflow JSON with placeholders", () => {
    const validation = validateWorkflowJson(sampleWorkflow);
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.nodeIds, ["6", "7"]);
    assert.equal(validation.placeholders?.positive, 1);
    assert.equal(validation.placeholders?.negative, 1);
  });

  it("rejects workflows without a positive placeholder", () => {
    const validation = validateWorkflowJson(
      JSON.stringify({
        "6": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["4", 0] } },
      }),
    );
    assert.equal(validation.ok, false);
  });

  it("injects prompts via placeholder tokens anywhere in the tree", () => {
    const workflow = JSON.parse(sampleWorkflow) as Record<string, unknown>;
    const injected = injectWorkflowPlaceholders(
      workflow,
      { positive: "Two cyclists racing", negative: "blurry, watermark" },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
    );
    assert.equal(injected.positiveReplacements, 1);
    assert.equal(injected.negativeReplacements, 1);
    const positiveNode = injected.workflow["6"] as { inputs: { text: string } };
    assert.equal(positiveNode.inputs.text, "Two cyclists racing");
  });

  it("injects queue parameter placeholders", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
        },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}" },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["4", 0] },
      },
    } satisfies Record<string, unknown>;

    const injected = injectWorkflowPlaceholders(
      workflow,
      {
        positive: "A rainy alley",
        params: {
          seed: "12345",
          width: "768",
          height: "512",
          cfg: "6.5",
          steps: "28",
        },
      },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
    );

    assert.equal(injected.paramReplacements.seed, 1);
    assert.equal(injected.paramReplacements.width, 1);
    const sampler = injected.workflow["3"] as {
      inputs: { seed: string; steps: string; cfg: string };
    };
    assert.equal(sampler.inputs.seed, "12345");
    assert.equal(sampler.inputs.steps, "28");
    const latent = injected.workflow["5"] as {
      inputs: { width: string; height: string };
    };
    assert.equal(latent.inputs.width, "768");
    assert.equal(latent.inputs.height, "512");
  });

  it("injects custom workflow tokens", () => {
    const workflow = {
      "2": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "{{CHECKPOINT}}" },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["2", 0] },
      },
    } satisfies Record<string, unknown>;

    const injected = injectWorkflowPlaceholders(
      workflow,
      {
        positive: "A rainy alley",
        customTokens: [{ token: "{{CHECKPOINT}}", value: "flux1-dev.safetensors" }],
      },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
    );

    assert.equal(injected.customReplacements?.["{{CHECKPOINT}}"], 1);
    const checkpoint = injected.workflow["2"] as {
      inputs: { ckpt_name: string };
    };
    assert.equal(checkpoint.inputs.ckpt_name, "flux1-dev.safetensors");
  });

  it("injectWorkflowPlaceholders tolerates cyclic object graphs without stack overflow", () => {
    const workflow: Record<string, unknown> = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["2", 0] },
      },
    };
    const node = workflow["1"] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    // Simulate a corrupted graph edge that points at the node object itself.
    node.inputs.model = node;

    const injected = injectWorkflowPlaceholders(
      workflow,
      { positive: "refined portrait" },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
    );
    const encoded = injected.workflow["1"] as {
      inputs: { text: string };
    };
    assert.equal(encoded.inputs.text, "refined portrait");
    assert.equal(injected.positiveReplacements, 1);
  });

  it("strips empty runtime overrides", () => {
    assert.equal(
      stripEmptyComfyUiRuntime({ apiUrl: "  ", positiveToken: "" }),
      undefined,
    );
    assert.deepEqual(stripEmptyComfyUiRuntime({ apiUrl: "http://127.0.0.1:8188" }), {
      apiUrl: "http://127.0.0.1:8188",
    });
  });

  it("preserves queue target model and loader params through runtime strip", () => {
    assert.deepEqual(
      stripEmptyComfyUiRuntime({
        workflowFileId: "abc123",
        queueTargetModel: "flux-2-klein-9b",
        queueQualityProfile: "final",
        directWorkflowPatching: false,
        queueParams: {
          unetFilename: "flux-2-klein-9b.safetensors",
          vaeFilename: "flux2-vae.safetensors",
        },
      }),
      {
        workflowFileId: "abc123",
        queueTargetModel: "flux-2-klein-9b",
        queueQualityProfile: "final",
        directWorkflowPatching: false,
        queueParams: {
          unetFilename: "flux-2-klein-9b.safetensors",
          vaeFilename: "flux2-vae.safetensors",
        },
      },
    );
  });
});

describe("comfyui workflow files", () => {
  it("builds runtime with only workflow json from a selected file", () => {
    const file: ComfyWorkflowFile = {
      id: "flux-main",
      name: "Flux main",
      createdAt: 1,
      workflowJson: '{"6":{"inputs":{"text":"{{POSITIVE}}"}}}',
    };

    const runtime = comfyUiSettingsToRuntime({
      ...DEFAULT_COMFYUI_SETTINGS,
      useServerDefaults: false,
      workflowJson: file.workflowJson,
    });

    assert.equal(runtime?.workflowJson, file.workflowJson);
    assert.match(runtime?.workflowJson ?? "", /POSITIVE/);
  });

  it("keeps server defaults when no workflow file is selected", () => {
    const runtime = comfyUiSettingsToRuntime({
      ...DEFAULT_COMFYUI_SETTINGS,
      useServerDefaults: true,
    });
    // useServerDefaults still ships queue params / LoRA tokens for injection,
    // but not client workflow JSON or API URL overrides.
    assert.ok(runtime);
    assert.equal(runtime?.workflowJson, undefined);
    assert.equal(runtime?.apiUrl, undefined);
    assert.equal(runtime?.queueParams?.width, "1328");
    assert.equal(runtime?.queueParams?.height, "1328");
  });

  it("lists server workflow paths from env", () => {
    process.env.COMFYUI_WORKFLOW_PATHS = "workflows/a.json,workflows/b.json";
    assert.deepEqual(listServerWorkflowPaths(), [
      "workflows/a.json",
      "workflows/b.json",
    ]);
    delete process.env.COMFYUI_WORKFLOW_PATHS;
  });
});

describe("comfyui gallery outputs", () => {
  it("extracts image refs from ComfyUI history outputs", () => {
    const images = extractImagesFromOutputs({
      "9": {
        images: [
          { filename: "ComfyUI_00001_.png", subfolder: "", type: "output" },
        ],
      },
      "12": {
        images: [
          { filename: "preview.png", subfolder: "temp", type: "temp" },
        ],
      },
    });
    assert.equal(images.length, 2);
    assert.equal(images[0]?.filename, "ComfyUI_00001_.png");
  });

  it("filters gallery entries by status and favorites", () => {
    const entries = [
      {
        id: "1",
        promptId: "a",
        prompt: "one",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 1,
        favorite: true,
        images: [],
      },
      {
        id: "2",
        promptId: "b",
        prompt: "two",
        comfyUrl: "http://127.0.0.1:8188",
        status: "pending" as const,
        queuedAt: 2,
        images: [],
      },
    ];
    assert.equal(
      filterComfyGalleryEntries(entries, { favoritesOnly: true }).length,
      1,
    );
    assert.equal(
      filterComfyGalleryEntries(entries, { status: "pending" }).length,
      1,
    );
    assert.equal(
      filterComfyGalleryEntries(entries, { query: "one" }).length,
      1,
    );
    assert.equal(
      filterComfyGalleryEntries(entries, { query: "duo" }).length,
      0,
    );
  });

  it("filters and sorts gallery entries by model and rating", () => {
    const entries = [
      {
        id: "high",
        promptId: "a",
        prompt: "rated",
        model: "model-a",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 1,
        reviewRating: 5 as const,
        favorite: true,
        images: [],
      },
      {
        id: "mid",
        promptId: "b",
        prompt: "mid",
        model: "model-b",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 2,
        reviewRating: 3 as const,
        images: [],
      },
      {
        id: "risk",
        promptId: "c",
        prompt: "risk",
        model: "model-a",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 3,
        images: [],
      },
    ];
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { model: "model-a" }).map((e) => e.id),
      ["high", "risk"],
    );
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { minRating: 4 }).map((e) => e.id),
      ["high"],
    );
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { atRiskOnly: true }).map((e) => e.id),
      ["mid", "risk"],
    );
    assert.deepEqual(
      sortGalleryEntries(entries, "rating-desc").map((e) => e.id),
      ["high", "mid", "risk"],
    );
  });

  it("filters gallery entries by media kind", () => {
    const entries = [
      {
        id: "still",
        promptId: "a",
        prompt: "photo",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 1,
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
      },
      {
        id: "clip",
        promptId: "b",
        prompt: "movie",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 2,
        images: [{ filename: "out.mp4", subfolder: "", type: "output" }],
      },
    ];
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { mediaKind: "image" }).map((e) => e.id),
      ["still"],
    );
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { mediaKind: "video" }).map((e) => e.id),
      ["clip"],
    );
    assert.equal(
      filterComfyGalleryEntries(entries, { mediaKind: "all" }).length,
      2,
    );
  });

  it("filters gallery entries by audio and mesh media kinds", () => {
    const entries = [
      {
        id: "still",
        promptId: "a",
        prompt: "photo",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 1,
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
      },
      {
        id: "song",
        promptId: "b",
        prompt: "violin",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 2,
        images: [{ filename: "out.wav", subfolder: "audio", type: "output" }],
      },
      {
        id: "shape",
        promptId: "c",
        prompt: "teapot",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 3,
        images: [{ filename: "mesh.glb", subfolder: "mesh", type: "output" }],
      },
    ];
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { mediaKind: "audio" }).map((e) => e.id),
      ["song"],
    );
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { mediaKind: "mesh" }).map((e) => e.id),
      ["shape"],
    );
  });

  it("paginates gallery entries", () => {
    const entries = Array.from({ length: 25 }, (_, index) => `entry-${index}`);
    const page1 = paginateGalleryEntries(entries, 1, 12);
    assert.equal(page1.items.length, 12);
    assert.equal(page1.page, 1);
    assert.equal(page1.totalPages, 3);
    assert.equal(page1.items[0], "entry-0");

    const page3 = paginateGalleryEntries(entries, 3, 12);
    assert.equal(page3.items.length, 1);
    assert.equal(page3.items[0], "entry-24");

    const overflow = paginateGalleryEntries(entries, 99, 12);
    assert.equal(overflow.page, 3);
    assert.equal(overflow.items[0], "entry-24");
  });

  it("shows all entries when page size is all", () => {
    const entries = Array.from({ length: 25 }, (_, index) => `entry-${index}`);
    assert.equal(resolveGalleryPageSize("all", 25), 25);
    const all = paginateGalleryEntries(
      entries,
      1,
      resolveGalleryPageSize("all", entries.length),
    );
    assert.equal(all.items.length, 25);
    assert.equal(all.totalPages, 1);
  });

  it("formats and normalizes slideshow intervals", () => {
    assert.equal(formatGallerySlideshowInterval(5000), "5s");
    assert.equal(formatGallerySlideshowInterval(90_000), "1m 30s");
    assert.equal(formatGallerySlideshowInterval(120_000), "2m");
    assert.equal(normalizeGallerySlideshowIntervalMs(8000), 7500);
    assert.equal(normalizeGallerySlideshowIntervalMs("nope"), 5000);
  });

  it("resolves slideshow transition preferences", () => {
    assert.equal(resolveGallerySlideshowTransition("zoom"), "zoom");
    assert.equal(resolveGallerySlideshowTransition("invalid"), "slide");
    assert.equal(resolveGallerySlideshowTransitionMs("none"), 0);
    assert.equal(resolveGallerySlideshowTransitionMs("fade"), 520);
  });

  it("builds pet scene seeds from hints", () => {
    const parsed = parsePetHints("tabby cat on a sunny windowsill");
    assert.equal(parsed.species, "cat");
    assert.equal(parsed.pair, false);

    const { seed } = buildRandomPetSeed("tabby cat on a sunny windowsill", "portrait");
    assert.match(seed, /solo pet only/i);
    assert.match(seed, /tabby cat|cat/i);
    assert.doesNotMatch(seed, /\b(a person|woman|man|human figure)\b/i);

    const pairParsed = parsePetHints("two playful cats in a living room");
    assert.equal(pairParsed.pair, true);
    const pairSeed = buildRandomPetSeed("two playful cats in a living room", "action");
    assert.match(pairSeed.seed, /two animals only/i);
  });

  it("loads pet presets", () => {
    const preset = getPetPreset("golden-retriever-park");
    assert.ok(preset?.hints.includes("golden retriever"));
    assert.ok(PET_PRESETS.length >= 30);
  });

  it("builds pet preset blocks from options", () => {
    const options = normalizePetPresetOptions({
      species: "cat",
      coatStyle: "long-fluffy",
      expression: "curious",
      settingVibe: "windowsill",
    });
    assert.equal(countPetPresetSelections(options), 4);
    const block = buildPetPresetBlock(options);
    assert.ok(block?.includes("PET PRESET"));
    assert.match(block ?? "", /cat/i);
    assert.match(block ?? "", /windowsill/i);
  });

  it("builds fantasy scene seeds and presets", () => {
    const options = normalizeFantasyPresetOptions({
      focus: "environment",
      subgenre: "dark-fantasy",
      settingArchetype: "underdark",
      magicElement: "necrotic-mist",
    });
    assert.equal(countFantasyPresetSelections(options), 4);
    assert.equal(resolveFantasyFocus(options, ""), "environment");
    assert.equal(fantasyFocusIncludesPeople(resolveFantasyFocus(options, "")), false);

    const { seed } = buildRandomFantasySeed(undefined, [], options, 70);
    assert.match(seed, /empty fantasy environment/i);
    assert.match(seed, /underdark|bioluminescent|fungi/i);

    const preset = getFantasyPreset("dragon-lair");
    assert.ok(preset?.hints.includes("dragon"));
    assert.ok(FANTASY_PRESETS.length >= 30);

    const block = buildFantasyPresetBlock(options);
    assert.ok(block?.includes("FANTASY PRESET"));

    assert.equal(resolveFantasyShotFraming("environment", "portrait"), "wide");
    assert.equal(resolveFantasyShotFraming("character", "action"), "action");
    assert.match(
      getFantasyShotFramingLine("full-body"),
      /full-body framing/i,
    );
  });

  it("sorts gallery entries", () => {
    const entries = [
      {
        id: "1",
        promptId: "a",
        prompt: "alpha",
        tool: "duo",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 100,
        completedAt: 300,
        favorite: false,
        images: [],
      },
      {
        id: "2",
        promptId: "b",
        prompt: "beta",
        tool: "character",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 200,
        completedAt: 100,
        favorite: true,
        images: [],
      },
    ];

    assert.deepEqual(
      sortGalleryEntries(entries, "queued-desc").map((entry) => entry.id),
      ["2", "1"],
    );
    assert.deepEqual(
      sortGalleryEntries(entries, "queued-asc").map((entry) => entry.id),
      ["1", "2"],
    );
    assert.deepEqual(
      sortGalleryEntries(entries, "completed-desc").map((entry) => entry.id),
      ["1", "2"],
    );
    assert.deepEqual(
      sortGalleryEntries(entries, "tool-asc").map((entry) => entry.id),
      ["2", "1"],
    );
    assert.deepEqual(
      sortGalleryEntries(entries, "favorites-first").map((entry) => entry.id),
      ["2", "1"],
    );
  });

  it("builds a cross-entry lightbox playlist", () => {
    const entries = [
      {
        id: "a",
        promptId: "p1",
        prompt: "first prompt",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 1,
        images: [{ filename: "a.png", subfolder: "", type: "output" }],
      },
      {
        id: "b",
        promptId: "p2",
        prompt: "second prompt",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed" as const,
        queuedAt: 2,
        images: [
          { filename: "b1.png", subfolder: "", type: "output" },
          { filename: "b2.png", subfolder: "", type: "output" },
        ],
      },
    ];

    const playlist = buildGalleryLightboxPlaylist(entries);
    assert.equal(playlist.images.length, 3);
    assert.equal(playlist.thumbImages.length, 3);
    assert.equal(playlist.originalImages.length, 3);
    assert.equal(playlist.titles[0], "first prompt");
    assert.match(playlist.images[0] ?? "", /[?&]w=1600(?:&|$)/);
    assert.match(playlist.thumbImages[0] ?? "", /[?&]w=512(?:&|$)/);
    assert.doesNotMatch(playlist.originalImages[0] ?? "", /[?&]w=/);
    assert.equal(resolveGalleryLightboxOpenIndex(entries, "b", 1), 2);
  });

  it("plays clips from the original view URL instead of a stills proxy", () => {
    const playlist = buildGalleryLightboxPlaylist([
      {
        id: "clip",
        promptId: "p-clip",
        prompt: "walks on",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: 1,
        images: [{ filename: "clip.mp4", subfolder: "", type: "output", format: "image/png" }],
      },
    ]);
    assert.equal(playlist.mediaKinds[0], "video");
    assert.doesNotMatch(playlist.images[0] ?? "", /[?&]w=/);
    assert.match(playlist.images[0] ?? "", /filename=clip\.mp4/);
    assert.equal(playlist.images[0], playlist.originalImages[0]);
  });

  it("prefers the mp4 over a preview still for clip heroes", () => {
    const entry = {
      id: "clip",
      promptId: "p-clip",
      prompt: "walks on",
      comfyUrl: "http://127.0.0.1:8188",
      status: "completed" as const,
      queuedAt: 1,
      images: [
        { filename: "preview.png", subfolder: "", type: "output" },
        { filename: "clip.mp4", subfolder: "", type: "output" },
      ],
    };
    assert.equal(galleryEntryPrimaryPlaybackIndex(entry), 1);
    assert.equal(galleryEntryPrimaryMediaKind(entry), "video");
    assert.match(galleryEntryHeroPreviewUrl(entry) ?? "", /filename=clip\.mp4/);
    assert.doesNotMatch(galleryEntryHeroPreviewUrl(entry) ?? "", /preview\.png/);
    assert.equal(
      filterComfyGalleryEntries([entry], { mediaKind: "video" }).map(item => item.id)[0],
      "clip",
    );
  });

  it("uses the original animated webp for WAN-style clip heroes", () => {
    const entry = {
      id: "wan-clip",
      promptId: "p-wan",
      prompt: "walks on",
      comfyUrl: "http://127.0.0.1:8188",
      status: "completed" as const,
      queuedAt: 1,
      tool: "video",
      derivedKind: "t2v" as const,
      images: [
        { filename: "preview.png", subfolder: "", type: "output" },
        {
          filename: "clip.webp",
          subfolder: "",
          type: "output",
          format: "image/webp",
        },
      ],
    };
    assert.equal(galleryEntryPrimaryPlaybackIndex(entry), 1);
    assert.equal(galleryEntryPrimaryMediaKind(entry), "video");
    assert.match(galleryEntryHeroPreviewUrl(entry) ?? "", /filename=clip\.webp/);
    assert.doesNotMatch(galleryEntryHeroPreviewUrl(entry) ?? "", /[?&]w=/);
    assert.doesNotMatch(galleryEntryHeroPreviewUrl(entry) ?? "", /preview\.png/);
    const playlist = buildGalleryLightboxPlaylist([entry]);
    assert.equal(playlist.mediaKinds[1], "video");
    assert.match(playlist.images[1] ?? "", /filename=clip\.webp/);
    assert.doesNotMatch(playlist.images[1] ?? "", /[?&]w=/);
    assert.equal(resolveGalleryLightboxOpenIndex([entry], "wan-clip", 1), 1);
  });
});

describe("comfyui job status formatting", () => {
  it("includes queue position while pending", () => {
    const line = formatComfyUiJobStatusLine({
      promptId: "abc-123",
      status: "pending",
      queuePosition: 2,
      statusMessage: "Queue position 2",
      comfyUrl: "http://127.0.0.1:8188",
    });
    assert.match(line, /Queued · position 2/);
    assert.match(line, /prompt_id abc-123/);
  });

  it("labels running jobs", () => {
    const line = formatComfyUiJobStatusLine({
      promptId: "abc-123",
      status: "running",
      queuePosition: 0,
      statusMessage: "Running now",
    });
    assert.match(line, /Running in ComfyUI/);
  });

  it("includes sampler progress while running", () => {
    const line = formatComfyUiJobStatusLine({
      promptId: "abc-123",
      status: "running",
      progressValue: 7,
      progressMax: 28,
      progressNode: "3",
    });
    assert.match(line, /Running · 7\/28/);
    assert.doesNotMatch(line, /\(25%\)/);
    assert.match(line, /node 3/);
    assert.equal(
      comfyUiJobStatusLabel({
        promptId: "abc-123",
        status: "running",
        progressValue: 7,
        progressMax: 28,
      }),
      "Running · 25%",
    );
  });
});

describe("history search filter", () => {
  it("filters by query substring", () => {
    const sample: PromptHistoryEntry[] = [
      {
        id: "1",
        tool: "duo",
        prompt: "velodrome sprint",
        model: "qwen-image-2512",
        timestamp: 1,
      },
    ];
    assert.equal(
      filterHistoryEntries(sample, { query: "velodrome" }).length,
      1,
    );
    assert.equal(
      filterHistoryEntries(sample, { query: "gravel" }).length,
      0,
    );
  });
});

describe("topic phrase normalization", () => {
  it("collapses duplicated dash phrases", () => {
    assert.equal(
      normalizeTopicPhrase(
        "beautiful woman dressed for night on the town — beautiful woman dressed for night on the town",
      ),
      "beautiful woman dressed for night on the town",
    );
  });

  it("collapses duplicated in phrases", () => {
    assert.equal(
      normalizeTopicPhrase("neon alley in neon alley"),
      "neon alley",
    );
  });
});

describe("parseSettingHint for topic seeds", () => {
  it("does not treat subject-led seeds as standalone locations", () => {
    const parsed = parseSettingHint(
      "beautiful woman dressed for night on the town",
    );
    assert.equal(parsed.location, null);
    assert.equal(parsed.remainder, "beautiful woman dressed for night on the town");
  });
});

describe("buildRandomTopicPhrase", () => {
  it("never returns theme duplicated with an em dash", () => {
    const seed = "beautiful woman dressed for night on the town";
    const duplicatePattern = /^(.+)\s+[—–-]\s+\1$/i;
    for (let index = 0; index < 40; index += 1) {
      const { seed: phrase } = buildRandomTopicPhrase(seed, []);
      assert.equal(duplicatePattern.test(phrase), false, `duplicate dash phrase: ${phrase}`);
      assert.notEqual(
        phrase.toLowerCase(),
        `${seed.toLowerCase()} — ${seed.toLowerCase()}`,
      );
    }
  });
});

describe("buildTemplateTopicList", () => {
  it("returns unique normalized topics for subject seeds", () => {
    const topics = buildTemplateTopicList({
      seedTopic: "beautiful woman dressed for night on the town",
      count: 8,
    });
    const duplicatePattern = /^(.+)\s+[—–-]\s+\1$/i;
    assert.ok(topics.length >= 3);
    assert.equal(
      new Set(topics.map((topic) => topic.toLowerCase())).size,
      topics.length,
    );
    for (const topic of topics) {
      assert.equal(duplicatePattern.test(topic), false, `duplicate dash phrase: ${topic}`);
    }
  });
});

describe("workflow category defaults", () => {
  it("scores workflow filenames by model category", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      { id: "flux-default", name: "Flux Klein default", filename: "flux-klein.json", workflowJson: "{}", createdAt: 1753843200000 },
      { id: "qwen-default", name: "Qwen image", filename: "qwen-image.json", workflowJson: "{}", createdAt: 1753843200000 },
    ]);
    assert.equal(map["flux-2-klein"], "flux-default");
    assert.ok(map["qwen-image-2512"]);
  });

  it("prefers lightning workflows for lightning model ids", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      {
        id: "qwen-standard",
        name: "Qwen 2512 standard",
        filename: "qwen-image-2512.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
      {
        id: "qwen-lightning-4",
        name: "Qwen 2512 Lightning 4-step",
        filename: "qwen-2512-lightning-4steps.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
    ]);
    assert.equal(map["qwen-image-2512-lightning-4"], "qwen-lightning-4");
    assert.equal(map["qwen-image-2512"], "qwen-standard");
  });

  it("prefers distilled klein workflows for distilled model ids", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      {
        id: "klein-base",
        name: "Flux Klein 4B base",
        filename: "flux-2-klein-base-4b.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
      {
        id: "klein-distilled",
        name: "Flux Klein 4B distilled",
        filename: "flux-2-klein-4b.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
    ]);
    assert.equal(map["flux-2-klein-4b-distilled"], "klein-distilled");
    assert.equal(map["flux-2-klein"], "klein-base");
  });

  it("prefers 9b distilled klein workflows for 9b distilled model ids", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      {
        id: "klein-base-9b",
        name: "Flux Klein 9B base",
        filename: "flux-2-klein-base-9b.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
      {
        id: "klein-distilled-9b",
        name: "FLUX-KLEIN-9B-distilled",
        filename: "FLUX-KLEIN-9B-distilled.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
    ]);
    assert.equal(map["flux-2-klein-9b-distilled"], "klein-distilled-9b");
    assert.equal(map["flux-2-klein-9b"], "klein-base-9b");
  });

  it("prefers rapid aio workflows for aio checkpoint model ids", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      {
        id: "qwen-standard",
        name: "Qwen 2511 edit",
        filename: "qwen-image-edit-2511.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
      {
        id: "rapid-aio",
        name: "Qwen Rapid AIO NSFW v23",
        filename: "qwen-rapid-aio-nsfw-v23.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
    ]);
    assert.equal(map["qwen-rapid-aio-nsfw"], "rapid-aio");
    assert.notEqual(map["qwen-rapid-aio-sfw"], "rapid-aio");
    assert.equal(map["qwen-image-edit-2511"], "qwen-standard");
  });

  it("maps 2511 lightning 8 workflows to the edit lightning target model", async () => {
    const { suggestWorkflowDefaultsByCategory } = await import("./workflow-category-defaults");
    const map = suggestWorkflowDefaultsByCategory([
      {
        id: "qwen-2511-l8",
        name: "Qwen 2511 Lightning 8-step",
        filename: "qwen-2511-lightning-8step.json",
        workflowJson: "{}",
        createdAt: 1753843200000,
      },
    ]);
    assert.equal(map["qwen-image-edit-2511-lightning-8"], "qwen-2511-l8");
    assert.notEqual(map["qwen-image-2512-lightning-8"], "qwen-2511-l8");
  });

  it("infers models from workflow labels", async () => {
    const { inferModelsFromWorkflowLabel } = await import("./workflow-category-defaults");
    const fluxModels = inferModelsFromWorkflowLabel({
      name: "Flux Klein default",
      filename: "flux-klein.json",
    });
    assert.ok(fluxModels.includes("flux-2-klein"));
    assert.equal(
      inferModelsFromWorkflowLabel({ name: "mystery workflow", filename: "custom.json" }).length,
      0,
    );
  });

  it("treats lightening typo as Lightning and prefers 2512-lightning-8", async () => {
    const { inferModelsFromWorkflowLabel } = await import("./workflow-category-defaults");
    const models = inferModelsFromWorkflowLabel({
      name: "qwen-image-2512-lightening-8",
      filename: "qwen-image-2512-lightening-8.json",
    });
    assert.ok(
      models.includes("qwen-image-2512-lightning-8"),
      `expected lightning-8 in ${models.join(", ")}`,
    );
    assert.ok(
      !models.includes("qwen-image-2512") ||
        models.indexOf("qwen-image-2512-lightning-8") <= models.indexOf("qwen-image-2512"),
    );
    // Vanilla must not be the sole/top suggestion for a Lightning-named file.
    assert.notEqual(models[0], "qwen-image-2512");
  });
});

describe("model workflow map", () => {
  it("resolves explicit map then filename defaults", async () => {
    const { resolveWorkflowForModelSelection } = await import("./model-workflow-map");
    const files = [
      { id: "flux-default", name: "Flux Klein default", filename: "flux-klein.json" },
      { id: "qwen-default", name: "Qwen image", filename: "qwen-image.json" },
    ];

    assert.equal(
      resolveWorkflowForModelSelection("qwen-image-2512", {
        map: { "qwen-image-2512": "custom-qwen" },
        workflowFiles: files,
      }),
      "custom-qwen",
    );

    assert.equal(
      resolveWorkflowForModelSelection("flux-2-klein", { workflowFiles: files }),
      "flux-default",
    );
  });

  it("patchSharedForModelChange selects mapped workflow", async () => {
    const { patchSharedForModelChange } = await import("./model-workflow-map");
    const patch = patchSharedForModelChange(
      "qwen-image-2512",
      {
        model: "flux-2-klein",
        detail: "balanced",
        modelWorkflowMap: { "qwen-image-2512": "wf-qwen" },
      },
      [{ id: "wf-qwen", name: "Qwen workflow" }],
    );
    assert.equal(patch.model, "qwen-image-2512");
    assert.equal(patch.selectedWorkflowFileId, "wf-qwen");
  });

  it("limits models to those with available workflows", async () => {
    const { modelsSupportedByAvailableWorkflows } = await import("./model-workflow-map");
    const files = [
      { id: "flux-default", name: "Flux Klein default", filename: "flux-klein.json" },
      { id: "qwen-default", name: "Qwen image", filename: "qwen-image.json" },
    ];

    const supported = modelsSupportedByAvailableWorkflows({
      map: { "qwen-image-2512": "custom-qwen" },
      workflowFiles: files,
      currentModel: "sdxl-base",
    });
    assert.equal(supported.source, "available_workflows");
    assert.ok(supported.models.includes("flux-2-klein"));
    assert.ok(supported.models.includes("qwen-image-2512"));
    assert.ok(supported.models.includes("qwen-image-2512-lightning-8"));
    assert.ok(supported.models.includes("sdxl-base"));

    const override = modelsSupportedByAvailableWorkflows({
      workflowFiles: files,
      currentModel: "qwen-image-2512",
      showAllOverride: true,
    });
    assert.equal(override.source, "override");
    assert.ok(override.models.length > supported.models.length);
  });

  it("keeps vanilla Qwen selectable when only Lightning is mapped", async () => {
    const { modelsSupportedByAvailableWorkflows } = await import("./model-workflow-map");
    const supported = modelsSupportedByAvailableWorkflows({
      map: { "qwen-image-2512-lightning-8": "wf-lightning" },
      workflowFiles: [
        {
          id: "wf-lightning",
          name: "Qwen Lightning 8",
          filename: "qwen-lightning-8.json",
        },
        {
          id: "wf-vanilla",
          name: "Qwen 2512 vanilla",
          filename: "qwen-image-2512.json",
        },
      ],
      currentModel: "qwen-image-2512-lightning-8",
    });
    assert.ok(supported.models.includes("qwen-image-2512"));
    assert.ok(supported.models.includes("qwen-image-2512-lightning-4"));
    assert.ok(supported.models.includes("qwen-image-2512-lightning-8"));
  });
});

describe("qwen edit builder", () => {
  it("builds keep/replace/add/remove instructions", async () => {
    const { buildQwenEditPrompt } = await import("./qwen-edit-builder");
    const prompt = buildQwenEditPrompt([
      { kind: "keep", text: "subject pose" },
      { kind: "replace", text: "background with rainy alley" },
      { kind: "add", text: "steam from grates" },
    ]);
    assert.match(prompt, /Keep unchanged:/);
    assert.match(prompt, /Replace with:/);
    assert.match(prompt, /Add:/);
  });
});

describe("character identity bundle", () => {
  it("round-trips bundle export fields", async () => {
    const { buildCharacterIdentityBundle, parseCharacterIdentityBundle } =
      await import("./character-identity-bundle");
    const bundle = buildCharacterIdentityBundle({
      name: "Night courier",
      shared: {
        model: "qwen-image-2512",
        detail: "balanced",
        lockedLocation: "neon alley",
      },
      hints: "leather jacket, rain",
    });
    const parsed = parseCharacterIdentityBundle(JSON.stringify(bundle));
    assert.equal(parsed.name, "Night courier");
    assert.equal(parsed.lockedLocation, "neon alley");
  });

  it("carries descriptor, LoRA triggers, and IP-Adapter ref settings", async () => {
    const { applyCharacterIdentityBundle, buildCharacterIdentityBundle } =
      await import("./character-identity-bundle");
    const bundle = buildCharacterIdentityBundle({
      name: "Courier bundle",
      shared: {
        model: "qwen-image-2512",
        detail: "balanced",
        activeCharacterDescriptor: "tall courier, silver jacket",
        ipAdapterImageFilename: "courier-ref.png",
        ipAdapterStrength: 0.55,
        ipAdapterModelFilename: "ip-adapter-plus.safetensors",
      },
      loraTriggerPhrases: ["courierlora", ""],
    });
    assert.equal(bundle.descriptor, "tall courier, silver jacket");
    assert.equal(bundle.ipAdapterImageFilename, "courier-ref.png");
    assert.equal(bundle.ipAdapterStrength, 0.55);
    assert.deepEqual(bundle.loraTriggerPhrases, ["courierlora"]);

    const patch = applyCharacterIdentityBundle(bundle);
    assert.equal(patch.activeCharacterDescriptor, "tall courier, silver jacket");
    assert.equal(patch.ipAdapterModelFilename, "ip-adapter-plus.safetensors");
  });

  it("upserts and removes saved identity bundles by name (case-insensitive)", async () => {
    const { buildCharacterIdentityBundle } = await import("./character-identity-bundle");
    const { upsertSavedIdentityBundle, removeSavedIdentityBundle } = await import("./settings-cache"
    );
    const first = buildCharacterIdentityBundle({
      name: "Courier",
      shared: { model: "qwen-image-2512", detail: "balanced" },
    });
    const updated = buildCharacterIdentityBundle({
      name: "COURIER",
      shared: { model: "flux-2-klein", detail: "rich" },
    });

    const afterFirst = upsertSavedIdentityBundle(undefined, first);
    assert.equal(afterFirst.length, 1);

    const afterUpdate = upsertSavedIdentityBundle(afterFirst, updated);
    assert.equal(afterUpdate.length, 1);
    assert.equal(afterUpdate[0]?.model, "flux-2-klein");

    const afterRemove = removeSavedIdentityBundle(afterUpdate, "courier");
    assert.equal(afterRemove.length, 0);
  });
});

describe("batch lint helpers", () => {
  it("filters blocked batch indexes", async () => {
    const { filterBatchByLintIndexes } = await import("./batch-lint-gate");
    assert.deepEqual(filterBatchByLintIndexes(["a", "b", "c"], [1]), ["a", "c"]);
  });
});

describe("gallery handoff", () => {
  it("builds refine and image prompt paths", async () => {
    const { galleryHandoffPath, galleryImprovePath } = await import("./gallery-handoff");
    assert.equal(galleryHandoffPath("refine"), "/refine?from=gallery");
    assert.equal(galleryHandoffPath("inpaint"), "/inpaint?from=gallery");
    assert.equal(galleryHandoffPath("outpaint"), "/outpaint?from=gallery");
    assert.equal(galleryHandoffPath("imagePrompt"), "/image-prompt?from=gallery");
    assert.equal(galleryHandoffPath("controlnet"), "/controlnet?from=gallery");
    assert.equal(galleryHandoffPath("promptEditor"), "/prompt?from=gallery");
    assert.equal(galleryImprovePath(), "/refine?from=gallery&improve=1");
  });

  it("builds gallery pick mode URLs", async () => {
    const {
      galleryPickPath,
      parseGalleryPickTarget,
      galleryHandoffHomePath,
      galleryPickActionLabel,
    } = await import("./gallery-handoff");
    assert.equal(galleryPickPath("roleplay"), "/gallery?pickFor=roleplay");
    assert.equal(
      galleryPickPath("cast", { characterId: "char-1" }),
      "/gallery?pickFor=cast&character=char-1"
    );
    assert.equal(parseGalleryPickTarget("roleplay"), "roleplay");
    assert.equal(parseGalleryPickTarget("cast"), "cast");
    assert.equal(parseGalleryPickTarget("video"), "video");
    assert.equal(parseGalleryPickTarget("bogus"), null);
    assert.equal(galleryHandoffHomePath("roleplay"), "/story");
    assert.equal(galleryPickActionLabel("roleplay"), "Use for Story");
    assert.equal(galleryHandoffHomePath("video"), "/video");
    assert.equal(galleryPickActionLabel("video"), "Use for Video");
    assert.equal(galleryPickActionLabel("fitting"), "Use for Outfit");
    assert.equal(galleryPickActionLabel("moodboard"), "Use for Look");
  });
});

describe("semantic search", () => {
  it("ranks overlapping tokens", async () => {
    const { rankBySemanticQuery } = await import("./semantic-search");
    const ranked = rankBySemanticQuery(
      [{ text: "gravel cyclist muddy forest" }, { text: "neon city portrait" }],
      "gravel forest",
      (item) => item.text,
    );
    assert.equal(ranked[0]?.item.text.includes("gravel"), true);
  });
});

describe("prompt iteration tree", () => {
  it("builds parent child forest", async () => {
    const { buildPromptIterationForest } = await import("./prompt-iteration-tree");
    const forest = buildPromptIterationForest([
      {
        id: "a",
        prompt: "root",
        tool: "character",
        model: "qwen-image-2512",
        timestamp: 1,
      },
      {
        id: "b",
        prompt: "child",
        tool: "character",
        model: "qwen-image-2512",
        timestamp: 2,
        metadata: { parentHistoryId: "a" },
      },
    ] as import("@/hooks/usePromptHistory").PromptHistoryEntry[]);
    assert.equal(forest.length, 1);
    assert.equal(forest[0]?.children.length, 1);
  });
});

describe("regional prompt builder", () => {
  it("joins labeled segments", async () => {
    const { buildRegionalPrompt } = await import("./regional-prompt-builder");
    const prompt = buildRegionalPrompt([
      { regionId: "subject", prompt: "cyclist" },
      { regionId: "background", prompt: "misty forest" },
    ]);
    assert.match(prompt, /Subject: cyclist/);
    assert.match(prompt, /Background: misty forest/);
  });
});

describe("preset packs", () => {
  it("round-trips pack json", async () => {
    const { buildPresetPack, parsePresetPack } = await import("./preset-packs");
    const pack = buildPresetPack({
      name: "Night pack",
      presets: [
        {
          id: "p1",
          name: "Neon alley",
          hints: "rain",
          tool: "studio",
          createdAt: 1,
        },
      ],
    });
    const parsed = parsePresetPack(JSON.stringify(pack));
    assert.equal(parsed.name, "Night pack");
    assert.equal(parsed.presets.length, 1);
  });
});

describe("context negative profile", () => {
  it("selects pet profile from tool context", async () => {
    const { resolveContextNegativeProfile } = await import("./context-negative-profile");
    const profile = resolveContextNegativeProfile(undefined, undefined, {
      tool: "pet",
      hints: "golden retriever in park",
    });
    assert.equal(profile?.id, "pet");
  });

  it("defaults to qwen-general for qwen models", async () => {
    const { resolveContextNegativeProfile } = await import("./context-negative-profile");
    const profile = resolveContextNegativeProfile(undefined, undefined, {
      model: "qwen-image-2512",
      hints: "city street at dusk",
    });
    assert.equal(profile?.id, "qwen-general");
  });

  it("uses qwen-portrait for portrait hints on qwen models", async () => {
    const { resolveContextNegativeProfile } = await import("./context-negative-profile");
    const profile = resolveContextNegativeProfile(undefined, undefined, {
      model: "qwen-image-2512-lightning-8",
      hints: "portrait headshot",
    });
    assert.equal(profile?.id, "qwen-portrait");
  });

  it("selects video-motion profile for video tool / WAN models", async () => {
    const { resolveContextNegativeProfile } = await import("./context-negative-profile");
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        tool: "video",
        hints: "cyclist cresting a hill",
      })?.id,
      "video-motion",
    );
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        model: "wan-video",
        hints: "camera push-in",
      })?.id,
      "video-motion",
    );
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        model: "wan-video-lightning-4",
        tool: "video",
      })?.id,
      "video-motion-lightning",
    );
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        model: "wan-video-rapid-aio",
        tool: "video",
      })?.id,
      "video-motion-lightning",
    );
  });
});

describe("gallery mutations", () => {
  it("builds location and wardrobe mutation prompts", async () => {
    const { buildMutatedPrompt } = await import("./gallery-mutations");
    assert.match(
      await buildMutatedPrompt("cyclist in forest", "location", "neon alley"),
      /Relocate scene to neon alley/,
    );
    assert.match(
      await buildMutatedPrompt("portrait", "wardrobe", "red dress"),
      /Change outfit to red dress/,
    );
  });
});

describe("history export formats", () => {
  it("exports csv rows with escaped commas", async () => {
    const { exportHistoryCsv } = await import("./history-export-formats");
    const csv = exportHistoryCsv([
      {
        id: "1",
        tool: "character",
        model: "qwen-image-2512",
        timestamp: Date.UTC(2026, 0, 1),
        prompt: "hello, world",
        hints: "",
      },
    ] as import("@/hooks/usePromptHistory").PromptHistoryEntry[]);
    assert.match(csv, /"hello, world"/);
    assert.match(csv, /character/);
  });
});

describe("prompt lineage session", () => {
  it("prefers explicit parent history id", async () => {
    const { resolveParentHistoryId } = await import("./prompt-lineage-session");
    assert.equal(resolveParentHistoryId("abc"), "abc");
    assert.equal(resolveParentHistoryId(undefined), undefined);
  });
});

describe("queue params settings", () => {
  it("returns empty merge on server", async () => {
    const { resolveQueueParams } = await import("./queue-params-settings");
    const params = resolveQueueParams({ seed: "42", width: "1024" });
    assert.equal(params.seed, "42");
    assert.equal(params.width, "1024");
  });
});

describe("comfyui runtime queue params", () => {
  it("preserves model sampling params from client overrides", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(undefined, {
      seed: "42",
      samplingShift: 1.73,
      fluxMaxShift: 1.15,
      fluxBaseShift: 0.5,
    });
    assert.equal(params.samplingShift, 1.73);
    assert.equal(params.fluxMaxShift, 1.15);
    assert.equal(params.fluxBaseShift, 0.5);
  });

  it("preserves loader filenames from client params on the server merge path", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(undefined, {
      unetFilename: "flux-2-klein-9b.safetensors",
      vaeFilename: "flux2-vae.safetensors",
    });
    assert.equal(params.unetFilename, "flux-2-klein-9b.safetensors");
    assert.equal(params.vaeFilename, "flux2-vae.safetensors");
  });

  it("fills missing loader filenames from model registry on the server", async () => {
    const { ensureQueueLoaderParams } = await import("./comfyui-config");
    const params = ensureQueueLoaderParams({ seed: "1" }, "flux-2-klein-9b");
    assert.equal(params.unetFilename, "flux-2-klein-base-9b.safetensors");
    assert.equal(params.vaeFilename, "flux2-vae.safetensors");
  });

  it("uses lightning-native resolution on the server when overrides omit size", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(undefined, { seed: "42" }, {
      model: "qwen-image-2512-lightning-8",
    });
    assert.equal(params.width, "1328");
    assert.equal(params.height, "1328");
    assert.equal(params.steps, "8");
    assert.equal(params.cfg, "1");
  });

  it("preserves Compose portrait size on inject merge when a figure is present", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(
      undefined,
      {
        seed: "42",
        width: "1104",
        height: "1472",
        inputImageFilename: "mirror-selfie.png",
      },
      { model: "qwen-image-edit-2511-lightning-8" },
    );
    assert.equal(params.width, "1104");
    assert.equal(params.height, "1472");
  });

  it("forces Lightning Max Compose denoise to 1 even when params carry soft edit denoise", async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import("./comfyui-config"
    );
    const tokens = resolvePlaceholderTokens();
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          latent_image: ["120", 0],
          steps: 20,
          cfg: 4,
          denoise: 0.65,
          sampler_name: "euler",
          scheduler: "simple",
          seed: 1,
        },
      },
    };
    const injected = injectPromptsWithFallbacks(
      workflow,
      {
        positive: "compose",
        negative: "",
        params: {
          width: 1104,
          height: 1472,
          cfg: 4,
          steps: 20,
          denoise: 0.65,
          inputImageFilename: "fig.png",
        },
      },
      tokens,
      {
        model: "qwen-image-edit-2511-lightning-8",
        qualityProfile: "max",
        directWorkflowPatching: true,
      },
    );
    const sampler = Object.values(injected.workflow).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "KSampler",
    ) as { inputs: { denoise: number; cfg: number; steps: number } };
    assert.equal(sampler.inputs.denoise, 1);
    assert.equal(sampler.inputs.cfg, 1);
    assert.equal(sampler.inputs.steps, 8);
  });

  it("honors sidebar denoise override on Lightning inject (does not force to 1)", async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import("./comfyui-config"
    );
    const tokens = resolvePlaceholderTokens();
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          latent_image: ["120", 0],
          steps: 20,
          cfg: 4,
          denoise: 0.65,
          sampler_name: "euler",
          scheduler: "simple",
          seed: 1,
        },
      },
    };
    const injected = injectPromptsWithFallbacks(
      workflow,
      {
        positive: "compose",
        negative: "",
        params: {
          width: 1104,
          height: 1472,
          cfg: 4,
          steps: 20,
          denoise: 0.72,
          inputImageFilename: "fig.png",
        },
      },
      tokens,
      {
        model: "qwen-image-edit-2511-lightning-8",
        qualityProfile: "max",
        directWorkflowPatching: true,
        samplerOverrides: { denoise: "0.72" },
      },
    );
    const sampler = Object.values(injected.workflow).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "KSampler",
    ) as { inputs: { denoise: number; cfg: number; steps: number } };
    assert.equal(sampler.inputs.denoise, 0.72);
    assert.equal(sampler.inputs.cfg, 1);
    assert.equal(sampler.inputs.steps, 8);
  });

  it("honors client queue params denoise on Lightning inject without sidebar runtime", async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import("./comfyui-config"
    );
    const tokens = resolvePlaceholderTokens();
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          latent_image: ["120", 0],
          steps: 20,
          cfg: 4,
          denoise: 0.65,
          sampler_name: "euler",
          scheduler: "simple",
          seed: 1,
        },
      },
    };
    const injected = injectPromptsWithFallbacks(
      workflow,
      {
        positive: "compose",
        negative: "",
        params: {
          width: 1104,
          height: 1472,
          cfg: 4,
          steps: 20,
          denoise: 0.58,
          inputImageFilename: "fig.png",
        },
      },
      tokens,
      {
        model: "qwen-image-edit-2511-lightning-8",
        qualityProfile: "max",
        directWorkflowPatching: true,
      },
    );
    const sampler = Object.values(injected.workflow).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "KSampler",
    ) as { inputs: { denoise: number; cfg: number; steps: number } };
    assert.equal(sampler.inputs.denoise, 0.58);
  });

  it("applies selected style LoRAs on Edit-2511 Lightning after the Lightning LoRA", async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import("./comfyui-config"
    );
    const tokens = resolvePlaceholderTokens();
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name:
            "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "120": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1328, height: 1328, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          latent_image: ["120", 0],
          steps: 8,
          cfg: 1,
          denoise: 1,
          sampler_name: "euler",
          scheduler: "simple",
          seed: 1,
        },
      },
    };
    const injected = injectPromptsWithFallbacks(
      workflow,
      {
        positive: "compose",
        negative: "",
        params: { width: 1328, height: 1328, cfg: 1, steps: 8, denoise: 1 },
      },
      tokens,
      {
        model: "qwen-image-edit-2511-lightning-8",
        directWorkflowPatching: true,
        loraLibrary: [
          {
            id: "skin",
            label: "Skin",
            triggerPhrase: "{{LORA_SKIN}}",
            tokenValue: "qwen-edit-skin.safetensors",
            enabled: true,
            strengthModel: 0.7,
            strengthClip: 0.7,
            order: 0,
          },
        ],
      },
    );
    const lightning = injected.workflow["7"] as {
      inputs: { lora_name: string; strength_model: number };
    };
    assert.match(lightning.inputs.lora_name, /Lightning-8steps/i);
    assert.equal(lightning.inputs.strength_model, 1);
    const style = Object.values(injected.workflow).find(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { inputs?: { lora_name?: string } }).inputs?.lora_name ===
          "qwen-edit-skin.safetensors",
    ) as {
      class_type: string;
      inputs: { model: [string, number]; strength_model: number };
    };
    assert.ok(style, "expected style LoRA chained after Lightning");
    assert.equal(style.class_type, "LoraLoaderModelOnly");
    assert.equal(style.inputs.model[0], "7");
    assert.equal(style.inputs.strength_model, 0.7);
    const sampler = injected.workflow["8"] as {
      inputs: { model: [string, number] };
    };
    assert.notEqual(sampler.inputs.model[0], "7");
  });

  it("bumps sub-native lightning overrides to 1328 on the server merge path", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(
      { queueParams: { width: "1024", height: "1024", steps: "20", cfg: "4" } },
      {},
      { model: "qwen-image-2512-lightning-8" },
    );
    assert.equal(params.width, "1328");
    assert.equal(params.height, "1328");
    assert.equal(params.steps, "8");
    assert.equal(params.cfg, "1");
    assert.equal(params.samplerName, "euler");
    assert.equal(params.scheduler, "simple");
  });

  it("comfyui-config resolveQueueParams keeps lockLatentSize thumbs on injection path", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(
      { queueQualityProfile: "draft", queueParams: { steps: "8", cfg: "1" } },
      {
        width: "256",
        height: "384",
        lockLatentSize: "true",
        inputImageFilename: "fig.png",
        seed: "1",
      },
      { model: "qwen-image-edit-2511-lightning-8" },
    );
    assert.equal(params.width, "256");
    assert.equal(params.height, "384");
    assert.equal(params.lockLatentSize, "true");
  });

  it("comfyui-config resolveQueueParams honors preserveInputAspect false without lock", async () => {
    const { resolveQueueParams } = await import("./comfyui-config");
    const params = resolveQueueParams(
      { queueQualityProfile: "draft", queueParams: { steps: "4", cfg: "1" } },
      {
        width: "256",
        height: "384",
        preserveInputAspect: "false",
        inputImageFilename: "fig.png",
        seed: "1",
      },
      { model: "qwen-image-edit-2511-lightning-8", preserveInputAspect: false },
    );
    assert.equal(params.width, "256");
    assert.equal(params.height, "384");
  });

  it("injects native lightning latent size even when workflow JSON still says 1024", async () => {
    const {
      injectPromptsWithFallbacks,
      resolvePlaceholderTokens,
      resolveQueueParams,
    } = await import("./comfyui-config");
    const tokens = resolvePlaceholderTokens();
    const result = injectPromptsWithFallbacks(
      {
        "6": {
          class_type: "EmptyLatentImage",
          inputs: { width: 1024, height: 1024, batch_size: 1 },
        },
        "8": {
          class_type: "KSampler",
          inputs: { steps: 20, cfg: 4, seed: 1, sampler_name: "dpmpp_2m", scheduler: "karras" },
        },
      },
      {
        positive: "test prompt",
        params: resolveQueueParams(undefined, {}, { model: "qwen-image-2512-lightning-8" }),
      },
      tokens,
      {
        model: "qwen-image-2512-lightning-8",
        loaders: {
          unet: "qwen_image_2512_bf16.safetensors",
          dualClip: "qwen_2.5_vl_7b.safetensors",
        },
      },
    );
    const latent = (result.workflow["6"] as { inputs: { width: number; height: number } }).inputs;
    assert.equal(latent.width, 1328);
    assert.equal(latent.height, 1328);
    const sampler = (result.workflow["8"] as { inputs: { steps: number; cfg: number } }).inputs;
    assert.equal(sampler.steps, 8);
    assert.equal(sampler.cfg, 1);
  });

  it("replaces UNET and VAE placeholders during injection", async () => {
    const { injectPromptsWithFallbacks, DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN } =
      await import("./comfyui-config");
    const result = injectPromptsWithFallbacks(
      {
        "228": {
          class_type: "UNETLoader",
          inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: "default" },
        },
        "230": {
          class_type: "VAELoader",
          inputs: { vae_name: DEFAULT_VAE_TOKEN },
        },
      },
      {
        positive: "Portrait",
        params: {
          unetFilename: "flux-2-klein-9b.safetensors",
          vaeFilename: "flux2-vae.safetensors",
        },
      },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
    );
    const unet = result.workflow["228"] as { inputs?: { unet_name?: string } };
    const vae = result.workflow["230"] as { inputs?: { vae_name?: string } };
    assert.equal(unet.inputs?.unet_name, "flux-2-klein-9b.safetensors");
    assert.equal(vae.inputs?.vae_name, "flux2-vae.safetensors");
    assert.equal(result.customReplacements?.[DEFAULT_UNET_TOKEN], 1);
    assert.equal(result.customReplacements?.[DEFAULT_VAE_TOKEN], 1);
  });

  it("resolves UNET/VAE through queue injection context when only model is known", async () => {
    const {
      resolveQueueInjectionContext,
      injectPromptsWithFallbacks,
      stripEmptyComfyUiRuntime,
      DEFAULT_UNET_TOKEN,
      DEFAULT_VAE_TOKEN,
    } = await import("./comfyui-config");

    const runtime = stripEmptyComfyUiRuntime({
      workflowFileId: "abc123",
      queueTargetModel: "flux-2-klein-9b",
    });

    const { params, loaders, customTokens } = resolveQueueInjectionContext({
      runtime,
      override: { seed: "1" },
      model: "flux-2-klein-9b",
    });

    assert.equal(params.unetFilename, "flux-2-klein-base-9b.safetensors");
    assert.equal(params.vaeFilename, "flux2-vae.safetensors");

    const result = injectPromptsWithFallbacks(
      {
        "228": {
          class_type: "UNETLoader",
          inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: "default" },
        },
        "230": {
          class_type: "VAELoader",
          inputs: { vae_name: DEFAULT_VAE_TOKEN },
        },
      },
      {
        positive: "Portrait",
        params,
        customTokens,
      },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
        initImage: "{{INIT_IMAGE}}",
        videoFrames: "{{VIDEO_FRAMES}}",
        videoFps: "{{VIDEO_FPS}}",
      },
      { loaders },
    );

    const unet = result.workflow["228"] as { inputs?: { unet_name?: string } };
    const vae = result.workflow["230"] as { inputs?: { vae_name?: string } };
    assert.equal(unet.inputs?.unet_name, "flux-2-klein-base-9b.safetensors");
    assert.equal(vae.inputs?.vae_name, "flux2-vae.safetensors");
  });

  it("resolves loaders using checkpoint map forwarded in runtime", async () => {
    const { resolveQueueInjectionContext } = await import("./comfyui-config");

    const { params, loaders } = resolveQueueInjectionContext({
      runtime: {
        queueTargetModel: "custom-flux-model",
        modelCheckpointMap: {
          "custom-flux-model": "flux-2-klein-9b-fp8.safetensors",
        },
        modelVaeMap: {
          "custom-flux-model": "FLUX.2-klein-9B.safetensors",
        },
      },
      override: { seed: "1" },
    });

    assert.equal(params.unetFilename, "flux-2-klein-9b-fp8.safetensors");
    assert.equal(params.vaeFilename, "FLUX.2-klein-9B.safetensors");
    assert.equal(loaders.unet, "flux-2-klein-9b-fp8.safetensors");
    assert.equal(loaders.vae, "FLUX.2-klein-9B.safetensors");
  });

  it("replaces missing wan-video T2V map entries with installed Rapid AIO at queue time", async () => {
    const { resolveQueueInjectionContext, DEFAULT_CHECKPOINT_TOKEN } =
      await import("./comfyui-config");

    const inventory = [
      "DreamShaper_8_pruned.safetensors",
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    ];
    const { params, loaders, customTokens } = resolveQueueInjectionContext({
      runtime: {
        queueTargetModel: "wan-video",
        modelCheckpointMap: {
          "wan-video": "wan2.2_t2v_high_noise_14B_fp16.safetensors",
        },
        workflowCustomTokens: [
          {
            token: DEFAULT_CHECKPOINT_TOKEN,
            value: "wan2.2_t2v_high_noise_14B_fp16.safetensors",
          },
        ],
      },
      model: "wan-video",
      availableCheckpoints: inventory,
    });

    assert.equal(
      loaders.checkpoint,
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
    assert.equal(
      params.checkpointFilename,
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
    assert.equal(
      customTokens.find((entry) => entry.token === DEFAULT_CHECKPOINT_TOKEN)?.value,
      "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    );
  });
});

describe("avoidance options", () => {
  it("filters template candidates by token list", async () => {
    const { filterAvoidedCandidatesFromList } = await import("./avoidance-options");
    const filtered = filterAvoidedCandidatesFromList(
      ["gravel cyclist in forest", "neon city portrait"],
      ["gravel"],
    );
    assert.equal(filtered.length, 1);
    assert.match(filtered[0] ?? "", /neon city/);
  });

  it("builds instruction text from token list", async () => {
    const { buildAvoidedTokensInstructionFromList } = await import("./avoidance-options");
    const instruction = buildAvoidedTokensInstructionFromList(["velodrome", "neon"]);
    assert.match(instruction ?? "", /velodrome/);
  });
});

describe("matrix export formats", () => {
  it("exports matrix rows as CSV with escaped prompts", async () => {
    const { exportMatrixCsv } = await import("./matrix-export-formats");
    const csv = exportMatrixCsv([
      {
        rowLabel: "sport",
        colLabel: "lighting",
        prompt: 'cyclist, "golden hour"',
        seed: "123",
      },
    ]);
    assert.match(csv, /^row,column,seed,prompt,error/);
    assert.match(csv, /sport/);
    assert.match(csv, /""golden hour""/);
  });
});

describe("rating token analytics", () => {
  it("ranks tokens by high vs low gallery ratings", async () => {
    const { analyzeGalleryRatingTokens } = await import("./rating-token-analytics");
    const stats = analyzeGalleryRatingTokens([
      {
        id: "a",
        promptId: "p1",
        prompt: "gravel cyclist in misty forest morning light",
        status: "completed",
        reviewRating: 5,
        queuedAt: 1,
        tool: "character",
        model: "qwen-image-2512",
        comfyUrl: "http://127.0.0.1:8188",
      },
      {
        id: "b",
        promptId: "p2",
        prompt: "gravel cyclist in misty forest morning light",
        status: "completed",
        reviewRating: 1,
        queuedAt: 2,
        tool: "character",
        model: "qwen-image-2512",
        comfyUrl: "http://127.0.0.1:8188",
      },
    ] as import("./comfyui-gallery").ComfyGalleryEntry[]);
    const gravel = stats.find((entry) => entry.token === "gravel");
    assert.ok(gravel);
    assert.equal(gravel?.highCount, 1);
    assert.equal(gravel?.lowCount, 1);
  });

  it("extracts negative scoring tokens", async () => {
    const { negativeScoringTokens } = await import("./rating-token-analytics");
    const tokens = negativeScoringTokens([
      { token: "gravel", highCount: 1, lowCount: 3, score: -2 },
      { token: "neon", highCount: 4, lowCount: 0, score: 4 },
    ]);
    assert.deepEqual(tokens, ["gravel"]);
  });
});

describe("avoided tokens management", () => {
  it("adds and removes tokens", async () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
        },
        dispatchEvent: () => undefined,
      },
    });

    try {
      const {
        addAvoidedToken,
        removeAvoidedToken,
        exportAvoidedTokenList,
        clearAvoidedTokens,
      } = await import("./avoided-tokens");
      clearAvoidedTokens();
      addAvoidedToken("velodrome");
      assert.ok(exportAvoidedTokenList().includes("velodrome"));
      removeAvoidedToken("velodrome");
      assert.equal(exportAvoidedTokenList().includes("velodrome"), false);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

describe("gallery compare export", () => {
  it("exports compare json manifest", async () => {
    const { exportCompareJson } = await import("./gallery-compare-export");
    const json = exportCompareJson([
      {
        id: "a",
        promptId: "p1",
        prompt: "test prompt",
        status: "completed",
        queuedAt: 1,
        images: [],
        tool: "character",
        model: "qwen-image-2512",
        comfyUrl: "http://127.0.0.1:8188",
        reviewRating: 5,
      },
    ] as import("./comfyui-gallery").ComfyGalleryEntry[]);
    assert.match(json, /test prompt/);
    assert.match(json, /"count": 1/);
  });
});

describe("iteration tree export", () => {
  it("serializes parent child forest", async () => {
    const { exportIterationForestJson } = await import("./iteration-tree-export");
    const json = exportIterationForestJson([
      {
        id: "root",
        tool: "character",
        model: "qwen-image-2512",
        prompt: "root prompt",
        hints: "",
        timestamp: 1,
      },
      {
        id: "child",
        tool: "refine",
        model: "qwen-image-2512",
        prompt: "child prompt",
        hints: "",
        timestamp: 2,
        metadata: { parentHistoryId: "root" },
      },
    ] as import("@/hooks/usePromptHistory").PromptHistoryEntry[]);
    assert.match(json, /child prompt/);
    assert.match(json, /"parentId": "root"/);
  });
});

describe("gallery similarity", () => {
  it("ranks entries by prompt and param overlap", async () => {
    const { rankGallerySimilarity, orderGalleryBySimilarity } = await import("./gallery-similarity"
    );
    const reference = {
      id: "ref",
      promptId: "p-ref",
      prompt: "gravel cyclist muddy rain competitive sprint",
      model: "qwen-image-2512",
      comfyUrl: "http://127.0.0.1:8188",
      status: "completed" as const,
      queuedAt: 1,
      images: [],
      queueParams: { cfg: "7", steps: "22", width: "1024", height: "1024", seed: "1" },
    };
    const close = {
      ...reference,
      id: "close",
      promptId: "p-close",
      prompt: "gravel cyclist rain sprint finish line",
      queueParams: { cfg: "7", steps: "22", width: "1024", height: "1024", seed: "2" },
    };
    const far = {
      ...reference,
      id: "far",
      promptId: "p-far",
      prompt: "underwater jellyfish bioluminescent cave",
      model: "flux-2-klein",
      queueParams: { cfg: "5", steps: "18", width: "768", height: "768", seed: "3" },
    };
    const ranked = rankGallerySimilarity([close, far], reference);
    assert.equal(ranked[0]?.entry.id, "close");
    const ordered = orderGalleryBySimilarity([far, reference, close], reference);
    assert.equal(ordered[0]?.id, "ref");
    assert.equal(ordered[1]?.id, "close");
  });
});

describe("iteration branch diff", () => {
  it("diffs linked history entries", async () => {
    const { diffHistoryEntries, listIterationEntries } = await import("./iteration-branch-diff"
    );
    const entries = [
      {
        id: "root",
        tool: "character",
        model: "qwen-image-2512",
        prompt: "alpha beta gamma",
        hints: "",
        timestamp: 1,
      },
      {
        id: "child",
        tool: "refine",
        model: "qwen-image-2512",
        prompt: "alpha beta delta",
        hints: "",
        timestamp: 2,
        metadata: { parentHistoryId: "root" },
      },
    ] as PromptHistoryEntry[];
    const flat = listIterationEntries(entries);
    assert.equal(flat.length, 2);
    const diff = diffHistoryEntries(flat[0]!, flat[1]!);
    assert.equal(diff.diff.changed, true);
  });
});

describe("avoided tokens import export", () => {
  it("round-trips json export", async () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
        },
        dispatchEvent: () => undefined,
      },
    });

    try {
      const {
        exportAvoidedTokensJson,
        importAvoidedTokensJson,
        exportAvoidedTokenList,
        clearAvoidedTokens,
      } = await import("./avoided-tokens");
      clearAvoidedTokens();
      importAvoidedTokensJson(
        JSON.stringify({ version: 1, tokens: ["neon", "velodrome"] }),
        "replace",
      );
      assert.deepEqual(exportAvoidedTokenList().sort(), ["neon", "velodrome"]);
      const exported = JSON.parse(exportAvoidedTokensJson()) as { tokens?: string[] };
      assert.deepEqual(exported.tokens?.sort(), ["neon", "velodrome"]);
      clearAvoidedTokens();
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

describe("api smoke routes", () => {
  it("lint POST validates empty body", async () => {
    const { POST } = await import("../app/api/lint/route");
    const response = await POST(
      new Request("http://localhost/api/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    assert.equal(response.status, 400);
  });

  it("lint POST returns diagnostics", async () => {
    const { POST } = await import("../app/api/lint/route");
    const response = await POST(
      new Request("http://localhost/api/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hints: "gravel race", prompt: "two cyclists sprint" }),
      }),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()) as { issues?: unknown[] };
    assert.ok(Array.isArray(data.issues));
  });

  it("health GET returns service payload", async () => {
    const { GET } = await import("../app/api/health/route");
    const response = await GET(new Request("http://localhost/api/health"));
    assert.equal(response.status, 200);
    const data = (await response.json()) as { llm?: unknown; comfyui?: unknown };
    assert.ok(data.llm);
    assert.ok(data.comfyui);
  });
});
