import type { ComfyImageModel } from '../comfy-models/client';
import { isFluxFineTuneCheckpointModel } from '../model/checkpoint-map';
import { modelUsesNegativePrompt } from '../prompt/pair';

export type AnatomyGuardMode = 'off' | 'standard' | 'strict';

export const DEFAULT_ANATOMY_GUARD_MODE: AnatomyGuardMode = 'standard';

export const ANATOMY_GUARD_OPTIONS: {
  id: AnatomyGuardMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'No anatomy steering on queue.',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Guards against extra limbs, mutations, and broken proportions.',
  },
  {
    id: 'strict',
    label: 'Strict',
    description: 'Stronger hand, finger, and limb guards for people and creatures.',
  },
];

const ANATOMY_POSITIVE_SUFFIX: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard: 'accurate anatomy, correct proportions, natural limb count, coherent body structure',
  strict:
    'accurate anatomy, correct proportions, natural limb count, anatomically correct hands and fingers, symmetrical features, coherent body structure',
};

const ANATOMY_NEGATIVE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions',
  strict:
    'mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions, extra fingers, too many fingers, fused fingers, extra hands, duplicate limbs, wrong number of limbs, body horror, anatomical nonsense',
};

const FLUX_ANATOMY_AVOID: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'Avoid extra limbs, missing limbs, deformed anatomy, mutations, and broken proportions.',
  strict:
    'Avoid extra limbs, missing limbs, deformed anatomy, extra or fused fingers, duplicate hands, mutations, and broken proportions.',
};

/**
 * Compact CFG-1 pack — Klein Distilled invents OR omits limbs.
 * Appended (not early-injected): this limb-count wording is what reliably steers 4-step.
 */
const KLEIN_DISTILLED_FIGURE_CUE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard: 'No extra legs, arms or hands. No less than two legs, arms, and hands per person.',
  strict:
    'No extra legs, arms or hands. No less than two legs, arms, and hands per person. Each visible hand shows five separate fingers.',
};

/** Portrait / headshot — don't force full-body limbs into a face crop. */
const KLEIN_DISTILLED_PORTRAIT_CUE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard: 'Natural face and neck; each visible hand shows five fingers—no extra digits.',
  strict:
    'Natural face and neck; each visible hand shows five separate fingers with clear knuckles—no extra or fused digits.',
};

function isKleinDistilledModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein-4b-distilled' || model === 'flux-2-klein-9b-distilled';
}

function isKleinBaseModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein' || model === 'flux-2-klein-9b';
}

const KLEIN_BASE_ANATOMY_POSITIVE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'anatomically correct hands with five distinct fingers, clear wrists, natural limb count, coherent body proportions',
  strict:
    'anatomically correct hands with five distinct fingers and visible knuckles, clear wrists and elbows, natural limb count, coherent body proportions, no overlapping or fused digits',
};

const KLEIN_BASE_POSE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'When hands are visible, keep five fingers distinct; avoid weight-bearing palm close-ups that crush digits.',
  strict:
    'When hands, faces, or full figures are visible, keep five-fingered hands readable—avoid fisheye distortion and palm-support close-ups that crush digits.',
};

const KLEIN_BASE_FISHEYE_HAND_CUE =
  'Use a normal rectangular full-frame lens read with anatomically correct five-fingered hands—avoid circular fisheye barrel distortion on the figure.';

const ULTRAREAL_ANATOMY_POSITIVE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'anatomically correct hands with five distinct fingers, clear wrists, natural limb count, coherent body proportions',
  strict:
    'anatomically correct hands with five distinct fingers and visible knuckles, clear wrists and elbows, natural limb count, coherent body proportions, no fused or overlapping digits',
};

const ULTRAREAL_POSE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'When hands are visible, keep five fingers distinct; avoid clasped or weight-bearing palm close-ups that crush digits.',
  strict:
    'When hands, faces, or full figures are visible, keep five-fingered hands readable—avoid clasped-hand knots, palm-support close-ups, and fisheye distortion.',
};

function promptHasFisheyeOrCircularFrame(prompt: string): boolean {
  return /\b(fisheye|fish-eye|circular (?:vignette|frame|crop)|barrel distortion)\b/i.test(prompt);
}

function kleinBaseHasStrongHandAnatomy(prompt: string): boolean {
  return /\b(five distinct fingers|anatomically correct hands with five)\b/i.test(prompt);
}

function ultraRealHasStrongHandAnatomy(prompt: string): boolean {
  return /\b(five distinct fingers|anatomically correct hands with five)\b/i.test(prompt);
}

function kleinDistilledHasCompactCue(prompt: string): boolean {
  return (
    /\bno extra legs, arms or hands\b/i.test(prompt) ||
    /\bno less than two legs, arms, and hands\b/i.test(prompt) ||
    // Legacy cue from earlier Distilled packs — treat as already steered.
    /\bsingle subject with one head, two arms, and two legs\b/i.test(prompt)
  );
}

function appendCue(prompt: string, cue: string): string {
  const trimmed = prompt.trim();
  if (!trimmed || !cue.trim()) {
    return trimmed;
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${cue.trim()}`;
}

function kleinDistilledHasPortraitCue(prompt: string): boolean {
  return (
    /\bnatural face and neck\b/i.test(prompt) && /\bfive (?:separate )?fingers\b/i.test(prompt)
  );
}

/** Likely people/hands — decide whether the compact figure cue is worth injecting. */
function promptLikelyShowsHands(prompt: string): boolean {
  return /\b(hand|hands|finger|fingers|fist|grip|grasp|holding|waving|punch|kick|fighter|fighting|chun.?li|figure|person|woman|man|girl|boy|character|portrait|full.?body|cowboy.?shot|action pose|martial|boxer|dancer|model)\b/i.test(
    prompt
  );
}

function promptIsHeadOrPortraitCrop(prompt: string): boolean {
  return /\b(portrait|headshot|head.?and.?shoulders|bust shot|face only|close-?up (?:of )?(?:her |his |their )?(?:face|head)|face close-?up)\b/i.test(
    prompt
  );
}

/** Full- or half-body people shots where Distilled most often invents or drops a limb. */
function promptLikelyShowsFullFigure(prompt: string): boolean {
  if (promptIsHeadOrPortraitCrop(prompt)) {
    return false;
  }
  return /\b(full.?body|cowboy.?shot|standing|walking|running|sitting|seated|kneeling|reclining|lying|action pose|fighter|fighting|martial|boxer|dancer|yoga|pose|figure|person|woman|man|girl|boy|character|athlete|model|outfit|dress|suit)\b/i.test(
    prompt
  );
}

function prependCueAfterFirstSentence(prompt: string, cue: string): string {
  const trimmed = prompt.trim();
  if (!trimmed || !cue.trim()) {
    return trimmed;
  }
  const sentenceBreak = trimmed.match(/^(.+?[.!?])\s+/);
  if (sentenceBreak) {
    return `${sentenceBreak[1]} ${cue.trim()} ${trimmed.slice(sentenceBreak[0].length)}`;
  }
  return `${cue.trim()} ${trimmed}`;
}

/** Prompt already names a body pose — do not append stance-steering that fights it. */
function promptHasExplicitPose(prompt: string): boolean {
  return /\b(sitting|seated|kneeling|kneels?|reclining|reclines?|lying|lies? (?:on|down)|crouching|squatting|dancing|running|jumping|leaning|bent over|bent-over|yoga|stretching|lounging|prone|supine|cross[- ]legged|lotus|fetal|straddling|mounting|riding|climbing|crawling|floating|suspended|hanging)\b/i.test(
    prompt
  );
}

function promptHasHandPoseGuidance(prompt: string): boolean {
  return /\b(when hands (?:are|appear)|keep five[- ]finger|keep fingers distinct|avoid (?:clasped|weight-bearing palm)|palm-support close-ups|keep poses straightforward)\b/i.test(
    prompt
  );
}

export function normalizeAnatomyGuardMode(value: unknown): AnatomyGuardMode {
  if (value === 'standard' || value === 'strict' || value === 'off') {
    return value;
  }
  return DEFAULT_ANATOMY_GUARD_MODE;
}

function mergeCommaList(base: string | undefined, extra: string): string {
  const parts = `${base ?? ''}, ${extra}`
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ');
}

function promptAlreadyHasAnatomyCue(prompt: string): boolean {
  return /\b(accurate anatomy|anatomically correct|correct proportions|natural limb count|coherent body structure)\b/i.test(
    prompt
  );
}

function clipSuffixToBudget(suffix: string, maxAppendChars: number): string {
  if (suffix.length <= maxAppendChars) {
    return suffix;
  }
  return suffix
    .slice(0, maxAppendChars)
    .replace(/,\s*[^,]*$/, '')
    .replace(/[.!?]\s*$/, '')
    .trim();
}

export function applyAnatomyGuardToPositive(
  prompt: string,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
  options?: { maxAppendChars?: number }
): string {
  const trimmed = prompt.trim();
  if (!trimmed || mode === 'off' || promptAlreadyHasAnatomyCue(trimmed)) {
    return trimmed;
  }

  const maxAppend = options?.maxAppendChars;
  if (typeof maxAppend === 'number' && maxAppend < 40) {
    return trimmed;
  }

  let suffix = ANATOMY_POSITIVE_SUFFIX[mode];
  if (typeof maxAppend === 'number') {
    suffix = clipSuffixToBudget(suffix, maxAppend);
    if (!suffix) {
      return trimmed;
    }
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${suffix}`;
}

export function applyAnatomyGuardToNegative(
  negative: string | undefined,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE
): string | undefined {
  if (mode === 'off') {
    return negative?.trim() || undefined;
  }

  const merged = mergeCommaList(negative, ANATOMY_NEGATIVE_EXTRA[mode]);
  return merged || undefined;
}

function applyKleinDistilledAnatomyGuard(input: {
  positive: string;
  mode: Exclude<AnatomyGuardMode, 'off'>;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  let positive = input.positive.trim();
  if (!positive) {
    return { positive, negative: undefined };
  }

  const maxAppend = input.maxPositiveAppendChars;
  if (typeof maxAppend === 'number' && maxAppend < 40) {
    return { positive, negative: undefined };
  }

  const portraitCrop = promptIsHeadOrPortraitCrop(positive);
  const fullFigure = !portraitCrop && promptLikelyShowsFullFigure(positive);

  // CFG-1 / 4-step: one compact cue. Portraits stay early (face crop); full figures
  // append the limb-count pack — that placement is what steers Distilled best.
  if (portraitCrop) {
    if (!kleinDistilledHasPortraitCue(positive)) {
      let cue = KLEIN_DISTILLED_PORTRAIT_CUE[input.mode];
      if (typeof maxAppend === 'number') {
        cue = clipSuffixToBudget(cue, maxAppend);
      }
      if (cue) {
        positive = prependCueAfterFirstSentence(positive, cue);
      }
    }
    return { positive, negative: undefined };
  }

  if (fullFigure || promptLikelyShowsHands(positive)) {
    if (!kleinDistilledHasCompactCue(positive)) {
      let cue = KLEIN_DISTILLED_FIGURE_CUE[input.mode];
      if (typeof maxAppend === 'number') {
        cue = clipSuffixToBudget(cue, maxAppend);
      }
      if (cue) {
        positive = appendCue(positive, cue);
      }
    }
  }

  return { positive, negative: undefined };
}

export function applyAnatomyGuardForModel(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  mode?: AnatomyGuardMode;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  const resolvedMode = input.mode ?? DEFAULT_ANATOMY_GUARD_MODE;
  if (resolvedMode === 'off') {
    return {
      positive: input.positive.trim(),
      negative: input.negative?.trim() || undefined,
    };
  }

  // Klein Distilled is CFG-1: use a compact hand/limb pack (standard already includes fingers).
  if (isKleinDistilledModel(input.model)) {
    return applyKleinDistilledAnatomyGuard({
      positive: input.positive,
      mode: resolvedMode,
      maxPositiveAppendChars: input.maxPositiveAppendChars,
    });
  }

  const baseLength = input.positive.trim().length;
  let positive = applyAnatomyGuardToPositive(input.positive, resolvedMode, {
    maxAppendChars: input.maxPositiveAppendChars,
  });
  let remaining =
    typeof input.maxPositiveAppendChars === 'number'
      ? Math.max(0, input.maxPositiveAppendChars - (positive.length - baseLength))
      : undefined;

  // Klein Base: hand anatomy is often ignored when cues are generic and late —
  // upgrade to five-finger language and keep poses simple.
  if (isKleinBaseModel(input.model)) {
    if (
      !kleinBaseHasStrongHandAnatomy(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let handCue = KLEIN_BASE_ANATOMY_POSITIVE[resolvedMode];
      if (typeof remaining === 'number') {
        handCue = clipSuffixToBudget(handCue, remaining);
      }
      if (handCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${handCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      !promptHasExplicitPose(positive) &&
      !promptHasHandPoseGuidance(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let pose = KLEIN_BASE_POSE_EXTRA[resolvedMode];
      if (typeof remaining === 'number') {
        pose = clipSuffixToBudget(pose, remaining);
      }
      if (pose) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${pose}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      promptHasFisheyeOrCircularFrame(positive) &&
      !/\bnormal rectangular full-frame\b/i.test(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let fisheyeCue = KLEIN_BASE_FISHEYE_HAND_CUE;
      if (typeof remaining === 'number') {
        fisheyeCue = clipSuffixToBudget(fisheyeCue, remaining);
      }
      if (fisheyeCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${fisheyeCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  // UltraReal: author notes hands are fragile — five-finger cues without stance overrides.
  if (isFluxFineTuneCheckpointModel(input.model)) {
    if (
      !ultraRealHasStrongHandAnatomy(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let handCue = ULTRAREAL_ANATOMY_POSITIVE[resolvedMode];
      if (typeof remaining === 'number') {
        handCue = clipSuffixToBudget(handCue, remaining);
      }
      if (handCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${handCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      !promptHasExplicitPose(positive) &&
      !promptHasHandPoseGuidance(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let pose = ULTRAREAL_POSE_EXTRA[resolvedMode];
      if (typeof remaining === 'number') {
        pose = clipSuffixToBudget(pose, remaining);
      }
      if (pose) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${pose}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  if (modelUsesNegativePrompt(input.model)) {
    return {
      positive,
      negative: applyAnatomyGuardToNegative(input.negative, resolvedMode),
    };
  }

  const avoid = FLUX_ANATOMY_AVOID[resolvedMode];
  if (!/\bavoid extra limbs\b/i.test(positive)) {
    if (typeof remaining !== 'number' || remaining >= 40) {
      const avoidText =
        typeof remaining === 'number' ? clipSuffixToBudget(avoid, remaining) : avoid;
      if (avoidText) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${avoidText}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  return { positive, negative: undefined };
}

export function formatAnatomyGuardHint(
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
  model?: ComfyImageModel | string
): string {
  if (mode === 'off') {
    return 'Off — no anatomy guards on queue.';
  }
  const option = ANATOMY_GUARD_OPTIONS.find(entry => entry.id === mode) ?? ANATOMY_GUARD_OPTIONS[0];
  const base = `${option.label} — ${option.description}`;
  if (model && isKleinDistilledModel(model)) {
    if (mode === 'strict') {
      return `${base} Klein Distilled Strict appends a limb-count cue (no extra / at least two legs, arms, and hands; five fingers). 4-step CFG-1 still fails on complex poses — use Klein 9B Base or Gallery → Anatomy repair.`;
    }
    return `${base} Klein Distilled appends: no extra legs/arms/hands, and no less than two of each per person. Keep poses simple; Strict adds hand wording; Klein 9B Base for hard full-body people.`;
  }
  return base;
}
