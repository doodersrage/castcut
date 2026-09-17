/**
 * Shared Image 3 stick-figure edit cues for Day / Story.
 * Wireframes unlock pose only — wording must block diagram/style bleed into stills.
 */

import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from '@/lib/render-realism';

/** Core pose-reference instruction (style-agnostic: never copy the diagram). */
export const POSE_GUIDE_EDIT_PROMPT_LINE =
  'Image 3 is a crude stick-figure pose wireframe on white — use it ONLY for body pose, stance, limb placement, and the number and relative positions of every stick figure. Completely ignore Image 3 style, line art, diagram look, white void background, face, and clothing; never draw stick figures, wireframes, schematics, or pose sketches in the output. When Image 3 shows more than one stick figure (often different line colors), each figure is one complete separate person with their own head, torso, arms, and legs.';

/** Blocks fused/merged bodies on duo+ pose guides (safe no-op for solo). */
export const POSE_GUIDE_MULTI_PERSON_LOCK =
  'If Image 3 shows two or more stick figures, keep that exact headcount as fully separate people — distinct faces and bodies may touch or embrace, but must not merge, fuse, morph, share one torso, or collapse into a couple-blob.';

/** Default realism lock when Settings realism is realistic / hyper (or unset). */
export const POSE_GUIDE_PHOTO_REALISM_LOCK =
  'Final still must be a photorealistic live-action photograph: real skin texture, real fabric, natural lighting, and believable materials — not illustration, cartoon, anime, CGI, or a redraw of the Image 3 wireframe.';

/** When Settings realism is anime — still reject stick figures, keep stylized finish. */
export const POSE_GUIDE_ANIME_STYLE_LOCK =
  'Final still must be a finished anime/illustration scene with real character rendering — not stick figures, wireframes, schematics, or a redraw of the Image 3 diagram.';

/** When realism is Off — still block diagram bleed without forcing a photo look. */
export const POSE_GUIDE_NO_DIAGRAM_LOCK =
  'Final still must be a finished rendered scene matching Image 1 material quality — never stick figures, wireframes, schematics, or a redraw of the Image 3 diagram.';

/** Extra negatives when Image 3 pose guide is attached. */
export const POSE_GUIDE_NEGATIVE_EXTRA =
  'stick figure, stickman, wireframe, pose diagram, schematic, skeleton line art, white void background, flat diagram, pose sketch, controlnet stickman, merged bodies, fused people, conjoined couple, shared torso, one body two heads, couple blob, morphing bodies, glued figures, siamese twin';

const POSE_GUIDE_CUE_RE = /Image 3 is a crude stick-figure/i;

export function promptHasPoseGuideCue(prompt: string | null | undefined): boolean {
  return POSE_GUIDE_CUE_RE.test(prompt?.trim() || '');
}

export function poseGuideStyleLockLine(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  const resolved = normalizeRenderRealismMode(mode);
  if (resolved === 'anime') {
    return POSE_GUIDE_ANIME_STYLE_LOCK;
  }
  if (resolved === 'off') {
    return POSE_GUIDE_NO_DIAGRAM_LOCK;
  }
  return POSE_GUIDE_PHOTO_REALISM_LOCK;
}

/** Full Image 3 block: pose reference + style lock + multi-person anti-merge. */
export function poseGuidePromptBlock(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  return `${POSE_GUIDE_EDIT_PROMPT_LINE} ${poseGuideStyleLockLine(mode)} ${POSE_GUIDE_MULTI_PERSON_LOCK}`;
}

/**
 * Append Image 3 pose + realism lock when queueing / saving a still prompt (idempotent).
 */
export function withPoseGuideEditPrompt(
  prompt: string,
  enabled: boolean,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  const trimmed = prompt.trim();
  if (!enabled || !trimmed) {
    return trimmed;
  }
  const lock = poseGuideStyleLockLine(mode);
  let next = trimmed;
  if (!promptHasPoseGuideCue(next)) {
    next = `${next}\n${POSE_GUIDE_EDIT_PROMPT_LINE}`;
  }
  if (!next.includes(lock.slice(0, 48))) {
    next = `${next}\n${lock}`;
  }
  if (!/fully separate people/i.test(next)) {
    next = `${next}\n${POSE_GUIDE_MULTI_PERSON_LOCK}`;
  }
  return next;
}

/** Ensure a prompt that already names Image 3 also carries the style lock. */
export function ensurePoseGuideStyleLock(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE
): string {
  const trimmed = prompt.trim();
  if (!trimmed || !promptHasPoseGuideCue(trimmed)) {
    return trimmed;
  }
  const lock = poseGuideStyleLockLine(mode);
  let next = trimmed;
  if (!next.includes(lock.slice(0, 48))) {
    // Legacy short cue — upgrade in place when possible.
    if (
      /ignore Image 3 style, face, and clothing\.?/i.test(next) &&
      !/never draw stick figures/i.test(next)
    ) {
      next = next.replace(
        /Image 3 is a crude stick-figure pose wireframe on white[^.]*\./i,
        POSE_GUIDE_EDIT_PROMPT_LINE
      );
    }
    next = `${next}\n${lock}`;
  }
  if (!/fully separate people/i.test(next)) {
    next = `${next}\n${POSE_GUIDE_MULTI_PERSON_LOCK}`;
  }
  return next;
}

export function mergePoseGuideNegatives(
  negative: string | undefined,
  enabled: boolean
): string | undefined {
  if (!enabled) {
    return negative?.trim() || undefined;
  }
  const parts = `${negative ?? ''}, ${POSE_GUIDE_NEGATIVE_EXTRA}`
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
  return merged.join(', ') || undefined;
}
