/**
 * Delivery check before a cut: what the film would leave out or get wrong, said before the
 * encode instead of after watching it. Pure — the file probe (missing file, black frames, a
 * talking clip with no sound) runs on the server (film-delivery-check-server.ts); the rest is
 * read off the Day / Story state.
 *
 * Roadmap review (2026-10-11): a slot whose clip failed quietly fell back to its still, a slot
 * still rendering was quietly left out, and nothing said which checks had actually run.
 */

/** What the server read off one shot's file. */
export type ShotProbe = {
  key: string;
  /** The file could not be fetched (the reason, e.g. "HTTP 404"). */
  missing?: string;
  /** Share of sampled frames that are black (0–1); unset when the frames couldn't be read. */
  blackShare?: number;
  /** Longest black run in a clip, seconds. */
  blackRunSec?: number;
  /** The clip has a sound track. Unset for stills / when not asked. */
  hasAudio?: boolean;
  /** Loudest moment of the sound track, dB (unset when there is none). */
  maxVolumeDb?: number;
  durationSec?: number;
};

/** `missing` when the file's host (ComfyUI) could not be reached — not proof it's gone. */
export const SHOT_SOURCE_UNREACHABLE = 'unreachable';

/** Mean frame brightness (0–255) below which a frame counts as black. */
export const BLACK_FRAME_LUMA = 20;
/** A clip this much black is "mostly black". */
export const MOSTLY_BLACK_SHARE = 0.8;
/** A black run this long inside a clip is worth a look (fades are shorter). */
export const BLACK_RUN_SEC = 1.5;
/** A sound track whose loudest moment is below this is silent. */
export const SILENT_MAX_DB = -45;

/** Why a probed shot needs a look before the cut (empty: it's fine). */
export function shotDeliveryReasons(
  probe: ShotProbe | undefined,
  kind: 'still' | 'clip',
  options?: { expectSpeech?: boolean }
): string[] {
  if (!probe) return [];
  if (probe.missing === SHOT_SOURCE_UNREACHABLE) {
    return ["couldn't read the file — is ComfyUI running?"];
  }
  if (probe.missing) return [`the file is missing (${probe.missing})`];
  const reasons: string[] = [];
  if (typeof probe.blackShare === 'number') {
    if (kind === 'still' && probe.blackShare >= 1) reasons.push('the picture is black');
    else if (kind === 'clip' && probe.blackShare >= MOSTLY_BLACK_SHARE)
      reasons.push('the clip is mostly black');
    else if (kind === 'clip' && (probe.blackRunSec ?? 0) >= BLACK_RUN_SEC)
      reasons.push(`the clip goes black for ${Math.round(probe.blackRunSec! * 10) / 10} s`);
  }
  if (kind === 'clip' && options?.expectSpeech) {
    if (probe.hasAudio === false) reasons.push("no sound — its line won't be heard");
    else if (typeof probe.maxVolumeDb === 'number' && probe.maxVolumeDb < SILENT_MAX_DB)
      reasons.push("the sound is silent — its line won't be heard");
  }
  return reasons;
}

/** Brightness stats from sampled gray frames (`frameSize` bytes each). */
export function blackStats(
  gray: Uint8Array,
  frameSize: number,
  fps: number
): { blackShare: number; blackRunSec: number; frames: number } | null {
  const frames = Math.floor(gray.length / frameSize);
  if (frames === 0) return null;
  let black = 0;
  let run = 0;
  let longest = 0;
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = f * frameSize; i < (f + 1) * frameSize; i += 1) sum += gray[i]!;
    if (sum / frameSize < BLACK_FRAME_LUMA) {
      black += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { blackShare: black / frames, blackRunSec: longest / fps, frames };
}

/** The loudest moment ffmpeg's volumedetect printed, or null. */
export function parseMaxVolumeDb(stderr: string): number | null {
  const match = stderr.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/);
  if (!match) return null;
  return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
}

type SlotLike = { id: string; label: string; line?: string };
type StillLike = {
  slotId: string;
  status?: 'queued' | 'running' | 'completed' | 'error';
  imageUrl?: string;
  clipStatus?: 'queued' | 'running' | 'completed' | 'error';
  clipUrl?: string;
};

/**
 * Day: what the cut will quietly do with each slot — leave it out (no still yet / the still
 * failed), use the still instead of the clip (the clip failed / is still rendering), or play a
 * line silent (no talking clip). Notes, not blockers.
 */
export function dayCutNotes(slots: SlotLike[], stills: StillLike[]): string[] {
  const bySlot = new Map(stills.map(still => [still.slotId, still]));
  const notes: string[] = [];
  for (const slot of slots) {
    const still = bySlot.get(slot.id);
    const clipDone = still?.clipStatus === 'completed' && Boolean(still.clipUrl?.trim());
    const stillDone = still?.status === 'completed' && Boolean(still.imageUrl?.trim());
    if (!clipDone && !stillDone) {
      notes.push(
        still?.status === 'error'
          ? `${slot.label}: the still failed — left out`
          : still?.status === 'queued' || still?.status === 'running'
            ? `${slot.label}: still rendering — left out`
            : `${slot.label}: not rendered — left out`
      );
      continue;
    }
    if (!clipDone && still?.clipStatus === 'error') {
      notes.push(`${slot.label}: the clip failed — its still is used`);
    } else if (!clipDone && (still?.clipStatus === 'queued' || still?.clipStatus === 'running')) {
      notes.push(`${slot.label}: clip still rendering — its still is used`);
    }
    if (slot.line?.trim() && !clipDone) {
      notes.push(`${slot.label}: its line won't be heard (no talking clip)`);
    }
  }
  return notes;
}

/**
 * Which checks have run on the shots going into the cut: "Checked: faces 3 of 4 · pose 4 of 4
 * · Not checked: auto-review". Files / black frames / sound are checked when Cut is pressed.
 */
export function cutChecksCoverage(input: {
  shotCount: number;
  faceChecked: number;
  poseChecked: number;
  /** Auto-review is on (null: this surface has none). */
  reviewOn?: boolean | null;
}): { checked: string[]; notChecked: string[] } {
  const checked: string[] = [];
  const notChecked: string[] = [];
  const count = (label: string, done: number) => {
    if (input.shotCount === 0) return;
    if (done <= 0) notChecked.push(label);
    else checked.push(done >= input.shotCount ? label : `${label} ${done} of ${input.shotCount}`);
  };
  count('faces', input.faceChecked);
  count('pose', input.poseChecked);
  if (input.reviewOn === true) checked.push('auto-review');
  else if (input.reviewOn === false) notChecked.push('auto-review');
  return { checked, notChecked };
}

export function cutChecksCoverageLine(coverage: {
  checked: string[];
  notChecked: string[];
}): string {
  const parts = [
    coverage.checked.length ? `Checked: ${coverage.checked.join(', ')}` : '',
    coverage.notChecked.length ? `Not checked: ${coverage.notChecked.join(', ')}` : '',
    'files, black frames and sound are checked when you cut',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Fold the file probe's reasons into the pre-cut problems (one row per shot). */
export function mergeDeliveryProblems<P extends { key: string; title: string; reasons: string[] }>(
  problems: P[],
  shots: ReadonlyArray<{ key: string; title: string }>,
  delivery: Map<string, string[]> | null | undefined
): Array<P | { key: string; title: string; reasons: string[] }> {
  if (!delivery || delivery.size === 0) return problems;
  const out: Array<P | { key: string; title: string; reasons: string[] }> = problems.map(
    problem => {
      const extra = delivery.get(problem.key);
      return extra
        ? { ...problem, reasons: [...new Set([...extra, ...problem.reasons])] }
        : problem;
    }
  );
  const seen = new Set(problems.map(problem => problem.key));
  for (const shot of shots) {
    const extra = delivery.get(shot.key);
    if (extra && !seen.has(shot.key))
      out.push({ key: shot.key, title: shot.title, reasons: extra });
  }
  return out;
}

/** Story: the same coverage line from each beat's own face / pose match. */
export function storyCutCoverageLine(
  story: ReadonlyArray<{
    id: string;
    at: number | string;
    imageUrl?: string;
    faceMatch?: { imageUrl: string };
    poseMatch?: { imageUrl: string };
  }>,
  shotKeys: string[]
): string {
  const byKey = new Map(story.map(beat => [`${beat.id}@${beat.at}`, beat]));
  let face = 0;
  let pose = 0;
  for (const key of shotKeys) {
    const beat = byKey.get(key);
    const url = beat?.imageUrl?.trim();
    if (beat?.faceMatch && beat.faceMatch.imageUrl === url) face += 1;
    if (beat?.poseMatch && beat.poseMatch.imageUrl === url) pose += 1;
  }
  return cutChecksCoverageLine(
    cutChecksCoverage({ shotCount: shotKeys.length, faceChecked: face, poseChecked: pose })
  );
}
