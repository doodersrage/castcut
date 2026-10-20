import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadEngineSettings,
  saveEngineSettings,
  resolveCloudTxt2ImgModel,
  resolveCloudQueueModel,
  resolveCloudQueueExtras,
  resolveCloudEngineHost,
} from "./settings";
import { cloudEngineHost } from "./capabilities";
import type { EngineId } from "./types";

// This module's `window`-gated client branch (localStorage-backed settings)
// never runs under node:test, since `typeof window` is 'undefined' here —
// so every case below exercises the server (env-var-driven) branch, which
// is what loadEngineSettings/saveEngineSettings/resolveCloudQueueExtras all
// fall back to in that environment. Confirmed via probe before writing this.
const ALL_ENV_KEYS = [
  "PROMPT_ENGINE",
  "NEXT_PUBLIC_PROMPT_ENGINE",
  "DIFFUSERS_API_URL",
  "NEXT_PUBLIC_DIFFUSERS_API_URL",
  "FAL_MODEL",
  "NEXT_PUBLIC_FAL_MODEL",
  "FAL_IMG2IMG_MODEL",
  "NEXT_PUBLIC_FAL_IMG2IMG_MODEL",
  "FAL_I2V_MODEL",
  "NEXT_PUBLIC_FAL_I2V_MODEL",
  "FAL_T2V_MODEL",
  "NEXT_PUBLIC_FAL_T2V_MODEL",
  "FAL_EXTEND_MODEL",
  "NEXT_PUBLIC_FAL_EXTEND_MODEL",
  "REPLICATE_MODEL",
  "NEXT_PUBLIC_REPLICATE_MODEL",
  "REPLICATE_IMG2IMG_MODEL",
  "NEXT_PUBLIC_REPLICATE_IMG2IMG_MODEL",
  "REPLICATE_I2V_MODEL",
  "NEXT_PUBLIC_REPLICATE_I2V_MODEL",
  "REPLICATE_T2V_MODEL",
  "NEXT_PUBLIC_REPLICATE_T2V_MODEL",
  "OPENAI_MODEL",
  "NEXT_PUBLIC_OPENAI_MODEL",
  "RUNWAY_MODEL",
  "NEXT_PUBLIC_RUNWAY_MODEL",
  "RUNWAY_I2V_MODEL",
  "NEXT_PUBLIC_RUNWAY_I2V_MODEL",
  "RUNWAY_T2V_MODEL",
  "NEXT_PUBLIC_RUNWAY_T2V_MODEL",
  "RUNWAY_EXTEND_MODEL",
  "NEXT_PUBLIC_RUNWAY_EXTEND_MODEL",
  "GEMINI_MODEL",
  "NEXT_PUBLIC_GEMINI_MODEL",
  "GROK_MODEL",
  "NEXT_PUBLIC_GROK_MODEL",
];

beforeEach(() => {
  for (const key of ALL_ENV_KEYS) delete process.env[key];
});

describe("loadEngineSettings: engine resolution", () => {
  it("defaults to 'comfyui' with no relevant env vars", () => {
    assert.equal(loadEngineSettings().engine, "comfyui");
  });

  it("reads PROMPT_ENGINE when it names a valid engine", () => {
    process.env.PROMPT_ENGINE = "fal";
    assert.equal(loadEngineSettings().engine, "fal");
  });

  it("prefers NEXT_PUBLIC_PROMPT_ENGINE over PROMPT_ENGINE", () => {
    process.env.PROMPT_ENGINE = "fal";
    process.env.NEXT_PUBLIC_PROMPT_ENGINE = "replicate";
    assert.equal(loadEngineSettings().engine, "replicate");
  });

  it("falls back to 'comfyui' for an unrecognized engine id", () => {
    process.env.PROMPT_ENGINE = "bogus-engine";
    assert.equal(loadEngineSettings().engine, "comfyui");
  });

  it("accepts 'diffusers' and trims/lowercases the raw value", () => {
    process.env.PROMPT_ENGINE = "diffusers";
    assert.equal(loadEngineSettings().engine, "diffusers");
    process.env.PROMPT_ENGINE = "  FAL  ";
    assert.equal(loadEngineSettings().engine, "fal");
  });
});

describe("loadEngineSettings: diffusersApiUrl and diffusersAutoStart", () => {
  it("defaults diffusersApiUrl to DEFAULT_DIFFUSERS_API_URL and diffusersAutoStart to true", () => {
    const settings = loadEngineSettings();
    assert.equal(settings.diffusersApiUrl, "http://127.0.0.1:8190");
    assert.equal(settings.diffusersAutoStart, true);
  });

  it("reads DIFFUSERS_API_URL, with NEXT_PUBLIC_DIFFUSERS_API_URL taking precedence", () => {
    process.env.DIFFUSERS_API_URL = "http://custom:9999";
    assert.equal(loadEngineSettings().diffusersApiUrl, "http://custom:9999");
    process.env.NEXT_PUBLIC_DIFFUSERS_API_URL = "http://pub:1111";
    assert.equal(loadEngineSettings().diffusersApiUrl, "http://pub:1111");
  });
});

describe("loadEngineSettings: cloud model env precedence", () => {
  it("defaults every cloud model field to its documented default constant", () => {
    const settings = loadEngineSettings();
    assert.equal(settings.falModel, "fal-ai/flux/schnell");
    assert.equal(settings.falI2vModel, "fal-ai/kling-video/v2.1/standard/image-to-video");
    assert.equal(settings.falT2vModel, "fal-ai/kling-video/v2.1/standard/text-to-video");
    assert.equal(settings.falExtendModel, "fal-ai/ltx-2.3/extend-video");
    assert.equal(settings.replicateI2vModel, "kwaivgi/kling-v3-video");
    assert.equal(settings.runwayExtendModel, "aleph2");
  });

  it("reads the plain env var, with the NEXT_PUBLIC_ variant taking precedence", () => {
    process.env.FAL_MODEL = "custom1";
    assert.equal(loadEngineSettings().falModel, "custom1");
    process.env.NEXT_PUBLIC_FAL_MODEL = "custom2";
    assert.equal(loadEngineSettings().falModel, "custom2");
  });

  it("resolves per-field env vars independently (e.g. FAL_I2V_MODEL)", () => {
    process.env.FAL_I2V_MODEL = "fi2v";
    assert.equal(loadEngineSettings().falI2vModel, "fi2v");
  });
});

describe("saveEngineSettings", () => {
  it("with an empty patch, returns the same values as loadEngineSettings()", () => {
    assert.deepEqual(saveEngineSettings({}), loadEngineSettings());
  });

  it("normalizes patch.engine through normalizeEngineId, falling back to 'comfyui' when invalid", () => {
    assert.equal(saveEngineSettings({ engine: "fal" as EngineId }).engine, "fal");
    assert.equal(saveEngineSettings({ engine: "bogus" as EngineId }).engine, "comfyui");
  });

  it("falls back to envDefaultDiffusersUrl() when patch.diffusersApiUrl is blank, else trims it", () => {
    assert.equal(
      saveEngineSettings({ diffusersApiUrl: "   " }).diffusersApiUrl,
      "http://127.0.0.1:8190"
    );
    assert.equal(
      saveEngineSettings({ diffusersApiUrl: "  http://x  " }).diffusersApiUrl,
      "http://x"
    );
  });

  it("passes diffusersAutoStart through when provided, and preserves the current value when omitted", () => {
    assert.equal(saveEngineSettings({ diffusersAutoStart: false }).diffusersAutoStart, false);
    assert.equal(
      saveEngineSettings({ engine: "fal" as EngineId }).diffusersAutoStart,
      true
    );
  });
});

describe("resolveCloudTxt2ImgModel", () => {
  it("returns settings[modelField] when a cloud engine option exists", () => {
    assert.equal(resolveCloudTxt2ImgModel("fal" as EngineId), "fal-ai/flux/schnell");
    process.env.FAL_MODEL = "custom-fal";
    assert.equal(resolveCloudTxt2ImgModel("fal" as EngineId), "custom-fal");
  });

  it("falls back to DEFAULT_FAL_TXT2IMG_MODEL for a non-cloud engine (no option found)", () => {
    assert.equal(resolveCloudTxt2ImgModel("comfyui" as EngineId), "fal-ai/flux/schnell");
  });

  it("defaults its engine argument to loadEngineSettings().engine", () => {
    assert.equal(resolveCloudTxt2ImgModel(), "fal-ai/flux/schnell");
  });
});

describe("resolveCloudQueueModel: grok and gemini native-video branches", () => {
  it("grok uses DEFAULT_GROK_VIDEO_MODEL unless clipMode is explicitly 'extend'", () => {
    assert.equal(
      resolveCloudQueueModel("grok" as EngineId, "video", {}),
      "grok-imagine-video-1.5"
    );
    assert.equal(
      resolveCloudQueueModel("grok" as EngineId, "video", { clipMode: "extend" }),
      "grok-imagine-video"
    );
  });

  it("grok stays on the video model even when hasInputImage infers i2v (only explicit 'extend' switches it)", () => {
    assert.equal(
      resolveCloudQueueModel("grok" as EngineId, "video", { hasInputImage: true }),
      "grok-imagine-video-1.5"
    );
  });

  it("gemini always returns DEFAULT_GEMINI_VIDEO_MODEL for video, ignoring clipMode", () => {
    assert.equal(
      resolveCloudQueueModel("gemini" as EngineId, "video", { clipMode: "extend" }),
      "veo-3.1-generate-preview"
    );
  });
});

describe("resolveCloudQueueModel: fal/replicate/runway video routing", () => {
  it("fal routes through resolveFalVideoModel using settings.falT2vModel for the default t2v clip mode", () => {
    process.env.FAL_T2V_MODEL = "custom-fal-t2v";
    assert.equal(resolveCloudQueueModel("fal" as EngineId, "video", {}), "custom-fal-t2v");
  });

  it("replicate routes through resolveReplicateVideoModel using settings.replicateI2vModel when hasInputImage", () => {
    process.env.REPLICATE_I2V_MODEL = "custom-repl-i2v";
    assert.equal(
      resolveCloudQueueModel("replicate" as EngineId, "video", { hasInputImage: true }),
      "custom-repl-i2v"
    );
  });

  it("runway routes through resolveRunwayVideoModel using settings.runwayExtendModel for clipMode 'extend'", () => {
    process.env.RUNWAY_EXTEND_MODEL = "custom-runway-extend";
    assert.equal(
      resolveCloudQueueModel("runway" as EngineId, "video", { clipMode: "extend" }),
      "custom-runway-extend"
    );
  });
});

describe("resolveCloudQueueModel: falls through to resolveCloudTxt2ImgModel", () => {
  it("for a non-video tool, even on an engine with a video branch", () => {
    process.env.FAL_MODEL = "custom-fal-still";
    assert.equal(resolveCloudQueueModel("fal" as EngineId, "image", {}), "custom-fal-still");
  });

  it("for an engine with no video branch at all (e.g. openai), even when tool is 'video'", () => {
    process.env.OPENAI_MODEL = "custom-openai";
    assert.equal(resolveCloudQueueModel("openai" as EngineId, "video", {}), "custom-openai");
  });
});

describe("resolveCloudQueueExtras", () => {
  it("returns only the common fields for a non-cloud engine (no matching cloudEngineOption)", () => {
    const result = resolveCloudQueueExtras("comfyui" as EngineId, {});
    assert.deepEqual(Object.keys(result).sort(), ["hasInputImage", "inputImageFilename", "tool"]);
    assert.equal(result.hasInputImage, false);
    assert.equal(result.inputImageFilename, undefined);
    assert.equal(result.tool, undefined);
    assert.ok(!("clipMode" in result));
    assert.ok(!("videoUrl" in result));
  });

  it("fal + video tool + explicit clipMode: full field set with fal-specific model extras", () => {
    const result = resolveCloudQueueExtras("fal" as EngineId, {
      hasInputImage: true,
      inputImageFilename: "foo.png",
      tool: "video",
      clipMode: "i2v",
    });
    assert.deepEqual(Object.keys(result).sort(), [
      "clipMode",
      "extendModel",
      "falApiKey",
      "hasInputImage",
      "i2vModel",
      "img2imgModel",
      "inputImageFilename",
      "t2vModel",
      "tool",
    ]);
    assert.equal(result.hasInputImage, true);
    assert.equal(result.inputImageFilename, "foo.png");
    assert.equal(result.tool, "video");
    assert.equal(result.clipMode, "i2v");
    assert.equal(result.falApiKey, undefined); // no sessionFalApiKey in default shared settings
    assert.equal(result.img2imgModel, "fal-ai/flux/dev/image-to-image");
    assert.equal(result.i2vModel, "fal-ai/kling-video/v2.1/standard/image-to-video");
    assert.equal(result.t2vModel, "fal-ai/kling-video/v2.1/standard/text-to-video");
    assert.equal(result.extendModel, "fal-ai/ltx-2.3/extend-video");
  });

  it("replicate gets i2vModel/t2vModel but no extendModel field (no documented extend/V2V)", () => {
    const result = resolveCloudQueueExtras("replicate" as EngineId, {
      tool: "video",
      hasInputImage: false,
    });
    assert.deepEqual(Object.keys(result).sort(), [
      "clipMode",
      "hasInputImage",
      "i2vModel",
      "img2imgModel",
      "inputImageFilename",
      "replicateApiToken",
      "t2vModel",
      "tool",
    ]);
    assert.ok(!("extendModel" in result));
  });

  it("runway gets the same i2v/t2v/extend model shape as fal", () => {
    const result = resolveCloudQueueExtras("runway" as EngineId, { tool: "video" });
    assert.deepEqual(Object.keys(result).sort(), [
      "clipMode",
      "extendModel",
      "hasInputImage",
      "i2vModel",
      "img2imgModel",
      "inputImageFilename",
      "runwayApiKey",
      "t2vModel",
      "tool",
    ]);
  });

  it("gemini gets common + token/img2img fields but no i2v/t2v/extend model fields", () => {
    const result = resolveCloudQueueExtras("gemini" as EngineId, { tool: "video" });
    assert.deepEqual(Object.keys(result).sort(), [
      "clipMode",
      "geminiApiKey",
      "hasInputImage",
      "img2imgModel",
      "inputImageFilename",
      "tool",
    ]);
  });

  it("omits inputImageFilenames when every entry is blank, includes it verbatim otherwise", () => {
    const blank = resolveCloudQueueExtras("fal" as EngineId, {
      inputImageFilenames: ["", "   "],
    });
    assert.ok(!("inputImageFilenames" in blank));
    const nonBlank = resolveCloudQueueExtras("fal" as EngineId, {
      inputImageFilenames: ["a.png", "b.png"],
    });
    assert.deepEqual(nonBlank.inputImageFilenames, ["a.png", "b.png"]);
  });

  it("trims videoUrl when present, omits the key when it is blank", () => {
    const withUrl = resolveCloudQueueExtras("fal" as EngineId, { videoUrl: "  http://vid  " });
    assert.equal(withUrl.videoUrl, "http://vid");
    const blankUrl = resolveCloudQueueExtras("fal" as EngineId, { videoUrl: "   " });
    assert.ok(!("videoUrl" in blankUrl));
  });
});

describe("resolveCloudEngineHost", () => {
  it("delegates to cloudEngineHost from engine/capabilities", () => {
    assert.equal(resolveCloudEngineHost("fal" as EngineId), cloudEngineHost("fal" as EngineId));
    assert.equal(
      resolveCloudEngineHost("comfyui" as EngineId),
      cloudEngineHost("comfyui" as EngineId)
    );
  });
});
