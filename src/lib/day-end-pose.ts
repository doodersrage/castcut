/**
 * Day "End pose": a clip that starts on the slot's still and lands on a second picture of the
 * same Cast — another finished Day still, or a short same-camera edit of the start still
 * ("Re-pose this still"). WAN wires it as WanFirstLastFrameToVideo, LTX-2.5 as a last-frame
 * LTXVAddGuide (see ltx25-renderer.ts).
 *
 * Live (2026-10-03, Rapid AIO WAN 2.2 + LTX-2.5 distilled, Day still → edited end): both engines
 * moved through to the end pose when the end kept the start's framing; a different camera
 * framing (another slot's still) made both cut hard to the end frame instead of moving there.
 */

import { LTX25_END_GUIDE_NODES, isLtx25Model, WAN_FIRST_LAST_FRAME_NODE } from './ltx25-renderer';

export type DayEndPoseSource = 'still' | 'edit';

export type DayEndPose = {
  /** The picture the clip ends on. */
  imageUrl: string;
  /** Its ComfyUI input filename, when already uploaded. */
  filename?: string;
  /** Another Day still, or a same-camera edit of this slot's still. */
  source: DayEndPoseSource;
  /** The slot whose still was picked (source 'still'). */
  fromSlotId?: string;
  /** The start take this end pose was made for — a requeued still drops it. */
  forTake?: string;
  /** What the re-pose edit asked for (source 'edit'); the clip prompt names it too. */
  poseWords?: string;
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeDayEndPose(value: unknown): DayEndPose | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const imageUrl = text(record.imageUrl, 2048);
  if (!imageUrl) return undefined;
  const source: DayEndPoseSource = record.source === 'edit' ? 'edit' : 'still';
  const filename = text(record.filename, 400);
  const fromSlotId = text(record.fromSlotId, 64);
  const forTake = text(record.forTake, 160);
  const poseWords = text(record.poseWords, 240);
  return {
    imageUrl,
    source,
    ...(filename ? { filename } : {}),
    ...(fromSlotId ? { fromSlotId } : {}),
    ...(forTake ? { forTake } : {}),
    ...(poseWords ? { poseWords } : {}),
  };
}

/** The end pose to use for this still's clip — none when it was made for an earlier take. */
export function activeDayEndPose(
  still: { promptId?: string; endPose?: DayEndPose } | undefined
): DayEndPose | undefined {
  const endPose = still?.endPose;
  if (!endPose?.imageUrl) return undefined;
  if (endPose.forTake && still?.promptId && endPose.forTake !== still.promptId) return undefined;
  return endPose;
}

/** ComfyUI nodes the end pose needs on the engine the clip queues on. */
export function dayEndPoseRequiredNodes(clipEngine: string): readonly string[] {
  return isLtx25Model(clipEngine) ? LTX25_END_GUIDE_NODES : [WAN_FIRST_LAST_FRAME_NODE];
}

/**
 * Whether this server can render an end pose on `clipEngine` (null node list = not known yet,
 * treated as no). Hunyuan / other video models have no first+last wiring here.
 */
export function dayEndPoseSupported(
  clipEngine: string,
  nodeTypes: ReadonlySet<string> | null | undefined
): boolean {
  if (!nodeTypes || nodeTypes.size === 0) return false;
  if (!isLtx25Model(clipEngine) && !/wan/i.test(clipEngine)) return false;
  return dayEndPoseRequiredNodes(clipEngine).every(type => nodeTypes.has(type));
}

export const DAY_END_POSE_FRAMING_WARNING =
  'A different camera framing makes the clip cut — it jumps to the end pose instead of moving there.';

/** Warn when the end still comes from another slot (its own camera framing). */
export function dayEndPoseFramingWarning(
  slotId: string,
  endPose: DayEndPose | undefined
): string | null {
  return endPose?.source === 'still' && endPose.fromSlotId && endPose.fromSlotId !== slotId
    ? DAY_END_POSE_FRAMING_WARNING
    : null;
}

/** Other finished stills of this Day (same Cast) that can be the end frame. */
export function dayEndPoseCandidates<
  T extends { slotId: string; status?: string; imageUrl?: string },
>(stills: T[], slotId: string): T[] {
  return stills.filter(
    still => still.slotId !== slotId && still.status === 'completed' && Boolean(still.imageUrl)
  );
}

/**
 * "Re-pose this still": a short same-camera edit of the start still. Short on purpose — the
 * distilled edit stacks drift on long briefs, and a changed camera makes the clip cut.
 */
export function buildDayEndPoseEditPrompt(
  poseWords: string,
  noun: 'woman' | 'man' | 'person' = 'person'
): string {
  const pose = poseWords.trim().replace(/[.\s]+$/, '');
  const possessive = noun === 'man' ? 'his' : noun === 'woman' ? 'her' : 'their';
  return [
    'Edit Image 1: the same person, same clothes, same place and camera framing,',
    `now ${pose}.`,
    `Keep ${possessive} face, hair, skin tone and body shape exactly; same light. Photoreal.`,
  ].join(' ');
}

export const DAY_END_POSE_EDIT_NEGATIVE =
  'different person, different face, changed clothes, different room, changed camera angle, zoomed, cropped body, extra people, text, blurry';

/** The clip's motion line gains where it ends (non-heat clips). */
export function withDayEndPoseMotion(motion: string, endPose: DayEndPose | undefined): string {
  const words = endPose?.poseWords?.trim().replace(/[.\s]+$/, '');
  if (!words) return motion;
  return `${motion.trim().replace(/[.\s]+$/, '')}; by the end of the clip, ${words}.`;
}
