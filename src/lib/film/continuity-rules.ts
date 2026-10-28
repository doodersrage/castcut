/**
 * Cross-shot continuity rules (M2 C4, ROADMAP §5.5 layer 1): deterministic findings from
 * comparing the film's shots in order, using each shot's state (shot-state.ts) — nothing a
 * vision model guesses. All warn; none stops a cut (only objectively required checks may).
 *
 * - `outfit-jump`: two shots in a row at the same place and time of day, but in another outfit
 *   or look, with no change stated on the later one (its own look or clothing picked by hand).
 * - `look-mismatch`: a shot rendered in another look than the one its slot or scene uses now
 *   (the Cast's active look switched after it was made).
 * - `plate-drift`: the look a shot uses has a plate the likeness guard flagged.
 * - `state-dropped` (M8 T6): an earlier shot of the same Cast at the same story time — the same
 *   story day and time of day — carries something over (her red umbrella, a bandaged hand) that
 *   this shot doesn't have. Story time, not the edit's order, decides "the same time"; the edit's
 *   order decides which shot came first.
 * Pure.
 */
import type { ContinuityFinding } from '../checks/findings';
import type { ShotState } from './shot-state';

export type RuleShot = {
  key: string;
  title: string;
  state: ShotState;
  /** The look its render was made in (its Gallery entry's `lookId`), when known. */
  renderedLookId?: string;
  renderedLookName?: string;
  /** The picture, for the finding's evidence. */
  pictureUrl?: string;
};

export type CrossShotFinding = { finding: ContinuityFinding; shotKey: string; shotTitle: string };

const same = (a?: string, b?: string) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** What earlier shots at the same story time carry over that `state` doesn't have (M8 T6). */
export function droppedCarriedState(
  earlier: readonly RuleShot[],
  state: ShotState
): Array<{ text: string; from: string }> {
  if (!state.time) return [];
  const has = new Set(
    [...(state.carries ?? []), ...(state.changes ?? [])].map(item => item.text.toLowerCase())
  );
  const out = new Map<string, { text: string; from: string }>();
  for (const shot of earlier) {
    const before = shot.state;
    if (
      before.time !== state.time ||
      before.storyDay !== state.storyDay ||
      !same(before.castName, state.castName)
    ) {
      continue;
    }
    for (const item of [...(before.carries ?? []), ...(before.changes ?? [])]) {
      const key = item.text.toLowerCase();
      if (item.carriesOver && !has.has(key) && !out.has(key)) {
        out.set(key, { text: item.text, from: shot.title });
      }
    }
  }
  return [...out.values()];
}

/** Findings for the film's included shots, in film order. */
export function crossShotFindings(
  shots: readonly RuleShot[],
  options: { lookDrifted?: (castId: string, lookId: string) => boolean } = {}
): CrossShotFinding[] {
  const out: CrossShotFinding[] = [];
  const add = (
    shot: RuleShot,
    rule: ContinuityFinding['rule'],
    evidence: string,
    suggestion: string
  ) =>
    out.push({
      finding: {
        id: `${shot.key}:${rule}`,
        rule,
        subject: shot.key,
        severity: 'warns',
        source: 'Continuity',
        evidence,
        ...(shot.pictureUrl ? { evidenceUrl: shot.pictureUrl } : {}),
        suggestion,
      },
      shotKey: shot.key,
      shotTitle: shot.title,
    });

  shots.forEach((shot, index) => {
    const { state } = shot;
    const previous = shots[index - 1];
    const dropped = droppedCarriedState(shots.slice(0, index), state);
    if (dropped.length) {
      add(
        shot,
        'state-dropped',
        `${dropped.map(entry => `${entry.text} (from “${entry.from}”)`).join(', ')} — not in this shot, at the same story time`,
        'Add it to this shot’s story state, or say it is fine (it was put down, or healed).'
      );
    }
    if (
      previous &&
      state.place &&
      state.time &&
      same(previous.state.place, state.place) &&
      previous.state.time === state.time &&
      same(previous.state.castName, state.castName) &&
      !state.changeStated
    ) {
      const outfitChanged =
        previous.state.outfit && state.outfit && !same(previous.state.outfit, state.outfit);
      const lookChanged =
        previous.state.lookId && state.lookId && previous.state.lookId !== state.lookId;
      if (outfitChanged || lookChanged) {
        const what = outfitChanged
          ? `${previous.state.outfit} → ${state.outfit}`
          : `${previous.state.look ?? 'one look'} → ${state.look ?? 'another'}`;
        add(
          shot,
          'outfit-jump',
          `Same place and time as “${previous.title}”, but ${what}`,
          'Wear the same here, or pick the change in the slot so it is meant.'
        );
      }
    }
    if (shot.renderedLookId && state.lookId && shot.renderedLookId !== state.lookId) {
      add(
        shot,
        'look-mismatch',
        `Made in ${shot.renderedLookName ?? 'another look'} — it uses ${state.look ?? 'another look'} now`,
        'Redo it in the look it uses now, or keep it as it is.'
      );
    }
    if (state.castId && state.lookId && options.lookDrifted?.(state.castId, state.lookId)) {
      add(
        shot,
        'plate-drift',
        `${state.look ?? 'Its look'}'s plate doesn't match the Cast's face`,
        'Check the look on the Cast page (Earlier plates), then redo the shot.'
      );
    }
  });
  return out;
}
