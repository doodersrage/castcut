/**
 * A man as the Day Cast lead. Day's briefs, recipes and beat pools are written for a woman
 * ("she wears…", "her hips"), so for a man lead the finished prompt is gender-swapped in one
 * pass: she↔he, her→his/him, woman↔man… both ways, so a companion written as "him" becomes
 * "her" and the pair stays a pair. Adult duo recipes are built for a man lead already
 * (rapid-duo-recipe `lead`) and are not swapped.
 */

const PAIRS: Record<string, string> = {
  she: 'he',
  he: 'she',
  his: 'her',
  him: 'her',
  hers: 'his',
  herself: 'himself',
  himself: 'herself',
  woman: 'man',
  man: 'woman',
  women: 'men',
  men: 'women',
  "woman's": "man's",
  "man's": "woman's",
  girl: 'guy',
  guy: 'girl',
  girls: 'guys',
  guys: 'girls',
  girlfriend: 'boyfriend',
  boyfriend: 'girlfriend',
  wife: 'husband',
  husband: 'wife',
  female: 'male',
  male: 'female',
  lady: 'gentleman',
  gentleman: 'lady',
  feminine: 'masculine',
  masculine: 'feminine',
};

/** Solo only — on the lead's own body, with no partner to confuse. */
const SOLO_ANATOMY: Array<[RegExp, string]> = [
  [/\bbare breasts with nipples visible\b/gi, 'bare chest'],
  [/\bbreasts\b/gi, 'chest'],
  [/\b(?:bare\s+)?(?:vulva|pussy|clit(?:oris)?)\b/gi, 'penis'],
  [/\bbras?\b/gi, 'undershirt'],
  [/\bpanties\b/gi, 'briefs'],
  [/\blingerie\b/gi, 'underwear'],
];

/** Words after "her" that make it the object ("kissing her back") rather than "his …". */
const OBJECT_FOLLOWERS = new Set([
  '',
  'to',
  'and',
  'or',
  'on',
  'in',
  'at',
  'with',
  'from',
  'up',
  'down',
  'off',
  'into',
  'onto',
  'over',
  'as',
  'while',
  'when',
  'close',
  'tight',
  'gently',
  'softly',
  'again',
  'goodnight',
  'for',
  'by',
  'through',
  'toward',
  'towards',
  'like',
  'than',
  'too',
  'is',
  'was',
]);

function matchCase(source: string, next: string): string {
  if (source === source.toUpperCase() && source.length > 1) return next.toUpperCase();
  return source[0] === source[0]!.toUpperCase() ? next[0]!.toUpperCase() + next.slice(1) : next;
}

export function swapDayPromptGender(text: string, options?: { solo?: boolean }): string {
  let out = text.replace(/\b[A-Za-z]+(?:'s)?\b/g, (word: string, offset: number) => {
    const lower = word.toLowerCase();
    if (lower !== 'her') {
      const swapped = PAIRS[lower];
      return swapped ? matchCase(word, swapped) : word;
    }
    // "her" before a noun is "his" ("her hips"); as the object — before punctuation, the end, or
    // a preposition ("kissing her.", "around her waist" stays his) — it is "him".
    const rest = text.slice(offset + word.length);
    const next = /^\s*([A-Za-z]+)/.exec(rest)?.[1]?.toLowerCase() ?? '';
    const objectPosition = !next || /^\s*[^\sA-Za-z]/.test(rest) || OBJECT_FOLLOWERS.has(next);
    return matchCase(word, objectPosition ? 'him' : 'his');
  });
  if (options?.solo) {
    for (const [re, replacement] of SOLO_ANATOMY) {
      out = out.replace(re, replacement);
    }
  }
  return out;
}

/**
 * Undo the swap on text that was already right (the Cast lead's own description, which the
 * prompt quotes): wherever its swapped form appears, put the original back.
 */
export function restoreText(swapped: string, original: string): string {
  const text = original.trim();
  if (!text) return swapped;
  const flipped = swapDayPromptGender(text);
  return flipped === text ? swapped : swapped.split(flipped).join(text);
}
