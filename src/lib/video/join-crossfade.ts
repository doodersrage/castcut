/**
 * A hard cut's sound crossfaded (the after-release list, 2026-11-18): at a straight cut between
 * two clips with sound, the picture is cut two frames inside each clip and each clip's sound
 * plays on through those frames, so both sides have sound to overlap; the two fade across the cut
 * over JOIN_CROSSFADE_SEC (equal power). Without it each side faded out and in over 8 ms — the
 * room and voices snapped at every cut. Not a longer version of that edge fade: the overlap is
 * real sound from both clips. Pure.
 */

/** Frames cut from each clip's picture at a hard join (the sound plays on through them). */
export const JOIN_SHAVE_FRAMES = 2;

/** How long the two sides' sound fade across the cut (centred on it). */
export const JOIN_CROSSFADE_SEC = 0.1;

/** A clip shorter than this keeps its frames (the shave would leave too little). */
const JOIN_MIN_HOLD_SEC = 1;

export type JoinCrossfadeInput = {
  kinds: ReadonlyArray<string>;
  /** Each shot's picture length (seconds), as the cut plays it. */
  holdSecs: ReadonlyArray<number>;
  /** Each clip's in point (null: from its start). */
  trimStarts: ReadonlyArray<number | null>;
  /** Each clip's J / L cut sound already set (seconds before / after its picture). */
  soundLeads: ReadonlyArray<number>;
  soundTails: ReadonlyArray<number>;
  /** Whether each shot's sound is in the mix (a clip with sound, not muted). */
  voiced: ReadonlyArray<boolean>;
  /** The join into each shot: its overlap (0: a hard cut) — cut-timeline.ts cutJoins. */
  overlaps: ReadonlyArray<number>;
  speeds?: ReadonlyArray<number>;
  reverses?: ReadonlyArray<boolean>;
  /** A continuous take's join (media/kind.ts chainIn / chainOut): its frames stay. */
  chainIns?: ReadonlyArray<boolean | undefined>;
  chainOuts?: ReadonlyArray<boolean | undefined>;
  fps: number;
};

export type JoinCrossfadePlan = {
  holdSecs: number[];
  trimStarts: Array<number | null>;
  soundLeads: number[];
  soundTails: number[];
  /** The join into shot i crossfades its sound (index 0 never). */
  crossfades: boolean[];
};

export function planJoinCrossfades(input: JoinCrossfadeInput): JoinCrossfadePlan {
  const holdSecs = [...input.holdSecs];
  const trimStarts = [...input.trimStarts];
  const soundLeads = [...input.soundLeads];
  const soundTails = [...input.soundTails];
  const crossfades = input.kinds.map(() => false);
  const shave = JOIN_SHAVE_FRAMES / input.fps;
  const plain = (i: number) =>
    input.kinds[i] === 'clip' &&
    input.voiced[i] === true &&
    (input.speeds?.[i] ?? 1) === 1 &&
    input.reverses?.[i] !== true;
  for (let i = 1; i < input.kinds.length; i += 1) {
    const before = i - 1;
    if ((input.overlaps[i] ?? 0) !== 0) continue;
    if (!plain(before) || !plain(i)) continue;
    // A J / L cut set by hand, or a continuous take's join: left as it is.
    if ((soundTails[before] ?? 0) > 0 || (soundLeads[i] ?? 0) > 0) continue;
    if (input.chainOuts?.[before] || input.chainIns?.[i]) continue;
    if (holdSecs[before]! - shave < JOIN_MIN_HOLD_SEC || holdSecs[i]! - shave < JOIN_MIN_HOLD_SEC)
      continue;
    holdSecs[before] = round(holdSecs[before]! - shave);
    soundTails[before] = round(shave);
    trimStarts[i] = round((trimStarts[i] ?? 0) + shave);
    holdSecs[i] = round(holdSecs[i]! - shave);
    soundLeads[i] = round(shave);
    crossfades[i] = true;
  }
  return { holdSecs, trimStarts, soundLeads, soundTails, crossfades };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A crossfaded join's fades on a clip's sound piece (ffmpeg afade): its sound piece runs `lead`
 * before its picture and `tail` after; the fade is centred on the cut, equal power. Empty when
 * that edge isn't crossfaded.
 */
export function joinCrossfadeFilters(input: {
  pieceSec: number;
  lead: number;
  tail: number;
  fadeIn: boolean;
  fadeOut: boolean;
}): { in: string; out: string } {
  const half = JOIN_CROSSFADE_SEC / 2;
  return {
    in: input.fadeIn
      ? `afade=t=in:st=${Math.max(0, input.lead - half).toFixed(3)}:d=${JOIN_CROSSFADE_SEC}:curve=qsin`
      : '',
    out: input.fadeOut
      ? `afade=t=out:st=${Math.max(0, input.pieceSec - input.tail - half).toFixed(3)}:d=${JOIN_CROSSFADE_SEC}:curve=qsin`
      : '',
  };
}
