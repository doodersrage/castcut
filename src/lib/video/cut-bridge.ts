/**
 * Cut bridges: a short generated clip between two shots — it starts on the last frame of one shot
 * and ends on the first frame of the next, so the film moves from one into the other instead of
 * cutting or fading. Pure (prompt, engine pick, placement); the render is queued from useCutRoom.
 *
 * Live (2026-10-17, three pairs of Day stills — two in different places, one in the same kitchen;
 * first + last frame on MiniMax-H3 and LTX-2.5):
 * - A plain "she moves from her first pose into the second" prompt: H3 cut hard to the end frame
 *   in 3/3 (biggest frame jump 40–70× the typical one), LTX in 1/3.
 * - "One continuous shot with no cut and no fade: the camera glides as the place smoothly
 *   transforms…" (CUT_BRIDGE_PROMPT): no hard cut on either engine (biggest jump 3–7×). H3 moved
 *   her through it — she got up from the floor onto the park bench as the room became the park;
 *   LTX dissolved two ghosted bodies across each other between different places (clean only in
 *   the same place). So H3 first, LTX-2.5 when H3 isn't installed.
 */

export const CUT_BRIDGE_PROMPT =
  'One continuous shot with no cut and no fade: the camera glides as the place smoothly transforms from the first scene into the second, and she moves in one fluid motion from her first pose into the second.';

/** H3 when this ComfyUI has its node, else LTX-2.5 (dissolves between different places). */
export function cutBridgeEngine(
  nodeTypes: ReadonlySet<string> | null | undefined,
  h3Node: string
): 'minimax-h3' | 'ltx-video-2.5' {
  return nodeTypes?.has(h3Node) ? 'minimax-h3' : 'ltx-video-2.5';
}

/** A bridge's frames: about 3 s — long enough to move, short enough not to stall the film. */
export const CUT_BRIDGE_FRAMES = 49;

export type CutBridgeStatus = 'rendering' | 'ready' | 'failed';

/**
 * The shot order with the bridge right after `fromKey` (any earlier copy of it moved there), and
 * a hard cut into the bridge. The join out of it (into `toKey`) turns into a hard cut when the
 * bridge has rendered (cutBridgeReadyEdits) — until then the two shots join as they did.
 */
export function placeCutBridge<E extends { transition?: string }>(input: {
  order: string[];
  shots: Record<string, E> | undefined;
  fromKey: string;
  toKey: string;
  bridgeKey: string;
}): { order: string[]; shots: Record<string, E> } {
  const rest = input.order.filter(key => key !== input.bridgeKey);
  const at = rest.indexOf(input.fromKey) + 1;
  const order =
    at > 0
      ? [...rest.slice(0, at), input.bridgeKey, ...rest.slice(at)]
      : [...rest, input.bridgeKey];
  const shots = { ...(input.shots ?? {}) } as Record<string, E>;
  shots[input.bridgeKey] = { ...(shots[input.bridgeKey] ?? ({} as E)), transition: 'cut' };
  return { order, shots };
}

/**
 * Shot edits once a bridge has rendered (`ready`: a hard cut out of it — its last frame is the
 * next shot's first, so a fade would show it twice) or is removed (the next shot's join as it
 * was before the bridge).
 */
export function cutBridgeJoinEdits<E extends { transition?: string }>(
  shots: Record<string, E> | undefined,
  toKey: string,
  next: { ready: true } | { ready: false; toWas?: string }
): Record<string, E> {
  const out = { ...(shots ?? {}) } as Record<string, E>;
  const own = { ...(out[toKey] ?? ({} as E)) };
  if (next.ready) own.transition = 'cut';
  else if (next.toWas) own.transition = next.toWas;
  else delete own.transition;
  out[toKey] = own;
  return out;
}

/** The shot after `key` among those in the film (left-out shots skipped), or null. */
export function nextIncludedShot<S extends { key: string }>(
  ordered: S[],
  key: string,
  included: (shot: S) => boolean
): S | null {
  const index = ordered.findIndex(shot => shot.key === key);
  if (index < 0) return null;
  return ordered.slice(index + 1).find(included) ?? null;
}
