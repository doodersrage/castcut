/**
 * The anatomy check on nude adult stills (user, 2026-11-22): every visible body should match who
 * the still is of — a woman's body for each woman, a man's for each man. The adult-appearance
 * gate's one vision call is told who should be in frame and asked whether any visible body
 * doesn't match; a mismatch is redone once with an anatomy line in the prompt, and a redo that
 * still doesn't match is kept but flagged for review (a quality miss, not a safety one).
 *
 * Pure: who is in frame, the question and the redo line. The decision is decideAdultGate.
 */

/** Who a still should show, by body. */
export type AnatomyCast = { women: number; men: number };

/** The gate asks the anatomy question: with the cast as context when the prompt states it. */
export type AnatomyAsk = { cast: AnatomyCast | null };

/** A noun the take knows a person by. */
type Noun = 'woman' | 'man' | string | null | undefined;

const asSex = (noun: Noun): 'woman' | 'man' | null =>
  noun === 'woman' || noun === 'man' ? noun : null;

/**
 * Who the still should show: the lead alone, or the lead and one partner whose noun is known.
 * Null when it can't be said (a partner of unknown sex, three or more people) — not asked then.
 */
export function anatomyCastFor(input: {
  leadNoun: Noun;
  partnerNoun?: Noun;
  /** People the still is of (1 alone, 2 with a partner). */
  people: number;
}): AnatomyCast | null {
  const lead = asSex(input.leadNoun);
  if (!lead) return null;
  if (input.people <= 1) return lead === 'woman' ? { women: 1, men: 0 } : { women: 0, men: 1 };
  if (input.people !== 2) return null;
  const partner = asSex(input.partnerNoun);
  if (!partner) return null;
  const women = (lead === 'woman' ? 1 : 0) + (partner === 'woman' ? 1 : 0);
  return { women, men: 2 - women };
}

/**
 * Who a still is meant to show, when its prompt says so outright ("a woman and a man", "two
 * women", "two men"); else null. Not guessed from a one-person reading: adult duo prompts name
 * the partner as "the man" and "the couple", and read as one person (calibration, 2026-11-22).
 */
export function anatomyCastFromPrompt(prompt: string | null | undefined): AnatomyCast | null {
  const text = String(prompt ?? '');
  if (/\b(?:a woman and a man|a man and a woman)\b/i.test(text)) return { women: 1, men: 1 };
  if (/\btwo women\b/i.test(text)) return { women: 2, men: 0 };
  if (/\btwo men\b/i.test(text)) return { women: 0, men: 2 };
  return null;
}

/** The ask from a request body: `{ cast }` (a cast or null); anything else is not asked. */
export function normalizeAnatomyAsk(value: unknown): AnatomyAsk | null {
  if (!value || typeof value !== 'object') return null;
  return { cast: normalizeAnatomyCast((value as Record<string, unknown>).cast) };
}

/** A cast from a request body: one or two people, each a woman or a man; else null. */
export function normalizeAnatomyCast(value: unknown): AnatomyCast | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const count = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 2 ? (n as number) : -1;
  const women = count(record.women);
  const men = count(record.men);
  if (women < 0 || men < 0 || women + men < 1 || women + men > 2) return null;
  return { women, men };
}

/** "one woman", "a woman and a man", "two men". */
export function anatomyCastWords(cast: AnatomyCast): string {
  const count = (n: number, one: string, many: string) =>
    n === 1 ? `one ${one}` : n === 2 ? `two ${many}` : '';
  if (cast.women && cast.men) return 'a woman and a man';
  return cast.women ? count(cast.women, 'woman', 'women') : count(cast.men, 'man', 'men');
}

/**
 * The gate's extra question (adultGateVisionPrompt), for a nude adult still: for each person,
 * their apparent gender (face, chest, build) and what is at their own crotch — the code decides
 * a mismatch (readAnatomyFromBodies). Tested on the user's own failed renders (2026-11-22): a
 * yes/no "does anyone's anatomy not match?" caught 0 of 5, a woman with a penis where her partner
 * was beside her read as "ok" every time; asked person by person, 1 of 5 caught, 0 of 41 clean
 * stills flagged. Counting penises against men in view caught 4 of 5 but flagged 27 of 41 clean
 * stills (a partner's penis read as nobody's), so it is not used.
 */
export function anatomyQuestionLines(cast: AnatomyCast | null): string[] {
  return [
    `Third question, "bodies": look at each person's own crotch — the place between their own thighs, where their legs join their own hips.${cast ? ` This photo is meant to show ${anatomyCastWords(cast)}.` : ''}`,
    'For each person give their apparent gender from face and chest ("woman" or "man"), whether their own crotch is in view ("yes" or "no"), and what is at it: "vulva", "penis", "both" or "covered". Judge only what is attached at that person\'s own crotch: a penis at a woman\'s crotch, between her thighs, counts as hers even when a man\'s face or hand is near it.',
  ];
}

/** One person's answer to the bodies question. */
export type AnatomyBody = { gender: string; inView: boolean; atCrotch: string };

/** The bodies list from the gate's JSON reply; null when there is none to read. */
export function readAnatomyBodies(value: unknown): AnatomyBody[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'
    )
    .map(entry => ({
      gender: String(entry.gender ?? '')
        .trim()
        .toLowerCase(),
      inView: !/^no\b/i.test(String(entry.crotch_in_view ?? entry.crotchInView ?? 'yes').trim()),
      atCrotch: String(entry.at_crotch ?? entry.atCrotch ?? '')
        .trim()
        .toLowerCase(),
    }));
}

/**
 * The read: a woman with a penis (or both) at her own crotch, or a man in view with a vulva
 * and no penis, is a mismatch; any crotch in view with something at it is ok; else not visible.
 */
export function readAnatomyFromBodies(bodies: AnatomyBody[] | null): AnatomyRead | null {
  if (!bodies) return null;
  const shown = bodies.filter(body => body.inView && /penis|vulva|both/.test(body.atCrotch));
  const wrong = shown.some(body =>
    body.gender.startsWith('woman')
      ? /penis|both/.test(body.atCrotch)
      : body.gender.startsWith('man') &&
        /vulva/.test(body.atCrotch) &&
        !/penis|both/.test(body.atCrotch)
  );
  if (wrong) return 'mismatch';
  return shown.length ? 'ok' : 'not_visible';
}

/** The one redo's line: each person's body said outright, leading the prompt. */
export function anatomyRedoLine(cast: AnatomyCast | null): string {
  if (!cast) {
    return "ANATOMY (mandatory): each person's body is consistent — every woman has a woman's body and a woman's genitals, no penis; every man has a man's body and a penis.";
  }
  const parts: string[] = [];
  if (cast.women === 1) parts.push("the woman has a woman's body and a woman's genitals, no penis");
  if (cast.women === 2) parts.push("both women have women's bodies and women's genitals, no penis");
  if (cast.men === 1) parts.push("the man has a man's body and a penis");
  if (cast.men === 2) parts.push("both men have men's bodies and each has a penis");
  return `ANATOMY (mandatory): ${parts.join('; ')}.`;
}

/** The redo's prompt: the anatomy line leads it (as the coverage line leads its redo). */
export function withAnatomyRedoLine(prompt: string, cast: AnatomyCast | null): string {
  const line = anatomyRedoLine(cast);
  return prompt.includes(line) ? prompt : `${line} ${prompt.trim()}`;
}

/** What the gate read about anatomy. */
export type AnatomyRead = 'ok' | 'mismatch' | 'not_visible' | 'unsure';

export function readAnatomyAnswer(value: unknown): AnatomyRead | null {
  if (value == null || typeof value === 'object') return null;
  const word = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (/^mismatch/.test(word) || word === 'no') return 'mismatch';
  if (/^ok\b|^ok$|^match|^yes/.test(word)) return 'ok';
  if (/^not_?visible|^none/.test(word)) return 'not_visible';
  return 'unsure';
}

/** The run's / card's flag when the redo still doesn't match. */
export const ANATOMY_FLAG_REASON = 'the anatomy may be wrong (checked twice)';

/*
 * The crop check (2026-11-22, on the user's own failed renders): the whole picture lets the model
 * give a woman's extra penis to the man beside her, or see one on a man who has none. Each
 * person's face-and-chest and crotch are cropped from the pose (DWPose) and asked about apart, the
 * crotch without saying whose. A person whose hips touch another's (a sex position: a partner's
 * genitals are in the crop) or whose crotch crop runs off the picture (a belly read as "smooth")
 * is not judged, and the check is skipped when the pose found fewer people than the photo has
 * (hips landed on the wrong body). With the whole-picture question: 4 of the user's 5 caught,
 * 0 of 41 clean stills flagged.
 */

/** A crop in pixels. */
export type AnatomyCropBox = { left: number; top: number; width: number; height: number };

/** One person to judge: where to crop, and whether their crotch can be judged at all. */
export type AnatomyPerson = {
  faceBox: AnatomyCropBox;
  crotchBox: AnatomyCropBox;
  /** Their hips touch another person's: a partner's genitals would be in the crop. */
  near: boolean;
  /** The crotch crop lies inside the picture. */
  inFrame: boolean;
};

type PosePoint = { x: number; y: number } | null | undefined;

const NECK = 1;
const RIGHT_HIP = 8;
const LEFT_HIP = 11;

/** People with a neck and both hips, from the pose (normalised points, OpenPose 18 order). */
export function anatomyPersonsFromPose(
  people: ReadonlyArray<ReadonlyArray<PosePoint>>,
  size: { width: number; height: number }
): AnatomyPerson[] {
  const { width: W, height: H } = size;
  const found = people
    .map(points => {
      const at = (i: number) => {
        const p = points[i];
        return p ? { x: p.x * W, y: p.y * H } : null;
      };
      const neck = at(NECK);
      const right = at(RIGHT_HIP);
      const left = at(LEFT_HIP);
      if (!neck || !right || !left) return null;
      const hip = { x: (right.x + left.x) / 2, y: (right.y + left.y) / 2 };
      const torso = Math.hypot(neck.x - hip.x, neck.y - hip.y);
      return torso >= 30 ? { neck, hip, torso } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const box = (cx: number, cy: number, side: number): AnatomyCropBox => {
    const left = Math.max(0, Math.round(cx - side / 2));
    const top = Math.max(0, Math.round(cy - side / 2));
    return {
      left,
      top,
      width: Math.max(1, Math.min(W, Math.round(cx + side / 2)) - left),
      height: Math.max(1, Math.min(H, Math.round(cy + side / 2)) - top),
    };
  };
  return found.map((p, i) => {
    const cy = p.hip.y + 0.18 * p.torso;
    const half = 0.375 * p.torso;
    return {
      faceBox: box(p.neck.x, p.neck.y - 0.05 * p.torso, 1.1 * p.torso),
      crotchBox: box(p.hip.x, cy, 2 * half),
      near: found.some(
        (q, j) =>
          j !== i &&
          Math.hypot(p.hip.x - q.hip.x, p.hip.y - q.hip.y) < 0.7 * Math.max(p.torso, q.torso)
      ),
      inFrame:
        cy + half <= H * 0.99 && cy - half >= 0 && p.hip.x - half >= 0 && p.hip.x + half <= W,
    };
  });
}

export const ANATOMY_GENDER_CROP_PROMPT =
  'This crop shows part of one person: their face and chest. Is this person a woman or a man? Reply with strict JSON only: {"gender":"woman"} — "unsure" when you cannot tell.';

export const ANATOMY_CROTCH_CROP_PROMPT =
  'This is a close-up crop of one area of a photo. Describe only what is at the CENTER of the crop: "penis", "vulva", "both" (a penis and a vulva together), "smooth" (bare skin with no genitals at all — a blank, featureless crotch), "covered" (clothing, a hand, a sheet), or "not_visible" (the center is not a crotch, or it is hidden). Reply with strict JSON only: {"center":"..."}';

/** One person's two crop answers, with whether they can be judged. */
export type AnatomyCropRead = { gender: string; center: string; near: boolean; inFrame: boolean };

/** The JSON field `key` of a model reply, lower-cased; '' when unreadable. */
export function readCropField(reply: string | null | undefined, key: 'gender' | 'center'): string {
  const text = String(reply ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return String(parsed[key] ?? '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The crop check's verdict: a woman with a penis (or both) at her crotch, or a man with a vulva or
 * a smooth crotch — among the people it can judge. Null: not judged (no one judgeable, or the pose
 * found fewer people than the photo shows).
 */
export function decideAnatomyFromCrops(
  reads: readonly AnatomyCropRead[],
  peopleInPhoto?: number
): AnatomyRead | null {
  if (peopleInPhoto && reads.length < peopleInPhoto) return null;
  const judged = reads.filter(read => !read.near && read.inFrame);
  if (!judged.length) return null;
  const wrong = judged.some(read =>
    read.gender.startsWith('woman')
      ? read.center === 'penis' || read.center === 'both'
      : read.gender.startsWith('man') && (read.center === 'vulva' || read.center === 'smooth')
  );
  return wrong ? 'mismatch' : 'ok';
}
