/**
 * Marks check (2026-10-14): after a Day still lands, a vision model says what it sees on her —
 * glasses, tattoos — and this module decides whether a repair pass is needed. Live, a marked plate
 * carried glasses 8 of 8 but a forearm rose spread to both arms on 3 of 4 or went missing
 * (cast-marks.ts); the shoe check had the same shape of problem and the same fix worked 9 of 9
 * (footwear-check.ts).
 *
 * As with shoes, the question never names her marks: told what to expect, vision models echo it
 * back. Only marks a downscaled still can show are judged — glasses (and other worn pieces) and
 * tattoos. A mole, a scar or freckles are too small to judge at that size and are left alone.
 *
 * Pure: no fetch, no React.
 */

import { castMarkPhrase, castMarkSpotShows } from './marks';
import type { CastMark, CastMarkSpot } from '../character-os';

export const MARKS_CHECK_VERSION = 1;

export const MARKS_CHECK_PROMPT = [
  'Look closely at the person in this photo.',
  'Answer strict JSON only:',
  '{"glasses": true|false, "tattoos": [{"where": "<face|neck|left arm|right arm|hand|chest|stomach|back|left leg|right leg|ankle>", "what": "<2-5 words>"}]}',
  '- glasses: she wears glasses or spectacles on her face (not sunglasses on her head).',
  '- tattoos: every tattoo you can see on her skin, one entry each; [] when there are none. Left and right are her own left and right.',
].join('\n');

export type MarksCheckReading = {
  glasses: boolean;
  tattoos: Array<{ where: string; what: string }>;
};

export type MarksCheckIssue =
  | { kind: 'missing-glasses'; mark: CastMark }
  | { kind: 'missing-tattoo'; mark: CastMark }
  | { kind: 'extra-tattoos'; count: number };

export type MarksCheckVerdict = { ok: boolean; issues: MarksCheckIssue[] };

const GLASSES_RE = /\b(glasses|spectacles)\b/i;
const TATTOO_RE = /\btattoo/i;
const ARM_SPOTS: CastMarkSpot[] = ['left arm', 'right arm', 'hands'];
/**
 * Reads that aren't ink: calibrated 2026-10-14 (nsfwvision-qwen3-vl-8b, 14 stills) — a dress's
 * lace-up panel was read as a chest tattoo and a mole as "a small dot under lip". Glasses were
 * read right 14 of 14; arm tattoos matched what was on the arms (sides are not trusted).
 */
const NOT_INK_RE =
  /\b(lace|lacing|laced|lace-up|strap|straps|dress|fabric|seam|dot|mole|freckles?|beauty mark|birthmark|scar|shadow)\b/i;

export function parseMarksCheck(text: string | null | undefined): MarksCheckReading | null {
  const raw = (text ?? '').trim();
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<MarksCheckReading>;
    if (typeof parsed.glasses !== 'boolean') return null;
    const tattoos = Array.isArray(parsed.tattoos)
      ? parsed.tattoos
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            where: String((item as { where?: unknown }).where ?? '')
              .toLowerCase()
              .trim(),
            what: String((item as { what?: unknown }).what ?? '').trim(),
          }))
      : [];
    return { glasses: parsed.glasses, tattoos: tattoos.filter(t => !NOT_INK_RE.test(t.what)) };
  } catch {
    return null;
  }
}

/** Her marks the still should show and the check can judge: glasses and tattoos where they show. */
export function checkableMarks(
  marks: CastMark[] | undefined,
  input: { outfit?: string | null; beat?: string | null; undressed?: boolean }
): CastMark[] {
  return (marks ?? []).filter(
    mark =>
      (GLASSES_RE.test(mark.what) || TATTOO_RE.test(mark.what)) &&
      castMarkSpotShows(mark.where, input)
  );
}

/** A tattoo read on the arms counts for an arm mark whichever side was read (sides are unreliable). */
function sameArea(read: string, spot: CastMarkSpot): boolean {
  if (ARM_SPOTS.includes(spot)) return /\b(arm|forearm|wrist|hand)\b/.test(read);
  if (spot === 'left leg' || spot === 'right leg') return /\b(leg|thigh|calf)\b/.test(read);
  return read.includes(spot.split(' ').at(-1)!);
}

export function marksCheckVerdict(
  reading: MarksCheckReading,
  expected: CastMark[],
  /** Every mark she has (an extra tattoo is one that matches none of them). */
  allMarks: CastMark[] = expected
): MarksCheckVerdict {
  const issues: MarksCheckIssue[] = [];
  for (const mark of expected) {
    if (GLASSES_RE.test(mark.what) && !reading.glasses) {
      issues.push({ kind: 'missing-glasses', mark });
    }
    if (TATTOO_RE.test(mark.what) && !reading.tattoos.some(t => sameArea(t.where, mark.where))) {
      issues.push({ kind: 'missing-tattoo', mark });
    }
  }
  const ownTattoos = allMarks.filter(mark => TATTOO_RE.test(mark.what));
  const extra = reading.tattoos.filter(
    tattoo => !ownTattoos.some(mark => sameArea(tattoo.where, mark.where))
  ).length;
  // Her own tattoo read on both arms is the spread seen live: one arm too many.
  const spread = ownTattoos.filter(mark => ARM_SPOTS.includes(mark.where)).length;
  const armReads = reading.tattoos.filter(tattoo =>
    /\b(arm|forearm|wrist|hand)\b/.test(tattoo.where)
  ).length;
  const extraArms = spread > 0 ? Math.max(0, armReads - spread) : 0;
  const count = Math.max(extra, extraArms);
  if (count > 0) issues.push({ kind: 'extra-tattoos', count });
  return { ok: issues.length === 0, issues };
}

/** One short edit for the issues (cast-plate-prepare's register: distilled edits drift on long briefs). */
export function buildMarksRepairPrompt(
  issues: MarksCheckIssue[],
  allMarks: CastMark[],
  subject: 'she' | 'he' = 'she'
): string {
  const her = subject === 'he' ? 'his' : 'her';
  const fixes: string[] = [];
  for (const issue of issues) {
    if (issue.kind === 'missing-glasses')
      fixes.push(`put ${her} ${issue.mark.what} on ${her} face`);
    if (issue.kind === 'missing-tattoo')
      fixes.push(`add ${castMarkPhrase(issue.mark).replace(/\bher\b/g, her)}`);
  }
  if (issues.some(issue => issue.kind === 'extra-tattoos')) {
    const own = allMarks.filter(mark => TATTOO_RE.test(mark.what)).map(castMarkPhrase);
    fixes.push(
      own.length
        ? `remove every tattoo except ${own.join(' and ')}`.replace(/\bher\b/g, her)
        : 'remove every tattoo'
    );
  }
  return `Edit Image 1: ${fixes.join('; ')}. Keep everything else exactly — the same person, face, hair, pose, clothes, place and light. One person. Photoreal.`;
}

export function marksCheckNote(issues: MarksCheckIssue[]): string {
  return issues
    .map(issue =>
      issue.kind === 'missing-glasses'
        ? 'glasses missing'
        : issue.kind === 'missing-tattoo'
          ? `${issue.mark.what} missing`
          : `${issue.count} extra tattoo${issue.count === 1 ? '' : 's'}`
    )
    .join(', ');
}
