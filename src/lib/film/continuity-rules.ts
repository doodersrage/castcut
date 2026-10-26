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
