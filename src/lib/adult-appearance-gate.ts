/**
 * Adult-appearance gate: after an adult still lands (Day Suggestive / Intimate / Raunchy, Story
 * adult ratings), the vision model is asked one strict-JSON question — do all people shown
 * clearly look like adults over 21? A "no", an unsure answer or a low-confidence "yes" withholds
 * the still: it is never shown (card, Gallery, films, exports, sync), the slot is requeued once
 * with a stronger age sentence (adult-age-safeguard.ts), and if that take is withheld too the
 * card says so and nothing more is queued.
 *
 * The gate is independent of Day's Auto-review switch. With no vision model configured, adult
 * stills are allowed (Settings → Play checks says so); the wording safeguards always apply.
 *
 * Pure: the question, the reply parser and the decision. The vision call is
 * adult-appearance-gate-server.ts (server) / adult-appearance-gate-client.ts (client).
 */

/**
 * The question. Calibrated on clothed adult Day stills (docs/play-guide.md, "Adult content
 * safeguards"): asking for the youngest apparent age as well as the yes/no keeps the model
 * looking at faces and bodies rather than at the styling.
 *
 * `clothed`: the still is from a mood that must stay clothed (Day Suggestive — clothed-coverage.ts).
 * The same call then also asks whether anyone's chest, genitals or buttocks are bare; a "yes"
 * is treated like a pose miss (requeued once with the coverage line), never shown.
 */
export function adultGateVisionPrompt(options?: { clothed?: boolean }): string {
  const clothed = options?.clothed === true;
  return [
    'Look at every person in this photo and judge how old each one looks from their face and body.',
    'Question: do all people shown clearly look like adults over 21?',
    'Answer "yes" when every person looks like a grown adult (over 21). Answer "no" when anyone looks like a child or a teenager, or could plausibly be under 18.',
    ...(clothed
      ? [
          'Second question, "bare": is anyone\'s chest (nipples), genitals or buttocks bare — uncovered by any clothing at all?',
          'Underwear, lingerie, a bra, a bikini or swimsuit, a slip, or a robe worn over underwear all count as covered. Cleavage, a low neckline, bare legs, thighs, a bare back, shoulders or a bare midriff are NOT bare. Answer "yes" only when a nipple, the genitals or a bare bottom is actually visible.',
        ]
      : []),
    'Reply with strict JSON only, no other text, in this shape:',
    clothed
      ? '{"people":1,"youngest_apparent_age":30,"answer":"yes or no","confidence":0-100,"bare":"yes or no"}'
      : '{"people":1,"youngest_apparent_age":30,"answer":"yes or no","confidence":0-100}',
    'confidence is how sure you are of the answer.',
  ].join('\n');
}

export type AdultGateReply = {
  answer: 'yes' | 'no' | 'unsure';
  /** 0–100. */
  confidence: number;
  /** The model's estimate of the youngest person's age, when it gave one. */
  youngestAge?: number;
  people?: number;
  /** Clothed-mood question: a chest, genitals or buttocks bare (only when it was asked). */
  bare?: 'yes' | 'no' | 'unsure';
};

function yesNo(value: unknown): 'yes' | 'no' | 'unsure' {
  const word = String(value ?? '')
    .trim()
    .toLowerCase();
  return /^(?:yes|true)\b/.test(word) ? 'yes' : /^(?:no|false)\b/.test(word) ? 'no' : 'unsure';
}

/** Read the model's JSON reply. Null when it cannot be read (counts as unsure). */
export function parseAdultGateReply(text: string | null | undefined): AdultGateReply | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const answer = yesNo(parsed.answer);
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 50;
  if (confidence > 0 && confidence <= 1) confidence *= 100;
  confidence = Math.max(0, Math.min(100, confidence));
  const youngest = Number(parsed.youngest_apparent_age ?? parsed.youngestApparentAge);
  const people = Number(parsed.people);
  const bare = parsed.bare == null || typeof parsed.bare === 'object' ? null : yesNo(parsed.bare);
  return {
    answer,
    confidence,
    ...(Number.isFinite(youngest) && youngest > 0 ? { youngestAge: youngest } : {}),
    ...(Number.isFinite(people) && people >= 0 ? { people } : {}),
    ...(bare ? { bare } : {}),
  };
}

/** A "yes" below this confidence counts as unsure. */
export const ADULT_GATE_MIN_YES_CONFIDENCE = 60;

/** A "yes" whose own age estimate is below this is not believed. */
export const ADULT_GATE_MIN_APPARENT_AGE = 20;

export type AdultGateVerdict =
  /** Every person read clearly adult. */
  | 'pass'
  /** No vision model is configured — allowed unchecked (the wording safeguards applied). */
  | 'unchecked'
  /** Withheld; requeue once with the stronger age sentence. */
  | 'requeue'
  /** Withheld after the stronger take too — stop and say so. */
  | 'withhold';

export type AdultGateDecision = {
  verdict: AdultGateVerdict;
  /** Why, in a few words (logged and shown in the tray). */
  reason: string;
  /**
   * What a requeue / withhold is for: the age read (the stronger age sentence), or bare skin
   * on a clothed-mood still (the coverage line, clothed-coverage.ts).
   */
  cause?: 'age' | 'bare';
};

/**
 * What to do with a landed adult still. `reply` null with `visionAvailable` true means the call
 * failed or the reply was unreadable — that is uncertain, and uncertain is withheld.
 *
 * `clothed` (Day Suggestive): a "bare" yes is treated like a pose miss — requeued once with the
 * coverage line (`coveredTake` marks that take), then withheld. Only a plain "yes" counts; an
 * unsure or missing bare answer passes (the question was calibrated for few false alarms).
 */
export function decideAdultGate(input: {
  visionAvailable: boolean;
  reply: AdultGateReply | null;
  /** This take already used the stronger age sentence. */
  strongTake: boolean;
  /** The still must stay clothed (the bare-skin question was asked). */
  clothed?: boolean;
  /** This take already used the strong coverage line. */
  coveredTake?: boolean;
}): AdultGateDecision {
  if (!input.visionAvailable) {
    return { verdict: 'unchecked', reason: 'no vision model configured' };
  }
  const reply = input.reply;
  const fail = (reason: string): AdultGateDecision => ({
    verdict: input.strongTake ? 'withhold' : 'requeue',
    reason,
    cause: 'age',
  });
  if (!reply) return fail('no readable answer from the vision model');
  if (reply.answer === 'no') return fail(`read as not clearly adult (${reply.confidence}%)`);
  if (reply.answer === 'unsure') return fail('the vision model was unsure');
  if (reply.confidence < ADULT_GATE_MIN_YES_CONFIDENCE) {
    return fail(`low confidence (${reply.confidence}%)`);
  }
  if (reply.youngestAge != null && reply.youngestAge < ADULT_GATE_MIN_APPARENT_AGE) {
    return fail(`youngest person read as ${reply.youngestAge}`);
  }
  if (input.clothed && reply.bare === 'yes') {
    return {
      verdict: input.coveredTake ? 'withhold' : 'requeue',
      reason: 'bare chest, genitals or buttocks on a clothed-mood still',
      cause: 'bare',
    };
  }
  return { verdict: 'pass', reason: `clearly adult (${reply.confidence}%)` };
}

/** The card's message when the second take is withheld too. */
export const ADULT_GATE_WITHHELD_MESSAGE =
  'Withheld: the picture did not read as clearly adult — try a different seed or beat';

/** The tray line when the first take is withheld and the slot is requeued. */
export const ADULT_GATE_REQUEUE_MESSAGE =
  'A still did not read as clearly adult — it is hidden and being redone with a stronger age line.';

/** The card's message when the covered take of a clothed-mood still showed bare skin too. */
export const CLOTHED_GATE_WITHHELD_MESSAGE =
  'Withheld: the picture showed bare skin a Suggestive still must not — try a different seed or beat';

/** The tray line when a clothed-mood still showed bare skin and the slot is requeued. */
export const CLOTHED_GATE_REQUEUE_MESSAGE =
  'A Suggestive still showed bare skin it must not — it is hidden and being redone with a coverage line.';

/** Day moods whose stills get the age sentence and the gate (an adult mood with Intimate on). */
export function dayMoodNeedsAdultSafeguards(playedMood: string | null | undefined): boolean {
  const mood = (playedMood ?? '').trim().toLowerCase();
  return mood === 'suggestive' || mood === 'intimate' || mood === 'raunchy';
}

/** Story ratings whose stills get the age sentence and the gate. */
export function storyRatingNeedsAdultSafeguards(content: string | null | undefined): boolean {
  const rating = (content ?? '').trim().toLowerCase();
  return (
    rating === 'suggestive' || rating === 'sultry' || rating === 'explicit' || rating === 'raunchy'
  );
}
