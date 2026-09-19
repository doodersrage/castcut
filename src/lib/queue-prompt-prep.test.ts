import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQueuePromptSteering } from "./queue-prompt-prep";

describe("queue-prompt-prep Rapid AIO / Lightning", () => {
  it("keeps short negatives and anti-moiré cues for Rapid AIO without long positives", () => {
    const result = applyQueuePromptSteering({
      positive: "a portrait in soft light",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /clean continuous tones/i);
    // Realism/anatomy suffixes must not append on CFG-1.
    assert.equal(/photorealistic|anatomically/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /moire|moiré/i);
    assert.match(result.negative ?? "", /grid artifacts|banding/i);
    assert.match(result.positive ?? "", /even gradients/i);
  });

  it("drops long auto-negatives for Rapid AIO", () => {
    const longNegative = "a".repeat(200);
    const result = applyQueuePromptSteering({
      positive: "scene",
      negative: longNegative,
      model: "qwen-rapid-aio-sfw",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal((result.negative ?? "").includes(longNegative), false);
    assert.match(result.negative ?? "", /moire|moiré/i);
  });

  it("keeps a short Image 3 anti-leak pack on Rapid AIO Edit NSFW when pose guide is attached", () => {
    const posePositive =
      "Image 3 is a flat SCHEMATIC pose guide on white — bright magenta/cyan filled capsules. " +
      "Match Image 3 pose only. a blonde woman on a balcony with wine";
    const result = applyQueuePromptSteering({
      positive: posePositive,
      negative: "blurry",
      model: "qwen-rapid-aio-edit-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    // User short negative + moiré + compact pose leak (not the full multi-KB pack).
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /moire|moiré/i);
    assert.match(result.negative ?? "", /neon capsule|pose guide leak|stick figure/i);
    // Neon magenta/cyan cue language is rewritten to gray-outline (Image 3 stays).
    assert.match(result.positive ?? "", /gray OUTLINE pose guide on white/i);
    assert.equal(/bright magenta\/cyan/i.test(result.positive ?? ""), false);
    assert.match(result.positive ?? "", /never paint Image 3|finished photograph only/i);
    // Full pose-guide negative dump must not blow past CFG-1 (spot-check a long unique term).
    assert.equal(/thigh-high boots when barefoot/i.test(result.negative ?? ""), false);
  });

  it("appends adult prop pack on Rapid AIO for intimate Day stills", () => {
    const result = applyQueuePromptSteering({
      positive:
        "MOOD: intimate solo sex/self-touch still\nPOSE FIRST: mandatory body pose and sex/action from the beat only: solo masturbation on the bed edge\nSOLO ACT: mid-self-touch",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /rumpled sheets in the foreground|bare bed surface|fingers on vulva|mid-self-touch|nothing held/i);
    assert.match(result.negative ?? "", /open book|lined pages|day planner|book between knees|beige lingerie|flesh-colored underwear|bra only|panties only|topless with panties|tan bikini|beach sand|middle finger|fingers pointing up|raised gesture|vibrator|egg vibrator|sex toy|rock on gesture|hands on bra cups|hands covering breasts|four hands|claw hands|hands framing crotch|hands on inner thighs/i);
  });

  it('keeps Suggestive Rapid packs clothed and bans mid-sex', () => {
    const result = applyQueuePromptSteering({
      positive: "MOOD: suggestive heat — clothed flirt\nPOSE FIRST: leaning in a doorway in lingerie",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /clothed suggestive heat|bottoms on|asymmetric charged pose|looking back|hip cocked/i);
    assert.doesNotMatch(result.positive ?? "", /mid-self-touch with fingers on vulva|exactly TWO adults mid-sex|clothes are now gone/i);
    assert.match(result.negative ?? "", /bottomless|doggy style|partner behind|mid-sex|muscular man|stiff standing fashion plate|square-on catalog|bikini|beach sand/i);
  });

  it('Suggestive + Image 3 pose guide does not inject nude pose-leak', () => {
    const result = applyQueuePromptSteering({
      positive:
        "MOOD: suggestive heat — clothed flirt\nCLOTHING LOCK CRITICAL: wear the EXACT Image 2 garment\nImage 3 is a flat gray OUTLINE pose guide on white\nbeat: twisting to zip a dress in a mirror — looking over a shoulder\ncamera: charged medium — match Image 3 (dance with both arms raised and one knee lifted, zip-twist look-back)",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /finished photograph only|clothed suggestive heat/i);
    assert.doesNotMatch(result.positive ?? "", /clothes are now gone|bare vulva|mid-self-touch with fingers on vulva|mid-dance both arms raised/i);
    assert.match(result.negative ?? "", /bikini|swimsuit|beach sand/i);
  });

  it('keeps Vacation Rapid packs clothed solo and bans partner doggy', () => {
    const result = applyQueuePromptSteering({
      positive: "MOOD: vacation travel day — hotel balcony\nPOSE FIRST: leaning on a balcony railing",
      negative: "blurry",
      model: "qwen-rapid-aio-edit",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /vacation travel still|one woman alone|clothes or swimsuit stay on|same face and hair as Image 1|relaxing or reclining/i);
    assert.doesNotMatch(result.positive ?? "", /upright travel pose|mid-self-touch with fingers on vulva|exactly TWO adults mid-sex|\bdoggy\b/i);
    assert.match(result.negative ?? "", /doggy style|man behind her|muscular man|mid-sex|hands and knees|stiff standing fashion plate|arms at sides standing still/i);
  });

  it('applies Vacation clothed-heat packs on Edit-2511 Lightning (not Rapid-only)', () => {
    const result = applyQueuePromptSteering({
      positive:
        "MOOD: vacation travel day — pool\nPOSE FIRST: MID-STRIDE collecting shells\nImage 3 is a neon magenta/cyan pose guide on white",
      negative: "blurry",
      model: "qwen-image-edit-2511-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /vacation travel still|clothes or swimsuit stay on|one woman alone/i);
    assert.match(result.positive ?? "", /full body walking mid-step|one foot clearly ahead/i);
    assert.match(result.positive ?? "", /finished photograph only|natural photograph|continuous arms|gray OUTLINE pose guide on white/i);
    assert.match(result.negative ?? "", /stiff standing fashion plate|white void background|doggy style|floating limb|magenta|neon capsule|purple/i);
  });

  it('applies Suggestive clothed-heat packs on Edit-2511 Lightning', () => {
    const result = applyQueuePromptSteering({
      positive: "MOOD: suggestive heat — clothed flirt\nPOSE FIRST: leaning in a doorway in lingerie",
      negative: "blurry",
      model: "qwen-image-edit-2511-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /clothed suggestive heat|bottoms on/i);
    assert.match(result.negative ?? "", /bikini|white void background|doggy style/i);
  });

  it('leaves plain Lightning T2I prompts without Vacation packs', () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.doesNotMatch(result.positive ?? "", /vacation travel still|clothed suggestive heat/i);
    assert.doesNotMatch(result.negative ?? "", /stiff standing fashion plate|white void background/i);
  });

  it("uses duo adult prop pack on Rapid AIO instead of solo self-touch", () => {
    const result = applyQueuePromptSteering({
      positive:
        "MOOD: raunchy duo sexual comedy\nPARTNERS: Exactly TWO adults\nHEADCOUNT LOCK: exactly TWO adults total\nDUO VISIBLE: partner head and torso share",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /exactly TWO adults mid-sex|partner head and torso/i);
    assert.doesNotMatch(result.positive ?? "", /mid-self-touch with fingers on vulva/i);
    assert.match(result.negative ?? "", /solo Cast nude portrait|partner cropped out|self-touch when duo/i);
  });

  it("allows a held dildo on Rapid AIO when the beat names one", () => {
    const result = applyQueuePromptSteering({
      positive:
        "MOOD: raunchy solo\nPOSE FIRST: alone on her back riding a thick silicone dildo\nSOLO ACT: wild dildo masturbation",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "day",
    });
    assert.match(result.positive ?? "", /vaginal opening|tip of the penis|penis-shaped/i);
    assert.match(result.negative ?? "", /dildo upright against belly|tip pointing at chest|male partner|man in frame|penis attached to man/i);
  });

  it("applies a short photo pack on Lightning CFG-1 without long realism suffixes", () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /a cyclist on a mountain trail/);
    assert.match(result.positive ?? "", /natural photograph|realistic skin texture/i);
    assert.equal(/anatomically|cinematic depth of field/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /illustration|drawing|painterly/i);
  });

  it("skips the Lightning photo pack when realism mode is off", () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal(result.positive, "a cyclist on a mountain trail");
    assert.equal(result.negative, "blurry");
  });

  it("applies short temporal/limb cues for WAN Lightning CFG-1", () => {
    const result = applyQueuePromptSteering({
      positive: "a fox runs through snow",
      negative: "blurry",
      model: "wan-video-lightning-4",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /temporal continuity|stable identity/i);
    assert.equal(/photorealistic|anatomically correct hands/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /flicker|extra limbs|floating props/i);
    assert.ok((result.negative ?? "").length < 220);
  });

  it("drops long auto-negatives for WAN Lightning and keeps the short pack", () => {
    const longNegative = "a".repeat(200);
    const result = applyQueuePromptSteering({
      positive: "scene",
      negative: longNegative,
      model: "wan-video-lightning-4",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal((result.negative ?? "").includes(longNegative), false);
    assert.match(result.negative ?? "", /flicker|extra limbs/i);
  });

  it("applies short temporal/limb cues for WAN Rapid AIO CFG-1", () => {
    const result = applyQueuePromptSteering({
      positive: "a fox runs through snow",
      negative: "blurry",
      model: "wan-video-rapid-aio",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /temporal continuity|stable identity/i);
    assert.equal(/photorealistic|anatomically correct hands/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /flicker|extra limbs/i);
  });

  it("applies klein base photo steering with plastic-skin negatives at queue time", () => {
    const result = applyQueuePromptSteering({
      positive: "Women lounge by a resort pool in pink light.",
      model: "flux-2-klein-9b",
      realismMode: "hyper-realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /unretouched RAW photograph|DSLR capture/i);
    assert.match(result.positive ?? "", /srx_detail/i);
    assert.match(result.negative ?? "", /plastic skin|blob clouds|repeating foam/i);
  });

  it("prioritizes anatomy/hand cues for Klein Distilled before realism budget", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman standing in sunlight.",
      model: "flux-2-klein-9b-distilled",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /no extra legs, arms or hands/i);
    assert.match(result.positive ?? "", /no less than two legs, arms, and hands per person/i);
    assert.match(result.positive ?? "", /five separate fingers/i);
    // Anatomy cue should appear before optional realism padding.
    const anatomyAt = (result.positive ?? "").search(/no extra legs, arms or hands/i);
    const realismAt = (result.positive ?? "").search(/photorealistic|natural lighting/i);
    assert.ok(anatomyAt >= 0);
    if (realismAt >= 0) {
      assert.ok(anatomyAt < realismAt);
    }
  });

  it("prioritizes anatomy/hand cues for UltraReal before realism budget", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman in a leather dress stands on a city sidewalk.",
      model: "flux-ultrareal-v4",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /five distinct fingers/i);
    assert.match(result.positive ?? "", /visible knuckles|clear wrists and elbows/i);
    assert.match(result.positive ?? "", /d1g1cam/i);
  });

  it("applies CFG-1 photo + anatomy steering for Boogu Image Turbo", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman on wet rocks by the ocean",
      negative: "blurry",
      model: "boogu-image-turbo",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /natural photograph|realistic skin texture/i);
    assert.match(result.positive ?? "", /single subject|five distinct fingers/i);
    assert.equal(/photorealistic, cinematic depth of field/i.test(result.positive ?? ""), false);
    assert.equal(result.negative, undefined);
  });

  it("drops long auto-negatives for Boogu Image Turbo", async () => {
    const { prepareQueuePrompts } = await import("./queue-prompt-prep");
    const longNegative = "a".repeat(200);
    const result = await prepareQueuePrompts({
      model: "boogu-image-turbo",
      positive: "portrait on a beach",
      explicitNegative: longNegative,
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal(result.negative, undefined);
  });

  it("drops negatives for Boogu Edit Turbo", async () => {
    const { prepareQueuePrompts } = await import("./queue-prompt-prep");
    const result = await prepareQueuePrompts({
      model: "boogu-image-edit-turbo",
      positive: "warm sunset tones",
      explicitNegative: "blurry, bad anatomy",
      realismMode: "realistic",
      anatomyMode: "standard",
      tool: "refine",
      turboEditStrength: "gentle",
    });
    assert.equal(result.negative, undefined);
    assert.equal(/natural photograph/i.test(result.positive ?? ""), false);
    assert.match(result.positive ?? "", /Do not restyle Image 1/i);
    assert.match(result.positive ?? "", /warm sunset tones/);
  });

  it("skips T2I anatomy/photo steering on Klein Distilled refine", () => {
    const result = applyQueuePromptSteering({
      positive: "warmer golden-hour light",
      model: "flux-2-klein-9b-distilled",
      tool: "refine",
      realismMode: "realistic",
      anatomyMode: "strict",
      turboEditStrength: "gentle",
    });
    assert.equal(/no extra legs, arms or hands/i.test(result.positive ?? ""), false);
    assert.equal(/photorealistic|natural lighting/i.test(result.positive ?? ""), false);
    assert.match(result.positive ?? "", /Do not restyle Image 1/i);
    assert.match(result.positive ?? "", /warmer golden-hour light/);
  });

  it("skips T2I photo steering on Z-Image Turbo refine", () => {
    const result = applyQueuePromptSteering({
      positive: "warmer golden-hour light",
      model: "z-image-turbo",
      tool: "refine",
      realismMode: "realistic",
      anatomyMode: "standard",
      turboEditStrength: "balanced",
    });
    assert.equal(/natural photograph/i.test(result.positive ?? ""), false);
    assert.match(result.positive ?? "", /Edit Image 1 via img2img/i);
    assert.match(result.positive ?? "", /warmer golden-hour light/);
  });

  it("wraps classic img2img refine with strength chips", () => {
    const result = applyQueuePromptSteering({
      positive: "warmer golden-hour light",
      model: "qwen-image-2512",
      tool: "refine",
      realismMode: "off",
      anatomyMode: "off",
      turboEditStrength: "gentle",
    });
    assert.match(result.positive ?? "", /Light img2img on Image 1/i);
    assert.match(result.positive ?? "", /warmer golden-hour light/);
  });
});
