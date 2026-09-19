/**
 * Phr00t Qwen-Image-Edit-Rapid-AIO residual safety often snaps "naked"/"strip"
 * edits back to a beige lingerie baseline. Prefer structural outfit replacement.
 *
 * Do NOT name lingerie / bra / panties / bikini (even as "never …") in the
 * positive — Rapid v23 has high prompt adherence and will paint those garments.
 * Keep garment bans in the negative pack only.
 *
 * NSFW Rapid merges also bias exposed skin toward beach/sand — ground an indoor
 * SETTING first in the main edit instruction (Edit NSFW stays required for bare skin).
 *
 * Prompting: use clear, direct natural language that names the target pose and
 * changes explicitly. Scale reference images with a separate ImageScale node —
 * never scale inside TextEncoderQwenEditPlus (cropping/zooming bugs).
 */

const FULLY_NUDE_RE = /\bFULLY NUDE\b/g;
const fullyNudeCiRe = /\bfully nude\b/gi;
const nakedRe = /\bnaked\b/gi;
const stripEveryRe = /\bIGNORE and strip every garment\b/gi;
const stripGarmentRe = /\bstrip every garment\b/gi;
const aggressivelyStripRe = /\baggressively strip\b/gi;

/**
 * Rewrite tripwire wording that makes Rapid AIO ignore outfit edits.
 * Safe to run on any Day/Story still prompt; no-op when those tokens are absent.
 */
export function softenQwenRapidNudeSafetyTriggers(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return trimmed;
  }
  let next = trimmed;
  next = next.replace(FULLY_NUDE_RE, 'bare skin only (clothes are now gone)');
  next = next.replace(fullyNudeCiRe, 'bare skin only');
  next = next.replace(stripEveryRe, 'Her clothes are now gone. Remove every garment');
  next = next.replace(stripGarmentRe, 'her clothes are now gone — remove every garment');
  next = next.replace(aggressivelyStripRe, 'her clothes are now gone');
  next = next.replace(nakedRe, 'with bare skin');
  return next.replace(/[ \t]{2,}/g, ' ').trim();
}

const DEFAULT_INDOOR_SETTING = 'a dimly lit bedroom with rumpled sheets and warm lamp light';

/**
 * Rapid often poses a dildo upright against the belly. Force vaginal penetration
 * and penis-shaped wording (toy object — not a man).
 */
export const SOLO_DILDO_INSERTION_CUE =
  'a realistic penis-shaped silicone dildo with the tip of the penis pushed deep into her vaginal opening — shaft entering her vagina, tip buried inside, both hands on the base thrusting deeper';

export const SOLO_DILDO_NO_EXTERNAL_HOLD_CUE =
  'never hold the dildo upright against her belly or pubic mound with the tip pointing at her chest; never merely press it to her vulva without penetration; never invent a man attached to the penis';

export type QwenRapidNudeEditLeadOptions = {
  soloHands?: boolean;
  /** Beat stance text — named explicitly so Rapid does not collapse every still. */
  beatPose?: string | null;
  /** Beat calls for a held dildo / vibrator — allow the toy instead of fingers-only. */
  soloToy?: boolean;
};

/**
 * Leading edit recipe in plain natural language: indoor place, clothes gone,
 * then the beat/Image 3 body pose (and solo hands when needed).
 */
export function buildQwenRapidNudeEditLead(
  setting?: string | null,
  options?: QwenRapidNudeEditLeadOptions
): string {
  const place = setting?.trim() || DEFAULT_INDOOR_SETTING;
  const soloHands = options?.soloHands !== false;
  const soloToy = options?.soloToy === true;
  const beat = options?.beatPose?.trim();
  const poseSentence = beat
    ? `Put her body into this exact pose from the beat and Image 3: ${beat}.`
    : `Match the beat and Image 3 body pose exactly — on her back, kneeling, on all fours, side-lying, standing, leaning, or seated as written — not the same kneeling pin-up every time.`;

  const base =
    `Change the scene so she is indoors at ${place}, lit only by indoor lamp or window light. ` +
    `No beach, sand, ocean, shoreline, pier, or night-beach city lights. ` +
    `Her clothes are now gone. Change her outfit to bare skin only — bare breasts with nipples visible and bare vulva, with zero fabric on the torso and hips. ` +
    `Keep face likeness from Image 1. ${poseSentence}`;

  if (!soloHands) {
    return `${base} Keep the beat sex contact with natural hand placement — do not raise gesture hands or point fingers at the camera.`;
  }

  if (soloToy) {
    return (
      `${base} ${SOLO_DILDO_INSERTION_CUE}. ${SOLO_DILDO_NO_EXTERNAL_HOLD_CUE} ` +
      `Exactly one adult woman alone — the penis-shaped dildo is a silicone object she inserts, not a penis attached to a man. ` +
      `Do not raise her hands to chest or shoulder height, and do not point fingers at the camera.`
    );
  }

  return (
    `${base} She has exactly two hands mid-self-touch, with fingers on her vulva as the beat describes; ` +
    `each hand continues from her own forearm and shoulder. ` +
    `Do not raise her hands to chest or shoulder height, and do not point fingers at the camera.`
  );
}

/** @deprecated Prefer {@link buildQwenRapidNudeEditLead} with the slot setting. */
export const QWEN_RAPID_NUDE_OUTFIT_EDIT_LEAD = buildQwenRapidNudeEditLead();
