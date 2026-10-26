/**
 * Continuity findings, one shape (M2 C1, ROADMAP §5.5). About ten checks already look at each
 * render — face and pose match, the marks check, a clip that cuts to another shot or has no
 * sound, the adult gate, your own "Looks wrong" — and each keeps its answer in a field of its own
 * on the Gallery entry. This reads those answers as findings: the rule, what it is about, how
 * much it matters, the evidence, and what to do. A finding's id is stable (subject + rule), so a
 * decision about it (C2) can be kept. Changes no check and stores nothing. Pure.
 */
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

export type ContinuityRule =
  | 'face-miss'
  | 'pose-miss'
  | 'marks-missing'
  | 'clip-cuts'
  | 'clip-silent'
  | 'adult-withheld'
  | 'looks-wrong'
  /** A shot plays media whose source is gone (Cut's pins, film/cut-pins.ts). */
  | 'source-gone'
  /** Cross-shot (film/continuity-rules.ts): the outfit or look changes with no stated change. */
  | 'outfit-jump'
  /** The shot was rendered in another look than the one it uses now. */
  | 'look-mismatch'
  /** The look's plate failed the likeness guard. */
  | 'plate-drift'
  /** Script coverage (day/script-coverage.ts, M3 S5): a planned scene has no establishing shot. */
  | 'coverage-establishing'
  /** A dialogue exchange with no reaction shot. */
  | 'coverage-reaction'
  /** Shots made into Scenes, none with a kept take. */
  | 'coverage-kept';

export type ContinuitySeverity =
  /** Objectively required: the shot can't be used as it is. */
  | 'blocks'
  /** Worth a look; never stops anything on its own (ROADMAP §5.5). */
  | 'warns';

export type ContinuityFinding = {
  /** `${subject}:${rule}` — stable, so a decision about it survives a reload. */
  id: string;
  rule: ContinuityRule;
  /** What it is about: a render's Gallery prompt id, a Cut shot's key, or a script scene. */
  subject: string;
  severity: ContinuitySeverity;
  /** The check that found it, as the app calls it. */
  source: string;
  /** What was measured, in a few words: "Face match 41%". */
  evidence: string;
  /** The picture it is about, when the caller has one. */
  evidenceUrl?: string;
  /** What to do about it. */
  suggestion: string;
};

export type FindingsEntry = Pick<
  ComfyGalleryEntry,
  'promptId' | 'playChecks' | 'adultCheck' | 'playerVerdict'
>;

const percent = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '';

/** The findings the checks already recorded on a render, most serious first. */
export function findingsForGalleryEntry(
  entry: FindingsEntry,
  options: { imageUrl?: string | null } = {}
): ContinuityFinding[] {
  const subject = entry.promptId?.trim();
  if (!subject) return [];
  const url = options.imageUrl?.trim() || undefined;
  const out: ContinuityFinding[] = [];
  const add = (
    rule: ContinuityRule,
    severity: ContinuitySeverity,
    source: string,
    evidence: string,
    suggestion: string
  ) =>
    out.push({
      id: `${subject}:${rule}`,
      rule,
      subject,
      severity,
      source,
      evidence,
      ...(url ? { evidenceUrl: url } : {}),
      suggestion,
    });

  if (entry.adultCheck?.state === 'withheld') {
    add(
      'adult-withheld',
      'blocks',
      'Adult check',
      entry.adultCheck.reason?.trim() ||
        (entry.adultCheck.cause === 'bare'
          ? 'Bare skin on a clothed still'
          : 'Did not read as clearly adult'),
      'Withheld for good — render it again.'
    );
  }
  const checks = entry.playChecks;
  if (checks?.faceMiss) {
    add(
      'face-miss',
      'warns',
      'Face match',
      `Face match ${percent(checks.face) || 'low'}`,
      "Redo the still, or check the look's face lock."
    );
  }
  if (checks?.poseMiss) {
    add(
      'pose-miss',
      'warns',
      'Pose match',
      `Pose match ${percent(checks.pose) || 'low'}`,
      'Redo it, or try another pose.'
    );
  }
  if (checks?.marksMissing?.trim()) {
    add(
      'marks-missing',
      'warns',
      'Marks check',
      `Missing after the repair: ${checks.marksMissing.trim()}`,
      'Redo it, or fix the area.'
    );
  }
  if (typeof checks?.clipCutAt === 'number' && checks.clipCutAt > 0) {
    add(
      'clip-cuts',
      'warns',
      'Clip check',
      `Cuts to another shot at ${checks.clipCutAt.toFixed(1)} s`,
      'Trim the clip before the cut, or make a new take.'
    );
  }
  if (checks?.clipSilent) {
    add(
      'clip-silent',
      'warns',
      'Clip check',
      'A talking clip with no sound',
      'Add the voice, or make the clip again.'
    );
  }
  if (entry.playerVerdict?.verdict === 'looks-wrong') {
    add(
      'looks-wrong',
      'warns',
      'You',
      'You marked it Looks wrong',
      'Redo it, or keep another take.'
    );
  }
  return out;
}

/** A Cut shot pinned to media whose source is gone (the scene deleted, its take let go). */
export function sourceGoneFinding(shotKey: string, imageUrl?: string | null): ContinuityFinding {
  const url = imageUrl?.trim();
  return {
    id: `${shotKey}:source-gone`,
    rule: 'source-gone',
    subject: shotKey,
    severity: 'warns',
    source: 'Cut',
    evidence: 'Its source is gone — it plays the take it was cut with',
    ...(url ? { evidenceUrl: url } : {}),
    suggestion: 'Keep it as it is, or unpin it to let it leave the cut.',
  };
}

/** Whether a finding about `subject` under `rule` was dismissed (C2). */
export function isFindingDismissed(
  decisions: ReadonlyMap<string, { decision: string }>,
  subject: string | undefined,
  rule: ContinuityRule
): boolean {
  const id = subject?.trim();
  return Boolean(id && decisions.get(`${id}:${rule}`)?.decision === 'dismissed');
}
