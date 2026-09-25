/**
 * Per-slot quality gate for Play Day stills.
 *
 * Pure logic only (no fetch, no storage): prompt builder for a single-image vision review,
 * tolerant JSON parser, keep / reroll / flag decision, reroll-budget ledger, and the prompt
 * nudge appended when a slot is requeued. The vision call itself lives in
 * `play-slot-review-server.ts` behind `/api/play-slot-review`.
 *
 * A single-image review cannot compare against the Cast plate, so `faceIntegrity` judges whether
 * the face is coherent and undistorted (not whether it matches the Cast). Identity match stays the
 * job of the IP-Adapter / LoRA locks.
 */

export const SLOT_REVIEW_FLAGS = [
  'extra-person',
  'extra-hands',
  'merged-limbs',
  'wrong-outfit',
  'face-distorted',
  'plastic-skin',
  'text-artifact',
  'cropped-subject',
  'wrong-face',
] as const;

export type SlotReviewFlag = (typeof SLOT_REVIEW_FLAGS)[number];

export type SlotQualityReport = {
  /** 1–5 — face coherent and undistorted (not a Cast match). */
  faceIntegrity: number;
  /** 1–5 — visible clothing matches the expected outfit. */
  outfitMatch: number;
  /** 1–5 — hands, limbs, and body proportions look physically plausible. */
  anatomy: number;
  /**
   * 1–5 — the person matches the reference panel. Only present when the review image was an
   * identity-compare pair; a single still cannot be scored for identity.
   */
  identityMatch?: number;
  flags: SlotReviewFlag[];
  /** One-sentence critique from the reviewer (may be empty). */
  note: string;
};

export type SlotQualityAction = 'keep' | 'reroll' | 'flag';

export type SlotQualityDecision = {
  action: SlotQualityAction;
  /** Human-readable reasons, shown on the slot card when action is not `keep`. */
  reasons: string[];
  /**
   * Soft findings that are worth surfacing but never worth spending GPU time on — identity doubt
   * (a weak signal on a small face) and plastic skin (Skin refine's job, not a reroll's).
   */
  warnings: string[];
  /** Mean of the three 1–5 scores, rounded to one decimal. */
  overall: number;
  /** True when the pose check ran and the still did not follow its guide. */
  poseMiss?: boolean;
  /** True when the measured face match says this is a different person. */
  faceMiss?: boolean;
};

export type SlotQualityPolicy = {
  /** Mean score below this triggers a reroll while budget remains. */
  minOverall: number;
  /** Any single score below this triggers a reroll while budget remains. */
  minSingle: number;
  /** Flags that always trigger a reroll while budget remains. */
  hardFlags: SlotReviewFlag[];
  /** Rerolls allowed per slot before the still is flagged for manual review instead. */
  maxRerolls: number;
  /** identityMatch below this warns (never rerolls — see {@link SlotQualityDecision.warnings}). */
  minIdentity: number;
  /**
   * Pose match (DWPose vs the Image 3 guide, 0–1) below this rerolls while budget remains.
   * Only applies when a pose check ran; uncalibrated starting value.
   */
  minPoseMatch: number;
  /**
   * Measured face match (face-recognition similarity to the Cast plate, 0–1) below this
   * rerolls; below {@link SlotQualityPolicy.warnFaceMatch} it only warns. Uncalibrated.
   */
  minFaceMatch: number;
  warnFaceMatch: number;
};

export const DEFAULT_SLOT_QUALITY_POLICY: SlotQualityPolicy = {
  minOverall: 3.5,
  minSingle: 2,
  hardFlags: ['extra-person', 'extra-hands', 'merged-limbs', 'wrong-outfit', 'face-distorted'],
  maxRerolls: 2,
  minIdentity: 3,
  minPoseMatch: 0.6,
  minFaceMatch: 0.3,
  warnFaceMatch: 0.45,
};

export type SlotReviewContext = {
  beat?: string;
  setting?: string;
  /** Expected outfit, e.g. kit label or BYO garment description. */
  outfit?: string;
  /**
   * Adults the still should show: 1 (Day default), 2, or 'any' when companions / duo beats are
   * allowed — 'any' never raises the extra-person flag.
   */
  expectedPeople?: 1 | 2 | 'any';
  /** The image is a side-by-side identity pair: reference left, new still right. */
  referencePair?: boolean;
};

const FLAG_SET = new Set<string>(SLOT_REVIEW_FLAGS);

function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** System + user prompt for one still review. JSON-only reply keeps parsing cheap. */
export function buildSlotReviewPrompt(context: SlotReviewContext = {}): {
  system: string;
  user: string;
} {
  const expected = context.expectedPeople ?? 1;
  const people =
    expected === 2 ? 'two adults' : expected === 'any' ? 'one or more adults' : 'exactly one adult';
  const pair = context.referencePair === true;
  const system = [
    'You are a strict quality reviewer for a generated photo of one scene in a day-in-the-life film.',
    pair
      ? 'The image is TWO PANELS side by side. LEFT is the reference portrait of the intended person. RIGHT is the new still under review. Score ONLY the right panel, except for identityMatch.'
      : '',
    'Reply with JSON only, no markdown and no reasoning:',
    pair
      ? '{"faceIntegrity":1-5,"outfitMatch":1-5,"anatomy":1-5,"identityMatch":1-5,"flags":["..."],"note":"one sentence"}'
      : '{"faceIntegrity":1-5,"outfitMatch":1-5,"anatomy":1-5,"flags":["..."],"note":"one sentence"}',
    'Scores: 5 = clean, 1 = clearly broken.',
    'faceIntegrity: is the face coherent and undistorted (eyes, mouth, teeth, symmetry)?',
    'outfitMatch: does the visible clothing match the expected outfit?',
    'anatomy: are hands (five fingers, no ghost hands), limbs, and proportions plausible?',
    `flags: zero or more of ${SLOT_REVIEW_FLAGS.join(', ')}.`,
    expected === 'any'
      ? 'Never use extra-person (companions are allowed); use extra-hands for ghost or duplicated hands;'
      : `Use extra-person when the still does not show ${people}; extra-hands for ghost or duplicated hands;`,
    'merged-limbs for fused or tangled limbs; plastic-skin for waxy over-smoothed skin;',
    'text-artifact for garbled lettering; cropped-subject when the subject is cut off awkwardly.',
    pair
      ? 'identityMatch: does the person on the right look like the same individual as the reference on the left (face shape, features, hair)? Judge the person, not the pose, outfit, lighting or crop. If the face on the right is too small or turned away to tell, score 3. Use wrong-face only when they are clearly different people.'
      : 'Never use wrong-face: there is no reference to compare against.',
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [pair ? 'Review the right-hand still.' : 'Review this still.'];
  if (context.outfit?.trim()) {
    lines.push(`Expected outfit: ${context.outfit.trim()}`);
  } else {
    lines.push(
      'No expected outfit given: score outfitMatch 5 unless the clothing clearly clashes with the setting.'
    );
  }
  if (context.setting?.trim()) {
    lines.push(`Setting: ${context.setting.trim()}`);
  }
  if (context.beat?.trim()) {
    lines.push(`Beat: ${context.beat.trim()}`);
  }
  lines.push(`Expected people: ${people}.`);
  if (pair) {
    lines.push('Remember: the left panel is only the identity reference. Review the right panel.');
  }
  return { system, user: lines.join('\n') };
}

/**
 * Outfit text for the reviewer, or undefined when we don't have a human-readable one.
 * `wardrobeLabelFor` falls back to the raw kit id before the catalog loads, and handing the
 * reviewer "kit-a1b2" invites a bogus low outfitMatch (and a wasted reroll), so an unresolved
 * label is treated as "no expected outfit".
 */
export function reviewOutfitLabel(input: {
  customDescription?: string | null;
  wardrobeId?: string | null;
  wardrobeLabel?: string | null;
}): string | undefined {
  const custom = input.customDescription?.trim();
  if (custom) {
    return custom;
  }
  const id = input.wardrobeId?.trim() ?? '';
  const label = input.wardrobeLabel?.trim() ?? '';
  if (!label || label === id) {
    return undefined;
  }
  return label;
}

/** Parse a reviewer reply. Returns null when no JSON object with any score can be found. */
export function parseSlotQualityReport(text: string): SlotQualityReport | null {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const hasScore =
    obj.faceIntegrity !== undefined || obj.outfitMatch !== undefined || obj.anatomy !== undefined;
  if (!hasScore) {
    return null;
  }
  const flags = Array.isArray(obj.flags)
    ? Array.from(
        new Set(
          obj.flags
            .map(flag => String(flag).trim().toLowerCase())
            .filter((flag): flag is SlotReviewFlag => FLAG_SET.has(flag))
        )
      )
    : [];
  return {
    // Missing scores default to 3 (neutral) so a partial reply never auto-passes or auto-fails.
    faceIntegrity: clampScore(obj.faceIntegrity, 3),
    outfitMatch: clampScore(obj.outfitMatch, 3),
    anatomy: clampScore(obj.anatomy, 3),
    // Absent identityMatch stays absent: a single-still review has nothing to compare against,
    // and a defaulted 3 would read as "checked and unsure" rather than "not checked".
    ...(obj.identityMatch === undefined || obj.identityMatch === null
      ? {}
      : { identityMatch: clampScore(obj.identityMatch, 3) }),
    flags,
    note: typeof obj.note === 'string' ? obj.note.trim().slice(0, 240) : '',
  };
}

export function slotQualityOverall(report: SlotQualityReport): number {
  const mean = (report.faceIntegrity + report.outfitMatch + report.anatomy) / 3;
  return Math.round(mean * 10) / 10;
}

const FLAG_LABELS: Record<SlotReviewFlag, string> = {
  'extra-person': 'unexpected number of people',
  'extra-hands': 'ghost or extra hands',
  'merged-limbs': 'merged or tangled limbs',
  'wrong-outfit': 'outfit does not match the Keep',
  'face-distorted': 'distorted face',
  'plastic-skin': 'plastic-looking skin',
  'text-artifact': 'garbled text',
  'cropped-subject': 'subject cropped awkwardly',
  'wrong-face': 'face does not match the reference',
};

export function slotReviewFlagLabel(flag: SlotReviewFlag): string {
  return FLAG_LABELS[flag];
}

/**
 * Decide what to do with a reviewed still.
 * `rerollsUsed` is how many rerolls this slot has already burned.
 * A failing still with budget left → `reroll`; a failing still with none left → `flag`.
 */
export function decideSlotQuality(
  report: SlotQualityReport,
  rerollsUsed: number,
  policy: SlotQualityPolicy = DEFAULT_SLOT_QUALITY_POLICY,
  extras?: { poseMatch?: number | null; faceMatch?: number | null }
): SlotQualityDecision {
  const overall = slotQualityOverall(report);
  const reasons: string[] = [];
  const poseMatch = extras?.poseMatch;
  const poseMiss = typeof poseMatch === 'number' && poseMatch < policy.minPoseMatch;
  if (poseMiss) {
    reasons.push(`pose match ${Math.round(poseMatch * 100)}% — guide not followed`);
  }
  const faceMatch = extras?.faceMatch;
  const faceMiss = typeof faceMatch === 'number' && faceMatch < policy.minFaceMatch;
  if (faceMiss) {
    reasons.push(`face match ${Math.round(faceMatch * 100)}% — not the Cast`);
  }

  for (const flag of report.flags) {
    if (policy.hardFlags.includes(flag)) {
      reasons.push(slotReviewFlagLabel(flag));
    }
  }
  const scores: Array<[string, number]> = [
    ['face', report.faceIntegrity],
    ['outfit', report.outfitMatch],
    ['anatomy', report.anatomy],
  ];
  for (const [label, score] of scores) {
    if (score < policy.minSingle) {
      reasons.push(`${label} score ${score}/5`);
    }
  }
  if (overall < policy.minOverall) {
    reasons.push(`overall ${overall}/5 below ${policy.minOverall}`);
  }

  const warnings: string[] = [];
  if (typeof faceMatch === 'number') {
    // A measured score outranks the vision reviewer's guess about the same question.
    if (!faceMiss && faceMatch < policy.warnFaceMatch) {
      warnings.push(`face match ${Math.round(faceMatch * 100)}%`);
    }
  } else if (report.flags.includes('wrong-face')) {
    warnings.push('face may not match the Cast');
  } else if (
    typeof report.identityMatch === 'number' &&
    report.identityMatch < policy.minIdentity
  ) {
    warnings.push(`face match ${report.identityMatch}/5`);
  }
  if (report.flags.includes('plastic-skin')) {
    warnings.push('plastic-looking skin — try Skin refine');
  }

  if (reasons.length === 0) {
    return { action: 'keep', reasons: [], warnings, overall };
  }
  const budgetLeft = rerollsUsed < Math.max(0, policy.maxRerolls);
  return {
    action: budgetLeft ? 'reroll' : 'flag',
    reasons,
    warnings,
    overall,
    ...(poseMiss ? { poseMiss: true } : {}),
    ...(faceMiss ? { faceMiss: true } : {}),
  };
}

const FLAG_NUDGES: Partial<Record<SlotReviewFlag, string>> = {
  'extra-person': 'Show exactly the expected number of people and no one else.',
  'extra-hands':
    'Each person has exactly two hands with five fingers each; no extra or ghost hands.',
  'merged-limbs': 'Keep every limb separate and clearly attached to the correct body.',
  'wrong-outfit': 'Wear the Keep outfit from Image 2 exactly; do not fall back to street clothes.',
  'face-distorted': 'Face is symmetrical and natural with clear eyes, nose, mouth, and teeth.',
  'plastic-skin': 'Natural skin texture with visible pores; no waxy smoothing.',
  'cropped-subject': 'Frame the whole subject with margin around the head and hands.',
};

/** Prompt nudge for a still whose measured face is not the Cast. */
export const FACE_MISMATCH_NUDGE =
  'Keep the exact Cast face from Image 1 — same face shape, eyes, nose, mouth, skin tone and hair; never a different woman.';

/** Extra prompt lines for a requeued slot, built from the flags that caused the reroll. */
export function slotRerollNudge(flags: SlotReviewFlag[]): string {
  return flags
    .map(flag => FLAG_NUDGES[flag])
    .filter((line): line is string => Boolean(line))
    .join(' ');
}

/** Per-slot reroll ledger, keyed by slot id. Immutable helpers so React state stays simple. */
export type SlotQualityLedger = Record<
  string,
  {
    rerolls: number;
    lastDecision?: SlotQualityAction;
    lastReasons?: string[];
    lastWarnings?: string[];
  }
>;

export function recordSlotDecision(
  ledger: SlotQualityLedger,
  slotId: string,
  decision: SlotQualityDecision
): SlotQualityLedger {
  const prev = ledger[slotId] ?? { rerolls: 0 };
  return {
    ...ledger,
    [slotId]: {
      rerolls: decision.action === 'reroll' ? prev.rerolls + 1 : prev.rerolls,
      lastDecision: decision.action,
      lastReasons: decision.reasons,
      lastWarnings: decision.warnings,
    },
  };
}

export function slotRerollsUsed(ledger: SlotQualityLedger, slotId: string): number {
  return ledger[slotId]?.rerolls ?? 0;
}

export type SlotQualityBadge = {
  tone: 'warn' | 'muted';
  label: string;
  /** Long form for `title` / screen readers; empty when there are no recorded reasons. */
  detail: string;
};

/**
 * Board badge for one slot's latest review: a warning while a still needs a human look, a quiet
 * note once a requeue fixed it. Returns null when the slot passed on its first try.
 */
export function slotQualityBadge(
  ledger: SlotQualityLedger,
  slotId: string
): SlotQualityBadge | null {
  const entry = ledger[slotId];
  if (!entry?.lastDecision) {
    return null;
  }
  const detail = entry.lastReasons?.join(', ') ?? '';
  const warnings = entry.lastWarnings ?? [];
  if (entry.lastDecision === 'flag') {
    return { tone: 'warn', label: 'Check this still', detail };
  }
  if (entry.lastDecision === 'reroll') {
    return { tone: 'warn', label: 'Requeueing…', detail };
  }
  if (warnings.length > 0) {
    // Passed the hard checks, but something is worth a human glance before the cut.
    return { tone: 'muted', label: 'Passed · worth a look', detail: warnings.join(', ') };
  }
  if (entry.rerolls > 0) {
    // Passed, but only after the gate requeued it — worth showing so the reroll isn't invisible.
    return {
      tone: 'muted',
      label:
        entry.rerolls === 1 ? 'Passed after 1 reroll' : `Passed after ${entry.rerolls} rerolls`,
      detail: '',
    };
  }
  return null;
}

/** Slots whose last review asked for manual attention. */
export function flaggedSlotIds(ledger: SlotQualityLedger): string[] {
  return Object.entries(ledger)
    .filter(([, entry]) => entry.lastDecision === 'flag')
    .map(([slotId]) => slotId);
}

/**
 * What "Retry flagged" requeues: stills Auto-review flagged, then clips flagged by the clip
 * check. A slot whose still is requeued skips its clip retry — the new still needs a new clip.
 */
export function flaggedRetryPlan(input: {
  flaggedStillSlotIds: string[];
  clipChecks: Record<string, { status: 'ok' | 'warn' }>;
  /** Board order, so retries queue morning → night. */
  slotOrder: string[];
}): { stills: string[]; clips: string[] } {
  const stills = new Set(input.flaggedStillSlotIds);
  const clips = new Set(
    Object.entries(input.clipChecks)
      .filter(([slotId, check]) => check.status === 'warn' && !stills.has(slotId))
      .map(([slotId]) => slotId)
  );
  return {
    stills: input.slotOrder.filter(id => stills.has(id)),
    clips: input.slotOrder.filter(id => clips.has(id)),
  };
}
