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
  [/\b(his|her) breast\b/gi, '$1 chest'],
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

/**
 * Women's clothing words in beats written for a woman lead ("in a short sundress", "in lingerie")
 * turned a man lead back into a woman (3/8 two-men Suggestive stills, live 2026-09-30).
 * "dressed" / "dressed up" are left alone.
 */
export function masculineClothes(text: string): string {
  return text
    .replace(
      /\b(?:a |an )?(?:short |little |long |evening |cocktail |summer |slip |wrap |party )?(?:sun)?dress(?:es)?\b(?!ed)/gi,
      'a shirt and trousers'
    )
    .replace(/\b(?:a )?(?:nightgown|nightie|negligee)\b/gi, 'a sleep shirt')
    .replace(/\blingerie\b/gi, 'boxer briefs')
    .replace(/\bbras?\b/gi, 'undershirt')
    .replace(/\b(?:a )?(?:mini)?skirts?\b/gi, 'shorts')
    .replace(/\bbikinis?\b/gi, 'swim trunks')
    .replace(/\b(?:high )?heels\b/gi, 'shoes')
    .replace(/\ba a shirt\b/gi, 'a shirt');
}

/** "her" → "his" before a noun ("her toes"), "him" as the object ("kissing her."). */
export function herToHisHim(text: string): string {
  return text.replace(/\bher\b/gi, (word: string, offset: number) => {
    const rest = text.slice(offset + word.length);
    const next = /^\s*([A-Za-z]+)/.exec(rest)?.[1]?.toLowerCase() ?? '';
    const objectPosition = !next || /^\s*[^\sA-Za-z]/.test(rest) || OBJECT_FOLLOWERS.has(next);
    return matchCase(word, objectPosition ? 'him' : 'his');
  });
}

/**
 * A same-sex partner on the long brief: the beat's "him / his" (written for a man partner) becomes
 * "her partner / her partner's" — keeping the word "partner", which the headcount reads. ("Her
 * girlfriend's chest" counted as one person — possessives are wardrobe there — and the couple
 * beat rendered as a solo recipe.) A man lead's prompt is swapped afterwards → "his partner".
 */
export function sameSexPartnerBeat(beat: string): string {
  return beat.replace(/\bhis\b/gi, "her partner's").replace(/\b(?:him|he)\b/gi, 'her partner');
}

/**
 * Who a piece of Day text is written about, by its first subject pronoun: Day's own beats are
 * written for a woman ("lying on her side", "with her boyfriend, his hand on her waist"), a beat
 * the player typed for a man lead starts with him ("he fixes his bike").
 */
export function writtenAboutHim(text: string | null | undefined): boolean {
  // The subject decides: Day's own beats name the partner as "his" / "him" ("sitting on his lap
  // facing him") without ever making him the subject before her.
  const first = /\b(she|he)\b/i.exec(text ?? '');
  return Boolean(first && first[1]!.toLowerCase() === 'he');
}

/**
 * Text in the voice the Day prompt is assembled in (a woman lead; the whole prompt is swapped
 * for a man at the end). A beat typed for a man is swapped first, so the final swap turns it
 * back — before, "he fixes his bike" came out "she fixes her bike".
 */
export function inDayPromptVoice(
  text: string | null | undefined,
  leadNoun: string | null | undefined
): string | undefined {
  if (!text) return text ?? undefined;
  return leadNoun === 'man' && writtenAboutHim(text) ? swapDayPromptGender(text) : text;
}
