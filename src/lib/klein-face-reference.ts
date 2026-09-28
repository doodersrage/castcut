/**
 * FLUX.2 Klein identity: a head crop of the Cast plate as the last ReferenceLatent.
 *
 * Klein holds a full-body plate's face loosely — plate-backed solo stills sat at face distance
 * 0.53–0.72 (similarity 0.28–0.47), so the 0.4 still gate would reroll about half of them.
 * Live A/B on Klein 9B Distilled (2026-09-28, 4 poses × 2 seeds, plate + OpenPose guide):
 * appending the head crop moved every still closer (mean 0.63 → 0.56; gate misses 5/8 → 2/8)
 * with pose and outfit unchanged; two more Casts (a woman, a man) held it, 15/16 closer. The Enhancer identity lock (SOFT/MID/HARD, plate-only
 * indices) and the Klein consistency LoRA did nothing measurable. Swapping the plate for the
 * crop instead lost the garment's cut (a mini dress became a maxi), so the crop rides along.
 * Solo stills only: on two-person guides the extra face read as an extra head (a third person
 * in both spoon seeds that were clean without it), and duo identity can't be scored anyway.
 */

import { isFluxKleinModel } from './model-denoise-defaults';

/** Names the extra reference; Klein reads references by order, so no image number. */
export const KLEIN_FACE_REFERENCE_LINE = 'The face exactly matches the close-up face reference.';

/**
 * Append the head crop when a solo still is on Klein and Image 1 is the full plate. When Image 1
 * already is a face crop (face-break, nude auto-crop, Cast face lock) there is nothing to add.
 * `headcount` is the pose guide's figure count (unset = no guide = solo).
 */
export function shouldAppendKleinFaceReference(input: {
  model: string | null | undefined;
  imageOneIsFaceCrop: boolean;
  headcount?: number | null;
}): boolean {
  return isFluxKleinModel(input.model) && !input.imageOneIsFaceCrop && (input.headcount ?? 1) <= 1;
}
