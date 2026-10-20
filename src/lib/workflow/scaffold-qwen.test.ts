import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowPlaceholderTokens } from "../comfyui/config";
import {
  LIGHTNING_LORA_TOKEN,
  buildQwenEditEncoderInputs,
  qwenCheckpointScaffold,
  qwenEditComposeScaffold,
  qwenEditImg2imgScaffold,
  qwenEditLightningScaffold,
  qwenLightningScaffold,
  qwenScaffold,
  resolveQwenEditEncoderClass,
  usesQwenCheckpointLoader,
} from "./scaffold-qwen";

type NodeLike = { class_type?: string; inputs?: Record<string, unknown>; _meta?: { title?: string } };

function node(graph: Record<string, unknown>, id: string): NodeLike {
  return graph[id] as NodeLike;
}

function classTypesOf(graph: Record<string, unknown>): string[] {
  return Object.values(graph)
    .map(entry => (entry as NodeLike).class_type)
    .filter((value): value is string => typeof value === "string");
}

/** Every ["id", outputIndex] wire in the graph must point at a node that actually exists. */
function assertNoDanglingRefs(graph: Record<string, unknown>): void {
  const ids = new Set(Object.keys(graph));
  for (const [id, entry] of Object.entries(graph)) {
    const inputs = (entry as NodeLike).inputs ?? {};
    for (const [key, value] of Object.entries(inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number") {
        assert.ok(ids.has(value[0]), `node "${id}" input "${key}" references missing node "${value[0]}"`);
      }
    }
  }
}

const baseTokens: WorkflowPlaceholderTokens = {
  positive: "{{POSITIVE}}",
  negative: "{{NEGATIVE}}",
  seed: "{{SEED}}",
  width: "512",
  height: "768",
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
};

describe("qwenScaffold", () => {
  it("wires UNET + CLIP + VAE loaders through ModelSamplingAuraFlow into KSampler", () => {
    const graph = qwenScaffold(baseTokens);

    assert.equal(node(graph, "1").class_type, "UNETLoader");
    assert.equal(node(graph, "1").inputs?.unet_name, "{{UNET}}");
    assert.equal(node(graph, "2").class_type, "CLIPLoader");
    assert.equal(node(graph, "2").inputs?.type, "qwen_image");
    assert.equal(node(graph, "2").inputs?.clip_name, "qwen_2.5_vl_7b.safetensors");
    assert.equal(node(graph, "3").class_type, "VAELoader");
    assert.equal(node(graph, "3").inputs?.vae_name, "qwen_image_vae.safetensors");

    assert.equal(node(graph, "7").class_type, "ModelSamplingAuraFlow");
    assert.deepEqual(node(graph, "7").inputs?.model, ["1", 0]);
    assert.equal(node(graph, "7").inputs?.shift, baseTokens.shift);

    const sampler = node(graph, "8");
    assert.equal(sampler.class_type, "KSampler");
    assert.deepEqual(sampler.inputs?.model, ["7", 0]);
    assert.deepEqual(sampler.inputs?.positive, ["4", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["5", 0]);
    assert.deepEqual(sampler.inputs?.latent_image, ["6", 0]);
    assert.equal(sampler.inputs?.seed, baseTokens.seed);
    assert.equal(sampler.inputs?.denoise, baseTokens.denoise);
  });

  it("places the positive/negative placeholder tokens on the correct CLIPTextEncode nodes", () => {
    const graph = qwenScaffold(baseTokens);
    assert.equal(node(graph, "4").class_type, "CLIPTextEncode");
    assert.equal(node(graph, "4").inputs?.text, "{{POSITIVE}}");
    assert.deepEqual(node(graph, "4").inputs?.clip, ["2", 0]);
    assert.equal(node(graph, "5").class_type, "CLIPTextEncode");
    assert.equal(node(graph, "5").inputs?.text, "{{NEGATIVE}}");
  });

  it("wires width/height into EmptySD3LatentImage and vae into VAEDecode/SaveImage", () => {
    const graph = qwenScaffold(baseTokens);
    assert.equal(node(graph, "6").class_type, "EmptySD3LatentImage");
    assert.equal(node(graph, "6").inputs?.width, "512");
    assert.equal(node(graph, "6").inputs?.height, "768");
    assert.equal(node(graph, "9").class_type, "VAEDecode");
    assert.deepEqual(node(graph, "9").inputs?.vae, ["3", 0]);
    assert.equal(node(graph, "10").class_type, "SaveImage");
    assert.deepEqual(node(graph, "10").inputs?.images, ["9", 0]);
  });

  it("has exactly 10 nodes with no dangling references", () => {
    const graph = qwenScaffold(baseTokens);
    assert.equal(Object.keys(graph).length, 10);
    assertNoDanglingRefs(graph);
  });
});

describe("qwenCheckpointScaffold", () => {
  it("uses a single CheckpointLoaderSimple instead of separate UNET/CLIP/VAE loaders", () => {
    const graph = qwenCheckpointScaffold(baseTokens);

    assert.equal(node(graph, "1").class_type, "CheckpointLoaderSimple");
    assert.equal(node(graph, "1").inputs?.ckpt_name, "{{CHECKPOINT}}");

    const classTypes = classTypesOf(graph);
    assert.ok(!classTypes.includes("UNETLoader"));
    assert.ok(!classTypes.includes("CLIPLoader"));
    assert.ok(!classTypes.includes("VAELoader"));
  });

  it("draws CLIP and VAE off the checkpoint loader's outputs", () => {
    const graph = qwenCheckpointScaffold(baseTokens);
    assert.deepEqual(node(graph, "4").inputs?.clip, ["1", 1]);
    assert.deepEqual(node(graph, "5").inputs?.clip, ["1", 1]);
    assert.deepEqual(node(graph, "7").inputs?.model, ["1", 0]);
    assert.deepEqual(node(graph, "9").inputs?.vae, ["1", 2]);
  });

  it("keeps the same KSampler wiring shape as qwenScaffold", () => {
    const graph = qwenCheckpointScaffold(baseTokens);
    const sampler = node(graph, "8");
    assert.equal(sampler.class_type, "KSampler");
    assert.deepEqual(sampler.inputs?.model, ["7", 0]);
    assert.deepEqual(sampler.inputs?.positive, ["4", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["5", 0]);
    assert.deepEqual(sampler.inputs?.latent_image, ["6", 0]);
  });

  it("has no dangling references", () => {
    assertNoDanglingRefs(qwenCheckpointScaffold(baseTokens));
  });
});

describe("LIGHTNING_LORA_TOKEN", () => {
  it("is the expected placeholder string", () => {
    assert.equal(LIGHTNING_LORA_TOKEN, "{{LORA_LIGHTNING}}");
  });
});

describe("qwenLightningScaffold", () => {
  it("inserts a LoraLoaderModelOnly between the UNET loader and ModelSamplingAuraFlow", () => {
    const graph = qwenLightningScaffold(baseTokens);

    assert.equal(node(graph, "1").class_type, "UNETLoader");

    const lora = node(graph, "7");
    assert.equal(lora.class_type, "LoraLoaderModelOnly");
    assert.deepEqual(lora.inputs?.model, ["1", 0]);
    assert.equal(lora.inputs?.lora_name, LIGHTNING_LORA_TOKEN);
    assert.equal(lora.inputs?.strength_model, 1);

    const modelSampling = node(graph, "11");
    assert.equal(modelSampling.class_type, "ModelSamplingAuraFlow");
    assert.deepEqual(modelSampling.inputs?.model, ["7", 0]);

    const sampler = node(graph, "8");
    assert.equal(sampler.class_type, "KSampler");
    assert.deepEqual(sampler.inputs?.model, ["11", 0]);
  });

  it("still wires CLIPTextEncode / VAEDecode / SaveImage the same as the base scaffold", () => {
    const graph = qwenLightningScaffold(baseTokens);
    assert.equal(node(graph, "4").inputs?.text, "{{POSITIVE}}");
    assert.equal(node(graph, "5").inputs?.text, "{{NEGATIVE}}");
    assert.deepEqual(node(graph, "9").inputs?.vae, ["3", 0]);
    assert.equal(node(graph, "10").class_type, "SaveImage");
  });

  it("has exactly 11 nodes (base 10 + the lightning LoRA loader) with no dangling references", () => {
    const graph = qwenLightningScaffold(baseTokens);
    assert.equal(Object.keys(graph).length, 11);
    assertNoDanglingRefs(graph);
  });
});

describe("resolveQwenEditEncoderClass", () => {
  it("returns TextEncodeQwenImageEdit for the original edit model", () => {
    assert.equal(resolveQwenEditEncoderClass("qwen-image-edit"), "TextEncodeQwenImageEdit");
  });

  it("returns TextEncodeQwenImageEditPlus for the 2511 edit model", () => {
    assert.equal(resolveQwenEditEncoderClass("qwen-image-edit-2511"), "TextEncodeQwenImageEditPlus");
  });

  it("falls back to TextEncodeQwenImageEditPlus for an unregistered model id", () => {
    assert.equal(
      resolveQwenEditEncoderClass("totally-unmapped-qwen-model"),
      "TextEncodeQwenImageEditPlus"
    );
  });
});

describe("usesQwenCheckpointLoader", () => {
  it("is true for Rapid AIO checkpoint merges (matched by comfyNode)", () => {
    assert.equal(usesQwenCheckpointLoader("qwen-rapid-aio-sfw"), true);
    assert.equal(usesQwenCheckpointLoader("qwen-rapid-aio-edit"), true);
  });

  it("is true for any unregistered id merely starting with qwen-rapid-aio", () => {
    assert.equal(usesQwenCheckpointLoader("qwen-rapid-aio-some-future-variant"), true);
  });

  it("is false for loader-split edit/T2I models", () => {
    assert.equal(usesQwenCheckpointLoader("qwen-image-edit"), false);
    assert.equal(usesQwenCheckpointLoader("qwen-image-2512"), false);
  });

  it("is false for an unregistered id that does not start with qwen-rapid-aio", () => {
    assert.equal(usesQwenCheckpointLoader("totally-unmapped-qwen-model"), false);
  });
});

describe("buildQwenEditEncoderInputs", () => {
  const clipRef: [string, number] = ["2", 0];
  const vaeRef: [string, number] = ["3", 0];
  const imageRef: [string, number] = ["900", 0];

  it("uses an `image` key for the original TextEncodeQwenImageEdit node", () => {
    const inputs = buildQwenEditEncoderInputs("TextEncodeQwenImageEdit", baseTokens, clipRef, vaeRef, imageRef);
    assert.deepEqual(inputs, {
      prompt: baseTokens.positive,
      clip: clipRef,
      vae: vaeRef,
      image: imageRef,
    });
  });

  it("uses an `image1` key for the Plus encoder variant", () => {
    const inputs = buildQwenEditEncoderInputs(
      "TextEncodeQwenImageEditPlus",
      baseTokens,
      clipRef,
      vaeRef,
      imageRef
    );
    assert.deepEqual(inputs, {
      prompt: baseTokens.positive,
      clip: clipRef,
      vae: vaeRef,
      image1: imageRef,
    });
  });

  it("also uses `image1` for any encoder class other than the original TextEncodeQwenImageEdit", () => {
    const inputs = buildQwenEditEncoderInputs("SomeOtherEncoder", baseTokens, clipRef, vaeRef, imageRef);
    assert.ok("image1" in inputs);
    assert.ok(!("image" in inputs));
  });
});

describe("qwenEditLightningScaffold", () => {
  it("wires loaders, the Lightning LoRA, edit-encode nodes, and 4 LoadImage figure slots", () => {
    const graph = qwenEditLightningScaffold(baseTokens, "qwen-image-edit-2511-lightning-4");

    assert.equal(node(graph, "1").class_type, "UNETLoader");
    assert.equal(node(graph, "2").class_type, "CLIPLoader");
    assert.equal(node(graph, "3").class_type, "VAELoader");

    assert.equal(node(graph, "4").class_type, "TextEncodeQwenImageEditPlus");
    assert.equal(node(graph, "4").inputs?.prompt, baseTokens.positive);
    assert.equal(node(graph, "5").class_type, "TextEncodeQwenImageEditPlus");
    assert.equal(node(graph, "5").inputs?.prompt, baseTokens.negative);

    assert.equal(node(graph, "7").class_type, "LoraLoaderModelOnly");
    assert.equal(node(graph, "11").class_type, "ModelSamplingAuraFlow");
    assert.deepEqual(node(graph, "11").inputs?.model, ["7", 0]);

    for (const id of ["900", "901", "902", "903"]) {
      assert.equal(node(graph, id).class_type, "LoadImage");
    }
  });

  it("selects the original TextEncodeQwenImageEdit class for a model registered with that comfyNode", () => {
    const graph = qwenEditLightningScaffold(baseTokens, "qwen-image-edit");
    assert.equal(node(graph, "4").class_type, "TextEncodeQwenImageEdit");
    assert.equal(node(graph, "5").class_type, "TextEncodeQwenImageEdit");
  });

  it("puts a trimmed custom inputImage token on Figure 1 and leaves Figures 2-4 as their defaults", () => {
    const graph = qwenEditLightningScaffold(
      { ...baseTokens, inputImage: "  my-uploaded-figure.png  " },
      "qwen-image-edit-2511-lightning-4"
    );
    assert.equal(node(graph, "900").inputs?.image, "my-uploaded-figure.png");
    assert.equal(node(graph, "901").inputs?.image, "{{INPUT_IMAGE_2}}");
    assert.equal(node(graph, "902").inputs?.image, "{{INPUT_IMAGE_3}}");
    assert.equal(node(graph, "903").inputs?.image, "{{INPUT_IMAGE_4}}");
  });

  it("falls back to the default INPUT_IMAGE token when inputImage is blank/whitespace", () => {
    const graph = qwenEditLightningScaffold(
      { ...baseTokens, inputImage: "   " },
      "qwen-image-edit-2511-lightning-4"
    );
    assert.equal(node(graph, "900").inputs?.image, "{{INPUT_IMAGE}}");
  });

  it("has no dangling references", () => {
    assertNoDanglingRefs(qwenEditLightningScaffold(baseTokens, "qwen-image-edit-2511-lightning-4"));
  });
});

describe("qwenEditComposeScaffold", () => {
  it("uses plain ModelSamplingAuraFlow off the UNET loader (no Lightning LoRA)", () => {
    const graph = qwenEditComposeScaffold(baseTokens, "qwen-image-edit-2511");
    assert.equal(node(graph, "1").class_type, "UNETLoader");
    const modelSampling = node(graph, "7");
    assert.equal(modelSampling.class_type, "ModelSamplingAuraFlow");
    assert.deepEqual(modelSampling.inputs?.model, ["1", 0]);
    assert.ok(!classTypesOf(graph).includes("LoraLoaderModelOnly"));

    const sampler = node(graph, "8");
    assert.deepEqual(sampler.inputs?.model, ["7", 0]);
  });

  it("wires the positive/negative edit-encode nodes without a vae reference", () => {
    const graph = qwenEditComposeScaffold(baseTokens, "qwen-image-edit-2511");
    assert.equal(node(graph, "4").inputs?.prompt, baseTokens.positive);
    assert.deepEqual(node(graph, "4").inputs?.clip, ["2", 0]);
    assert.ok(!("vae" in (node(graph, "4").inputs ?? {})));
    assert.equal(node(graph, "5").inputs?.prompt, baseTokens.negative);
  });

  it("includes 4 LoadImage figure slots honoring a custom inputImage token", () => {
    const graph = qwenEditComposeScaffold(
      { ...baseTokens, inputImage: "ref.png" },
      "qwen-image-edit-2511"
    );
    assert.equal(node(graph, "900").inputs?.image, "ref.png");
    assert.equal(node(graph, "903").inputs?.image, "{{INPUT_IMAGE_4}}");
  });

  it("has no dangling references", () => {
    assertNoDanglingRefs(qwenEditComposeScaffold(baseTokens, "qwen-image-edit-2511"));
  });
});

describe("qwenEditImg2imgScaffold", () => {
  it("delegates entirely to qwenEditLightningScaffold for a Lightning model", () => {
    const model = "qwen-image-edit-2511-lightning-8";
    const graph = qwenEditImg2imgScaffold(baseTokens, model);
    assert.deepEqual(graph, qwenEditLightningScaffold(baseTokens, model));
  });

  it("uses a single-file CheckpointLoaderSimple + VAEEncode path for Rapid AIO models", () => {
    const graph = qwenEditImg2imgScaffold(baseTokens, "qwen-rapid-aio-sfw");

    assert.equal(node(graph, "1").class_type, "CheckpointLoaderSimple");
    assert.equal(node(graph, "1").inputs?.ckpt_name, "{{CHECKPOINT}}");

    assert.equal(node(graph, "900").class_type, "LoadImage");
    assert.equal(node(graph, "900").inputs?.image, baseTokens.inputImage);

    const vaeEncode = node(graph, "901");
    assert.equal(vaeEncode.class_type, "VAEEncode");
    assert.deepEqual(vaeEncode.inputs?.pixels, ["900", 0]);
    assert.deepEqual(vaeEncode.inputs?.vae, ["1", 2]);

    assert.equal(node(graph, "4").inputs?.prompt, baseTokens.positive);
    assert.equal(node(graph, "5").inputs?.prompt, baseTokens.negative);
    assert.ok("image1" in (node(graph, "4").inputs ?? {}));

    const sampler = node(graph, "8");
    assert.deepEqual(sampler.inputs?.positive, ["4", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["5", 0]);
    assert.deepEqual(sampler.inputs?.latent_image, ["901", 0]);
    assert.deepEqual(node(graph, "9").inputs?.vae, ["1", 2]);

    const classTypes = classTypesOf(graph);
    assert.ok(!classTypes.includes("UNETLoader"));
    assert.ok(!classTypes.includes("EmptySD3LatentImage"));
  });

  it("uses the original TextEncodeQwenImageEdit `image` key for a Rapid AIO edit model wired to that comfyNode", () => {
    // qwen-rapid-aio-edit is registered with comfyNode 'Load Checkpoint', so
    // resolveQwenEditEncoderClass falls through to the Plus variant here too —
    // assert the actual resolved class rather than assuming the original.
    const graph = qwenEditImg2imgScaffold(baseTokens, "qwen-rapid-aio-edit");
    assert.equal(node(graph, "4").class_type, resolveQwenEditEncoderClass("qwen-rapid-aio-edit"));
  });

  it("uses the UNET/CLIP/VAE loader path with a single combined encode node for split loader-based edit models", () => {
    const graph = qwenEditImg2imgScaffold(baseTokens, "qwen-image-edit-2511");

    assert.equal(node(graph, "1").class_type, "UNETLoader");
    assert.equal(node(graph, "2").class_type, "CLIPLoader");
    assert.equal(node(graph, "3").class_type, "VAELoader");

    assert.equal(node(graph, "900").class_type, "LoadImage");
    const vaeEncode = node(graph, "901");
    assert.deepEqual(vaeEncode.inputs?.vae, ["3", 0]);

    assert.equal(node(graph, "4").class_type, "TextEncodeQwenImageEditPlus");
    assert.equal(node(graph, "4").inputs?.prompt, baseTokens.positive);
    // No separate negative encode node in this branch — KSampler reuses node 4 for both.
    assert.equal(graph["5"], undefined);

    const sampler = node(graph, "8");
    assert.deepEqual(sampler.inputs?.positive, ["4", 0]);
    assert.deepEqual(sampler.inputs?.negative, ["4", 0]);
    assert.deepEqual(sampler.inputs?.latent_image, ["901", 0]);
  });

  it("uses the `image` key (not image1) when the resolved encoder class is the original TextEncodeQwenImageEdit", () => {
    const graph = qwenEditImg2imgScaffold(baseTokens, "qwen-image-edit");
    assert.equal(node(graph, "4").class_type, "TextEncodeQwenImageEdit");
    assert.ok("image" in (node(graph, "4").inputs ?? {}));
    assert.ok(!("image1" in (node(graph, "4").inputs ?? {})));
  });

  it("has no dangling references across every branch", () => {
    assertNoDanglingRefs(qwenEditImg2imgScaffold(baseTokens, "qwen-image-edit-2511-lightning-4"));
    assertNoDanglingRefs(qwenEditImg2imgScaffold(baseTokens, "qwen-rapid-aio-sfw"));
    assertNoDanglingRefs(qwenEditImg2imgScaffold(baseTokens, "qwen-image-edit-2511"));
  });
});
