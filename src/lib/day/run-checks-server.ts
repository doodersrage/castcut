/**
 * A run's take checked on the server as it lands (FINISHING_PLAN Phase 3, step 7): the page's
 * after-checks (useDayStillAfterChecks) with the server's functions — her outfit (an Everyday
 * day, against the planned kit), her face against the plate (alone in frame), her marks. What
 * they find goes on the take (its gallery entry's playChecks) and the run keeps the best take by
 * it (bestSceneTake).
 *
 * Not here: the marks repair pass (a miss is recorded at once — the run tries the Scene again
 * instead), Auto-review, Face finish and the pose judge (the page's; a take they did not see has
 * no pose score, as on a page with them off).
 */
import type { CharacterRecord } from '@/lib/character/os';
import { checkableMarks, marksCheckNote, marksCheckVerdict } from '@/lib/cast/marks-check';
import { readMarksInStill } from '@/lib/cast/marks-check-server';
import { STILL_MIN_FACE_MATCH } from '@/lib/face/match';
import { comfyInputViewUrl } from '@/lib/face/match-client';
import { measureLeadFaceInComfy } from '@/lib/face/finish-server';
import { measureFaceMatchInComfy } from '@/lib/face/match-server';
import type { GalleryPlayChecks } from '@/lib/gallery/comfyui-gallery-entry';
import { parseLlmRequestOptions, sharedLlmRequestBody } from '@/lib/llm/request-options';
import type { PictureIo } from '@/lib/media/picture-io';
import { reviewOutfitLabel } from '@/lib/play/slot-quality';
import type { SharedToolSettings } from '@/lib/settings/cache';
import { outfitWearerFor } from '@/lib/still/outfit-check';
import { checkOutfitInStill } from '@/lib/still/outfit-check-server';
import { askSameRoom } from '@/lib/still/room-server';
export { roomReferenceFor } from './room-reference';
import { isDayAdultMood, normalizeDayIntimateMix, normalizeDayMood } from './planner';
import type { ServerTakeReport } from './run-take-server';

/** Whose clothes and face to check: the lead alone, or beside someone else (the page's plan). */
export function serverChecksPlan(report: ServerTakeReport, autoReview: boolean) {
  const { toolSettings, slot } = report;
  const mood = normalizeDayMood(toolSettings.dayMood);
  const companionsPossible =
    toolSettings.allowCompanions === true ||
    (isDayAdultMood(mood) && normalizeDayIntimateMix(toolSettings.intimateMix) !== 'solo');
  const solo = report.drawnPeople != null ? report.drawnPeople === 1 : !companionsPossible;
  // The outfit: planned on an Everyday day, and not already checked by Auto-review.
  const outfit =
    mood === 'everyday' && !autoReview
      ? reviewOutfitLabel({
          customDescription: toolSettings.customGarmentDescription,
          wardrobeId: slot.wardrobeId,
          wardrobeLabel: report.wardrobeLabel(slot.wardrobeId),
        })
      : undefined;
  const wearer = outfit
    ? outfitWearerFor({ lead: report.leadNoun, solo, prompt: report.prompt })
    : null;
  return { solo, outfit, wearer, mood };
}

async function dataUrlOf(io: Pick<PictureIo, 'loadBlob'>, url: string): Promise<string> {
  const blob = await io.loadBlob([url]);
  const bytes = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || 'image/png'};base64,${bytes.toString('base64')}`;
}

export async function checkServerTake(input: {
  imageUrl: string;
  report: ServerTakeReport;
  shared: SharedToolSettings;
  comfyUrl: string;
  io: Pick<PictureIo, 'loadBlob'>;
  /** The scene's reference to hold the take against (roomReferenceFor): the same-room check. */
  roomReferenceUrl?: string | null;
  /** Tests replace the vision checks and the face match. */
  sameRoom?: typeof askSameRoom;
  outfitCheck?: typeof checkOutfitInStill;
  readMarks?: typeof readMarksInStill;
  faceMatch?: typeof measureFaceMatchInComfy;
  leadFaceMatch?: typeof measureLeadFaceInComfy;
}): Promise<GalleryPlayChecks | undefined> {
  const { report, shared } = input;
  if (report.slot.placeOnly) return undefined;
  // The same room as the scene's reference (still/room.ts; advisory) — two shots of one scene in
  // two kitchens went unseen. Asked whoever is in frame.
  const roomCheck = async (checks: GalleryPlayChecks) => {
    const reference = input.roomReferenceUrl?.trim();
    if (!reference || reference === input.imageUrl) return;
    const verdict = await (input.sameRoom ?? askSameRoom)({
      io: input.io as PictureIo,
      referenceUrl: reference,
      imageUrl: input.imageUrl,
      llm: parseLlmRequestOptions(sharedLlmRequestBody(shared)),
    }).catch(() => null);
    if (verdict) checks.roomMiss = verdict.same ? '' : verdict.note || 'another room';
  };
  const autoReview = report.toolSettings.autoReviewStills === true;
  const { solo, outfit, wearer, mood } = serverChecksPlan(report, autoReview);
  const checks: GalleryPlayChecks = { at: Date.now() };
  await roomCheck(checks);
  if (!solo && !wearer && !report.slot.poseLead)
    return Object.keys(checks).length > 1 ? checks : undefined;
  const llm = parseLlmRequestOptions(sharedLlmRequestBody(shared));
  let image: string | null = null;
  const still = async () => (image ??= await dataUrlOf(input.io, input.imageUrl));

  if (outfit && wearer) {
    const verdict = await (input.outfitCheck ?? checkOutfitInStill)({
      imageDataUrl: await still(),
      outfit,
      wearer,
      llm,
    }).catch(() => null);
    if (verdict) {
      checks.outfitMiss = verdict.match ? '' : verdict.seen;
      checks.outfitChecked = true;
    }
  }
  const found = () => (Object.keys(checks).length > 1 ? checks : undefined);
  // Face match against the plate (the Likeness chart and the keep-best read it).
  const plate = report.plate;
  const plateUrl = plate?.imageUrl?.includes('/api/comfyui/view?')
    ? plate.imageUrl
    : comfyInputViewUrl(plate?.filename);
  if (!solo) {
    // Two in frame, she on her side (script-shots.ts poseLead): her face there. A scene's master
    // that drew someone else in her place gave every shot cut from it that face (the flagship's
    // hardware store, 2026-11-18) — and the check above only looks at her alone.
    const side = report.slot.poseLead;
    if (plateUrl && side) {
      const measured = await (input.leadFaceMatch ?? measureLeadFaceInComfy)({
        imageUrl: input.imageUrl,
        referenceUrl: plateUrl,
        side: side === 'left' ? 'leftmost' : 'rightmost',
        comfyUrl: input.comfyUrl,
      }).catch(() => null);
      if (measured) {
        checks.face = measured.similarity;
        checks.faceMiss = measured.similarity < STILL_MIN_FACE_MATCH;
      }
    }
    return found();
  }

  if (plateUrl) {
    const measured = await (input.faceMatch ?? measureFaceMatchInComfy)({
      referenceUrl: plateUrl,
      imageUrl: input.imageUrl,
      comfyUrl: input.comfyUrl,
    }).catch(() => null);
    if (measured?.available) {
      checks.face = measured.similarity;
      checks.faceMiss = measured.similarity < STILL_MIN_FACE_MATCH;
    }
  }

  // Her marks (glasses, tattoos that should show).
  const character: CharacterRecord | undefined = report.character;
  const marks = character?.marks;
  const expected = checkableMarks(marks, {
    outfit: report.prompt ?? report.slot.sceneHints,
    beat: report.slot.sceneHints,
    undressed: isDayAdultMood(mood),
  });
  if (expected.length && report.toolSettings.checkMarks !== false) {
    const reading = await (input.readMarks ?? readMarksInStill)({
      imageDataUrl: await still(),
      llm,
    }).catch(() => null);
    if (reading) {
      const issues = marksCheckVerdict(reading, expected, marks).issues;
      if (issues.length) checks.marksMissing = marksCheckNote(issues);
    }
  }
  return found();
}
