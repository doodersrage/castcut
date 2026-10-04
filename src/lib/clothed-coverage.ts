/**
 * Suggestive is a clothed mood (lingerie, loungewear, a robe — flirty, never nude). The pose
 * report card (2026-10-03) found it partly nude anyway: Qwen-Image 2.1 drew a bare bottom or a
 * bare chest on 4 of 22 stills, Rapid AIO and Edit 2511 a bare breast once each — every time from
 * beat words that invited it ("silk robe loosely tied — cleavage and skin", "robe falling open
 * over lingerie", "thin sleepwear … bare thighs"). Rapid runs at CFG 1, where the negative prompt
 * does nothing, so coverage is said in the positive wording: one short line on every Suggestive
 * recipe, and a stronger mandatory line on the one requeue after the adult check saw bare skin
 * (adult-appearance-gate.ts).
 */

/** On every Suggestive solo recipe, after the clothes sentence. */
export const SUGGESTIVE_COVERAGE_LINE = 'Her clothes stay on, covering her chest and hips.';

/** The requeue after the gate saw bare skin: a mandatory line at the top of the prompt. */
export const STRONG_COVERAGE_LINE =
  'COVERED (mandatory): she keeps every garment on — her chest, her hips and her bottom are covered by her clothes.';

/** Day moods that must stay clothed (the gate's bare-skin question applies). */
export function dayMoodMustStayClothed(playedMood: string | null | undefined): boolean {
  return (playedMood ?? '').trim().toLowerCase() === 'suggestive';
}

export function hasStrongCoverageLine(text: string | null | undefined): boolean {
  return /^COVERED \(mandatory\):/m.test(text ?? '');
}

/**
 * The words that undress a Suggestive still, said clothed instead. Replayed on the report card's
 * leaking stills (2026-10-04, 3 engines × 3 seeds): the coverage line alone on the old words
 * stayed nude 10 of 10; the same stills with the words changed were clothed 27 of 27. So the
 * requeue after bare skin changes the words too — a robe is belted and has something under it,
 * "cleavage and skin" is a hint of neckline, "bare thighs" go.
 */
const BARE_WORD_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b(robe|shirt|cardigan|kimono)\s+loosely\s+tied\b/gi, '$1 belted at the waist over a camisole'],
  [/\bloosely\s+(?:tied|belted|knotted)\b/gi, 'belted'],
  [
    /\b(robe|shirt|cardigan|kimono)\s+(?:falling|hanging|slipping)\s+open(?:\s+over\s+lingerie)?\b/gi,
    '$1 over a bra and panties',
  ],
  [/\b(?:falling|hanging|slipping)\s+open\b/gi, 'open over a camisole'],
  [/\bcleavage\s+and\s+skin\b/gi, 'a hint of neckline'],
  [/\bthin\s+sleepwear\b/gi, 'a camisole and sleep shorts'],
  [/\btowel\s+wrap\b/gi, 'short robe over lingerie'],
  [/\b(?:topless|bottomless|braless|nothing\s+(?:else|underneath|under\s+it))\b/gi, 'dressed'],
  [/\b(?:sheer|see-through)\s+/gi, 'satin '],
  [
    /,?\s*(?:fabric\s+catching\s+light\s+on\s+)?bare\s+(?:thighs?|legs?|skin|chest|breasts?|bottom|butt|midriff)\b/gi,
    '',
  ],
];

/** Bare-skin words in a Suggestive beat said clothed (the text is otherwise untouched). */
export function softenBareSkinWords(text: string): string {
  let next = text ?? '';
  for (const [re, to] of BARE_WORD_RULES) next = next.replace(re, to);
  return next.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1');
}

/** The strong line as the prompt's first line (once). */
export function withStrongCoverageLine(prompt: string): string {
  const text = prompt ?? '';
  if (hasStrongCoverageLine(text)) return text;
  return text.trim() ? `${STRONG_COVERAGE_LINE}\n${text}` : STRONG_COVERAGE_LINE;
}
