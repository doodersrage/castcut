import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureFluxGuidanceInWorkflow,
  resolveFlux1GuidanceValue,
} from "./flux-guidance-patch";
import { buildWorkflowScaffoldForModel } from "./scaffold";
import { patchSamplerParamsInWorkflow } from "../comfyui/config";
import { patchWorkflowDirectParams } from "./direct-patch";

describe("flux guidance patch", () => {
  it("maps UltraReal sidebar CFG to FluxGuidance value 2.5", () => {
    assert.equal(resolveFlux1GuidanceValue("flux-ultrareal-v4"), 2.5);
    assert.equal(resolveFlux1GuidanceValue("flux-dev"), 3.5);
    assert.equal(resolveFlux1GuidanceValue("flux-ultrareal-v4", { cfg: 2.5 }), 2.5);
  });

  it("inserts FluxGuidance and forces KSampler cfg 1 for UltraReal scaffolds without it", () => {
    const bare = {
      "5": {
        class_type: "CLIPTextEncode",
        inputs: { text: "a photo", clip: ["2", 0] },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: "", clip: ["2", 0] },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 30,
          cfg: 3,
          sampler_name: "dpmpp_2m",
          scheduler: "beta",
          denoise: 1,
          model: ["4", 0],
          positive: ["5", 0],
          negative: ["6", 0],
          latent_image: ["7", 0],
        },
      },
    };
    const result = ensureFluxGuidanceInWorkflow(bare, "flux-ultrareal-v4", {
      cfg: 2.5,
    });
    assert.equal(result.inserted, 1);
    assert.equal(result.samplerCfgForced, 1);
    const sampler = result.workflow["8"] as {
      inputs: { cfg: number; positive: [string, number] };
    };
    assert.equal(sampler.inputs.cfg, 1);
    const guidanceId = sampler.inputs.positive[0];
    const guidance = result.workflow[guidanceId] as {
      class_type: string;
      inputs: { guidance: number; conditioning: [string, number] };
    };
    assert.equal(guidance.class_type, "FluxGuidance");
    assert.equal(guidance.inputs.guidance, 2.5);
    assert.equal(guidance.inputs.conditioning[0], "5");
  });

  it("does not insert FluxGuidance for Klein", () => {
    const result = ensureFluxGuidanceInWorkflow(
      {
        "8": {
          class_type: "KSampler",
          inputs: {
            cfg: 3.5,
            positive: ["5", 0],
            negative: ["6", 0],
            seed: 1,
            steps: 20,
          },
        },
      },
      "flux-2-klein-9b",
      { cfg: 3.5 },
    );
    assert.equal(result.inserted, 0);
    assert.equal(result.samplerCfgForced, 0);
  });

  it("builds UltraReal scaffold with FluxGuidance + sampler cfg 1", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-ultrareal-v4");
    assert.match(scaffold.json, /FluxGuidance/);
    assert.match(scaffold.json, /"cfg": 1/);
    assert.match(scaffold.json, /\{\{CFG\}\}/);
  });

  it("patchSamplerParams keeps Flux.1 KSampler at cfg 1 while preserving guidance param", () => {
    const scaffold = JSON.parse(
      buildWorkflowScaffoldForModel("flux-ultrareal-v4").json,
    ) as Record<string, unknown>;
    const result = patchSamplerParamsInWorkflow(
      scaffold,
      {
        cfg: 3,
        steps: 40,
        samplerName: "dpmpp_2m",
        scheduler: "beta",
        seed: 42,
      },
      "flux-ultrareal-v4",
    );
    const sampler = Object.values(result.workflow).find((node) => {
      const record = node as { class_type?: string };
      return record.class_type === "KSampler";
    }) as { inputs: { cfg: number; steps: number } };
    assert.equal(sampler.inputs.cfg, 1);
    assert.equal(sampler.inputs.steps, 40);

    const guided = ensureFluxGuidanceInWorkflow(result.workflow, "flux-ultrareal-v4", {
      cfg: 3,
    });
    const guidance = Object.values(guided.workflow).find((node) => {
      const record = node as { class_type?: string };
      return record.class_type === "FluxGuidance";
    }) as { inputs: { guidance: number } };
    assert.equal(guidance.inputs.guidance, 3);
  });

  it("direct patch inserts FluxGuidance for UltraReal packs missing it", () => {
    const workflow = {
      "5": {
        class_type: "CLIPTextEncode",
        inputs: { text: "test", clip: ["2", 0] },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 30,
          cfg: 3,
          positive: ["5", 0],
          negative: ["5", 0],
          latent_image: ["7", 0],
          model: ["4", 0],
          sampler_name: "dpmpp_2m",
          scheduler: "beta",
          denoise: 1,
        },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "flux-ultrareal-v4",
      params: { cfg: 3, width: 1024, height: 1024 },
    });
    assert.ok((result.patched.fluxGuidance ?? 0) > 0);
    const sampler = result.workflow["8"] as {
      inputs: { cfg: number; positive: [string, number] };
    };
    assert.equal(sampler.inputs.cfg, 1);
    assert.notEqual(sampler.inputs.positive[0], "5");
  });
});
