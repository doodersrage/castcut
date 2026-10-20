import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatQueueQualityProfileLabel,
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
} from "./quality-profile";

describe("queue-quality-profile", () => {
  it("labels draft/final/max as Fast/Good/Best", () => {
    assert.equal(formatQueueQualityProfileLabel("draft"), "Fast");
    assert.equal(formatQueueQualityProfileLabel("final"), "Good");
    assert.equal(formatQueueQualityProfileLabel("max"), "Best");
    assert.equal(formatQueueQualityProfileLabel("followSettings"), "Follow sidebar");
  });
  it("keeps sidebar preset when profile follows settings", () => {
    assert.equal(
      resolveEffectiveSamplerPreset("optimized", "followSettings"),
      "optimized",
    );
    assert.equal(
      resolveEffectiveResolutionSizeTier("medium", "followSettings"),
      "medium",
    );
  });

  it("forces draft to base sampler and caps resolution", () => {
    assert.equal(resolveEffectiveSamplerPreset("max", "draft"), "base");
    assert.equal(resolveEffectiveResolutionSizeTier("max", "draft"), "medium");
  });

  it("floors full WAN / Rapid AIO Base to Optimized", () => {
    assert.equal(
      resolveEffectiveSamplerPreset("base", "followSettings", {
        model: "wan-video",
      }),
      "optimized",
    );
    assert.equal(
      resolveEffectiveSamplerPreset("base", "draft", {
        model: "wan-video-rapid-aio",
      }),
      "optimized",
    );
    assert.equal(
      resolveEffectiveSamplerPreset("base", "followSettings", {
        model: "wan-video-lightning-4",
      }),
      "base",
    );
  });

  it("bumps final renders to at least optimized sampler and medium resolution", () => {
    assert.equal(resolveEffectiveSamplerPreset("base", "final"), "optimized");
    assert.equal(resolveEffectiveResolutionSizeTier("small", "final"), "medium");
  });

  it("uses full max sampler and max resolution for max profile", () => {
    assert.equal(resolveEffectiveSamplerPreset("base", "max"), "max");
    assert.equal(resolveEffectiveResolutionSizeTier("small", "max"), "max");
  });

  it("resolves per-tool overrides before global profile", async () => {
    const { resolveQueueQualityProfile } = await import("./quality-profile");
    assert.equal(
      resolveQueueQualityProfile({
        tool: "variations",
        global: "draft",
        toolProfiles: { variations: "max" },
      }),
      "max",
    );
    assert.equal(
      resolveQueueQualityProfile({
        tool: "generate",
        global: "final",
        toolProfiles: { variations: "max" },
      }),
      "final",
    );
  });

  it("promotes Compose Draft to Final and restores light Lanczos on Edit Lightning Compose", async () => {
    const {
      resolveQueueQualityProfile,
      profileSkipsOutputUpscaleForModel,
      upscaleScaleForProfile,
    } = await import("./quality-profile");
    assert.equal(
      resolveQueueQualityProfile({
        tool: "compose",
        global: "draft",
        toolProfiles: {},
      }),
      "final",
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("final", {
        model: "qwen-image-edit-2511-lightning-8",
        hasInputImage: true,
      }),
      false,
    );
    assert.equal(
      upscaleScaleForProfile("final", {
        model: "qwen-image-edit-2511-lightning-8",
        hasInputImage: true,
      }),
      1.05,
    );
    assert.equal(
      upscaleScaleForProfile("max", {
        model: "qwen-image-edit-2511-lightning-8",
        hasInputImage: true,
      }),
      1.08,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("final", {
        model: "qwen-image-edit-2511-lightning-8",
        hasInputImage: false,
      }),
      true,
    );
  });

  it("promotes any model Draft to Final so keepers get enrich polish", async () => {
    const { resolveQueueQualityProfile } = await import("./quality-profile");
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-rapid-aio-nsfw",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "flux-2-klein-9b-distilled",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "wan-video",
        tool: "video",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        override: "draft",
        model: "qwen-rapid-aio-nsfw",
      }),
      "draft",
    );
  });

  it("promotes Rapid AIO Draft to Final so moiré polish runs", async () => {
    const {
      resolveQueueQualityProfile,
      formatQueuePipelineStatusNotes,
    } = await import("./quality-profile");
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-rapid-aio-nsfw",
      }),
      "final",
    );
    const notes = formatQueuePipelineStatusNotes({
      model: "qwen-rapid-aio-nsfw",
      qualityProfile: "final",
    });
    assert.ok(notes.some((note) => /moiré polish on/i.test(note)));
    assert.ok(notes.some((note) => /upscale skipped/i.test(note)));
  });

  it("promotes vanilla 2512 and Lightning Draft to Final for keeper enrich", async () => {
    const { resolveQueueQualityProfile } = await import("./quality-profile");
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-image-2512",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-image-2512-lightning-8",
      }),
      "final",
    );
  });

  it("flags final and max profiles for upscale enrichment", async () => {
    const {
      profileUsesUpscaleEnrich,
      profileUsesNeuralUpscaleEnrich,
      profileSkipsOutputUpscaleForModel,
      profileUsesLightningDecodePolish,
      upscaleScaleForProfile,
      upscaleMethodForProfile,
    } = await import("./quality-profile");
    assert.equal(profileUsesUpscaleEnrich("final"), true);
    assert.equal(profileUsesUpscaleEnrich("draft"), false);
    assert.equal(upscaleScaleForProfile("final"), 1.25);
    assert.equal(upscaleScaleForProfile("max"), 1.5);
    assert.equal(
      upscaleScaleForProfile("final", { model: "qwen-image-2512-lightning-8" }),
      1,
    );
    assert.equal(
      upscaleScaleForProfile("max", { model: "qwen-image-2512-lightning-8" }),
      1,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("final", { model: "qwen-image-2512-lightning-8" }),
      true,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("max", { model: "qwen-image-2512-lightning-8" }),
      true,
    );
    assert.equal(
      upscaleMethodForProfile("max", { model: "qwen-image-2512-lightning-8" }),
      "lanczos",
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "qwen-image-2512-lightning-8" }),
      false,
    );
    assert.equal(
      profileUsesLightningDecodePolish("final", { model: "qwen-image-2512-lightning-8" }),
      true,
    );
    assert.equal(
      profileUsesLightningDecodePolish("draft", { model: "qwen-image-2512-lightning-8" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("final", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "flux-ultrareal-v4" }),
      true,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("final", { model: "flux-ultrareal-v4" }),
      false,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("final", { model: "flux-ultrareal-v4" }),
      true,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("max", { model: "flux-ultrareal-v4" }),
      false,
    );
    assert.equal(
      upscaleScaleForProfile("max", { model: "flux-ultrareal-v4" }),
      1.35,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("max", { model: "flux-2-klein-9b" }),
      false,
    );
    assert.equal(
      profileSkipsOutputUpscaleForModel("final", { model: "boogu-image-turbo" }),
      false,
    );
    assert.equal(
      upscaleScaleForProfile("final", { model: "flux-2-klein-9b" }),
      1.08,
    );
    assert.equal(
      upscaleScaleForProfile("max", { model: "flux-2-klein-9b" }),
      1.15,
    );
    assert.equal(
      upscaleScaleForProfile("final", { model: "boogu-image-turbo" }),
      1.08,
    );
    assert.equal(
      upscaleScaleForProfile("max", { model: "z-image-turbo" }),
      1.12,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "boogu-image-turbo" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "flux-2-klein-9b" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "flux-2-klein-9b-distilled" }),
      false,
    );
    assert.equal(profileUsesNeuralUpscaleEnrich("max"), true);
    const { formatQueueQualityProfileHint } = await import("./quality-profile");
    const finalHint = formatQueueQualityProfileHint("final", "base", "medium", {
      neuralUpscaleAvailable: true,
      model: "qwen-image-2512",
    });
    assert.match(String(finalHint), /chroma guard|Lanczos/i);
    assert.doesNotMatch(String(finalHint), /UpscaleModel/);
    const maxHint = formatQueueQualityProfileHint("max", "base", "medium", {
      neuralUpscaleAvailable: true,
      model: "qwen-image-2512",
    });
    assert.match(String(maxHint), /chroma guard|Lanczos/i);
    assert.doesNotMatch(String(maxHint), /UpscaleModel/);
    const lightningHint = formatQueueQualityProfileHint("final", "base", "medium", {
      model: "qwen-image-2512-lightning-8",
    });
    assert.match(String(lightningHint), /soft blur polish|no upscale/i);
    assert.doesNotMatch(String(lightningHint), /Lanczos polish/i);
    const { neuralTargetScaleAfterUpscale, parseNeuralUpscaleFactor } =
      await import("./quality-profile");
    assert.equal(neuralTargetScaleAfterUpscale("final"), 0.3125);
    assert.equal(neuralTargetScaleAfterUpscale("max"), 0.375);
    assert.equal(
      neuralTargetScaleAfterUpscale("max", { polishScale: 1.05 }),
      0.3571,
    );
    assert.equal(
      neuralTargetScaleAfterUpscale("final", {
        neuralFactor: 2,
      }),
      0.625,
    );
    assert.equal(
      neuralTargetScaleAfterUpscale("max", {
        polishScale: 1.05,
        priorLatentScale: 1.2,
      }),
      0.2976,
    );
    const { outputUpscaleScaleAfterLatent } = await import("./quality-profile");
    assert.equal(
      outputUpscaleScaleAfterLatent("max", { priorLatentScale: 1.5 }),
      1,
    );
    assert.equal(
      outputUpscaleScaleAfterLatent("max", { priorLatentScale: 1.2 }),
      1.25,
    );
    assert.equal(parseNeuralUpscaleFactor("4x-UltraSharp.pth"), 4);
    assert.equal(parseNeuralUpscaleFactor("RealESRGAN_x2plus.pth"), 2);
  });

  it("enables SDXL refiner and neural polish only on appropriate profiles", async () => {
    const {
      profileUsesSdxlRefinerEnrich,
      profileUsesNeuralUpscalePolish,
      lanczosPolishScaleAfterNeural,
      sdxlRefinerDenoiseForProfile,
    } = await import("./quality-profile");
    assert.equal(profileUsesSdxlRefinerEnrich("final"), true);
    assert.equal(profileUsesSdxlRefinerEnrich("draft"), false);
    assert.equal(profileUsesNeuralUpscalePolish("max"), true);
    assert.equal(profileUsesNeuralUpscalePolish("final"), false);
    assert.equal(lanczosPolishScaleAfterNeural(), 1.05);
    assert.equal(sdxlRefinerDenoiseForProfile("max"), 0.3);
    assert.equal(sdxlRefinerDenoiseForProfile("final"), 0.22);
  });

  it("gates latent detail pass and neural-only sharpen by model", async () => {
    const {
      profileUsesLatentDetailPass,
      profileUsesSharpenAfterNeuralUpscale,
      sharpenAlphaForProfile,
      latentDetailDenoiseForProfile,
    } = await import("./quality-profile");
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "flux-dev" }),
      true,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "flux-ultrareal-v4" }),
      false,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "flux-2-klein-9b" }),
      false,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", {
        model: "qwen-image-2512-lightning-8",
      }),
      false,
    );
    assert.equal(
      profileUsesSharpenAfterNeuralUpscale("max", { afterNeural: true }),
      true,
    );
    assert.equal(
      profileUsesSharpenAfterNeuralUpscale("max", { afterNeural: false }),
      false,
    );
    assert.equal(
      sharpenAlphaForProfile("max", { model: "qwen-image-2512" }),
      0.06,
    );
    assert.equal(latentDetailDenoiseForProfile("final"), 0.2);
    assert.equal(
      latentDetailDenoiseForProfile("final", { model: "qwen-image-2512" }),
      0.14,
    );
    assert.equal(
      latentDetailDenoiseForProfile("max", { model: "qwen-image-2512" }),
      0.2,
    );
  });
});
