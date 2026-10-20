import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTurboEditStrengthToPrompt,
  formatTurboEditStrengthHint,
  normalizeTurboEditStrength,
  resolveZImageTurboImg2imgDenoise,
  skipsCfg1T2iSteeringForTurboEdit,
  stripTurboEditStrengthWrap,
  usesTurboEditStrengthUi,
} from "./turbo-edit-strength";

describe("turbo edit strength", () => {
  it("normalizes unknown values to balanced", () => {
    assert.equal(normalizeTurboEditStrength(undefined), "balanced");
    assert.equal(normalizeTurboEditStrength("nope"), "balanced");
    assert.equal(normalizeTurboEditStrength("GENTLE"), "gentle");
  });

  it("maps Z-Image Turbo denoise across visibly different 8-step bands", () => {
    assert.equal(resolveZImageTurboImg2imgDenoise("gentle"), 0.16);
    assert.equal(resolveZImageTurboImg2imgDenoise("balanced"), 0.36);
    assert.equal(resolveZImageTurboImg2imgDenoise("strong"), 0.58);
  });

  it("shows the control on every local still-image edit tool", () => {
    assert.equal(usesTurboEditStrengthUi("z-image-turbo", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("z-image-turbo", "imagePrompt"), true);
    assert.equal(usesTurboEditStrengthUi("z-image-turbo", "compose"), true);
    assert.equal(usesTurboEditStrengthUi("z-image-turbo", "generate"), false);
    assert.equal(usesTurboEditStrengthUi("z-image", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("qwen-image-2512", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("qwen-image-edit-2511", "compose"), true);
    assert.equal(usesTurboEditStrengthUi("flux-dev", "imagePrompt"), true);
    assert.equal(usesTurboEditStrengthUi("boogu-image-edit-turbo", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("boogu-image-edit", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("boogu-image-turbo", "generate"), false);
    assert.equal(usesTurboEditStrengthUi("flux-2-klein-9b-distilled", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("flux-2-klein-9b-distilled", "compose"), true);
    assert.equal(usesTurboEditStrengthUi("flux-2-klein-9b-distilled", "generate"), false);
    assert.equal(usesTurboEditStrengthUi("flux-2-klein-9b", "refine"), true);
    assert.equal(usesTurboEditStrengthUi("wan-video", "refine"), false);
    assert.equal(usesTurboEditStrengthUi("wan-video", "video"), false);
    assert.equal(usesTurboEditStrengthUi("flux-inpaint", "inpaint"), true);
    assert.equal(usesTurboEditStrengthUi("qwen-image-2512", "outpaint"), true);
    assert.equal(usesTurboEditStrengthUi("flux-dev", "controlnet"), true);
  });

  it("skips T2I photo steering on turbo edit paths", () => {
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("boogu-image-edit-turbo"), true);
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("z-image-turbo", "refine"), true);
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("z-image-turbo", "generate"), false);
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("boogu-image-turbo", "generate"), false);
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("flux-2-klein-9b-distilled", "refine"), true);
    assert.equal(skipsCfg1T2iSteeringForTurboEdit("flux-2-klein-9b-distilled", "generate"), false);
  });

  it("rewrites Boogu / Klein / Z-Image prompts and swaps when strength changes", () => {
    const boogu = applyTurboEditStrengthToPrompt(
      "warmer golden-hour light",
      "boogu-image-edit-turbo",
      "gentle",
    );
    assert.match(boogu, /Do not restyle Image 1/i);
    assert.match(boogu, /warmer golden-hour light/);
    assert.equal(
      applyTurboEditStrengthToPrompt(boogu, "boogu-image-edit-turbo", "gentle"),
      boogu,
    );

    const booguStrong = applyTurboEditStrengthToPrompt(boogu, "boogu-image-edit-turbo", "strong");
    assert.match(booguStrong, /even if lighting, wardrobe, or background must change/i);
    assert.match(booguStrong, /warmer golden-hour light/);
    assert.equal(/Do not restyle Image 1/i.test(booguStrong), false);

    const zImage = applyTurboEditStrengthToPrompt("swap the jacket", "z-image-turbo", "balanced");
    assert.match(zImage, /Edit Image 1 via img2img/i);
    assert.match(zImage, /swap the jacket/);

    const composeLeftover = applyTurboEditStrengthToPrompt(
      "Edit Image 1 via img2img. Preserve facial identity, gender presentation, and likeness from Image 1. Keep pose and framing unless the prompt says otherwise. warmer golden-hour light",
      "z-image-turbo",
      "strong",
    );
    assert.match(composeLeftover, /Stronger img2img/i);
    assert.match(composeLeftover, /warmer golden-hour light/);
    assert.equal(/Preserve facial identity, gender presentation/i.test(composeLeftover), false);

    const klein = applyTurboEditStrengthToPrompt(
      "Keep the subject’s pose and framing unchanged unless asked otherwise. warmer golden-hour light",
      "flux-2-klein-9b-distilled",
      "strong",
    );
    assert.match(klein, /Carry out this change/i);
    assert.match(klein, /warmer golden-hour light/);
    assert.equal(/Keep the subject/i.test(klein), false);

    const qwenEdit = applyTurboEditStrengthToPrompt(
      "warmer golden-hour light",
      "qwen-image-edit-2511",
      "gentle",
    );
    assert.match(qwenEdit, /Do not restyle Image 1/i);
    assert.match(qwenEdit, /warmer golden-hour light/);

    const qwenT2i = applyTurboEditStrengthToPrompt("swap the jacket", "qwen-image-2512", "strong");
    assert.match(qwenT2i, /Stronger img2img/i);
    assert.match(qwenT2i, /swap the jacket/);
  });

  it("strips a previous wrap back to the user instruction", () => {
    const wrapped = applyTurboEditStrengthToPrompt(
      "swap the jacket",
      "boogu-image-edit-turbo",
      "balanced",
    );
    assert.equal(stripTurboEditStrengthWrap(wrapped), "swap the jacket");
  });

  it("explains the lever per model", () => {
    assert.match(formatTurboEditStrengthHint("z-image-turbo", "balanced") ?? "", /0\.36/);
    assert.match(formatTurboEditStrengthHint("qwen-image-2512", "gentle", "refine") ?? "", /0\.28/);
    assert.match(formatTurboEditStrengthHint("boogu-image-edit-turbo", "gentle") ?? "", /denoise 1/);
    assert.match(
      formatTurboEditStrengthHint("flux-2-klein-9b-distilled", "balanced") ?? "",
      /ReferenceLatent/,
    );
    assert.match(
      formatTurboEditStrengthHint("qwen-image-edit-2511", "strong", "compose") ?? "",
      /denoise 1/,
    );
    assert.match(formatTurboEditStrengthHint("flux-inpaint", "gentle", "inpaint") ?? "", /0\.55/);
    assert.match(formatTurboEditStrengthHint("qwen-image-2512", "strong", "outpaint") ?? "", /0\.95/);
  });
});
