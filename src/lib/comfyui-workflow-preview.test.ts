import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { previewWorkflowInjection } from "./comfyui-workflow-preview";

describe("previewWorkflowInjection", () => {
  describe("input validation", () => {
    it("rejects an empty prompt", () => {
      const result = previewWorkflowInjection({ prompt: "" });
      assert.deepEqual(result, { ok: false, error: "Prompt is required." });
    });

    it("rejects a whitespace-only prompt", () => {
      const result = previewWorkflowInjection({ prompt: "   \n\t  " });
      assert.deepEqual(result, { ok: false, error: "Prompt is required." });
    });
  });

  describe("minimal fallback (no workflow configured)", () => {
    it("returns the minimal fallback shape when no comfy runtime is provided", () => {
      const result = previewWorkflowInjection({ prompt: "  A cat in a hat  " });

      assert.equal(result.ok, true);
      assert.equal(result.workflowSource, "minimal");
      assert.deepEqual(result.replacements, { positive: 1, negative: 0, params: {} });
      assert.deepEqual(result.snippets, [{ path: "minimal.prompt", value: "A cat in a hat" }]);
      assert.equal(
        result.workflowJson,
        JSON.stringify(
          { note: "Minimal fallback workflow (no custom workflow configured)" },
          null,
          2
        )
      );
      assert.equal(result.truncated, undefined);
      assert.equal(result.preflightIssues, undefined);
    });

    it("slices an overlong prompt to 160 chars in the minimal-fallback snippet", () => {
      const longPrompt = "A".repeat(200);
      const result = previewWorkflowInjection({ prompt: longPrompt });

      assert.equal(result.ok, true);
      assert.equal(result.snippets?.[0]?.path, "minimal.prompt");
      assert.equal(result.snippets?.[0]?.value.length, 160);
      assert.equal(result.snippets?.[0]?.value, "A".repeat(160));
    });
  });

  describe("full injection path (custom workflow configured)", () => {
    const singleClipWorkflow = () =>
      JSON.stringify({
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: "{{POSITIVE}}", clip: ["4", 0] },
        },
      });

    it("skips optimizeWorkflowForQueue when workflowQueueOptimize is false", () => {
      const result = previewWorkflowInjection({
        prompt: "A dog running",
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.workflowSource, "client");
      // Passthrough optimizer output carries no changes, so both derived
      // change lists collapse to empty arrays instead of being omitted.
      assert.deepEqual(result.preflightIssues, []);
      assert.deepEqual(result.queueOptimizeChanges, []);
      assert.match(result.workflowJson ?? "", /A dog running/);
    });

    it("resolves an upscale model filename from live inventory", () => {
      const result = previewWorkflowInjection({
        prompt: "A mountain landscape",
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
        inventory: {
          models: {
            checkpoints: [],
            unets: [],
            vaes: [],
            clips: [],
            dualClipTypes: [],
            clipLoaderTypes: [],
            loras: [],
            controlNets: [],
            upscaleModels: ["totally-distinct-upscaler-xyz.pth"],
          },
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.resolvedParams?.upscaleModelFilename, "4x-UltraSharp.pth");
    });

    it("resolves a refiner checkpoint filename for an SDXL model from live inventory", () => {
      const result = previewWorkflowInjection({
        prompt: "A castle",
        model: "sdxl",
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
        inventory: {
          models: {
            checkpoints: ["sd_xl_refiner_1.0.safetensors", "sd_xl_base_1.0.safetensors"],
            unets: [],
            vaes: [],
            clips: [],
            dualClipTypes: [],
            clipLoaderTypes: [],
            loras: [],
            controlNets: [],
            upscaleModels: [],
          },
        },
      });

      assert.equal(result.ok, true);
      assert.equal(
        result.resolvedParams?.refinerCheckpointFilename,
        "sd_xl_refiner_1.0.safetensors"
      );
    });

    it("leaves the refiner checkpoint unresolved for a non-SDXL model even with checkpoints in inventory", () => {
      const result = previewWorkflowInjection({
        prompt: "A skyline",
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
        inventory: {
          models: {
            checkpoints: ["some_checkpoint.safetensors"],
            unets: [],
            vaes: [],
            clips: [],
            dualClipTypes: [],
            clipLoaderTypes: [],
            loras: [],
            controlNets: [],
            upscaleModels: [],
          },
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.resolvedParams?.refinerCheckpointFilename, undefined);
    });

    it("does not add a negative-prompt snippet when negativePrompt is whitespace-only", () => {
      const result = previewWorkflowInjection({
        prompt: "A sunny beach",
        negativePrompt: "   ",
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.replacements?.negative, 0);
    });

    it("truncates a very large workflowJson to MAX_PREVIEW_CHARS and marks truncated", () => {
      const longPrompt = "word ".repeat(1500); // ~7500 chars once injected
      const result = previewWorkflowInjection({
        prompt: longPrompt,
        comfy: {
          workflowJson: singleClipWorkflow(),
          workflowQueueOptimize: false,
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.truncated, true);
      assert.equal(result.workflowJson?.length, 6002);
      assert.ok(result.workflowJson?.endsWith("\n…"));
    });
  });
});

describe("previewWorkflowInjection LoRA stack", () => {
  it("builds the preview with the LoRA library the browser forwards", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-9b-distilled.safetensors", weight_dtype: "default" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "{{POSITIVE}}", clip: ["3", 0] } },
      "3": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" } },
      "4": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["2", 0], seed: 1, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1, latent_image: ["5", 0] } },
      "5": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "6": { class_type: "SaveImage", inputs: { images: ["4", 0], filename_prefix: "t" } },
    };
    const result = previewWorkflowInjection({
      prompt: "A portrait.",
      model: "flux-2-klein-9b-distilled",
      comfy: {
        workflowJson: JSON.stringify(workflow),
        loraLibrary: [
          {
            id: "detail",
            label: "Detail",
            triggerPhrase: "",
            tokenValue: "klein_detail.safetensors",
            strengthModel: 0.6,
            enabled: true,
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    assert.match(result.workflowJson ?? "", /klein_detail\.safetensors/);
  });
});
