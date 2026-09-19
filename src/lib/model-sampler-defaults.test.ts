import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchSamplerParamsInWorkflow } from "./comfyui-config";
import {
  ensureDistilledSamplerParams,
  ensureLightningSamplerParams,
  ensureRapidAioSamplerParams,
  formatModelSamplerHint,
  getModelSamplerDefaults,
  hasModelSamplerOverrides,
  normalizeModelSamplerPresetTier,
  ksamplerSafeScheduler,
  pickModelSamplerOverrideFields,
  resolveModelSamplerParams,
} from "./model-sampler-defaults";
import { resolveQueueParams } from "./queue-params-settings";

describe("model sampler defaults", () => {
  it("returns base category defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "base"), {
      steps: 30,
      cfg: 6.5,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });
  });

  it("returns higher optimized defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "optimized"), {
      steps: 36,
      cfg: 6,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });
  });

  it("returns fast defaults for flux-schnell in both tiers", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "optimized"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
  });

  it("uses official euler turbo sampler for Boogu Image Turbo", () => {
    assert.deepEqual(getModelSamplerDefaults("boogu-image-turbo", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "sgm_uniform",
    });
    assert.deepEqual(
      ensureLightningSamplerParams({ cfg: 7, steps: 28 }, "boogu-image-turbo").cfg,
      1,
    );
  });

  it("resolves queue params from optimized model defaults", () => {
    assert.deepEqual(resolveModelSamplerParams("qwen-image-2512", "optimized"), {
      steps: 30,
      cfg: 3.2,
      samplerName: "euler",
      scheduler: "beta",
    });
  });

  it("uses a calmer 50-step CFG ladder for vanilla qwen 2512", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "base"), {
      steps: 20,
      cfg: 2.5,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "maxCompatible"), {
      steps: 40,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "max"), {
      steps: 50,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "beta",
    });
  });

  it("returns lightning defaults for qwen 2512 4-step", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512-lightning-4", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(
      resolveModelSamplerParams("qwen-image-edit-2511-lightning-8", "optimized"),
      {
        steps: 8,
        cfg: 1,
        samplerName: "euler",
        scheduler: "simple",
      },
    );
  });

  it("returns lightning defaults for WAN video 4-step", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video-lightning-4", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "uni_pc",
      scheduler: "simple",
    });
    assert.deepEqual(
      ensureLightningSamplerParams(
        { steps: 20, cfg: 6, samplerName: "uni_pc", scheduler: "simple", seed: "1" },
        "wan-video-lightning-4",
      ),
      {
        steps: 4,
        cfg: 1,
        samplerName: "uni_pc",
        scheduler: "simple",
        seed: "1",
      },
    );
  });

  it("returns Phr00t Rapid AIO presets for WAN video", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video-rapid-aio", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("wan-video-rapid-aio", "optimized"), {
      steps: 6,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "beta",
    });
    assert.deepEqual(
      ensureRapidAioSamplerParams(
        { steps: 30, cfg: 6, samplerName: "uni_pc", scheduler: "simple", seed: "2" },
        "wan-video-rapid-aio",
      ),
      {
        steps: 4,
        cfg: 1,
        samplerName: "euler_ancestral",
        scheduler: "beta",
        seed: "2",
      },
    );
  });

  it("hints CFG-1 WAN presets (Lightning / Rapid AIO) and full WAN Optimized", async () => {
    const { formatWanVideoSamplerHint } = await import("./model-sampler-defaults");
    assert.match(
      formatWanVideoSamplerHint("wan-video-lightning-4", "base") ?? "",
      /4-step|cfg 1|simple/i,
    );
    assert.match(
      formatWanVideoSamplerHint("wan-video-rapid-aio", "base") ?? "",
      /rapid aio|optimized|cfg.?1/i,
    );
    assert.match(
      formatWanVideoSamplerHint("wan-video", "base") ?? "",
      /optimized/i,
    );
    assert.equal(formatWanVideoSamplerHint("wan-video", "optimized"), null);
  });

  it("clamps stale overrides to lightning sampler params", () => {
    assert.deepEqual(
      ensureLightningSamplerParams(
        { steps: 20, cfg: 4, samplerName: "dpmpp_2m", scheduler: "karras", seed: "9" },
        "qwen-image-2512-lightning-8",
      ),
      {
        steps: 8,
        cfg: 1,
        samplerName: "euler",
        scheduler: "simple",
        seed: "9",
      },
    );
    assert.deepEqual(
      ensureLightningSamplerParams({ cfg: 7, steps: 28 }, "qwen-image-2512"),
      { cfg: 7, steps: 28 },
    );
  });

  it("clamps stale overrides to Rapid AIO sampler params", () => {
    const rapid = getModelSamplerDefaults("qwen-rapid-aio-sfw", "base");
    assert.deepEqual(
      ensureRapidAioSamplerParams(
        { steps: 28, cfg: 4, samplerName: "dpmpp_2m", scheduler: "karras", seed: "3" },
        "qwen-rapid-aio-sfw",
      ),
      {
        steps: rapid.steps,
        cfg: rapid.cfg,
        samplerName: rapid.samplerName,
        scheduler: rapid.scheduler,
        seed: "3",
      },
    );
    assert.deepEqual(
      ensureDistilledSamplerParams(
        { cfg: 7, steps: 20 },
        "qwen-rapid-aio-nsfw",
      ).cfg,
      1,
    );
  });

  it("preserves Rapid AIO Max steps when inject passes base tier", () => {
    const preserved = ensureDistilledSamplerParams(
      {
        steps: 6,
        cfg: 1,
        samplerName: "euler",
        scheduler: "beta",
      },
      "qwen-rapid-aio-sfw",
      "base",
    );
    assert.equal(preserved.steps, 6);
    assert.equal(preserved.cfg, 1);
    // Stale beta from older presets is rewritten to Phr00t simple.
    assert.equal(preserved.scheduler, "simple");
  });

  it("returns klein distilled and base sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-4b-distilled", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "optimized"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "maxCompatible"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein", "base"), {
      steps: 24,
      cfg: 4,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "base"), {
      steps: 24,
      cfg: 4,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "maxCompatible"), {
      steps: 24,
      cfg: 4,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "max"), {
      steps: 28,
      cfg: 4,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "optimized"), {
      steps: 24,
      cfg: 4,
      samplerName: "euler",
      scheduler: "simple",
    });
  });

  it("returns rapid aio checkpoint sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-edit", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-edit-nsfw", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-edit-nsfw", "optimized"), {
      steps: 6,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-sfw", "maxCompatible"), {
      steps: 8,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-nsfw", "optimized"), {
      steps: 6,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "sgm_uniform",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-sfw", "max"), {
      steps: 8,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-edit-nsfw", "max"), {
      steps: 8,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "simple",
    });
  });

  it("normalizes preset tier values", () => {
    assert.equal(normalizeModelSamplerPresetTier("maxCompatible"), "maxCompatible");
    assert.equal(normalizeModelSamplerPresetTier("max-compatible"), "maxCompatible");
    assert.equal(normalizeModelSamplerPresetTier("max"), "max");
    assert.equal(normalizeModelSamplerPresetTier("optimized"), "optimized");
    assert.equal(normalizeModelSamplerPresetTier("base"), "base");
    assert.equal(normalizeModelSamplerPresetTier(undefined), "base");
  });

  it("uses DPM++ 2M + beta for UltraReal Fine-Tune v4 (Civitai author settings)", () => {
    const base = getModelSamplerDefaults("flux-ultrareal-v4", "base");
    assert.equal(base.samplerName, "dpmpp_2m");
    assert.equal(base.scheduler, "beta");
    assert.equal(base.steps, 30);
    assert.equal(base.cfg, 2.5);
    const max = getModelSamplerDefaults("flux-ultrareal-v4", "max");
    assert.equal(max.steps, 50);
  });

  it("keeps Klein Base CFG at 4 across quality tiers", () => {
    assert.equal(getModelSamplerDefaults("flux-2-klein-9b", "base").cfg, 4);
    assert.equal(getModelSamplerDefaults("flux-2-klein-9b", "optimized").cfg, 4);
    assert.equal(getModelSamplerDefaults("flux-2-klein-9b", "max").cfg, 4);
  });

  it("returns max compatible defaults within model sampler limits", () => {
    const optimized = getModelSamplerDefaults("flux-dev", "optimized");
    const compatible = getModelSamplerDefaults("flux-dev", "maxCompatible");
    const max = getModelSamplerDefaults("flux-dev", "max");
    assert.deepEqual(compatible, optimized);
    assert.ok(max.steps > compatible.steps);
    assert.equal(compatible.samplerName, "euler");
    assert.equal(compatible.scheduler, "simple");
  });

  it("keeps klein distilled step-locked at 4 / cfg 1 across quality tiers", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-4b-distilled", "maxCompatible"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "max"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
  });

  it("returns max quality defaults above max compatible for SDXL", () => {
    const compatible = getModelSamplerDefaults("sdxl", "maxCompatible");
    const max = getModelSamplerDefaults("sdxl", "max");
    assert.ok(max.steps > compatible.steps);
    assert.ok(compatible.steps >= getModelSamplerDefaults("sdxl", "optimized").steps);
  });

  it("returns video model family sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video", "optimized"), {
      steps: 30,
      cfg: 6,
      samplerName: "uni_pc",
      scheduler: "simple",
    });
    assert.equal(getModelSamplerDefaults("ltx-video", "base").scheduler, "simple");
    assert.equal(ksamplerSafeScheduler("ltxv"), "simple");
    assert.equal(ksamplerSafeScheduler("karras"), "karras");
  });

  it("formats sampler hint with preset label", () => {
    assert.match(
      formatModelSamplerHint("flux-dev", "optimized"),
      /Optimized · euler · simple · steps 28/,
    );
  });
});

describe("patchSamplerParamsInWorkflow", () => {
  it("patches KSampler seed, steps, cfg, sampler, and scheduler inputs", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 10,
          cfg: 5,
          sampler_name: "euler",
          scheduler: "normal",
        },
      },
    };

    const result = patchSamplerParamsInWorkflow(workflow, {
      seed: "999",
      steps: "28",
      cfg: "6.5",
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });

    const inputs = (result.workflow["3"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.seed, 999);
    assert.equal(inputs.steps, 28);
    assert.equal(inputs.cfg, 6.5);
    assert.equal(inputs.sampler_name, "dpmpp_2m");
    assert.equal(inputs.scheduler, "karras");
    assert.deepEqual(result.patched, {
      seed: 1,
      steps: 1,
      cfg: 1,
      samplerName: 1,
      scheduler: 1,
    });
  });

  it("maps leftover KSampler scheduler ltxv to simple", () => {
    const workflow = {
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 3,
          sampler_name: "euler",
          scheduler: "ltxv",
        },
      },
    };
    const coerced = patchSamplerParamsInWorkflow(workflow, { seed: 1, steps: 20, cfg: 3 });
    assert.equal(
      (coerced.workflow["5"] as { inputs: Record<string, unknown> }).inputs.scheduler,
      "simple",
    );

    const stamped = patchSamplerParamsInWorkflow(workflow, {
      seed: 1,
      steps: 20,
      cfg: 3,
      scheduler: "ltxv",
    });
    assert.equal(
      (stamped.workflow["5"] as { inputs: Record<string, unknown> }).inputs.scheduler,
      "simple",
    );
  });

  it("resolves {{DENOISE}} placeholder to 1.0 when params omit denoise", () => {
    const workflow = {
      "8": {
        class_type: "KSampler",
        inputs: { denoise: "{{DENOISE}}" },
      },
    };
    const result = patchSamplerParamsInWorkflow(workflow, {
      seed: 1,
      steps: 20,
      cfg: 4,
      samplerName: "euler",
      scheduler: "normal",
    });
    const inputs = (result.workflow["8"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.denoise, 1);
    assert.equal(result.patched.denoise, 1);
  });

  it("picks non-empty sidebar override fields", () => {
    assert.deepEqual(
      pickModelSamplerOverrideFields({ steps: "12", cfg: "", samplerName: " euler ", denoise: "0.55" }),
      { steps: "12", samplerName: "euler", denoise: "0.55" },
    );
    assert.equal(hasModelSamplerOverrides({}), false);
    assert.equal(hasModelSamplerOverrides({ cfg: "3.5" }), true);
    assert.equal(hasModelSamplerOverrides({ denoise: "0.8" }), true);
  });

  it("merges sidebar sampler overrides in resolveQueueParams", () => {
    const params = resolveQueueParams({
      model: "sdxl",
      samplerOverrides: { steps: "40", cfg: "5.5" },
    });
    assert.equal(params.steps, "40");
    assert.equal(params.cfg, "5.5");
    assert.equal(params.samplerName, "dpmpp_2m");
  });

  it("uses Balanced 0.36 denoise for Z-Image Turbo refine", () => {
    const params = resolveQueueParams({
      model: "z-image-turbo",
      tool: "refine",
      inputImageFilename: "figure.png",
    });
    assert.equal(params.denoise, 0.36);
  });

  it("sidebar denoise override wins over automatic edit denoise", () => {
    const params = resolveQueueParams({
      model: "sdxl",
      tool: "compose",
      inputImageFilename: "figure.png",
      samplerOverrides: { denoise: "0.42" },
    });
    assert.equal(params.denoise, "0.42");
  });

  it("sidebar denoise override is kept on Lightning compose (not forced to 1)", () => {
    const params = resolveQueueParams({
      model: "qwen-image-edit-2511-lightning-8",
      tool: "compose",
      inputImageFilename: "figure.png",
      samplerOverrides: { denoise: "0.55" },
    });
    assert.equal(params.denoise, "0.55");
  });
});
