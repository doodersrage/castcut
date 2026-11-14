/**
 * A take's second person, found or made (FINISHING_PLAN Phase 3, the take built off the page):
 * who it is was decided in the take's plan (planTakePartner); here the face — a stand-in reused
 * or rendered (one a film, kept per script, and one on the page for the partner; a stranger has
 * their own), or the partner Cast member's face crop, checked. What changes is handed back for
 * the caller to keep (the page: its settings; the server: the run's patch queue). The page's
 * steps by default; the server passes its own.
 */
import type { CharacterRecord } from '@/lib/character/os';
import { checkReferenceImage, referenceViewUrl } from '@/lib/checks/reference-check-client';
import { resolveDayNudeIdentityPlateWithFaceCrop } from './nude-face-crop';
import type { DayPartner } from './partner';
import type { PictureIo } from '@/lib/media/picture-io';
import {
  renderDayPartnerStandIn,
  uploadDayPartnerVlFace,
  reusableDayPartnerStandIn,
  type DayPartnerStandIn,
  type DayStandInSteps,
} from './partner-stand-in';
import { resolveDayCastPlate } from './plate';
import type { TakePartnerPlan } from './take-plan';
import type { DayFacePlateOps } from './vacation-face-crop';

type SendComfyUi = Parameters<typeof renderDayPartnerStandIn>[0]['sendComfyUi'];

export type TakePartnerFaceSteps = {
  /** Face crops (face-plate-ops-server.ts on the server). */
  faceOps?: Pick<DayFacePlateOps, 'loadBlob' | 'locate' | 'upload'>;
  /** The reference check (checkReferenceOnServer on the server). */
  checkReference?: typeof checkReferenceImage;
  /** The stand-in render's wait and picture steps (serverDressPlateDeps on the server). */
  standIn?: DayStandInSteps;
};

export type TakePartnerFace = {
  slotPartner: DayPartner | null;
  partnerFace: { filename?: string; imageUrl?: string } | null;
  /** For the card: a face lock or a partner picture left out, a partner left out. */
  notes: string[];
  /** The page's partner stand-in, when it changed. */
  pageStandIn?: DayPartnerStandIn;
  /** The script's stand-ins with this film's, when it changed. */
  filmPartners?: Record<string, DayPartnerStandIn>;
};

export async function resolveTakePartnerFace(input: {
  plan: TakePartnerPlan;
  /** The script's stand-ins (scriptPartners; none outside a Scene). */
  filmPartners: Record<string, DayPartnerStandIn>;
  /** The page's partner stand-in so far. */
  pageStandIn: DayPartnerStandIn | null;
  lead: CharacterRecord | null | undefined;
  stillModel: string;
  comfyUrl?: string;
  sendComfyUi: SendComfyUi;
  steps?: TakePartnerFaceSteps;
}): Promise<TakePartnerFace> {
  const { plan, lead, stillModel, comfyUrl } = input;
  const steps = input.steps ?? {};
  const notes: string[] = [];
  const faceCrop = (character: CharacterRecord) =>
    resolveDayNudeIdentityPlateWithFaceCrop({
      character,
      model: stillModel,
      comfyUrl,
      ...(steps.faceOps ? { ops: steps.faceOps } : {}),
      ...(steps.checkReference ? { checkReference: steps.checkReference } : {}),
    });

  if (plan.kind === 'stand-in') {
    const { filmKey, stranger, candidate } = plan;
    let standIn =
      (filmKey ? reusableDayPartnerStandIn(input.filmPartners[filmKey], candidate.noun) : null) ??
      (stranger ? null : reusableDayPartnerStandIn(input.pageStandIn, candidate.noun));
    if (!standIn && lead) {
      const leadFace = await faceCrop(lead);
      const leadFaceFilename = leadFace.plate?.filename?.trim();
      if (leadFace.faceLockRejected) notes.push(leadFace.faceLockRejected);
      if (leadFaceFilename) {
        standIn = await renderDayPartnerStandIn({
          noun: candidate.noun,
          leadFaceFilename,
          model: stillModel,
          ...(comfyUrl ? { comfyUrl } : {}),
          sendComfyUi: input.sendComfyUi,
          characterId: lead.id,
          elderly: stranger?.elderly,
          ...(steps.standIn ? { steps: steps.standIn } : {}),
        }).catch(() => null);
      }
    }
    const out: TakePartnerFace = standIn
      ? {
          slotPartner: { name: '', noun: standIn.noun, descriptor: standIn.look.slice(0, 220) },
          partnerFace: { filename: standIn.filename },
          notes,
        }
      : // No face to reuse (render failed): a new stranger with their own face.
        { slotPartner: candidate, partnerFace: null, notes };
    if (standIn && !stranger && standIn !== input.pageStandIn) out.pageStandIn = standIn;
    if (standIn && filmKey && input.filmPartners[filmKey] !== standIn) {
      out.filmPartners = { ...input.filmPartners, [filmKey]: standIn };
    }
    return out;
  }

  if (plan.kind === 'cast') {
    const partner = plan.character;
    const resolved = await faceCrop(partner);
    if (resolved.faceLockRejected) notes.push(resolved.faceLockRejected);
    if (!resolved.plate?.filename?.trim() && !resolved.plate?.imageUrl?.trim()) {
      return { slotPartner: null, partnerFace: null, notes };
    }
    // The partner's face must be a face, theirs, and not the lead's. A picture that fails is
    // left out and the still invents the partner (the engine made up a stranger anyway when the
    // upload was an unrelated picture, d56fe14a) — said on the card. A check that could not run
    // keeps the picture.
    const verdict = await (steps.checkReference ?? checkReferenceImage)({
      role: 'partner-face',
      filename: resolved.plate.filename,
      imageUrl: resolved.plate.imageUrl,
      subject: partner.name,
      partnerReferenceUrl: referenceViewUrl(resolveDayCastPlate(partner)),
      leadReferenceUrl: referenceViewUrl(resolveDayCastPlate(lead)),
      comfyUrl,
    });
    if (verdict.status === 'mismatch') {
      notes.push(
        `${verdict.message ?? "The partner's face picture is not a face."} This still invents the partner instead.`
      );
      return {
        slotPartner: { name: '', noun: plan.candidate.noun, invented: true },
        partnerFace: null,
        notes,
      };
    }
    return {
      slotPartner: plan.candidate,
      partnerFace: {
        filename: resolved.plate.filename?.trim() || undefined,
        imageUrl: resolved.plate.imageUrl?.trim() || undefined,
      },
      notes,
    };
  }

  if (plan.note) notes.push(plan.note);
  return { slotPartner: null, partnerFace: null, notes };
}

/**
 * The partner's face as Image 2, as it goes out: on a clothed still a VL-only copy
 * (uploadDayPartnerVlFace), else the face itself. The file that goes is checked — a Cast
 * partner's against their plate and the lead's, a stand-in's only as a face. A picture that
 * fails is left out (the engine invents the partner), and a stand-in that is no face is
 * forgotten, page and film alike, so the next shot renders a new one.
 */
export async function sendTakePartnerFace(input: {
  partnerFace: { filename?: string; imageUrl?: string };
  adultStill: boolean;
  slotPartner: DayPartner | null;
  partnerCharacter: CharacterRecord | null;
  lead: CharacterRecord | null | undefined;
  stillModel: string;
  comfyUrl?: string;
  filmPartners: Record<string, DayPartnerStandIn>;
  pageStandIn: DayPartnerStandIn | null;
  steps?: { io?: PictureIo; checkReference?: typeof checkReferenceImage };
}): Promise<{
  /** Image 2: a URL to upload or a file already in ComfyUI. */
  url?: string;
  filename: string;
  note?: string;
  /** The Cast partner's face as sent (the card keeps it). */
  sentFace?: { partnerId: string; filename: string };
  /** The page's stand-in was no face: forget it. */
  clearPageStandIn?: true;
  /** The script's stand-ins without the one that was no face. */
  filmPartners?: Record<string, DayPartnerStandIn>;
}> {
  const { partnerFace, comfyUrl } = input;
  const steps = input.steps ?? {};
  const vlFace = !input.adultStill
    ? await uploadDayPartnerVlFace({
        ...partnerFace,
        model: input.stillModel,
        ...(comfyUrl ? { comfyUrl } : {}),
        ...(steps.io ? { io: steps.io } : {}),
      })
    : null;
  const url = vlFace ? undefined : partnerFace.imageUrl;
  // The file that actually goes out (the VL re-upload is a new file: for four days it was a
  // different picture from the face it was made from).
  const filename = vlFace || partnerFace.filename || '';
  const sent = filename.trim();
  if (!sent) return { url, filename };
  const castPartner =
    input.slotPartner && !input.slotPartner.invented ? input.partnerCharacter : null;
  const verdict = await (steps.checkReference ?? checkReferenceImage)({
    role: castPartner ? 'partner-face' : 'face',
    filename: sent,
    subject: castPartner?.name ?? "the partner's",
    ...(castPartner
      ? {
          partnerReferenceUrl: referenceViewUrl(resolveDayCastPlate(castPartner)),
          leadReferenceUrl: referenceViewUrl(resolveDayCastPlate(input.lead)),
        }
      : {}),
    comfyUrl,
  });
  if (verdict.status !== 'mismatch') {
    return {
      url,
      filename,
      ...(castPartner ? { sentFace: { partnerId: castPartner.id, filename: sent } } : {}),
    };
  }
  const out: Awaited<ReturnType<typeof sendTakePartnerFace>> = {
    filename: '',
    note: `${verdict.message ?? 'The partner picture is not a face.'} It was left out of this still, so the engine invents the partner.`,
  };
  // A stand-in that is no face (until 2026-11-11 its crop kept only the forehead).
  const badFace = partnerFace.filename?.trim();
  if (!castPartner && badFace) {
    if (input.pageStandIn?.filename === badFace) out.clearPageStandIn = true;
    const kept = Object.fromEntries(
      Object.entries(input.filmPartners).filter(([, standIn]) => standIn.filename !== badFace)
    );
    if (Object.keys(kept).length !== Object.keys(input.filmPartners).length) {
      out.filmPartners = kept;
    }
  }
  return out;
}
