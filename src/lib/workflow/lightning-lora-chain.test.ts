import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureLightningModelChainInWorkflow,
  loraStrengthIsActive,
  neutralizeNonLightningLoras,
} from "./lightning-lora-chain";
import type { WorkflowNodeRecord } from "./lightning-queue";

const LIGHTNING_MODEL = "qwen-image-2512-lightning-8";
const LIGHTNING_LORA_FILENAME = "qwen_lightning_8step.safetensors";
const LORA_FILENAMES = { "{{LORA_LIGHTNING}}": LIGHTNING_LORA_FILENAME };

function baseGraph(): Record<string, WorkflowNodeRecord> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{POSITIVE}}", clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: 1,
        steps: 8,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0] } },
  };
}

function node(workflow: Record<string, unknown>, id: string): WorkflowNodeRecord {
  return workflow[id] as WorkflowNodeRecord;
}

function loraLoaderNodeIds(workflow: Record<string, unknown>): string[] {
  return Object.entries(workflow)
    .filter(([, n]) => (n as WorkflowNodeRecord).class_type === "LoraLoaderModelOnly")
    .map(([id]) => id);
}

describe("ensureLightningModelChainInWorkflow", () => {
  it("returns the workflow unchanged for non-Lightning models", () => {
    const workflow = baseGraph();
    const result = ensureLightningModelChainInWorkflow(workflow, "qwen-image-2512", {});
    assert.equal(result, workflow);
  });

  it("splices AuraFlow + a Lightning LoRA between the loader and KSampler when neither exists yet", () => {
    const workflow = baseGraph();
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, LORA_FILENAMES);
    const sampler = node(result, "5");
    const auraId = (sampler.inputs!.model as [string, number])[0];
    const aura = node(result, auraId);
    assert.equal(aura.class_type, "ModelSamplingAuraFlow");
    assert.equal(aura.inputs!.shift, 3);
    const loraId = (aura.inputs!.model as [string, number])[0];
    const lora = node(result, loraId);
    assert.equal(lora.class_type, "LoraLoaderModelOnly");
    assert.equal(lora.inputs!.lora_name, LIGHTNING_LORA_FILENAME);
    assert.equal(lora.inputs!.strength_model, 1);
    assert.deepEqual(lora.inputs!.model, ["1", 0]);
  });

  it("repairs an out-of-range shift on an AuraFlow node already in the chain", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 1 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["8", 0];
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, LORA_FILENAMES);
    assert.equal(node(result, "8").inputs!.shift, 3);
  });

  it("leaves an in-range AuraFlow shift alone", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3.2 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["8", 0];
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, LORA_FILENAMES);
    assert.equal(node(result, "8").inputs!.shift, 3.2);
  });

  it("still wires AuraFlow but adds no LoRA node when no Lightning LoRA filename resolves", () => {
    const workflow = baseGraph();
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, {});
    const sampler = node(result, "5");
    const auraId = (sampler.inputs!.model as [string, number])[0];
    assert.equal(node(result, auraId).class_type, "ModelSamplingAuraFlow");
    assert.equal(loraLoaderNodeIds(result).length, 0);
  });

  it("does nothing when the chain already has both AuraFlow and a Lightning LoRA", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 1 },
    };
    workflow["9"] = {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["8", 0], shift: 3 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["9", 0];
    const before = JSON.stringify(workflow);
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, LORA_FILENAMES);
    assert.equal(JSON.stringify(result), before);
  });

  it("rewires an existing but disconnected Lightning LoRA node into the chain instead of duplicating it", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["8", 0];
    // Disconnected Lightning LoRA node — not wired into the model chain yet.
    workflow["99"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 0.5 },
    };
    const result = ensureLightningModelChainInWorkflow(workflow, LIGHTNING_MODEL, LORA_FILENAMES);
    const aura = node(result, "8");
    assert.deepEqual(aura.inputs!.model, ["99", 0]);
    assert.equal(node(result, "99").inputs!.strength_model, 1);
    assert.equal(loraLoaderNodeIds(result).length, 1);
  });
});

describe("loraStrengthIsActive", () => {
  it("treats non-numeric or missing strengths as active (fail open) and zero/negative as inactive", () => {
    assert.equal(loraStrengthIsActive(undefined), true);
    assert.equal(loraStrengthIsActive("not-a-number"), true);
    assert.equal(loraStrengthIsActive(0.75), true);
    assert.equal(loraStrengthIsActive(0), false);
    assert.equal(loraStrengthIsActive(-1), false);
  });
});

describe("neutralizeNonLightningLoras", () => {
  it("does nothing when the model doesn't need style-LoRA neutralization", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: "anime_style.safetensors", strength_model: 1 },
    };
    const { workflow: result, neutralizedNodeIds } = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-2512",
      {},
    );
    assert.equal(result, workflow);
    assert.deepEqual(neutralizedNodeIds, []);
  });

  it("does nothing for a Lightning model whose workflow has no Lightning LoRA yet", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: "anime_style.safetensors", strength_model: 1 },
    };
    const { workflow: result, neutralizedNodeIds } = neutralizeNonLightningLoras(
      workflow,
      LIGHTNING_MODEL,
      {},
    );
    assert.equal(result, workflow);
    assert.deepEqual(neutralizedNodeIds, []);
  });

  it("neutralizes an active non-Lightning style LoRA while leaving a Lightning LoRA untouched", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 1 },
    };
    workflow["9"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["8", 0], lora_name: "anime_style_v2.safetensors", strength_model: 0.8 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["9", 0];
    const { workflow: result, neutralizedNodeIds } = neutralizeNonLightningLoras(
      workflow,
      LIGHTNING_MODEL,
      LORA_FILENAMES,
    );
    assert.deepEqual(neutralizedNodeIds, ["9"]);
    assert.equal(node(result, "9").inputs!.strength_model, 0);
    assert.equal(node(result, "8").inputs!.strength_model, 1);
  });

  it("neutralizes non-Lightning slots in a Power Lora Loader (rgthree) node but skips off and Lightning slots", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 1 },
    };
    workflow["9"] = {
      class_type: "Power Lora Loader (rgthree)",
      inputs: {
        model: ["8", 0],
        lora_1: { on: true, lora: "anime_style.safetensors", strength: 0.7, strengthTwo: 0.7 },
        lora_2: { on: false, lora: "unused_style.safetensors", strength: 1 },
        lora_3: { on: true, lora: LIGHTNING_LORA_FILENAME, strength: 1 },
        lora_4: { on: true, lora: "", strength: 1 },
      },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["9", 0];
    const { workflow: result, neutralizedNodeIds } = neutralizeNonLightningLoras(
      workflow,
      LIGHTNING_MODEL,
      LORA_FILENAMES,
    );
    assert.deepEqual(neutralizedNodeIds, ["9:lora_1", "9:lora_4"]);
    const slots = node(result, "9").inputs as Record<
      string,
      { on?: boolean; strength?: number; strengthTwo?: number }
    >;
    assert.equal(slots.lora_1.on, false);
    assert.equal(slots.lora_1.strength, 0);
    assert.equal(slots.lora_1.strengthTwo, 0);
    assert.equal(slots.lora_2.on, false);
    assert.equal(slots.lora_2.strength, 1); // untouched — was already off
    assert.equal(slots.lora_3.on, true); // Lightning slot left alone
    assert.equal(slots.lora_4.on, false);
    assert.equal(slots.lora_4.strength, 0);
  });

  it("keeps only the sampler-nearest Lightning LoRA at strength when a pack bakes it twice", () => {
    const workflow = baseGraph();
    workflow["8"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 1 },
    };
    workflow["9"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["8", 0], lora_name: LIGHTNING_LORA_FILENAME, strength_model: 1 },
    };
    (node(workflow, "5").inputs as Record<string, unknown>).model = ["9", 0];
    const { workflow: result, neutralizedNodeIds } = neutralizeNonLightningLoras(
      workflow,
      LIGHTNING_MODEL,
      LORA_FILENAMES,
    );
    assert.deepEqual(neutralizedNodeIds, ["8"]);
    assert.equal(node(result, "9").inputs!.strength_model, 1);
    assert.equal(node(result, "8").inputs!.strength_model, 0);
  });
});
