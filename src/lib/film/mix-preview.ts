/**
 * Preview the mix: the music bed and the talking clips' lines, played together in the browser
 * at the Cut options' levels, each line where the server encode will put it (cut-timeline.ts),
 * the music ducked under every line — before spending an encode (roadmap review 2026-10-11:
 * "preview dialogue and music together before exporting"). Sound only; the reel shows picture.
 */

import { clipTrimWindow } from '../clip/trim';
import { cutJoins, cutStarts, filmSpeechStarts, type CutTimelineKind } from '../video/cut-timeline';
import { probeMediaDurationSec } from './cut-media';
import { DEFAULT_STILL_HOLD_SEC, type FilmPlaylistShot } from '../media/kind';
import { normalizeMusicLevel, normalizeVoiceLevel } from '../audio/mix-levels';
import { TITLE_CARD_SEC } from '../video/polish';

/** The music sits at this share of its level under a line (the encode's sidechain, roughly). */
export const PREVIEW_DUCK = 0.35;

export type MixPlan = {
  lines: Array<{ shot: number; startSec: number; fromSec: number; durSec: number }>;
  totalSec: number;
};

/**
 * Where each clip's sound plays in the cut, from shot lengths (clips: their trimmed length).
 * Every clip is a candidate; ones without sound are skipped when decoded.
 */
export function planMix(input: {
  shots: FilmPlaylistShot[];
  clipSecs: Array<number | null>;
  crossfadeSec: number;
  titleCard: boolean;
}): MixPlan {
  const kinds: CutTimelineKind[] = [
    ...(input.titleCard ? (['title'] as const) : []),
    ...input.shots.map(shot => shot.kind),
  ];
  const offset = input.titleCard ? 1 : 0;
  const holdSecs: number[] = [
    ...(input.titleCard ? [TITLE_CARD_SEC] : []),
    ...input.shots.map((shot, index) => {
      if (shot.kind !== 'clip') return shot.holdSec ?? DEFAULT_STILL_HOLD_SEC;
      const full = input.clipSecs[index] ?? null;
      const trim = clipTrimWindow(shot, full);
      const end = trim.end ?? full ?? 4;
      return Math.max(0.5, end - trim.start);
    }),
  ];
  const transitions = [
    ...(input.titleCard ? [undefined] : []),
    ...input.shots.map(shot => shot.transitionIn),
  ];
  const starts = filmSpeechStarts({
    kinds,
    holdSecs,
    crossfadeSec: input.crossfadeSec,
    transitions,
    speech: kinds.map(kind => kind === 'clip'),
  });
  const totalSec = cutStarts(
    holdSecs,
    cutJoins({ count: kinds.length, crossfadeSec: input.crossfadeSec, transitions }).overlaps
  ).total;
  return {
    lines: starts.map(start => {
      const shot = input.shots[start.index - offset]!;
      return {
        shot: start.index - offset,
        startSec: start.startSec,
        fromSec: clipTrimWindow(shot, input.clipSecs[start.index - offset] ?? null).start,
        durSec: start.holdSec,
      };
    }),
    totalSec: Math.round(totalSec * 100) / 100,
  };
}

async function decode(context: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    // No sound track (a silent WAN clip), or a format the browser can't decode.
    return null;
  }
}

export type MixPreview = { stop: () => void; totalSec: number; lines: number };

/** Start playing the mix; resolves once it is playing (or throws when there is nothing to hear). */
export async function playMixPreview(input: {
  shots: FilmPlaylistShot[];
  audioBedUrl?: string;
  crossfadeSec: number;
  titleCard: boolean;
  musicLevel?: number;
  voiceLevel?: number;
  /** Muted tracks (M4 F4): the music, the clips' lines. */
  muteMusic?: boolean;
  muteLines?: boolean;
  onEnded?: () => void;
}): Promise<MixPreview> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('This browser cannot play a mix preview.');
  const clipSecs = await Promise.all(
    input.shots.map(shot =>
      shot.kind === 'clip' ? probeMediaDurationSec(shot.url, 'video') : null
    )
  );
  const plan = planMix({
    shots: input.shots,
    clipSecs,
    crossfadeSec: input.crossfadeSec,
    titleCard: input.titleCard,
  });
  const context = new Ctx();
  const [bed, ...voices] = await Promise.all([
    input.audioBedUrl?.trim() && !input.muteMusic
      ? decode(context, input.audioBedUrl)
      : Promise.resolve(null),
    ...(input.muteLines ? [] : plan.lines).map(line =>
      decode(context, input.shots[line.shot]!.url)
    ),
  ]);
  const heard = (input.muteLines ? [] : plan.lines)
    .map((line, index) => ({ line, buffer: voices[index] ?? null }))
    .filter((entry): entry is { line: MixPlan['lines'][number]; buffer: AudioBuffer } =>
      Boolean(entry.buffer)
    );
  if (!bed && heard.length === 0) {
    void context.close();
    throw new Error(
      input.muteMusic || input.muteLines
        ? 'Nothing to hear — the music or the lines are muted (Tracks, under the timeline).'
        : 'Nothing to hear yet — add music or a talking clip.'
    );
  }
  const at = context.currentTime + 0.1;
  const sources: AudioScheduledSourceNode[] = [];
  const music = normalizeMusicLevel(input.musicLevel);
  if (bed) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(music, at);
    for (const { line } of heard) {
      gain.gain.setTargetAtTime(music * PREVIEW_DUCK, at + line.startSec, 0.03);
      gain.gain.setTargetAtTime(music, at + line.startSec + line.durSec, 0.15);
    }
    const source = context.createBufferSource();
    source.buffer = bed;
    source.connect(gain).connect(context.destination);
    source.start(at, 0, Math.min(bed.duration, plan.totalSec));
    sources.push(source);
  }
  const voice = normalizeVoiceLevel(input.voiceLevel);
  for (const { line, buffer } of heard) {
    const gain = context.createGain();
    gain.gain.value = voice;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.start(at + line.startSec, line.fromSec, line.durSec);
    sources.push(source);
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already ended
      }
    }
    void context.close();
  };
  const timer = window.setTimeout(
    () => {
      stop();
      input.onEnded?.();
    },
    (plan.totalSec + 0.4) * 1000
  );
  return {
    stop: () => {
      window.clearTimeout(timer);
      stop();
    },
    totalSec: plan.totalSec,
    lines: heard.length,
  };
}
