/**
 * Whether the Image 3 pose guide actually reached the queue, per slot.
 *
 * The guide is built on a canvas and uploaded to ComfyUI; both steps can fail (no canvas, upload
 * rejected, Comfy unreachable) and both used to be swallowed silently. A still then queues with
 * only Image 1, so it keeps the plate's stance — which reads as "posing is broken" with nothing
 * anywhere saying why. These helpers turn that into one readable line.
 */

export type PoseGuideState = 'attached' | 'skipped' | 'failed';

export type PoseGuideOutcome = {
  slotId: string;
  slotLabel: string;
  state: PoseGuideState;
  /** Why, for `skipped` (by design) and `failed` (the error). */
  reason?: string;
  /** Model the still queued on, and whether it can actually consume Image 3 as an edit. */
  model?: string;
  editCapableModel?: boolean;
  /** Image 3 art that was drawn (attached only). */
  style?: 'openpose' | 'legacy';
  /** ComfyUI view URL of the uploaded guide, for the Day board preview. */
  previewUrl?: string;
};

export type PoseGuidePreview = { slotId: string; slotLabel: string; url: string };

/** Attached guides with a viewable upload, in slot order. */
export function poseGuidePreviews(outcomes: PoseGuideOutcome[]): PoseGuidePreview[] {
  return outcomes.flatMap(entry =>
    entry.state === 'attached' && entry.previewUrl
      ? [{ slotId: entry.slotId, slotLabel: entry.slotLabel, url: entry.previewUrl }]
      : []
  );
}

/** Readable one-liner from whatever the build/upload threw. */
export function poseGuideFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  if (!message) {
    return 'unknown error';
  }
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}

function labels(outcomes: PoseGuideOutcome[], state: PoseGuideState): string[] {
  return outcomes.filter(entry => entry.state === state).map(entry => entry.slotLabel);
}

function firstReason(outcomes: PoseGuideOutcome[], state: PoseGuideState): string {
  return (
    outcomes.find(entry => entry.state === state && entry.reason?.trim())?.reason?.trim() ?? ''
  );
}

function list(values: string[]): string {
  if (values.length <= 2) {
    return values.join(' and ');
  }
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * One status line for the Day board, or null before anything has queued.
 * Failures lead, because that is the case where the stills silently keep the plate's pose.
 */
export function summarizePoseGuideOutcomes(outcomes: PoseGuideOutcome[]): string | null {
  if (outcomes.length === 0) {
    return null;
  }
  const failed = labels(outcomes, 'failed');
  const skipped = labels(outcomes, 'skipped');
  const attached = labels(outcomes, 'attached');

  // A guide that attached on a text-to-image model is worse than no guide: the wireframe is
  // just another image to copy from, which is the "schematic bleed" failure.
  const bleeding = outcomes.filter(
    entry => entry.state === 'attached' && entry.editCapableModel === false
  );
  if (bleeding.length > 0) {
    const model = bleeding.find(entry => entry.model?.trim())?.model?.trim();
    return `Pose guide attached on a non-Edit model${
      model ? ` (${model})` : ''
    } — the guide will bleed into the still. Switch the Day engine to an Edit model.`;
  }
  if (failed.length > 0) {
    const reason = firstReason(outcomes, 'failed');
    return `Pose guide failed on ${list(failed)}${reason ? ` — ${reason}` : ''}. Those stills keep the plate's pose.`;
  }
  if (skipped.length > 0 && attached.length === 0) {
    const reason = firstReason(outcomes, 'skipped');
    return `Pose guide off on ${list(skipped)}${reason ? ` — ${reason}` : ''}. Stance comes from the prompt text.`;
  }
  if (skipped.length > 0) {
    const reason = firstReason(outcomes, 'skipped');
    return `Pose guide on ${attached.length} of ${outcomes.length} slots; off on ${list(skipped)}${
      reason ? ` — ${reason}` : ''
    }.`;
  }
  const openPose = outcomes.some(entry => entry.state === 'attached' && entry.style === 'openpose');
  return `Pose guide${openPose ? ' (OpenPose)' : ''} attached on ${attached.length} of ${
    outcomes.length
  } ${outcomes.length === 1 ? 'slot' : 'slots'}.`;
}

/** Upsert one slot's outcome, keeping slot order stable. */
export function recordPoseGuideOutcome(
  outcomes: PoseGuideOutcome[],
  next: PoseGuideOutcome
): PoseGuideOutcome[] {
  const index = outcomes.findIndex(entry => entry.slotId === next.slotId);
  if (index < 0) {
    return [...outcomes, next];
  }
  const copy = [...outcomes];
  copy[index] = next;
  return copy;
}
