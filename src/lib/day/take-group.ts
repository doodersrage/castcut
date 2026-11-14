/**
 * A group still's third and fourth person (FINISHING_PLAN Phase 3, the take built off the page):
 * whether the still can hold them (day-group.ts) and their faces — a face crop each, as Image 3
 * and Image 4. Out of queueSlot; the page's steps by default, the server passes its own.
 */
import type { CharacterRecord } from '@/lib/character/os';
import { poseModelFamily } from '@/lib/pose/pose-model-profile';
import type { DayThirdPerson } from './group';
import { resolveDayNudeIdentityPlateWithFaceCrop } from './nude-face-crop';
import { dayPartnerNoun } from './partner';
import type { TakePartnerFaceSteps } from './take-partner-face';

export type TakeGroupFaces = {
  third?: { person: DayThirdPerson; filename: string };
  fourth?: { person: DayThirdPerson; filename: string };
  /** For the card: who was left out and why. */
  notes: string[];
};

export async function resolveTakeGroupFaces(input: {
  slot: { thirdCastId?: string; fourthCastId?: string };
  getCharacter: (id: string) => CharacterRecord | null | undefined;
  stillModel: string;
  comfyUrl?: string;
  /** What else the still carries: a place photo, an adult mood, a partner's face, Klein's face. */
  placePhoto: boolean;
  adultStill: boolean;
  partnerFace: boolean;
  kleinFace: boolean;
  steps?: Pick<TakePartnerFaceSteps, 'faceOps' | 'checkReference'>;
}): Promise<TakeGroupFaces> {
  const { stillModel } = input;
  const notes: string[] = [];
  const out: TakeGroupFaces = { notes };
  const face = async (character: CharacterRecord) =>
    (
      await resolveDayNudeIdentityPlateWithFaceCrop({
        character,
        model: stillModel,
        comfyUrl: input.comfyUrl,
        ...(input.steps?.faceOps ? { ops: input.steps.faceOps } : {}),
        ...(input.steps?.checkReference ? { checkReference: input.steps.checkReference } : {}),
      })
    ).plate?.filename?.trim();
  const qwen21 = poseModelFamily(stillModel) === 'qwen-image-2.1';

  const thirdId = input.slot.thirdCastId?.trim();
  const thirdCharacter = thirdId ? input.getCharacter(thirdId) : undefined;
  if (thirdCharacter) {
    // Edit 2511 two-person stills carry a face-break crop as Image 1 — the layout the 6/6 test
    // ran on (an earlier `!vacationFaceBreak` here kept every group still from ever reaching
    // the queue).
    const groupOk =
      !input.placePhoto &&
      !input.adultStill &&
      input.partnerFace &&
      !input.kleinFace &&
      // Qwen-Image 2.1 too (the third face as its third reference): Turbo, four group graphs ×
      // 2 seeds, three distinct people in their own clothes 8/8 (2026-10-17).
      (/qwen-image-edit-2511|qwen_image_edit_2511/i.test(stillModel ?? '') || qwen21);
    if (!groupOk) {
      notes.push(
        `${thirdCharacter.name} was left out: three-person stills need Edit 2511 or Qwen-Image 2.1, a clothed mood and a partner in the still.`
      );
    } else {
      const filename = await face(thirdCharacter);
      if (filename) {
        out.third = {
          filename,
          person: {
            noun: dayPartnerNoun(thirdCharacter),
            descriptor: (thirdCharacter.descriptor || thirdCharacter.hints || '').slice(0, 160),
            busy: qwen21,
          },
        };
      } else {
        notes.push(`${thirdCharacter.name} has no face picture yet — left out of this still.`);
      }
    }
  }

  // A fourth person: their face as Image 4 — Qwen-Image 2.1 reads four (Turbo, four group beats
  // × 2 seeds: four distinct people in their own clothes 8/8, the lead's face as close as in
  // three-person stills on the portrait canvas, 2026-10-17).
  const fourthId = input.slot.fourthCastId?.trim();
  const fourthCharacter = out.third && fourthId ? input.getCharacter(fourthId) : undefined;
  if (fourthCharacter) {
    if (!qwen21) {
      notes.push(`${fourthCharacter.name} was left out: four-person stills need Qwen-Image 2.1.`);
    } else {
      const filename = await face(fourthCharacter);
      if (filename) {
        out.fourth = {
          filename,
          person: {
            noun: dayPartnerNoun(fourthCharacter),
            descriptor: (fourthCharacter.descriptor || fourthCharacter.hints || '').slice(0, 160),
          },
        };
      } else {
        notes.push(`${fourthCharacter.name} has no face picture yet — left out of this still.`);
      }
    }
  }
  return out;
}
