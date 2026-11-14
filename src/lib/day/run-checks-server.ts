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
import { measureFaceMatchInComfy } from '@/lib/face/match-server';
import type { GalleryPlayChecks } from '@/lib/gallery/comfyui-gallery-entry';
import { parseLlmRequestOptions, sharedLlmRequestBody } from '@/lib/llm/request-options';
import type { PictureIo } from '@/lib/media/picture-io';
import { reviewOutfitLabel } from '@/lib/play/slot-quality';
import type { SharedToolSettings } from '@/lib/settings/cache';
import { outfitWearerFor } from '@/lib/still/outfit-check';
import { checkOutfitInStill } from '@/lib/still/outfit-check-server';
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
  /** Tests replace the vision checks and the face match. */
  outfitCheck?: typeof checkOutfitInStill;
  readMarks?: typeof readMarksInStill;
  faceMatch?: typeof measureFaceMatchInComfy;
}): Promise<GalleryPlayChecks | undefined> {
  const { report, shared } = input;
  if (report.slot.placeOnly) return undefined;
  const autoReview = report.toolSettings.autoReviewStills === true;
  const { solo, outfit, wearer, mood } = serverChecksPlan(report, autoReview);
  if (!solo && !wearer) return undefined;
  const llm = parseLlmRequestOptions(sharedLlmRequestBody(shared));
  const checks: GalleryPlayChecks = { at: Date.now() };
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
  if (!solo) return found();

  // Face match against the plate (the Likeness chart and the keep-best read it).
  const plate = report.plate;
  const plateUrl = plate?.imageUrl?.includes('/api/comfyui/view?')
    ? plate.imageUrl
    : comfyInputViewUrl(plate?.filename);
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
