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
  image?: 'combined' | 'alone' | null
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
  return `FOOTWEAR (mandatory): on ${possessive} feet ${subject} wears ${named} — exactly these, on both feet.`;
}

/**
 * A beat that is about the feet keeps its own say ("heels in one hand", "barefoot on the sand",
 * "kicking off her shoes") — a footwear line would contradict the scene.
 */
export function beatOwnsFootwear(beat: string | null | undefined): boolean {
  return /\b(?:barefoot|bare feet|heels in (?:one |her |his )?hands?|shoes? in (?:one |her |his )?hands?|(?:kick|kicking|kicks|took|taking|takes|slipping|slips) off (?:her |his )?(?:heels|shoes|boots|sneakers))\b/i.test(
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
  image?: 'combined' | 'alone' | null
): string {
  const line = footwearPromptLine(value, subject, image);
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
