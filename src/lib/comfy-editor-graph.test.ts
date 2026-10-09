import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  apiPromptToUiWorkflow,
  isApiPromptGraph,
  readAppEditorMeta,
  uiWorkflowToApiPrompt,
  widgetSlots,
  type ComfyApiPrompt,
  type ComfyNodeDefs,
} from "./comfy-editor-graph";
import {
  diffEditorGraphs,
  samplerOverridesFromEditorChanges,
  sortEditorChanges,
} from "./comfy-editor-diff";
import {
  editorWorkflowFileName,
  isSafeEditorFileName,
} from "./comfy-editor-workflows-server";

// Shapes as ComfyUI 0.37 `/object_info/<class>` returns them.
const defs: ComfyNodeDefs = {
  UNETLoader: {
    input: {
      required: {
        unet_name: [["qwen_image_edit_2511_bf16.safetensors"], {}],
        weight_dtype: [["default", "fp8_e4m3fn"], {}],
      },
    },
    input_order: { required: ["unet_name", "weight_dtype"] },
    output: ["MODEL"],
    output_name: ["MODEL"],
    display_name: "Load Diffusion Model",
  },
  LoraLoaderModelOnly: {
    input: {
      required: {
        model: ["MODEL", {}],
        lora_name: [["lightning-8.safetensors", "skin.safetensors"], {}],
        strength_model: ["FLOAT", { default: 1 }],
      },
    },
    input_order: { required: ["model", "lora_name", "strength_model"] },
    output: ["MODEL"],
    output_name: ["MODEL"],
  },
  LoadImage: {
    input: { required: { image: [["plate.png"], { image_upload: true }] } },
    input_order: { required: ["image"] },
    output: ["IMAGE", "MASK"],
    output_name: ["IMAGE", "MASK"],
    display_name: "Load Image",
  },
  TextEncodeQwenImageEditPlus: {
    input: {
      required: { clip: ["CLIP", {}], prompt: ["STRING", { multiline: true }] },
      optional: { vae: ["VAE", {}], image1: ["IMAGE", {}], image2: ["IMAGE", {}] },
    },
    input_order: { required: ["clip", "prompt"], optional: ["vae", "image1", "image2"] },
    output: ["CONDITIONING"],
    output_name: ["CONDITIONING"],
  },
  KSampler: {
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", { default: 0, control_after_generate: true }],
        steps: ["INT", { default: 20 }],
        cfg: ["FLOAT", { default: 8 }],
        sampler_name: [["euler", "res_multistep"], {}],
        scheduler: ["COMBO", { options: ["simple", "beta"] }],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
        denoise: ["FLOAT", { default: 1 }],
      },
    },
    input_order: {
      required: [
        "model",
        "seed",
        "steps",
        "cfg",
        "sampler_name",
        "scheduler",
        "positive",
        "negative",
        "latent_image",
        "denoise",
      ],
    },
    output: ["LATENT"],
    output_name: ["LATENT"],
  },
};

const prompt: ComfyApiPrompt = {
  "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors", weight_dtype: "default" } },
  "2": { class_type: "LoraLoaderModelOnly", inputs: { model: ["1", 0], lora_name: "lightning-8.safetensors", strength_model: 1 } },
  "3": { class_type: "LoadImage", inputs: { image: "castcut-plate-abc.png" }, _meta: { title: "Cast plate" } },
  "4": { class_type: "TextEncodeQwenImageEditPlus", inputs: { clip: ["9", 0], prompt: "She waves.", image1: ["3", 0] } },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["2", 0],
      seed: 123456789,
      steps: 8,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      positive: ["4", 0],
      negative: ["4", 0],
      latent_image: ["8", 0],
      denoise: 1,
    },
  },
  // Not installed on this ComfyUI.
  "9": { class_type: "MysteryClipLoader", inputs: { clip_name: "qwen_2.5_vl.safetensors", mode: "x" } },
};

describe("comfy-editor-graph", () => {
  it("recognises API-format graphs", () => {
    assert.equal(isApiPromptGraph(prompt), true);
    assert.equal(isApiPromptGraph({ nodes: [], links: [] }), false);
    assert.equal(isApiPromptGraph({}), false);
  });

  it("orders widgets like the frontend: seed control and the upload button included", () => {
    assert.deepEqual(
      widgetSlots(defs.KSampler!).map(slot => slot.name),
      ["seed", "seed:control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "denoise"]
    );
    assert.deepEqual(
      widgetSlots(defs.LoadImage!).map(slot => slot.kind),
      ["input", "upload"]
    );
  });

  it("converts to a UI workflow with links, widgets and dependency columns", () => {
    const ui = apiPromptToUiWorkflow(prompt, defs, { tool: "day", promptId: "p-1", createdAt: 1 });
    assert.equal(ui.version, 0.4);
    assert.equal(ui.nodes.length, 6);
    const byId = new Map(ui.nodes.map(node => [node.id, node]));

    const sampler = byId.get(5)!;
    assert.deepEqual(sampler.widgets_values, [123456789, "fixed", 8, 1, "euler", "simple", 1]);
    const load = byId.get(3)!;
    assert.deepEqual(load.widgets_values, ["castcut-plate-abc.png", "image"]);
    assert.equal(load.title, "Cast plate");

    // Every link is on both ends.
    for (const [id, origin, originSlot, target, targetSlot, type] of ui.links) {
      assert.ok(byId.get(origin)!.outputs[originSlot].links!.includes(id));
      assert.equal(byId.get(target)!.inputs[targetSlot].link, id);
      assert.notEqual(type, "");
    }
    assert.equal(ui.last_link_id, ui.links.length);
    // positive and negative share one output: two links.
    assert.equal(byId.get(4)!.outputs[0].links!.length, 2);
    // Unused optional sockets are not listed; used ones are.
    assert.deepEqual(
      byId.get(4)!.inputs.map(input => input.name),
      ["clip", "prompt", "image1"]
    );

    // Columns follow dependency depth: loader left of LoRA left of sampler.
    assert.ok(byId.get(1)!.pos[0] < byId.get(2)!.pos[0]);
    assert.ok(byId.get(2)!.pos[0] < sampler.pos[0]);
    assert.ok(byId.get(4)!.order < sampler.order);

    // Unknown node keeps its values and gets an output for the link it feeds.
    const mystery = byId.get(9)!;
    assert.deepEqual(mystery.widgets_values, ["qwen_2.5_vl.safetensors", "x"]);
    assert.equal(mystery.outputs.length, 1);

    const meta = readAppEditorMeta(ui);
    assert.equal(meta?.tool, "day");
    assert.deepEqual(meta?.apiPrompt, prompt);
  });

  it("round-trips back to the same graph", () => {
    const ui = JSON.parse(JSON.stringify(apiPromptToUiWorkflow(prompt, defs)));
    const back = uiWorkflowToApiPrompt(ui, defs);
    assert.deepEqual(diffEditorGraphs(prompt, back), []);
    assert.deepEqual(back["5"].inputs?.model, ["2", 0]);
    assert.deepEqual(back["4"].inputs?.image1, ["3", 0]);
  });

  it("renumbers non-integer ids and maps them back", () => {
    const nested: ComfyApiPrompt = {
      "12:3": { class_type: "UNETLoader", inputs: { unet_name: "a", weight_dtype: "default" } },
      "12:4": { class_type: "LoraLoaderModelOnly", inputs: { model: ["12:3", 0], lora_name: "skin.safetensors", strength_model: 0.5 } },
    };
    const ui = apiPromptToUiWorkflow(nested, defs);
    assert.deepEqual(ui.nodes.map(node => node.id), [1, 2]);
    const back = uiWorkflowToApiPrompt(JSON.parse(JSON.stringify(ui)), defs);
    assert.deepEqual(Object.keys(back).sort(), ["12:3", "12:4"]);
    assert.deepEqual(back["12:4"].inputs?.model, ["12:3", 0]);
  });

  it("drops muted and bypassed nodes when reading an edited workflow", () => {
    const ui = JSON.parse(JSON.stringify(apiPromptToUiWorkflow(prompt, defs)));
    ui.nodes.find((node: { id: number }) => node.id === 2).mode = 4;
    const back = uiWorkflowToApiPrompt(ui, defs);
    assert.equal(back["2"], undefined);
    const changes = diffEditorGraphs(prompt, back);
    assert.deepEqual(changes.map(change => change.kind), ["lora"]);
  });
});

describe("comfy-editor-diff", () => {
  it("lists sampler, LoRA and prompt edits and turns sampler ones into overrides", () => {
    const ui = JSON.parse(JSON.stringify(apiPromptToUiWorkflow(prompt, defs)));
    const node = (id: number) => ui.nodes.find((entry: { id: number }) => entry.id === id);
    node(5).widgets_values = [42, "randomize", 12, 2.5, "res_multistep", "beta", 1];
    node(2).widgets_values = ["skin.safetensors", 0.6];
    node(4).widgets_values = ["She waves at the camera."];
    const changes = sortEditorChanges(diffEditorGraphs(prompt, uiWorkflowToApiPrompt(ui, defs)));
    assert.deepEqual(
      changes.map(change => `${change.kind}:${change.input}`),
      [
        "sampler:sampler_name",
        "scheduler:scheduler",
        "steps:steps",
        "cfg:cfg",
        "lora:lora_name",
        "lora:strength_model",
        "prompt:prompt",
        "seed:seed",
      ]
    );
    assert.deepEqual(samplerOverridesFromEditorChanges(changes), {
      samplerName: "res_multistep",
      scheduler: "beta",
      steps: "12",
      cfg: "2.5",
    });
  });

  it("leaves out an override changed two different ways", () => {
    const overrides = samplerOverridesFromEditorChanges([
      { kind: "steps", nodeId: "1", classType: "KSampler", input: "steps", before: 8, after: 10 },
      { kind: "steps", nodeId: "2", classType: "KSampler", input: "steps", before: 8, after: 20 },
      { kind: "cfg", nodeId: "1", classType: "KSampler", input: "cfg", before: 1, after: 1.5 },
    ]);
    assert.deepEqual(overrides, { cfg: "1.5" });
  });

  it("treats '8' and 8 as the same value", () => {
    const a: ComfyApiPrompt = { "1": { class_type: "KSampler", inputs: { steps: 8 } } };
    const b: ComfyApiPrompt = { "1": { class_type: "KSampler", inputs: { steps: "8" } } };
    assert.deepEqual(diffEditorGraphs(a, b), []);
  });
});

describe("comfy-editor-workflows-server names", () => {
  it("names files <tool>-<date>-<id>.json and rejects paths", () => {
    const name = editorWorkflowFileName({
      tool: "Day",
      id: "5892db46-1234-5678",
      date: new Date("2026-10-03T12:00:00Z"),
    });
    assert.equal(name, "day-2026-10-03-5892db46.json");
    assert.equal(isSafeEditorFileName(name), true);
    assert.equal(isSafeEditorFileName("../comfy.settings.json"), false);
    assert.equal(isSafeEditorFileName("a/b.json"), false);
    assert.equal(isSafeEditorFileName("notes.txt"), false);
  });
});
