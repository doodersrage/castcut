/**
 * I2I / Edit models often invent tattoos on bare skin. Block that unless the
 * prompt or Cast appearance explicitly asks for ink.
 */

/** Keep short — Lightning/WAN CFG-1 packs have tight negative budgets. */
export const CLEAN_SKIN_NEGATIVE =
  'tattoo, tattoos, tattoo sleeve, inked skin, body ink, tribal tattoo';

export const CLEAN_SKIN_POSITIVE_LOCK = 'clean unmarked skin with no tattoos or body ink';
/** The lock when the prompt names a mark of her own (a scar, a mole, freckles). */
export const NO_INK_POSITIVE_LOCK = 'no tattoos or body ink';
/** With a Cast's own tattoo: the spread seen live (both forearms, scattered dots). */
const CAST_MARK_EXTRA_INK_NEGATIVE =
  'tattoo sleeve, many tattoos, extra tattoos, tattoos on both arms, scattered small tattoos, dark dots on skin';
const SKIN_MARK_RE = /\b(scars?|moles?|beauty mark|birthmarks?|freckles?|freckled)\b/i;

const TATTOO_INTENT_RE =
  /\b(tattoo|tattoos|tattooed|inked|body\s*ink|tattoo\s*sleeve|sleeve\s*tattoo|tribal\s*tattoo|henna)\b/i;

/** True when the text already asks for tattoos — do not fight that intent. */
export function appearanceAllowsTattoos(text: string | null | undefined): boolean {
  return TATTOO_INTENT_RE.test(text?.trim() || '');
}

function mergeCommaList(base: string | undefined, extra: string): string {
  const parts = `${base ?? ''}, ${extra}`
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ');
}

/** Append anti-tattoo negatives unless the prompt/appearance wants ink. */
export function mergeCleanSkinNegatives(
  negative: string | undefined,
  appearanceOrPrompt?: string | null
): string | undefined {
  if (appearanceAllowsTattoos(appearanceOrPrompt) || appearanceAllowsTattoos(negative)) {
    // A Cast's own tattoo (cast-marks.ts): keep the extras out.
    return /the same in every picture of her\. No other ink or marks/.test(appearanceOrPrompt ?? '')
      ? mergeCommaList(negative, CAST_MARK_EXTRA_INK_NEGATIVE) || undefined
      : negative?.trim() || undefined;
  }
  const merged = mergeCommaList(negative, CLEAN_SKIN_NEGATIVE);
  return merged || undefined;
}

/**
 * A product shot with nobody in it (the shoe and clothing packshot extracts). Skin wording
 * appended to such a prompt asks for skin: the shoe extract came back with the feet still in
 * the sandals on 4 of 6 renders, and with the wording left off, 0 of 40 (live 2026-10-02).
 */
export function promptHasNoPerson(positive: string | null | undefined): boolean {
  const text = positive ?? '';
  return /\bproduct photograph\b/i.test(text) && /\bNo person\b/.test(text);
}

/** Append a short clean-skin lock on I2I stills unless ink is intentional. */
export function appendCleanSkinPositive(
  positive: string,
  appearanceOrPrompt?: string | null
): string {
  const trimmed = positive.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (
    promptHasNoPerson(trimmed) ||
    appearanceAllowsTattoos(trimmed) ||
    appearanceAllowsTattoos(appearanceOrPrompt) ||
    /clean unmarked skin|no tattoos or body ink/i.test(trimmed)
  ) {
    return trimmed;
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  // A Cast's scar, mole or freckles (cast-marks.ts): "clean unmarked skin" would erase them.
  const lock = SKIN_MARK_RE.test(trimmed) ? NO_INK_POSITIVE_LOCK : CLEAN_SKIN_POSITIVE_LOCK;
  return `${trimmed}${separator}${lock}.`;
}
