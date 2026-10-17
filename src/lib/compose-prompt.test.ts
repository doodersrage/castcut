import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComposeCapableModel, isEditQueueTool } from "./model-denoise-defaults";
import {
  applyInputImageFilenamesToParams,
  buildComposeInstruction,
  COMPOSE_DEFAULT_MODEL,
  composeDefaultModel,
  Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING,
  multiInputImageCustomTokens,
  normalizeInputImageFilenames,
} from "./compose-prompt";
import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
} from "./comfyui-config";
import { filterModelsForQueueTool } from "./queue-tool-model";
import {
  inferLoadImageBinding,
  inputImageBindingForFigureIndex,
} from "./workflow-load-image-bindings";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings";
import { patchLoadImageNodesInWorkflow } from "./workflow-direct-patch";
import { ensureQwenEditReferenceImagesForImg2Img } from "./workflow-lightning-queue";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";

describe("compose tool defaults", () => {
  it("registers compose as an edit queue tool", () => {
    assert.equal(isEditQueueTool("compose"), true);
  });

  it("defaults Compose to Edit-2511 Lightning 8", () => {
    assert.equal(COMPOSE_DEFAULT_MODEL, "qwen-image-edit-2511-lightning-8");
  });

  it("warns that Z-Image extras stay prompt-only", () => {
    assert.match(Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING, /Image 1 to the sampler/);
    assert.match(Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING, /Image 2–4 stay in the prompt/);
  });

  it("filters compose picker to compose-capable models (not flux-inpaint)", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-image-edit-2511-lightning-8",
        "boogu-image-edit-turbo",
        "z-image-turbo",
        "flux-inpaint",
        "flux-dev",
      ],
      "compose",
    );
    assert.deepEqual(filtered, [
      "qwen-image-edit-2511-lightning-8",
      "boogu-image-edit-turbo",
      "z-image-turbo",
    ]);
  });

  it("rejects flux-inpaint as compose-capable", () => {
    assert.equal(isComposeCapableModel("flux-inpaint"), false);
    assert.equal(isComposeCapableModel("qwen-image-edit-2511-lightning-8"), true);
  });
});

describe("compose input image filenames + tokens", () => {
  it("normalizes array with primary override", () => {
    assert.deepEqual(
      normalizeInputImageFilenames("fig1.png", ["a.png", "b.png", "c.png"]),
      ["fig1.png", "b.png", "c.png"],
    );
  });

  it("keeps Image 2 empty so Figure 3 does not become Image 2", () => {
    assert.deepEqual(
      normalizeInputImageFilenames("fig1.png", ["fig1.png", "", "fig3.png"]),
      ["fig1.png", "", "fig3.png"],
    );
    const params = applyInputImageFilenamesToParams(
      {},
      ["fig1.png", "", "fig3.png"],
    );
    assert.equal(params.inputImageFilename, "fig1.png");
    assert.deepEqual(params.inputImageFilenames, ["fig1.png", "", "fig3.png"]);
  });

  it("fills INPUT_IMAGE_2..4 custom tokens", () => {
    const tokens = multiInputImageCustomTokens([
      "a.png",
      "b.png",
      "c.png",
      "d.png",
    ]);
    assert.deepEqual(tokens, [
      { token: DEFAULT_INPUT_IMAGE_TOKEN, value: "a.png" },
      { token: DEFAULT_INPUT_IMAGE_2_TOKEN, value: "b.png" },
      { token: DEFAULT_INPUT_IMAGE_3_TOKEN, value: "c.png" },
      { token: DEFAULT_INPUT_IMAGE_4_TOKEN, value: "d.png" },
    ]);
  });
});

describe("compose LoadImage bindings", () => {
  it("maps Figure 1–4 titles to inputImageN kinds", () => {
    assert.equal(inferLoadImageBinding("LoadImage", "Figure 1"), "inputImage");
    assert.equal(inferLoadImageBinding("LoadImage", "Image 2"), "inputImage2");
    assert.equal(inferLoadImageBinding("LoadImage", "Ref 3 donor"), "inputImage3");
    assert.equal(inferLoadImageBinding("LoadImage", "Photo 4"), "inputImage4");
    assert.equal(inputImageBindingForFigureIndex(2), "inputImage2");
  });

  it("binds sequential untitled LoadImages to Figure slots (not control)", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 0,
        loadImageCount: 3,
      }),
      "inputImage",
    );
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 1,
        loadImageCount: 3,
      }),
      "inputImage2",
    );
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 2,
        loadImageCount: 3,
      }),
      "inputImage3",
    );
  });

  it("keeps control-titled LoadImage as controlImage", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Control Image depth"),
      "controlImage",
    );
  });

  it("applies {{INPUT_IMAGE_2}} bindings from mapper", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "old.png" },
        _meta: { title: "Figure 1" },
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "old2.png" },
        _meta: { title: "Figure 2" },
      },
    });
    const mappings = suggestWorkflowNodeMappings(json);
    const applied = applyWorkflowNodeBindings(json, mappings, {
      positive: "{{POSITIVE}}",
      negative: "{{NEGATIVE}}",
    });
    const parsed = JSON.parse(applied.json) as Record<
      string,
      { inputs: { image: string } }
    >;
    assert.equal(parsed["1"]!.inputs.image, DEFAULT_INPUT_IMAGE_TOKEN);
    assert.equal(parsed["2"]!.inputs.image, DEFAULT_INPUT_IMAGE_2_TOKEN);
  });

  it("patches multi LoadImage filenames by figure title", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" },
        _meta: { title: "Figure 1" },
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_2}}" },
        _meta: { title: "Figure 2" },
      },
      "3": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_3}}" },
        _meta: { title: "Figure 3" },
      },
    };
    const { workflow: patched, patched: counts } = patchLoadImageNodesInWorkflow(
      workflow,
      "a.png",
      ["a.png", "b.png", "c.png"],
    );
    const nodes = patched as typeof workflow;
    assert.equal(nodes["1"]!.inputs.image, "a.png");
    assert.equal(nodes["2"]!.inputs.image, "b.png");
    assert.equal(nodes["3"]!.inputs.image, "c.png");
    assert.equal(counts.inputImage, 3);
  });

  it("wires multi LoadImage into Qwen EditPlus encode slots", () => {
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
    };
    const { workflow: next, wiredNodeIds } = ensureQwenEditReferenceImagesForImg2Img(
      workflow,
      {
        hasInputImage: true,
        inputImageFilename: "fig1.png",
        inputImageFilenames: ["fig1.png", "fig2.png", "fig3.png"],
      },
    );
    assert.ok(wiredNodeIds.includes("4"));
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string>;
    };
    const loaders = Object.entries(next).filter(
      ([, node]) =>
        (node as { class_type?: string })?.class_type === "LoadImage",
    );
    assert.equal(loaders.length, 3);
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.ok(Array.isArray(encode.inputs.image2));
    assert.ok(Array.isArray(encode.inputs.image3));
    assert.equal(
      (next[encode.inputs.image1[0]] as { _meta?: { title?: string } })._meta
        ?.title,
      "Figure 1",
    );
    assert.equal(
      (next[encode.inputs.image2[0]] as { _meta?: { title?: string } })._meta
        ?.title,
      "Figure 2",
    );
  });

  it("does not slide Figure 3 into Image 2 when Figure 2 is empty", () => {
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          clip: ["2", 0],
          image2: ["stale", 0],
        },
      },
    };
    const { workflow: next } = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: "fig1.png",
      inputImageFilenames: ["fig1.png", "", "fig3.png"],
    });
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string>;
    };
    assert.equal(encode.inputs.image2, undefined);
    assert.ok(Array.isArray(encode.inputs.image3));
    assert.equal(
      (next[encode.inputs.image3[0]] as { _meta?: { title?: string } })._meta?.title,
      "Figure 3",
    );
  });

  it("wires multi LoadImage into TextEncodeBooguEdit image_1…image_4 slots", () => {
    const workflow = {
      "4": {
        class_type: "TextEncodeBooguEdit",
        inputs: {
          prompt: "edit",
          negative_prompt: "",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
    };
    const { workflow: next, wiredNodeIds } = ensureQwenEditReferenceImagesForImg2Img(
      workflow,
      {
        hasInputImage: true,
        inputImageFilename: "fig1.png",
        inputImageFilenames: ["fig1.png", "fig2.png"],
      },
    );
    assert.ok(wiredNodeIds.includes("4"));
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string>;
    };
    assert.ok(Array.isArray(encode.inputs['images.image_1']));
    assert.ok(Array.isArray(encode.inputs['images.image_2']));
    assert.equal(
      (next[(encode.inputs['images.image_1'] as [string, number])[0]] as {
        _meta?: { title?: string };
      })._meta?.title,
      "Figure 1",
    );
    assert.equal(encode.inputs.image_1, undefined);
  });
});

describe("compose instruction builder", () => {
  it("prefixes transfer instructions without image index labels", () => {
    assert.equal(
      buildComposeInstruction({
        mode: "transfer",
        instruction: "swap the jacket",
        figureCount: 2,
      }),
      "Using Image 1, Image 2: swap the jacket",
    );
  });

  it("leaves labeled transfer instructions alone", () => {
    const text = "Keep pose from Image 1. Use jacket from Image 2.";
    assert.equal(
      buildComposeInstruction({
        mode: "transfer",
        instruction: text,
        figureCount: 2,
      }),
      text,
    );
  });

  it("expands keep/replace modify segments", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "keep: face\nreplace: rainy alley",
      figureCount: 1,
    });
    assert.match(built, /Keep unchanged: face/);
    assert.match(built, /Replace with: rainy alley/);
  });

  it("prefixes Klein Distilled Modify with turbo edit strength, not a keep-everything line", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "warmer golden-hour light",
      figureCount: 1,
      model: "flux-2-klein-9b-distilled",
      turboEditStrength: "strong",
    });
    assert.match(built, /Carry out this change/i);
    assert.match(built, /warmer golden-hour light/);
    assert.equal(/Keep the subject/i.test(built), false);
  });

  it("prefixes Qwen aggressive Modify with pose-unlock guidance", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "Aggressively refactor into beast-mode athletics.",
      figureCount: 1,
      model: "qwen-image-edit-2511-lightning-8",
    });
    assert.match(built, /facial identity and likeness only/i);
    assert.match(built, /Do not preserve the original body pose/i);
    assert.match(built, /beast-mode athletics/i);
  });

  it("prefixes Qwen aggressive Transfer with Image 1/2 pose roles", () => {
    const built = buildComposeInstruction({
      mode: "transfer",
      instruction: "Aggressively refactor while keeping face from Image 1.",
      figureCount: 2,
      model: "qwen-image-edit-2511-lightning-8",
    });
    assert.match(built, /Image 1 is facial identity only/i);
    assert.match(built, /Image 2 supplies the target pose/i);
  });

  it("prefixes Boogu aggressive Modify with pose-unlock guidance", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "Aggressively refactor into beast-mode athletics.",
      figureCount: 1,
      model: "boogu-image-edit-turbo",
    });
    assert.match(built, /facial identity and likeness only/i);
    assert.match(built, /beast-mode athletics/i);
    assert.match(built, /Carry out this change/i);
  });

  it("prefixes Z-Image Turbo Modify with strength wrap instead of a fixed keep-everything line", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "warmer golden-hour light",
      figureCount: 1,
      model: "z-image-turbo",
      turboEditStrength: "gentle",
    });
    assert.match(built, /Light img2img on Image 1/i);
    assert.match(built, /warmer golden-hour light/);
    assert.equal(/gender presentation/i.test(built), false);
  });

  it("prefixes Z-Image Transfer with img2img base note", () => {
    const built = buildComposeInstruction({
      mode: "transfer",
      instruction: "swap the jacket",
      figureCount: 2,
      model: "z-image",
    });
    assert.match(built, /Image 1 is the img2img base/i);
    assert.match(built, /facial identity, gender presentation, and likeness/i);
    assert.match(built, /Image 1, Image 2/i);
    assert.match(built, /swap the jacket/);
  });

  it("prefixes isolated Image 1 on Modify so the white plate is replaced", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "replace: rainy neon alley",
      figureCount: 1,
      isolatedSubject: true,
    });
    assert.match(built, /isolated on a blank white backdrop/i);
    assert.match(built, /Do not keep a studio void/i);
    assert.match(built, /rainy neon alley/i);
  });

  it("prefixes isolated Image 1 on Transfer as identity-only", () => {
    const built = buildComposeInstruction({
      mode: "transfer",
      instruction: "swap the jacket",
      figureCount: 2,
      isolatedSubject: true,
    });
    assert.match(built, /isolated on a blank white backdrop \(identity only\)/i);
    assert.match(built, /Do not keep a studio void/i);
    assert.match(built, /Using Image 1, Image 2/i);
    assert.match(built, /swap the jacket/);
  });

  it("does not double-prefix when the isolate cue is already present", () => {
    const text =
      "Image 1 is the subject isolated on a blank white backdrop. Replace the white with a forest.";
    assert.equal(
      buildComposeInstruction({
        mode: "modify",
        instruction: text,
        figureCount: 1,
        isolatedSubject: true,
      }),
      text,
    );
  });

  it("adds isolate cue alongside Klein Distilled strength wrap on Modify", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "warmer golden-hour light",
      figureCount: 1,
      model: "flux-2-klein-9b-distilled",
      isolatedSubject: true,
      turboEditStrength: "balanced",
    });
    assert.match(built, /isolated on a blank white backdrop/i);
    assert.match(built, /Edit Image 1:/i);
    assert.match(built, /warmer golden-hour light/);
  });
});

describe("composeDefaultModel", () => {
  it("prefers Qwen-Image 2.1 Turbo when installed, else Edit 2511", () => {
    assert.equal(composeDefaultModel(() => true), "qwen-image-2.1-edit-turbo-8");
    assert.equal(
      composeDefaultModel(id => id === "qwen-image-edit-2511-lightning-8"),
      "qwen-image-edit-2511-lightning-8",
    );
    assert.equal(composeDefaultModel(null), "qwen-image-edit-2511-lightning-8");
  });
});

describe('reference picture limits', () => {
  it('the queue carries eight pictures; Compose keeps four figures', async () => {
    const { MAX_INPUT_IMAGE_FILENAMES, normalizeInputImageFilenames, QWEN_EDIT_ENCODE_IMAGE_KEYS } =
      await import('./workflow-load-image-bindings');
    const { MAX_COMPOSE_FIGURES } = await import('./compose-prompt');
    assert.equal(MAX_INPUT_IMAGE_FILENAMES, 8);
    assert.equal(MAX_COMPOSE_FIGURES, 4);
    assert.deepEqual(QWEN_EDIT_ENCODE_IMAGE_KEYS.slice(-1), ['image8']);
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    assert.deepEqual(normalizeInputImageFilenames('a', names), names.slice(0, 8));
  });
});
