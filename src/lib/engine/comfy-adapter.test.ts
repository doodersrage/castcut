import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comfyEngineAdapter,
  diffusersEngineAdapter,
  falEngineAdapter,
  geminiEngineAdapter,
  getEngineAdapter,
  getEngineAdapterById,
  grokEngineAdapter,
  openaiEngineAdapter,
  replicateEngineAdapter,
} from "./index";
import { buildDiffusersViewPath, buildEngineViewPath, buildFalViewPath, buildNamedCloudViewPath, buildReplicateViewPath } from "./view-paths";

describe("engine adapter", () => {
  it("builds a ComfyUI view path for gallery entries without an engine URL", () => {
    // Imported / saved-film entries can lack comfyUrl; the Cast home crashed on them.
    const image = { filename: "film.webm", subfolder: "", type: "output" };
    const path = buildEngineViewPath(undefined, undefined, image);
    assert.equal(path, "/api/comfyui/view?filename=film.webm&subfolder=&type=output");
    assert.match(
      buildEngineViewPath("comfyui", "http://127.0.0.1:8188/", image),
      /comfyUrl=http%3A%2F%2F127\.0\.0\.1%3A8188$/
    );
  });

  it("defaults to ComfyUI outside the browser", () => {
    assert.equal(getEngineAdapter().id, "comfyui");
    assert.equal(getEngineAdapter(), comfyEngineAdapter);
  });

  it("resolves adapters by id", () => {
    assert.equal(getEngineAdapterById("comfyui"), comfyEngineAdapter);
    assert.equal(getEngineAdapterById("diffusers"), diffusersEngineAdapter);
    assert.equal(getEngineAdapterById("fal"), falEngineAdapter);
    assert.equal(getEngineAdapterById("replicate"), replicateEngineAdapter);
    assert.equal(getEngineAdapterById("openai"), openaiEngineAdapter);
    assert.equal(getEngineAdapterById("gemini"), geminiEngineAdapter);
    assert.equal(getEngineAdapterById("grok"), grokEngineAdapter);
    assert.equal(getEngineAdapterById(undefined), comfyEngineAdapter);
  });

  it("maps engineUrl through buildViewPath to the Comfy view proxy", () => {
    const path = comfyEngineAdapter.buildViewPath(
      "http://127.0.0.1:8188",
      { filename: "out.png", subfolder: "", type: "output" },
      { width: 320 },
    );
    assert.match(path, /^\/api\/comfyui\/view\?/);
    assert.match(path, /filename=out\.png/);
    assert.match(path, /w=320/);
    assert.match(path, /comfyUrl=/);
  });

  it("maps Diffusers view paths through /api/diffusers/view", () => {
    const path = diffusersEngineAdapter.buildViewPath(
      "http://127.0.0.1:8190",
      { filename: "job.png", subfolder: "", type: "output" },
      { width: 256 },
    );
    assert.match(path, /^\/api\/diffusers\/view\?/);
    assert.match(path, /filename=job\.png/);
    assert.match(path, /engineUrl=/);
    assert.match(path, /w=256/);
    assert.equal(
      buildEngineViewPath("diffusers", "http://127.0.0.1:8190", {
        filename: "job.png",
        subfolder: "",
        type: "output",
      }),
      buildDiffusersViewPath("http://127.0.0.1:8190", {
        filename: "job.png",
        subfolder: "",
        type: "output",
      }),
    );
  });

  it("maps Fal view paths through /api/fal/view", () => {
    const path = falEngineAdapter.buildViewPath(
      "https://queue.fal.run",
      { filename: "req.png", subfolder: "fal-ai--flux--schnell", type: "output" },
      { width: 256 },
    );
    assert.match(path, /^\/api\/fal\/view\?/);
    assert.match(path, /filename=req\.png/);
    assert.match(path, /w=256/);
    assert.equal(
      buildEngineViewPath("fal", "https://queue.fal.run", {
        filename: "req.png",
        subfolder: "fal-ai--flux--schnell",
        type: "output",
      }),
      buildFalViewPath("https://queue.fal.run", {
        filename: "req.png",
        subfolder: "fal-ai--flux--schnell",
        type: "output",
      }),
    );
  });

  it("maps Replicate view paths through /api/replicate/view", () => {
    const path = replicateEngineAdapter.buildViewPath(
      "https://api.replicate.com",
      { filename: "pred.png", subfolder: "black-forest-labs--flux-schnell", type: "output" },
      { width: 256 },
    );
    assert.match(path, /^\/api\/replicate\/view\?/);
    assert.match(path, /filename=pred\.png/);
    assert.match(path, /w=256/);
    assert.equal(
      buildEngineViewPath("replicate", "https://api.replicate.com", {
        filename: "pred.png",
        subfolder: "black-forest-labs--flux-schnell",
        type: "output",
      }),
      buildReplicateViewPath("https://api.replicate.com", {
        filename: "pred.png",
        subfolder: "black-forest-labs--flux-schnell",
        type: "output",
      }),
    );
  });

  it("maps ChatGPT / Gemini / Grok view paths through /api/<engine>/view", () => {
    assert.match(
      openaiEngineAdapter.buildViewPath("https://api.openai.com", {
        filename: "job.png",
        subfolder: "gpt-image-2",
        type: "output",
      }),
      /^\/api\/openai\/view\?/,
    );
    assert.equal(
      buildEngineViewPath("gemini", "https://generativelanguage.googleapis.com", {
        filename: "job.png",
        subfolder: "gemini-3.1-flash-image",
        type: "output",
      }),
      buildNamedCloudViewPath("gemini", "https://generativelanguage.googleapis.com", {
        filename: "job.png",
        subfolder: "gemini-3.1-flash-image",
        type: "output",
      }),
    );
    assert.match(
      grokEngineAdapter.buildViewPath("https://api.x.ai", {
        filename: "job.png",
        subfolder: "grok-imagine-image-2.0",
        type: "output",
      }),
      /^\/api\/grok\/view\?/,
    );
  });

  it("exposes progress subscribe helpers on adapters", () => {
    assert.equal(typeof comfyEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof comfyEngineAdapter.openProgressBeforeQueue, "function");
    assert.equal(typeof diffusersEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof diffusersEngineAdapter.openProgressBeforeQueue, "function");
    assert.equal(typeof falEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof falEngineAdapter.openProgressBeforeQueue, "function");
    assert.equal(typeof replicateEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof replicateEngineAdapter.openProgressBeforeQueue, "function");
    assert.equal(typeof openaiEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof geminiEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof grokEngineAdapter.subscribeProgress, "function");
  });
});
