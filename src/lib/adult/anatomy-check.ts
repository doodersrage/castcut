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
 * The gate's extra question (adultGateVisionPrompt), for a nude adult still. It asks whether
 * anyone's genitals don't match the rest of their own body — so it holds when the cast isn't
 * known. Calibration (2026-11-22): told "one woman" from a prompt that read as one person, the
 * model judged two-person stills (her and a man) against it and called the man a mismatch; a
 * cast is now only context, and only when the prompt states it outright.
 */
export function anatomyQuestionLines(cast: AnatomyCast | null): string[] {
  return [
    `Third question, "anatomy": look only at genitals that are clearly visible.${cast ? ` This photo is meant to show ${anatomyCastWords(cast)}.` : ''}`,
    "Answer \"mismatch\" only when someone's visible genitals clearly do not match the rest of their own body — someone with a woman's face, breasts and body who has a penis, or someone with a man's face, flat chest and build whose groin is clearly visible and has no penis. Judge each person against their own body, not against the description.",
    'Answer "ok" when every visible body is consistent, and "not_visible" when no genitals are clearly visible.',
  ];
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
