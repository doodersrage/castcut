import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { injectPromptsWithFallbacks, resolvePlaceholderTokens, resolveQueueParams } from "./comfyui-config";
import {
  formatModelSamplingHint,
  getModelSamplingPatchDefaults,
  isLightningDistilledModel,
  isModelSamplingPatchNode,
  isQwenLightningModel,
  isWanLightningModel,
  modelUsesShiftSamplingPatch,
  patchModelSamplingInWorkflow,
  resolveModelSamplingParams,
} from "./model-sampling-patch";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";

describe("model sampling patch", () => {
  it("detects model sampling node class types", () => {
    assert.equal(isModelSamplingPatchNode("ModelSamplingAuraFlow"), true);
    assert.equal(isModelSamplingPatchNode("ModelSamplingFlux"), true);
    assert.equal(isModelSamplingPatchNode("ModelSamplingSD3"), true);
    assert.equal(isModelSamplingPatchNode("KSampler"), false);
  });

  it("returns aura, sd3, and qwen shift defaults", () => {
    assert.deepEqual(getModelSamplingPatchDefaults("auraflow", "base"), {
      samplingShift: 1.73,
    });
    assert.deepEqual(getModelSamplingPatchDefaults("sd3-medium", "optimized"), {
      samplingShift: 3,
    });
    assert.deepEqual(getModelSamplingPatchDefaults("qwen-image-2512", "base"), {
      samplingShift: 3.1,
    });
    assert.deepEqual(getModelSamplingPatchDefaults("qwen-image-2512", "optimized"), {
      samplingShift: 3.1,
    });
    assert.deepEqual(getModelSamplingPatchDefaults("qwen-image-2512-lightning-8", "optimized"), {});
    assert.deepEqual(getModelSamplingPatchDefaults("qwen-image-2512-lightning-8", "max"), {});
  });

  it("skips shift sampling patch for lightning models", () => {
    assert.equal(isQwenLightningModel("qwen-image-2512-lightning-8"), true);
    assert.equal(isQwenLightningModel("qwen-image-edit-2511-lightning-4"), true);
    assert.equal(isQwenLightningModel("qwen-image-2512"), false);
    assert.equal(isQwenLightningModel("wan-video-lightning-4"), false);
    assert.equal(isWanLightningModel("wan-video-lightning-4"), true);
    assert.equal(isWanLightningModel("qwen-image-2512-lightning-4"), false);
    assert.equal(isLightningDistilledModel("wan-video-lightning-4"), true);
    assert.equal(modelUsesShiftSamplingPatch("qwen-image-2512-lightning-8"), false);
    assert.equal(modelUsesShiftSamplingPatch("qwen-image-2512"), true);
  });

  it("resolves lightning shift placeholders to LightX2V AuraFlow shift (3)", () => {
    const workflow = {
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: "{{SHIFT}}" },
      },
    };

    const result = patchModelSamplingInWorkflow(
      workflow,
      resolveModelSamplingParams("qwen-image-2512", "optimized"),
      "qwen-image-2512-lightning-8",
    );
    const inputs = (result.workflow["7"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.shift, 3);
    assert.equal(result.patched.samplingShift, 1);
  });

  it("drops Flux-only inputs left on a shift-only AuraFlow node", () => {
    const workflow = {
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: {
          model: ["1", 0],
          shift: "{{SHIFT}}",
          max_shift: "{{FLUX_MAX_SHIFT}}",
          base_shift: "{{FLUX_BASE_SHIFT}}",
          width: "{{WIDTH}}",
          height: "{{HEIGHT}}",
        },
      },
    };
    const result = patchModelSamplingInWorkflow(
      workflow,
      resolveModelSamplingParams("qwen-image-2512", "optimized"),
      "qwen-image-2512",
    );
    const inputs = (result.workflow["7"] as { inputs: Record<string, unknown> }).inputs;
    assert.deepEqual(Object.keys(inputs).sort(), ["model", "shift"]);
    assert.equal(typeof inputs.shift, "number");
  });

  it("returns flux model sampling defaults", () => {
    assert.deepEqual(getModelSamplingPatchDefaults("flux-dev", "base"), {
      fluxMaxShift: 1.15,
      fluxBaseShift: 0.5,
      samplingShift: 1.73,
    });
    assert.deepEqual(resolveModelSamplingParams("flux-2-klein-9b", "base"), {
      fluxMaxShift: 1.15,
      fluxBaseShift: 0.5,
      samplingShift: 1.73,
    });
  });

  it("formats model sampling hints", () => {
    assert.match(formatModelSamplingHint("auraflow", "base") ?? "", /shift 1\.73/);
    assert.match(formatModelSamplingHint("flux-dev", "base") ?? "", /Flux max 1\.15/);
  });

  it("patches flux model sampling nodes and leaves concrete aura shift unchanged", () => {
    const workflow = {
      "10": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 1.5 },
      },
      "11": {
        class_type: "ModelSamplingFlux",
        inputs: {
          model: ["2", 0],
          max_shift: 1,
          base_shift: 0.4,
          width: 768,
          height: 768,
        },
      },
    };

    const result = patchModelSamplingInWorkflow(workflow, {
      samplingShift: "1.73",
      fluxMaxShift: "1.15",
      fluxBaseShift: "0.5",
      width: "1024",
      height: "1152",
    });

    const aura = (result.workflow["10"] as { inputs: Record<string, unknown> }).inputs;
    const flux = (result.workflow["11"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(aura.shift, 1.5);
    assert.equal(flux.max_shift, 1.15);
    assert.equal(flux.base_shift, 0.5);
    assert.equal(flux.width, 1024);
    assert.equal(flux.height, 1152);
    assert.deepEqual(result.patched, {
      fluxMaxShift: 1,
      fluxBaseShift: 1,
      width: 1,
      height: 1,
    });
  });

  it("does not overwrite concrete ModelSamplingAuraFlow shift values in the healthy band", () => {
    const workflow = {
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 2.8 },
      },
    };
    const result = patchModelSamplingInWorkflow(
      workflow,
      resolveModelSamplingParams("qwen-image-2512", "optimized"),
      "qwen-image-2512",
    );
    const inputs = (result.workflow["7"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.shift, 2.8);
    assert.equal(result.patched.samplingShift, undefined);
  });

  it("repairs concrete Comfy AuraFlow defaults (~1.73) toward official Qwen 3.1", () => {
    const workflow = {
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 1.73 },
      },
    };
    const result = patchModelSamplingInWorkflow(
      workflow,
      resolveModelSamplingParams("qwen-image-2512", "base"),
      "qwen-image-2512",
    );
    const inputs = (result.workflow["7"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.shift, 3.1);
    assert.equal(result.patched.samplingShift, 1);
  });

  it("resolves qwen shift placeholders from model defaults", () => {
    const workflow = {
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: "{{SHIFT}}" },
      },
    };

    const result = patchModelSamplingInWorkflow(
      workflow,
      resolveModelSamplingParams("qwen-image-2512", "optimized"),
      "qwen-image-2512",
    );
    const inputs = (result.workflow["7"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.shift, 3.1);
    assert.equal(result.patched.samplingShift, 1);
  });

  it("resolves unreplaced shift placeholders using node defaults", () => {
    const result = patchModelSamplingInWorkflow(
      {
        "324": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: "{{SHIFT}}" },
        },
      },
      {},
    );

    const inputs = (result.workflow["324"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.shift, 1.73);
    assert.equal(result.patched.samplingShift, 1);
  });

  it("resolves shift placeholders through server queue param merge", () => {
    const params = resolveQueueParams(undefined, {
      seed: "42",
      width: "1024",
      height: "1024",
      cfg: "4",
      steps: "28",
      samplerName: "euler",
      scheduler: "simple",
      samplingShift: 1.73,
    });

    const injected = injectPromptsWithFallbacks(
      {
        "1": {
          class_type: "CLIPTextEncode",
          inputs: { text: "{{POSITIVE}}" },
        },
        "324": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["2", 0], shift: "{{SHIFT}}" },
        },
      },
      {
        positive: "A portrait.",
        params,
      },
      resolvePlaceholderTokens(),
    );

    const inputs = (injected.workflow["324"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(Number(inputs.shift), 1.73);
  });

  it("patches model sampling nodes during queue injection", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}" },
      },
      "2": {
        class_type: "ModelSamplingFlux",
        inputs: {
          model: ["3", 0],
          max_shift: 1,
          base_shift: 0.4,
          width: 512,
          height: 512,
        },
      },
    };

    const injected = injectPromptsWithFallbacks(
      workflow,
      {
        positive: "A portrait in soft light.",
        params: {
          fluxMaxShift: "1.15",
          fluxBaseShift: "0.5",
          width: "896",
          height: "1152",
        },
      },
      resolvePlaceholderTokens(),
    );

    const flux = (injected.workflow["2"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(flux.width, 896);
    assert.equal(flux.height, 1152);
    assert.equal(flux.max_shift, 1.15);
    assert.equal(flux.base_shift, 0.5);
  });

  it("maps model sampling nodes separately from ksampler", () => {
    const mappings = suggestWorkflowNodeMappings(
      JSON.stringify({
        "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20, cfg: 7 } },
        "4": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 1.73 } },
        "5": {
          class_type: "ModelSamplingFlux",
          inputs: { model: ["2", 0], width: 1024, height: 1024 },
        },
      }),
    );
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "sampler"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "modelSampling"));
    assert.equal(
      mappings.filter((entry) => entry.suggestedBinding === "sampler").length,
      1,
    );
  });
});
