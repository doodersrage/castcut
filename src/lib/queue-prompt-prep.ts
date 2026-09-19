'use client';

import { modelUsesNegativePrompt } from './prompt-pair';
import type { ComfyImageModel } from './comfy-models/client';
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  type AnatomyGuardMode,
} from './anatomy-guard';
import { loadAnatomyGuardMode } from './anatomy-guard-settings';
import {
  applyRenderRealismForModel,
  applyRenderRealismToNegative,
  applyRenderRealismToPositive,
  type RenderRealismMode,
} from './render-realism';
import { loadRenderRealismMode } from './render-realism-settings';
import {
  ensurePoseGuideStyleLock,
  mergePoseGuideNegatives,
  promptHasPoseGuideCue,
  rewritePoseGuideCueForRapidAio,
  usesOutlineGrayPoseGuide,
} from './pose-guide-prompt';
import { appendCleanSkinPositive, mergeCleanSkinNegatives } from './clean-skin';
import { inferAthleticSport, type AthleticSport } from './athletic-sport-profiles';
import { resolveQueueNegativePromptRaw } from './queue-negative';
import { isQwenLightningModel, isWanLightningModel } from './model-sampling-patch';
import { isQwenRapidAioModel, isWanRapidAioModel } from './model-denoise-defaults';
import {
  applyTurboEditStrengthToPrompt,
  normalizeTurboEditStrength,
  skipsCfg1T2iSteeringForTurboEdit,
  usesTurboEditStrengthUi,
  type TurboEditStrength,
} from './turbo-edit-strength';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import {
  isKleinBaseModel,
  isKleinDistilledModel,
  isLightningModelId,
} from './model-sampler-defaults';
import { isBooguTurboModel } from './model-denoise-defaults';
import { ensureUltraRealAmplifierTriggerInPrompt } from './ultrareal-amplifier-lora';
import { ensureKleinRealisticDetailTriggerInPrompt } from './klein-realistic-detail-lora';
import { expandWildcardText } from './wildcard-expand';
import {
  loadCustomWildcardLists,
  loadWildcardExpansionEnabled,
  loadWildcardSeed,
} from './wildcard-settings';
import { buildClothingNegativePack } from './clothing-quality';
import { appendEmbeddingTokens, modelSupportsTextualInversion } from './textual-inversion';

/** Distilled Lightning (CFG 1) softens with long auto-negatives — keep only short explicit ones. */
const LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS = 160;

/**
 * Cap combined realism + anatomy growth so scene-specific positive text stays dominant.
 * Negatives are budgeted separately and can stay longer.
 */
const MAX_QUEUE_POSITIVE_SUFFIX_CHARS = 200;
const KLEIN_BASE_QUEUE_POSITIVE_SUFFIX_CHARS = 580;
const KLEIN_DISTILLED_QUEUE_POSITIVE_SUFFIX_CHARS = 180;
const ULTRAREAL_QUEUE_POSITIVE_SUFFIX_CHARS = 420;

function maxQueuePositiveSuffixChars(model: ComfyImageModel | string): number {
  if (isKleinBaseModel(model)) {
    return KLEIN_BASE_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  if (isKleinDistilledModel(model)) {
    return KLEIN_DISTILLED_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  if (isFluxFineTuneCheckpointModel(model)) {
    return ULTRAREAL_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  return MAX_QUEUE_POSITIVE_SUFFIX_CHARS;
}

/** Short CFG-1-friendly anti-moiré terms for Phr00t Rapid AIO. */
const RAPID_AIO_MOIRE_NEGATIVE =
  'moire, moiré, halftone, screen door, mesh pattern, wavy interference, grid artifacts, banding, crosshatch';

const RAPID_AIO_MOIRE_POSITIVE =
  'clean continuous tones, smooth natural skin texture, even gradients';

/**
 * Compact Image 3 anti-leak pack for Rapid AIO (CFG-1).
 * Full POSE_GUIDE_NEGATIVE_EXTRA is far over the Lightning length gate and gets dropped —
 * these high-signal terms still block magenta/cyan schematic bleed while keeping pose usable.
 */
export const RAPID_AIO_POSE_LEAK_NEGATIVE =
  'neon capsule, magenta stick figure, cyan pose outline, stick figure overlay, pose diagram, openpose lines, controlnet overlay, pose guide leak, Image 3 drawn into scene, translucent ghost person, flat filled figure, black morphsuit, black bodysuit, latex void suit, spandex partner, zentai, black catsuit, full body black suit, face and hands only suit, black rubber partner, black blob between bodies, open book, open notebook, lined pages, diary, journal on bed, planner, day planner, schedule grid, clipboard, notepad, hardcover, paperback, book between knees, reading in bed, pen on bed, hands on book, tablet, spreadsheet, sketchbook, diagram pad, reading prop, fused bodies, flesh blob, merged torso, extra hands, four hands, three hands, duplicate hands, ghost hand, floating hand, third arm, fourth arm, arms from behind back, disembodied hands, hands emerging from torso, six fingers, seven fingers, extra fingers, malformed fingers, claw hands, splayed fingers on thighs, hands framing crotch, hands on inner thighs posing, heart hands, V fingers toward crotch, resting hands on thighs, softcore thigh frame, rock on gesture, devil horns hand, peace sign hands, jazz hands, raised gesture hands, hands on bra cups, grabbing bra, hands covering breasts posing, hands on chest covering, modest covering pose, softcore breast cover, lingerie when nude, beige panties when nude, beige bra when nude, nude lingerie set, nude-tone bra, tan bikini top when nude, matching bra and panties softcore, hands covering crotch posing, hands flat on windowsill posing, duplicate genitals, futa, hermaphrodite, penis on woman, phallus, fleshy crotch protrusion, cowboy hat, missing partner head, solo portrait when duo posed, oily plastic skin, wet plastic shine, floating smoke, floating steam, vapor wisp, cyan chest glow, magenta rim light, neon gel lighting, holding vibrator as crotch cover, egg vibrator prop, wooden bar between thighs, softcore toy prop';

/** Anti-diagram / anti-morphsuit only — safe for Suggestive / Vacation clothed pose unlock. */
export const RAPID_AIO_POSE_LEAK_POSITIVE_BASE =
  'finished photograph only — do not paint Image 3 outlines, stick figures, neon overlays, cyan/magenta lights, or black morphsuits into the scene';

/** Adult nude/duo pose unlock — never append on Suggestive / Vacation (fights CLOTHING LOCK). */
export const RAPID_AIO_POSE_LEAK_POSITIVE = `${RAPID_AIO_POSE_LEAK_POSITIVE_BASE}; duo partners are fully bare-skinned humans both fully visible mid-contact; solo adult: rumpled indoor sheets and lamp light in the foreground, no beach sand or ocean, no ocean through window, clothes are now gone — bare breasts with nipples visible and bare vulva, zero fabric on the body, body pose matches the beat and Image 3 exactly, exactly two hands mid-self-touch as the beat says (fingers on vulva or a penis-shaped silicone dildo with the tip of the penis pushed deep into her vaginal opening), each on a continuous forearm from her own shoulder, one woman alone never invent a man, eyes half-lidded looking down not at the lens, five natural fingers each, natural matte pores, warm lamp light, bare sheets only`;

export const RAPID_AIO_ADULT_PROP_POSITIVE =
  'rumpled indoor sheets in the foreground, bare bed surface, lamp and closed blinds only, opaque walls, no beach sand or ocean, no glass balcony door, no ocean through window, no coastal vista, body pose matches the beat, exactly two hands mid-self-touch with fingers on vulva as written, each on a continuous forearm from her shoulder, bare breasts uncovered with nipples visible, clothes are now gone, bare vulva, zero fabric on the body, matte skin';

/** Duo adult Rapid pack — never inject solo self-touch (that collapses partner scenes). */
export const RAPID_AIO_ADULT_DUO_PROP_POSITIVE =
  'rumpled indoor sheets in the foreground, bare bed surface, lamp and closed blinds only, opaque walls, no beach sand or ocean, no glass balcony door, no ocean through window, no coastal vista, exactly TWO adults mid-sex both fully visible, partner head and torso in frame with Cast, four hands on bodies, bare skin and sheets only, clothes are now gone, matte skin — never a solo Cast nude portrait with empty sheets beside her';

export const RAPID_AIO_ADULT_DUO_PROP_NEGATIVE =
  'solo Cast nude portrait, one woman alone, solo nude pin-up, empty sheets beside her, partner cropped out, missing partner, Cast alone on bed, leg against wall solo posing, softcore solo nude, self-touch when duo, masturbation when duo, fingering herself when duo, second person missing, only one head in frame, peace sign hands, V sign fingers, cowgirl when doggy, kneeling softcore facing camera when doggy, glass balcony door, ocean balcony, sliding glass ocean view';

export const RAPID_AIO_SUGGESTIVE_PROP_POSITIVE =
  'clothed suggestive heat only, lingerie or dress with bottoms on, charged pose matching the beat (dancing with both arms raised and one knee lifted mid-kick, zip-twist look-back, leaning, seated, stretching, reclining — never a stiff square-on standing catalog pose with arms at sides), one woman alone, continuous arms and legs attached to her torso, soft lamp light, rumpled sheets as backdrop only';

export const RAPID_AIO_SUGGESTIVE_PROP_NEGATIVE =
  'nude, fully nude, bottomless, pants pulled down, panties off, bare vulva, genitals, scrotum, penis, mid-sex, mid-thrust, doggy style, doggystyle, all fours, hands and knees, rear-entry, missionary, cowgirl, oral sex, partner behind, man behind her, muscular man, male partner, boyfriend, second adult, second person, all fours sex, sex from behind, bare buttocks sex pose, hands on her hips from behind, looking back over shoulder sex pose, stiff standing fashion plate, square-on catalog pose, arms at sides standing still, polite standing portrait, bland standing model, bikini, swimsuit, swimwear, string bikini, tan bikini, beige bikini, beach sand, ocean shoreline, tropical beach, wet sand, pier softcore, white void background, blank white backdrop, seamless white studio, pure white studio background, ecommerce cutout, product photo void, cutout plate on white, floating limb, floating arm, floating leg, disembodied arm, disembodied hand, ghost limb, detached limb, extra arm, third arm, extra limbs';

/** Vacation / travel Day — keep clothed solo; fight leftover NSFW Edit doggy priors AND standing try-on freeze. */
export const RAPID_AIO_VACATION_PROP_POSITIVE =
  'vacation travel still, clothes or swimsuit stay on, one woman alone, same face and hair as Image 1, beat stance (relaxing or reclining lying down on a towel or lounge with hips down, seated with knees bent, mid-stride walking with one foot ahead, dancing with both arms raised and one knee lifted, reaching with an arm high, perched, leaning — never a square-on standing catalog pose with arms at sides, never rear-presenting), continuous arms and legs attached to her torso, full SETTING venue with depth behind her never blank white or missing background, resort hotel pool market balcony beach energy';

export const RAPID_AIO_VACATION_PROP_NEGATIVE =
  'nude sex, fully nude, mid-sex, mid-thrust, doggy style, doggystyle, all fours, hands and knees, rear-entry, missionary, cowgirl, oral sex, partner behind, man behind her, muscular man, male partner, boyfriend, second adult, second person, sex from behind, hands on her hips from behind, genitals, scrotum, penis, looking back over shoulder sex pose, kneeling on bed presenting, stiff standing fashion plate, square-on catalog pose, arms at sides standing still, planted fashion stand, upright travel pose freeze, polite standing portrait, bland standing model, office desk, grocery, bookstore, cubicle, white void background, blank white backdrop, seamless white studio, pure white studio background, mid-gray void, blue-gray studio plate, ecommerce cutout, product photo void, cutout plate on white, floating limb, floating arm, floating leg, disembodied arm, disembodied hand, ghost limb, detached limb, extra arm, third arm, extra limbs';

/** Compact anti-float pack when Image 3 is attached on Lightning clothed-heat Day. */
export const CLOTHED_HEAT_POSE_LIMB_NEGATIVE =
  'floating limb, floating arm, floating leg, disembodied arm, disembodied hand, ghost limb, detached limb, extra arm, third arm, extra limbs, pose guide limb leak';

export const CLOTHED_HEAT_POSE_LIMB_POSITIVE =
  'two continuous arms and two continuous legs attached to her torso, natural limb count, no floating body parts';
/** When the beat names a dildo / vibrator — allow the held toy in positives. */
export const RAPID_AIO_ADULT_TOY_PROP_POSITIVE =
  'rumpled indoor sheets in the foreground, bare bed surface, lamp and closed blinds only, opaque walls, no beach sand or ocean, no glass balcony door, no ocean through window, no coastal vista, body pose matches the beat, one woman alone, realistic penis-shaped silicone dildo with the tip of the penis pushed deep into her vaginal opening, shaft entering her vagina, tip buried inside, both hands on the base thrusting deeper, each hand on a continuous forearm from her shoulder, bare breasts uncovered with nipples visible, clothes are now gone, bare vulva, zero fabric on the body, matte skin';

export const RAPID_AIO_ADULT_PROP_NEGATIVE =
  'open book, open notebook, lined pages, diary, journal, planner, day planner, schedule, clipboard, notepad, hardcover, paperback, book between knees, reading in bed, pen on sheets, tablet, spreadsheet, magazine, menu, reading prop, beach sand, wet sand, ocean shoreline, night beach, seaside softcore, pier softcore, city lights on horizon beach, outdoor sand pin-up, ocean through window, sea view through glass, coastal vista, water outside window, open window ocean, harbor through window, daylight ocean vista, glass balcony door, sliding glass door, balcony railing ocean, ocean balcony, beige lingerie, flesh-colored underwear, skin-toned clothing, nude-tone bra, nude-tone panties, beige bra, beige panties, tan bikini, tan string bikini, beige bikini, bikini top only, bikini bottom only, bra only, panties only, thong only, straps across chest, string between cheeks, topless with panties, bottomless with bra, half dressed softcore, one garment left on, translucent fabric, sheer lingerie, matching bra and panties softcore, underwear when bare skin intended, bra, panties, hands on bra cups, hands covering breasts, hands on chest covering, four hands, three hands, duplicate hands, third arm, fourth arm, arms from behind back, disembodied hands, hands emerging from torso, modest covering pose, softcore breast cover, middle finger, flip off, raised middle finger, fingers pointing up, index finger pointing up, pointing at camera, hands raised to shoulders, hands above waist, hands at head height, arms raised, rock on gesture, devil horns hand, peace sign hands, V sign fingers, jazz hands, raised gesture hands, claw hands, splayed fingers on thighs, hands framing crotch, hands on inner thighs posing, heart hands, V fingers toward crotch, resting hands on thighs, softcore thigh frame, camera stare softcore pin-up, kneeling upright facing camera softcore, oily plastic skin, wet plastic shine, vibrator, egg vibrator, wand vibrator, dildo, sex toy, wooden bar between thighs, colorful toy between thighs, object held at crotch';

/** Toy-beat negatives — keep softcore toy covers banned, but allow a real held dildo. */
export const RAPID_AIO_ADULT_TOY_PROP_NEGATIVE =
  'open book, open notebook, lined pages, diary, journal, planner, day planner, schedule, clipboard, notepad, hardcover, paperback, book between knees, reading in bed, pen on sheets, tablet, spreadsheet, magazine, menu, reading prop, beach sand, wet sand, ocean shoreline, night beach, seaside softcore, pier softcore, city lights on horizon beach, outdoor sand pin-up, ocean through window, sea view through glass, coastal vista, water outside window, open window ocean, harbor through window, daylight ocean vista, glass balcony door, sliding glass door, balcony railing ocean, ocean balcony, beige lingerie, flesh-colored underwear, skin-toned clothing, nude-tone bra, nude-tone panties, beige bra, beige panties, tan bikini, tan string bikini, beige bikini, bikini top only, bikini bottom only, bra only, panties only, thong only, straps across chest, string between cheeks, topless with panties, bottomless with bra, half dressed softcore, one garment left on, translucent fabric, sheer lingerie, matching bra and panties softcore, underwear when bare skin intended, bra, panties, hands on bra cups, hands covering breasts, hands on chest covering, four hands, three hands, duplicate hands, third arm, fourth arm, arms from behind back, disembodied hands, hands emerging from torso, modest covering pose, softcore breast cover, middle finger, flip off, raised middle finger, fingers pointing up, index finger pointing up, pointing at camera, hands raised to shoulders, hands above waist, hands at head height, arms raised, rock on gesture, devil horns hand, peace sign hands, V sign fingers, jazz hands, raised gesture hands, claw hands, splayed fingers on thighs, hands framing crotch, hands on inner thighs posing, heart hands, V fingers toward crotch, resting hands on thighs, softcore thigh frame, camera stare softcore pin-up, kneeling upright facing camera softcore, oily plastic skin, wet plastic shine, holding vibrator as crotch cover, egg vibrator prop, wooden bar between thighs, softcore toy prop, dildo held outside body, dildo only against thighs, dildo upright against belly, dildo tip pointing at chest, dildo pressed to pubic mound, no penetration, toy outside vaginal opening, second person, male partner, boyfriend, man in frame, duo when solo, penis attached to man, futa, hermaphrodite, penis growing from crotch';

/** Beat-conditional adult pose Rapid packs — fight softcore kneel / cowgirl / wall→bed drift. */
export const RAPID_AIO_ADULT_ALL_FOURS_POSITIVE =
  'all fours hips high weight on knees and hands looking back over shoulder never kneeling upright facing the lens';
export const RAPID_AIO_ADULT_ALL_FOURS_NEGATIVE =
  'kneeling upright facing camera, front softcore kneel, peace sign hands, V sign fingers, cowgirl astride facing camera';
export const RAPID_AIO_ADULT_DOGGY_POSITIVE =
  'doggy rear-entry Cast bent or on all fours partner behind mid-thrust both adults mid-sex';
export const RAPID_AIO_ADULT_DOGGY_NEGATIVE =
  'cowgirl astride facing camera, peace-sign softcore kneel, both staring at camera posing, kneeling upright facing lens';
export const RAPID_AIO_ADULT_WALL_POSITIVE =
  'standing wall press both adults standing upright Cast back flat against solid bedroom wall feet on floor partner behind mid-sex never on the bed';
export const RAPID_AIO_ADULT_WALL_NEGATIVE =
  'cowgirl on the bed, kneeling softcore pin-up facing the lens, seated astride facing camera, front kneel on mattress, glass balcony door ocean';
/** Short CFG-1-friendly temporal / anatomy cues for WAN Lightning 4-step. */
export const WAN_LIGHTNING_ARTIFACT_NEGATIVE =
  'flicker, morphing, identity drift, abrupt cuts, extra limbs, warped hands, duplicate subjects, floating props';

export const WAN_LIGHTNING_ARTIFACT_POSITIVE =
  'stable identity, consistent limb count, coherent hands, temporal continuity';

/**
 * Short CFG-1 photo cues for Qwen Image Lightning — long realism suffixes soften
 * distilled stacks, but a compact photograph / anti-illustration pack helps
 * pull 8-step Max away from a drawn look.
 */
export const QWEN_LIGHTNING_PHOTO_POSITIVE =
  'natural photograph, realistic skin texture, soft natural light, lifelike materials';

export const QWEN_LIGHTNING_PHOTO_NEGATIVE =
  'illustration, drawing, cartoon, anime, painting, CGI, plastic skin, airbrushed, painterly, tattoo, tattoos, tattoo sleeve, inked skin';

/** CFG-1 T2I (Boogu/Z-Image Turbo, Schnell): short anatomy + anti-halo cues — not long auto-neg lists. */
export const CFG1_T2I_ANATOMY_POSITIVE =
  'single subject, natural limb count, five distinct fingers, coherent hands and wrists';

export const CFG1_T2I_ARTIFACT_NEGATIVE =
  'extra limbs, duplicate hands, fused fingers, bad anatomy, oversaturated, oversharpened halos, plastic skin, moire, grid artifacts';

export const QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE =
  'natural photograph, lifelike skin pores, camera realism, soft natural light';

function appendUniqueCsv(base: string | undefined, extra: string): string {
  const existing = base?.trim() ?? '';
  if (!existing) {
    return extra;
  }
  const lower = existing.toLowerCase();
  const missing = extra
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !lower.includes(part.toLowerCase()));
  if (missing.length === 0) {
    return existing;
  }
  return `${existing}, ${missing.join(', ')}`;
}

function dayPromptHasSuggestiveHeat(positive: string): boolean {
  return /\bMOOD:\s*suggestive\b/i.test(positive);
}

function dayPromptHasVacationHeat(positive: string): boolean {
  return /\bMOOD:\s*vacation\b/i.test(positive);
}

/**
 * Suggestive / Vacation CFG-1 packs — shared by Rapid AIO and Qwen Lightning Edit.
 * Lightning used to skip these (early photo-pack return), so Vacation pose/outfit/white-void
 * locks were Rapid-only and Edit-2511 Lightning felt inconsistent after switching back.
 */
function applyDayClothedHeatSteering(input: {
  positive: string;
  negative?: string;
  steeredPositive: string;
}): { positive: string; negative?: string; applied: boolean } {
  const suggestiveHeat = dayPromptHasSuggestiveHeat(input.steeredPositive);
  const vacationHeat = dayPromptHasVacationHeat(input.steeredPositive);
  if (!suggestiveHeat && !vacationHeat) {
    return { positive: input.positive, negative: input.negative, applied: false };
  }

  let positive = input.positive;
  let negative = input.negative;
  if (suggestiveHeat) {
    positive = appendUniqueCsv(positive, RAPID_AIO_SUGGESTIVE_PROP_POSITIVE);
    negative = appendUniqueCsv(negative, RAPID_AIO_SUGGESTIVE_PROP_NEGATIVE);
    // Only when the beat names DANCING — camera templates mention "dance" as an example.
    if (
      /\bDANCING\b/.test(input.steeredPositive) ||
      /\bbeat:\s*[^\n]*\bdanc(?:e|es|ing)\b/i.test(input.steeredPositive)
    ) {
      positive = appendUniqueCsv(
        positive,
        'mid-dance both arms raised overhead one knee lifted mid-kick hips swaying never arms at sides standing catalog pose'
      );
    }
  } else {
    positive = appendUniqueCsv(positive, RAPID_AIO_VACATION_PROP_POSITIVE);
    negative = appendUniqueCsv(negative, RAPID_AIO_VACATION_PROP_NEGATIVE);
    if (/\bDANCING\b/i.test(input.steeredPositive)) {
      positive = appendUniqueCsv(
        positive,
        'mid-dance both arms raised overhead one knee lifted mid-kick hips swaying never arms at sides standing catalog pose'
      );
    } else if (/\bMID-STRIDE\b/i.test(input.steeredPositive)) {
      positive = appendUniqueCsv(
        positive,
        'full body walking mid-step one foot clearly ahead opposite arm swing both feet visible never mid-thigh catalog portrait arms at sides staring at lens'
      );
    } else if (/\bWAVING\b/i.test(input.steeredPositive)) {
      positive = appendUniqueCsv(
        positive,
        'waving one arm raised high overhead weight shifted one foot stepped never arms at sides standing catalog pose'
      );
    } else if (/\b(RELAXING|RECLINING)\b/i.test(input.steeredPositive)) {
      positive = appendUniqueCsv(
        positive,
        'lying down on lounge or towel hips and back on the surface knees drawn up never standing beside it'
      );
    } else if (/\b(SEATED|PERCHED)\b/i.test(input.steeredPositive)) {
      positive = appendUniqueCsv(
        positive,
        'seated hips on seat knees bent never standing with arms at sides'
      );
    }
  }
  return { positive, negative, applied: true };
}

function isCfg1DistilledStillImageModel(model: ComfyImageModel | string): boolean {
  return isLightningModelId(model) && !isQwenLightningModel(model) && !isWanLightningModel(model);
}

function steeringForCfg1DistilledStillImage(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode: RenderRealismMode;
  anatomyMode: AnatomyGuardMode;
  tool?: string;
  turboEditStrength?: TurboEditStrength;
}): { positive: string; negative?: string } {
  const explicit = input.negative?.trim();
  const shortExplicit =
    explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
  if (skipsCfg1T2iSteeringForTurboEdit(String(input.model), input.tool)) {
    const positive = applyTurboEditStrengthToPrompt(
      input.positive,
      String(input.model),
      input.turboEditStrength
    );
    if (isBooguTurboModel(input.model)) {
      return { positive, negative: undefined };
    }
    return {
      positive,
      negative: appendUniqueCsv(shortExplicit, CFG1_T2I_ARTIFACT_NEGATIVE),
    };
  }
  let positive = input.positive;
  if (input.realismMode === 'realistic' || input.realismMode === 'hyper-realistic') {
    positive = appendUniqueCsv(
      positive,
      input.realismMode === 'hyper-realistic'
        ? QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE
        : QWEN_LIGHTNING_PHOTO_POSITIVE
    );
  }
  if (
    input.anatomyMode !== 'off' &&
    /\b(?:person|people|woman|man|girl|boy|figure|model|portrait|hand|hands|finger|limb|subject)\b/i.test(
      positive
    )
  ) {
    positive = appendUniqueCsv(positive, CFG1_T2I_ANATOMY_POSITIVE);
  }
  // Official Boogu Turbo: ConditioningZeroOut / empty encode — never steer a negative.
  if (isBooguTurboModel(input.model)) {
    return { positive, negative: undefined };
  }
  return {
    positive,
    negative: appendUniqueCsv(shortExplicit, CFG1_T2I_ARTIFACT_NEGATIVE),
  };
}

export function applyQueuePromptSteering(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
  tool?: string;
  turboEditStrength?: TurboEditStrength;
}): { positive: string; negative?: string } {
  const realismMode = input.realismMode ?? loadRenderRealismMode();
  const anatomyMode = input.anatomyMode ?? loadAnatomyGuardMode();
  const turboEditStrength = normalizeTurboEditStrength(input.turboEditStrength);
  // Pose-guide Image 3: lock finished-scene realism and block stick-figure bleed.
  // Rapid AIO keeps Image 3 but rewrites neon magenta/cyan cue language to gray-outline.
  const poseGuideAttached = promptHasPoseGuideCue(input.positive);
  let steeredPositive = poseGuideAttached
    ? ensurePoseGuideStyleLock(input.positive, realismMode)
    : input.positive;
  if (poseGuideAttached && usesOutlineGrayPoseGuide(input.model)) {
    steeredPositive = rewritePoseGuideCueForRapidAio(steeredPositive, realismMode);
  }
  const steeredNegative = mergePoseGuideNegatives(input.negative, poseGuideAttached);
  const finish = (result: { positive: string; negative?: string }) => {
    // Boogu zeros the negative encode; WAN Lightning keeps a tiny artifact pack only.
    const skipNegativeSkin =
      isBooguTurboModel(input.model) ||
      isWanLightningModel(input.model) ||
      isWanRapidAioModel(input.model);
    const usesNegative = modelUsesNegativePrompt(input.model) && !skipNegativeSkin;
    // Prefer person / Play stills — don't decorate every landscape or animal clip.
    const shouldCleanSkin =
      poseGuideAttached ||
      input.tool === 'image-prompt' ||
      input.tool === 'fitting' ||
      input.tool === 'day' ||
      input.tool === 'roleplay' ||
      input.tool === 'moodboard' ||
      input.tool === 'compose' ||
      input.tool === 'refine' ||
      /\b(woman|man|girl|boy|person|portrait|character|cast|skin|edit image)\b/i.test(
        result.positive
      );
    const withSkin = {
      positive:
        shouldCleanSkin && !isWanLightningModel(input.model) && !isWanRapidAioModel(input.model)
          ? appendCleanSkinPositive(result.positive)
          : result.positive,
      negative: usesNegative
        ? shouldCleanSkin
          ? mergeCleanSkinNegatives(result.negative, result.positive)
          : result.negative
        : skipNegativeSkin
          ? result.negative
          : undefined,
    };
    if (!usesTurboEditStrengthUi(String(input.model), input.tool)) {
      return withSkin;
    }
    return {
      ...withSkin,
      positive: applyTurboEditStrengthToPrompt(
        withSkin.positive,
        String(input.model),
        turboEditStrength
      ),
    };
  };

  if (isQwenLightningModel(input.model)) {
    // CFG-1: skip long realism/anatomy suffixes — keep a short photo pack instead.
    // Gate on the *user* negative; pose-guide merge exceeds the length cap.
    // Vacation/Suggestive Day stills also need the clothed-heat packs (same as Rapid) —
    // Edit-2511 Lightning is pose-sticky and otherwise drifts to stand/white-void.
    const userExplicit = input.negative?.trim();
    const shortExplicit =
      userExplicit && userExplicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS
        ? userExplicit
        : undefined;
    const clothedHeat = applyDayClothedHeatSteering({
      positive: steeredPositive,
      negative: shortExplicit,
      steeredPositive,
    });
    let positive = clothedHeat.positive;
    let negative = clothedHeat.negative;
    if (poseGuideAttached && clothedHeat.applied) {
      positive = appendUniqueCsv(positive, RAPID_AIO_POSE_LEAK_POSITIVE_BASE);
      positive = appendUniqueCsv(positive, CLOTHED_HEAT_POSE_LIMB_POSITIVE);
      negative = appendUniqueCsv(negative, CLOTHED_HEAT_POSE_LIMB_NEGATIVE);
      // Full Rapid anti-leak — Lightning was only getting a short stick-figure line,
      // so magenta/purple Image 3 capsules painted into the finished still.
      negative = appendUniqueCsv(negative, RAPID_AIO_POSE_LEAK_NEGATIVE);
    }
    const poseLeakNeg = poseGuideAttached
      ? 'stick figure, wireframe, pose diagram, cyan pose outline, magenta pose outline, purple squiggle, neon capsule, pose guide leak, Image 3 drawn into scene'
      : 'stick figure, wireframe, pose diagram';
    if (realismMode === 'realistic' || realismMode === 'hyper-realistic') {
      return finish({
        positive: appendUniqueCsv(
          positive,
          realismMode === 'hyper-realistic'
            ? QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE
            : QWEN_LIGHTNING_PHOTO_POSITIVE
        ),
        negative: appendUniqueCsv(
          negative,
          appendUniqueCsv(QWEN_LIGHTNING_PHOTO_NEGATIVE, poseLeakNeg)
        ),
      });
    }
    return finish({
      positive,
      negative: poseGuideAttached ? appendUniqueCsv(negative, poseLeakNeg) : negative,
    });
  }

  // WAN Lightning / Rapid AIO are CFG-1 distilled — long video-motion + anatomy lists fight them.
  // Keep short temporal/limb cues instead of full still-image steering.
  if (isWanLightningModel(input.model) || isWanRapidAioModel(input.model)) {
    const explicit = steeredNegative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
    return finish({
      positive: appendUniqueCsv(steeredPositive, WAN_LIGHTNING_ARTIFACT_POSITIVE),
      negative: appendUniqueCsv(shortExplicit, WAN_LIGHTNING_ARTIFACT_NEGATIVE),
    });
  }

  // Rapid AIO is CFG-1 distilled (Lightning baked in) — skip long auto-negatives
  // and long realism/anatomy positives; keep short anti-moiré cues only.
  // Pose-guide merge is huge and would always fail the length gate — use the
  // user negative + a compact anti-leak pack so Image 3 still unlocks pose.
  if (isQwenRapidAioModel(input.model)) {
    const userExplicit = input.negative?.trim();
    const shortExplicit =
      userExplicit && userExplicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS
        ? userExplicit
        : undefined;
    let positive = appendUniqueCsv(steeredPositive, RAPID_AIO_MOIRE_POSITIVE);
    let negative = appendUniqueCsv(shortExplicit, RAPID_AIO_MOIRE_NEGATIVE);
    // Adult Day/Story: empty-bed positives + prop bans in negatives (saying "planner"
    // in the long positive tends to summon lined notebooks on CFG-1 stacks).
    const adultHeat =
      /\b(MOOD:\s*(?:intimate|raunchy)|POSE FIRST: mandatory body pose and sex|masturbat|self[- ]touch|mid-sex|PARTNERS:|SOLO ACT:|FULLY NUDE|fingering|oral sex|missionary|doggy)\b/i.test(
        steeredPositive
      );
    const clothedHeat = applyDayClothedHeatSteering({
      positive,
      negative,
      steeredPositive,
    });
    positive = clothedHeat.positive;
    negative = clothedHeat.negative;
    if (poseGuideAttached) {
      // Nude solo/duo pose-leak fights CLOTHING LOCK on Suggestive/Vacation — base only.
      positive = appendUniqueCsv(
        positive,
        clothedHeat.applied || !adultHeat
          ? RAPID_AIO_POSE_LEAK_POSITIVE_BASE
          : RAPID_AIO_POSE_LEAK_POSITIVE
      );
      negative = appendUniqueCsv(negative, RAPID_AIO_POSE_LEAK_NEGATIVE);
    }
    if (!clothedHeat.applied && adultHeat) {
      const duoBeat =
        /\b(MOOD:\s*(?:intimate|raunchy)\s+duo|PARTNERS:|HEADCOUNT LOCK:|exactly TWO adults|DUO VISIBLE)\b/i.test(
          steeredPositive
        );
      const soloToyBeat =
        !duoBeat &&
        /\b(dildo|vibrator|wand\s+vibrator|magic\s*wand|rabbit\s+vibe|sex\s*toy|toy\s+play)\b/i.test(
          steeredPositive
        );
      if (duoBeat) {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_DUO_PROP_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_DUO_PROP_NEGATIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_PROP_NEGATIVE);
      } else if (soloToyBeat) {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_TOY_PROP_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_TOY_PROP_NEGATIVE);
      } else {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_PROP_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_PROP_NEGATIVE);
      }
      if (
        /\bPOSE LOCK:\s*ALL FOURS\b/i.test(steeredPositive) ||
        /\ball\s+fours\b/i.test(steeredPositive)
      ) {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_ALL_FOURS_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_ALL_FOURS_NEGATIVE);
      } else if (
        /\bPOSE LOCK:\s*DOGGY\b/i.test(steeredPositive) ||
        /\b(?:doggy|doggystyle|from\s+behind|rear[- ]entry)\b/i.test(steeredPositive)
      ) {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_DOGGY_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_DOGGY_NEGATIVE);
      } else if (
        /\bPOSE LOCK:\s*STANDING WALL\b/i.test(steeredPositive) ||
        /\b(?:against|pressed\s+against)\s+(?:the\s+)?(?:bedroom\s+)?wall\b|\bwall\s+(?:sex|press)\b/i.test(
          steeredPositive
        )
      ) {
        positive = appendUniqueCsv(positive, RAPID_AIO_ADULT_WALL_POSITIVE);
        negative = appendUniqueCsv(negative, RAPID_AIO_ADULT_WALL_NEGATIVE);
      }
    }
    return finish({ positive, negative });
  }

  if (isCfg1DistilledStillImageModel(input.model)) {
    return finish(
      steeringForCfg1DistilledStillImage({
        positive: steeredPositive,
        negative: steeredNegative,
        model: input.model,
        realismMode,
        anatomyMode,
        tool: input.tool,
        turboEditStrength,
      })
    );
  }

  const suffixBudget = maxQueuePositiveSuffixChars(input.model);
  const baseLength = steeredPositive.trim().length;

  // Klein Distilled (CFG-1): anatomy/hand cues first — realism often ate the budget.
  // Edit tools skip those T2I suffixes — they fight ReferenceLatent and rewrite the frame.
  if (isKleinDistilledModel(input.model)) {
    if (skipsCfg1T2iSteeringForTurboEdit(String(input.model), input.tool)) {
      return finish({
        positive: steeredPositive,
        negative: steeredNegative,
      });
    }
    const withAnatomy = applyAnatomyGuardForModel({
      positive: steeredPositive,
      negative: steeredNegative,
      model: input.model,
      mode: anatomyMode,
      maxPositiveAppendChars: suffixBudget,
    });
    const anatomyGrowth = Math.max(0, withAnatomy.positive.trim().length - baseLength);
    return finish(
      applyRenderRealismForModel({
        positive: withAnatomy.positive,
        negative: withAnatomy.negative,
        model: input.model,
        mode: realismMode,
        maxPositiveAppendChars: Math.max(0, suffixBudget - anatomyGrowth),
      })
    );
  }

  // UltraReal: anatomy/hand cues first — soft decode + fragile hands need the budget.
  if (isFluxFineTuneCheckpointModel(input.model)) {
    const withAnatomy = applyAnatomyGuardForModel({
      positive: steeredPositive,
      negative: steeredNegative,
      model: input.model,
      mode: anatomyMode,
      maxPositiveAppendChars: suffixBudget,
    });
    const anatomyGrowth = Math.max(0, withAnatomy.positive.trim().length - baseLength);
    const withRealism = applyRenderRealismForModel({
      positive: withAnatomy.positive,
      negative: withAnatomy.negative,
      model: input.model,
      mode: realismMode,
      maxPositiveAppendChars: Math.max(0, suffixBudget - anatomyGrowth),
    });
    return finish({
      ...withRealism,
      positive: ensureUltraRealAmplifierTriggerInPrompt(withRealism.positive),
    });
  }

  const withRealism = applyRenderRealismForModel({
    positive: steeredPositive,
    negative: steeredNegative,
    model: input.model,
    mode: realismMode,
    maxPositiveAppendChars: suffixBudget,
  });
  const realismGrowth = Math.max(0, withRealism.positive.trim().length - baseLength);

  const withAnatomy = applyAnatomyGuardForModel({
    positive: withRealism.positive,
    negative: withRealism.negative,
    model: input.model,
    mode: anatomyMode,
    maxPositiveAppendChars: Math.max(0, suffixBudget - realismGrowth),
  });

  if (isKleinBaseModel(input.model)) {
    return finish({
      ...withAnatomy,
      positive: ensureKleinRealisticDetailTriggerInPrompt(withAnatomy.positive),
    });
  }

  return finish(withAnatomy);
}

/**
 * Wildcards / dynamic prompts: `__name__` list tokens and `{a|b|c}` choice
 * groups, expanded before any other queue-prep step. Gated by the shared
 * `expandWildcards` setting (default on) and reproducible via `wildcardSeed`.
 */
function expandWildcardsForQueue(
  text: string | undefined,
  options?: { expandWildcards?: boolean; wildcardSeed?: string }
): string | undefined {
  if (!text) {
    return text;
  }
  const enabled = options?.expandWildcards ?? loadWildcardExpansionEnabled();
  if (!enabled) {
    return text;
  }
  return expandWildcardText(text, {
    seed: options?.wildcardSeed ?? loadWildcardSeed(),
    wildcards: loadCustomWildcardLists(),
  });
}

export async function prepareQueuePrompts(input: {
  model: ComfyImageModel | string;
  positive: string;
  hints?: string;
  sport?: AthleticSport | null;
  tool?: string;
  explicitNegative?: string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
  /** Overrides the shared `expandWildcards` setting for this call. */
  expandWildcards?: boolean;
  /** Overrides the shared `wildcardSeed` setting for this call (reproducible expands). */
  wildcardSeed?: string;
  /** SD/SDXL textual inversion stems; appended as embedding:name. */
  embeddingTokens?: string[];
  turboEditStrength?: TurboEditStrength;
}): Promise<{ positive: string; negative?: string }> {
  const wildcardOptions = {
    expandWildcards: input.expandWildcards,
    wildcardSeed: input.wildcardSeed,
  };
  let positive = expandWildcardsForQueue(input.positive, wildcardOptions) ?? input.positive;
  if (modelSupportsTextualInversion(input.model) && input.embeddingTokens?.length) {
    positive = appendEmbeddingTokens(positive, input.embeddingTokens);
  }
  const hints = expandWildcardsForQueue(input.hints, wildcardOptions);
  const explicitNegative = expandWildcardsForQueue(input.explicitNegative, wildcardOptions);

  let negative: string | undefined;
  const distilledCfg1 =
    isLightningModelId(input.model) ||
    isWanLightningModel(input.model) ||
    isWanRapidAioModel(input.model) ||
    isQwenRapidAioModel(input.model);
  if (distilledCfg1) {
    // Skip auto-negative profiles — they fight CFG-1 distillation.
    // WAN Lightning gets a short artifact pack in applyQueuePromptSteering.
    // Boogu Turbo uses ConditioningZeroOut / empty encode — drop explicit negatives too.
    negative = isBooguTurboModel(input.model) ? undefined : explicitNegative?.trim() || undefined;
  } else if (modelUsesNegativePrompt(input.model)) {
    negative = await resolveQueueNegativePromptRaw({
      model: input.model,
      hints,
      sport: input.sport,
      tool: input.tool,
      explicitNegative,
    });
  }

  // People / wardrobe queues: append high-signal clothing artifact negatives.
  const clothingHints = hints ?? positive;
  const clothingTool =
    input.tool === 'character' ||
    input.tool === 'duo' ||
    input.tool === 'generate' ||
    input.tool === 'gallery-mutate' ||
    input.tool === 'pet' ||
    input.tool === 'fantasy' ||
    input.tool === 'roleplay';
  if (
    !distilledCfg1 &&
    modelUsesNegativePrompt(input.model) &&
    (clothingTool ||
      /\b(?:wearing|outfit|wardrobe|jersey|helmet|scrubs|uniform)\b/i.test(clothingHints))
  ) {
    negative = appendUniqueCsv(
      negative,
      buildClothingNegativePack({
        hints: clothingHints,
        tool: input.tool,
        sport: input.sport ?? inferAthleticSport(clothingHints),
      })
    );
  }

  return applyQueuePromptSteering({
    positive,
    negative,
    model: input.model,
    realismMode: input.realismMode,
    anatomyMode: input.anatomyMode,
    tool: input.tool,
    turboEditStrength: input.turboEditStrength,
  });
}

export function preparePositiveForQueue(
  positive: string,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
  }
): string {
  const realismMode = options?.realismMode ?? loadRenderRealismMode();
  const withPoseLock = ensurePoseGuideStyleLock(positive, realismMode);
  const withRealism = applyRenderRealismToPositive(withPoseLock, realismMode);
  const withAnatomy = applyAnatomyGuardToPositive(
    withRealism,
    options?.anatomyMode ?? loadAnatomyGuardMode()
  );
  return appendCleanSkinPositive(withAnatomy);
}

export function prepareNegativeForQueue(
  negative: string | undefined,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
    /** When true, or when pairing with a pose-guide positive, block stick-figure bleed. */
    poseGuide?: boolean;
  }
): string | undefined {
  const withPoseNeg = mergePoseGuideNegatives(negative, options?.poseGuide === true);
  const withRealism = applyRenderRealismToNegative(
    withPoseNeg,
    options?.realismMode ?? loadRenderRealismMode()
  );
  const withAnatomy = applyAnatomyGuardToNegative(
    withRealism,
    options?.anatomyMode ?? loadAnatomyGuardMode()
  );
  return mergeCleanSkinNegatives(withAnatomy, negative);
}
