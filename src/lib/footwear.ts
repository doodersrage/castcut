/**
 * Footwear picked for a Cast's outfit, alongside the clothing (Outfit, Day, Story).
 *
 * The edit models take three images — the Cast plate, the clothing packshot and the pose map —
 * so shoes travel as words. They are stated as their own line because a clothing packshot rarely
 * shows shoes and the models then invent them (or leave her barefoot, as the plate is).
 */

export type FootwearPresetId =
  | 'auto'
  | 'barefoot'
  | 'sneakers'
  | 'heels'
  | 'boots'
  | 'knee-boots'
  | 'sandals'
  | 'flats'
  | 'loafers'
  | 'custom';

export type FootwearPreset = { id: FootwearPresetId; label: string; words: string };

/** `auto` leaves the shoes to the outfit and the scene, as before. */
export const FOOTWEAR_PRESETS: readonly FootwearPreset[] = [
  { id: 'auto', label: 'Auto — suit the outfit', words: '' },
  { id: 'barefoot', label: 'Barefoot', words: 'barefoot' },
  { id: 'sneakers', label: 'Sneakers', words: 'white low-top sneakers' },
  { id: 'heels', label: 'High heels', words: 'black high-heeled pumps' },
  { id: 'boots', label: 'Ankle boots', words: 'black leather ankle boots' },
  { id: 'knee-boots', label: 'Knee-high boots', words: 'black knee-high leather boots' },
  { id: 'sandals', label: 'Sandals', words: 'flat tan leather sandals' },
  { id: 'flats', label: 'Ballet flats', words: 'black ballet flats' },
  { id: 'loafers', label: 'Loafers', words: 'brown leather loafers' },
  { id: 'custom', label: 'Custom…', words: '' },
];

export const FOOTWEAR_MAX_LENGTH = 140;

const BAREFOOT_RE = /^(?:barefoot|bare feet|no shoes|none|nothing)$/i;

/** Stored footwear words: one line, no trailing punctuation, capped. '' = auto. */
export function normalizeFootwear(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:she|he|they)\s+(?:wears?|is wearing)\s+/i, '')
    .replace(/[.;,\s]+$/, '')
    .slice(0, FOOTWEAR_MAX_LENGTH)
    .trim();
}

export function footwearIsBarefoot(value: unknown): boolean {
  return BAREFOOT_RE.test(normalizeFootwear(value));
}

/** Which preset the stored words are: a preset's own words, `auto` when empty, else `custom`. */
export function footwearPresetId(value: unknown): FootwearPresetId {
  const words = normalizeFootwear(value).toLowerCase();
  if (!words) return 'auto';
  if (BAREFOOT_RE.test(words)) return 'barefoot';
  return (
    FOOTWEAR_PRESETS.find(preset => preset.words && preset.words.toLowerCase() === words)?.id ??
    'custom'
  );
}

export function footwearPresetWords(id: FootwearPresetId | string): string {
  return FOOTWEAR_PRESETS.find(preset => preset.id === id)?.words ?? '';
}

/**
 * Shoes for the other person in a duo, named and unlike the lead's. "Their own different shoes"
 * left the partner in the lead's sneakers 1 still in 4 (live, two men on Day).
 */
export function partnerShoesUnlike(leadShoes: string): string {
  // Sneakers first: "white leather low-top sneakers" are sneakers, not leather shoes.
  if (/\b(?:sneakers?|trainers?|runners?|running shoes|high-tops?|plimsolls?)\b/i.test(leadShoes)) {
    return 'dark brown leather shoes';
  }
  return /\b(?:leather|loafers?|oxfords?|brogues?|derbys?|dress shoes|heels|pumps|boots?)\b/i.test(
    leadShoes
  )
    ? 'plain white sneakers'
    : 'dark brown leather shoes';
}

/**
 * The footwear line for a prompt, or '' on auto. `subject` is "she" / "he".
 *
 * Kept as its own short sentence: tacked onto the end of the outfit clause the shoes were the
 * first thing the models dropped.
 */
export function footwearPromptLine(
  value: unknown,
  subject: 'she' | 'he' = 'she',
  /**
   * Where the shoes are pictured, when they are: under the clothing in Image 2 (`combined`) or as
   * Image 2 on their own (`alone`). The words still name them — image and words together held
   * the shoes 4/4, the image alone 3/4 (live, Edit 2511).
   */
  image?: 'combined' | 'alone' | null,
  /**
   * Two people in the still: say whose shoes these are. "On his feet he wears white sneakers"
   * put the sneakers on both men (live, two men on Day).
   */
  pair = false
): string {
  const words = normalizeFootwear(value);
  if (!words && !image) return '';
  const possessive = subject === 'he' ? 'his' : 'her';
  if (BAREFOOT_RE.test(words)) {
    return `FOOTWEAR (mandatory): ${subject} is barefoot — bare feet, no shoes and no socks.`;
  }
  const shown =
    image === 'combined'
      ? ' shown at the bottom of Image 2'
      : image === 'alone'
        ? ' shown in Image 2'
        : '';
  const named = shown ? `the ${words || 'shoes'}${shown}` : words;
  return pair
    ? `FOOTWEAR (mandatory): on ${possessive} own feet (the person from the first image) ${subject} wears ${named} — exactly these, on both feet; the other person wears ${partnerShoesUnlike(words)} — never the same pair.`
    : `FOOTWEAR (mandatory): on ${possessive} feet ${subject} wears ${named} — exactly these, on both feet.`;
}

/**
 * A beat that is about the feet keeps its own say ("heels in one hand", "barefoot on the sand",
 * "kicking off her shoes") — a footwear line would contradict the scene.
 */
export function beatOwnsFootwear(beat: string | null | undefined): boolean {
  return /\b(?:barefoot|bare feet|heels in (?:one |her |his )?hands?|shoes? in (?:one |her |his )?hands?|(?:kick|kicking|kicks|took|taking|takes|slipping|slips) off (?:her |his )?(?:heels|shoes|boots|sneakers)|(?:heels|shoes|boots|sneakers|sandals) (?:kicked |slipped |taken )?off|feet (?:dangling )?in the water|toes in the (?:sand|water))\b/i.test(
    beat ?? ''
  );
}

/**
 * Add the footwear line to a finished still prompt: straight after the outfit line when there is
 * one (so clothes and shoes read together), else as the first line after the edit lead-in.
 */
export function withFootwearLine(
  prompt: string,
  value: unknown,
  subject: 'she' | 'he' = 'she',
  image?: 'combined' | 'alone' | null,
  pair = false
): string {
  const line = footwearPromptLine(value, subject, image, pair);
  if (!line || !prompt.trim() || prompt.includes('FOOTWEAR (mandatory):')) return prompt;
  const lines = prompt.split('\n');
  const outfitIndex = lines.findIndex(text => /^\s*OUTFIT \(mandatory\):/.test(text));
  if (outfitIndex >= 0) {
    lines.splice(outfitIndex + 1, 0, line);
    return lines.join('\n');
  }
  const lead = /^(Edit Image 1:\s*)/.exec(prompt);
  return lead ? `${lead[1]}${line}\n${prompt.slice(lead[1]!.length)}` : `${line}\n${prompt}`;
}

/** Places where bare feet are normal: home, bed, bath, beach, pool, a yoga or martial-arts mat. */
const BAREFOOT_PLACE_RE =
  /\b(?:bed|bedroom|bath|bathroom|bathtub|shower|sauna|spa|pool|poolside|beach|sand|sandy|shore|surf|sea|ocean|lake|river (?:bank|shallows)|water|swim\w*|yoga|mat|dojo|tatami|dance studio|living[- ]room|lounge|couch|sofa|at home|apartment|hotel room|suite|kitchen|rug|carpet|blanket|picnic)\b/i;

const BEAT_SHOE_KINDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:hiking\s+)?boots?\b/i, 'brown leather ankle boots'],
  [/\bheels?\b|\bstilettos?\b|\bpumps\b/i, 'black strappy heeled sandals'],
  [/\bsandals?\b|\bflip[- ]?flops?\b/i, 'flat tan leather sandals'],
  [/\b(?:sneakers?|trainers?|running shoes?)\b/i, 'white leather sneakers'],
  [/\bloafers?\b/i, 'black leather loafers'],
];

/**
 * Footwear on "auto" for a clothed Day still: a named pair that suits the outfit and the place,
 * or null where bare feet belong. The short recipe prompts named no shoes, and the Cast plate is
 * barefoot — the overnight sweep (2026-10-08) had her barefoot on streets, boardwalks, subway
 * platforms and crosswalks across Everyday, Vacation and themes. A vague "shoes that suit the
 * outfit" fixed ~3/8 replays; a named pair in the FOOTWEAR line 8/8.
 */
export function dayAutoFootwear(input: {
  beat?: string | null;
  setting?: string | null;
  outfit?: string | null;
  dayMood?: string | null;
  /** The Cast lead — a man never gets heels. */
  lead?: 'woman' | 'man' | 'person';
}): string | null {
  const place = `${input.beat ?? ''} ${input.setting ?? ''}`;
  if (beatOwnsFootwear(input.beat) || BAREFOOT_PLACE_RE.test(place)) return null;
  // Dressed for bed, bath or the water: bare feet go with it.
  if (
    /\b(?:robe|bathrobe|sleepwear|pajamas?|pyjamas?|nightgown|towel|swimsuit|bikini|wetsuit|lingerie)\b/i.test(
      `${place} ${input.outfit ?? ''}`
    )
  ) {
    return null;
  }
  const mood = (input.dayMood ?? '').toLowerCase();
  if (mood === 'sport') return null; // Sport kits name their own shoes.
  // The beat names the shoes ("lacing boots", "unlacing her boots"): that kind, not sneakers —
  // the first auto pick put white sneakers on a boot-lacing beat (2026-10-08).
  const named = BEAT_SHOE_KINDS.find(([re]) => re.test(input.beat ?? ''));
  if (named) return named[1];
  const outfit = (input.outfit ?? '').toLowerCase();
  if (/\b(?:suit|blazer|tailored|trousers|slacks|tuxedo)\b/.test(outfit)) {
    return 'black leather loafers';
  }
  if (
    input.lead !== 'man' &&
    /\b(?:gown|cocktail|evening|sequin|satin|silk slip|slip dress)\b/.test(outfit)
  ) {
    return 'strappy heeled sandals';
  }
  if (
    mood === 'vacation' ||
    /\b(?:boardwalk|promenade|resort|beach town|seafront|harbou?r|marina)\b/i.test(place)
  ) {
    return 'flat tan leather sandals';
  }
  return 'white leather sneakers';
}
