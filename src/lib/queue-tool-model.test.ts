import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  isVideoModel,
  resolveEditCounterpartForImg2img,
  resolveModelForPromptGeneration,
  resolveModelForQueueTool,
  resolvePreferredImg2imgModel,
  resolveTxt2iCounterpartForGenerate,
  stripEditInstructionLead,
  toolIgnoresSystemWorkflowSnap,
} from "./queue-tool-model";

describe("queue-tool-model", () => {
  it("keeps Edit Lightning on generate queue (same model + LoRA stack)", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "generate"),
      "qwen-image-edit-2511-lightning-8",
    );
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-4", "generate"),
      "qwen-image-edit-2511-lightning-4",
    );
  });

  it("maps edit Lightning to T2I counterpart for prompt writing on generate", () => {
    assert.equal(
      resolveModelForPromptGeneration(
        "qwen-image-edit-2511-lightning-8",
        "generate",
      ),
      "qwen-image-2512-lightning-8",
    );
  });

  it("keeps edit model for prompt writing on refine", () => {
    assert.equal(
      resolveModelForPromptGeneration(
        "qwen-image-edit-2511-lightning-8",
        "refine",
      ),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("keeps edit model on refine tool queue", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "refine"),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("filters edit models from full generate catalog", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512"]);
  });

  it("prefers scene models even when includeEditModels is off by default", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512"]);
  });

  it("keeps edit models on generate only when includeEditModels is set", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
      { includeEditModels: true },
    );
    assert.deepEqual(filtered, [
      "qwen-image-2512",
      "qwen-image-edit-2511-lightning-8",
    ]);
  });

  it("resolves Edit Lightning T2I counterpart for Generate switch", () => {
    assert.equal(
      resolveTxt2iCounterpartForGenerate("qwen-image-edit-2511-lightning-8"),
      "qwen-image-2512-lightning-8",
    );
  });

  it("recognizes txt2img models as scene generation models", () => {
    assert.equal(isSceneGenerationModel("qwen-image-2512"), true);
    assert.equal(isSceneGenerationModel("qwen-image-edit-2511"), false);
    assert.equal(isSceneGenerationModel("boogu-image"), true);
    assert.equal(isSceneGenerationModel("boogu-image-turbo"), true);
    assert.equal(isSceneGenerationModel("boogu-image-edit"), false);
    assert.equal(isSceneGenerationModel("boogu-image-edit-turbo"), false);
  });

  it("includes Boogu T2I and Edit models on refine, generate, and inpaint pickers", () => {
    const catalog = [
      "qwen-image-2512",
      "boogu-image",
      "boogu-image-turbo",
      "boogu-image-edit",
      "boogu-image-edit-turbo",
      "flux-dev",
    ] as const;
    assert.deepEqual(filterModelsForQueueTool([...catalog], "refine"), [
      "qwen-image-2512",
      "boogu-image",
      "boogu-image-turbo",
      "boogu-image-edit",
      "boogu-image-edit-turbo",
      "flux-dev",
    ]);
    assert.deepEqual(filterModelsForQueueTool([...catalog], "inpaint"), [
      "boogu-image-edit",
      "boogu-image-edit-turbo",
    ]);
    assert.deepEqual(filterModelsForQueueTool([...catalog], "imagePrompt"), [
      "qwen-image-2512",
      "boogu-image",
      "boogu-image-turbo",
      "boogu-image-edit",
      "boogu-image-edit-turbo",
      "flux-dev",
    ]);
    assert.deepEqual(filterModelsForQueueTool([...catalog], "generate"), [
      "qwen-image-2512",
      "boogu-image",
      "boogu-image-turbo",
      "flux-dev",
    ]);
  });

  it("keeps Rapid AIO SFW/NSFW in generate picker as dual-purpose T2I", () => {
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-nsfw"), true);
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-sfw"), true);
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-edit"), false);
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-rapid-aio-nsfw",
        "qwen-rapid-aio-edit",
        "qwen-image-edit-2511",
      ],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512", "qwen-rapid-aio-nsfw"]);
  });

  it("filters Roleplay From photo to img2img/edit models", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-image-2512-lightning-8",
        "qwen-rapid-aio-nsfw",
        "qwen-rapid-aio-edit",
        "qwen-image-edit-2511-lightning-8",
        "flux-dev",
        "flux-2-klein",
        "z-image-turbo",
        "boogu-image",
        "boogu-image-edit",
      ],
      "roleplay",
      { preferEditModels: true },
    );
    assert.deepEqual(filtered, [
      "qwen-rapid-aio-edit",
      "qwen-image-edit-2511-lightning-8",
      "flux-2-klein",
      "z-image-turbo",
      "boogu-image-edit",
    ]);
  });

  it("filters Day with preferEditModels to img2img/edit models", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512-lightning-8",
        "qwen-image-edit-2511-lightning-8",
        "flux-2-klein",
        "z-image-turbo",
      ],
      "day",
      { preferEditModels: true },
    );
    assert.deepEqual(filtered, [
      "qwen-image-edit-2511-lightning-8",
      "flux-2-klein",
      "z-image-turbo",
    ]);
  });

  it("keeps Roleplay From bio on the T2I catalog", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-rapid-aio-nsfw",
        "qwen-rapid-aio-edit",
        "qwen-image-edit-2511-lightning-8",
      ],
      "roleplay",
    );
    assert.deepEqual(filtered, ["qwen-image-2512", "qwen-rapid-aio-nsfw"]);
  });

  it("lets Show all override Roleplay From photo img2img filter", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "roleplay",
      { preferEditModels: true, includeEditModels: true },
    );
    assert.deepEqual(filtered, [
      "qwen-image-2512",
      "qwen-image-edit-2511-lightning-8",
    ]);
  });

  it("maps T2I Lightning to Edit Lightning for From photo", () => {
    assert.equal(
      resolveEditCounterpartForImg2img("qwen-image-2512-lightning-8"),
      "qwen-image-edit-2511-lightning-8",
    );
    assert.equal(
      resolveEditCounterpartForImg2img("qwen-rapid-aio-nsfw"),
      "qwen-rapid-aio-edit",
    );
    assert.equal(
      resolveEditCounterpartForImg2img("boogu-image-turbo"),
      "boogu-image-edit-turbo",
    );
    assert.equal(
      resolveEditCounterpartForImg2img("qwen-image-edit-2511-lightning-8"),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("snaps a T2I pick onto an allowed img2img counterpart", () => {
    assert.equal(
      resolvePreferredImg2imgModel({
        current: "qwen-image-2512-lightning-8",
        allowed: [
          "qwen-image-edit-2511-lightning-8",
          "qwen-rapid-aio-edit",
          "flux-2-klein",
        ],
      }),
      "qwen-image-edit-2511-lightning-8",
    );
    assert.equal(
      resolvePreferredImg2imgModel({
        current: "qwen-rapid-aio-nsfw",
        allowed: ["qwen-image-edit-2511", "qwen-rapid-aio-edit"],
      }),
      "qwen-rapid-aio-edit",
    );
    assert.equal(
      resolvePreferredImg2imgModel({
        current: "z-image-turbo",
        allowed: ["qwen-image-edit-2511-lightning-8", "z-image-turbo"],
      }),
      "z-image-turbo",
    );
  });

  it("does not remap Rapid AIO NSFW away on generate", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-rapid-aio-nsfw", "generate"),
      "qwen-rapid-aio-nsfw",
    );
  });

  it("strips edit instruction preambles for generate tool", () => {
    const raw =
      "Keep the person unchanged in pose and lighting from Qwen-Image-Edit-2511 Lightning (8-step) format. Arrange cobalt blue ceramic vases filled with cream roses.";
    assert.equal(
      stripEditInstructionLead(raw, "generate"),
      "Arrange cobalt blue ceramic vases filled with cream roses.",
    );
  });

  it("recognizes WAN/Hunyuan/LTX Video as video models, images/edit as not", () => {
    assert.equal(isVideoModel("wan-video"), true);
    assert.equal(isVideoModel("wan-video-rapid-aio"), true);
    assert.equal(isVideoModel("wan-video-lightning-4"), true);
    assert.equal(isVideoModel("hunyuan-video"), true);
    assert.equal(isVideoModel("ltx-video"), true);
    assert.equal(isVideoModel("qwen-image-2512"), false);
    assert.equal(isVideoModel("qwen-image-edit-2511"), false);
  });

  it("scopes the Video tool picker to video-category models only", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "wan-video",
        "wan-video-rapid-aio",
        "wan-video-lightning-4",
        "hunyuan-video",
        "ltx-video",
        "flux-dev",
      ],
      "video",
    );
    assert.deepEqual(filtered, [
      "wan-video",
      "wan-video-rapid-aio",
      "wan-video-lightning-4",
      "hunyuan-video",
      "ltx-video",
    ]);
  });

  it("keeps the full catalog for the Video tool when no video models are present", () => {
    const filtered = filterModelsForQueueTool(["qwen-image-2512", "flux-dev"], "video");
    assert.deepEqual(filtered, ["qwen-image-2512", "flux-dev"]);
  });

  it("ignores includeEditModels override for the Video tool (never mixes in image checkpoints)", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "wan-video"],
      "video",
      { includeEditModels: true },
    );
    assert.deepEqual(filtered, ["wan-video"]);
  });

  it("scopes Audio and Mesh tool pickers to their categories", () => {
    assert.deepEqual(
      filterModelsForQueueTool(
        ["qwen-image-2512", "stable-audio", "hunyuan-3d", "wan-video"],
        "audio",
      ),
      ["stable-audio"],
    );
    assert.deepEqual(
      filterModelsForQueueTool(
        ["qwen-image-2512", "stable-audio", "hunyuan-3d", "wan-video"],
        "mesh",
      ),
      ["hunyuan-3d"],
    );
  });

  it("skips system-workflow snap for audio, mesh, and video tools", () => {
    assert.equal(toolIgnoresSystemWorkflowSnap("audio"), true);
    assert.equal(toolIgnoresSystemWorkflowSnap("mesh"), true);
    assert.equal(toolIgnoresSystemWorkflowSnap("video"), true);
    assert.equal(toolIgnoresSystemWorkflowSnap("generate"), false);
  });

  it("prefers the Video tool's last model over a still-image shared model", async () => {
    const { resolvePreferredVideoModel } = await import("./queue-tool-model");
    assert.equal(
      resolvePreferredVideoModel({
        toolModel: "wan-video-rapid-aio",
        sharedModel: "qwen-image-2512",
      }),
      "wan-video-rapid-aio",
    );
    assert.equal(
      resolvePreferredVideoModel({
        toolModel: undefined,
        sharedModel: "hunyuan-video",
      }),
      "hunyuan-video",
    );
    assert.equal(
      resolvePreferredVideoModel({
        toolModel: undefined,
        sharedModel: "flux-dev",
      }),
      "wan-video",
    );
  });
});
