/**
 * I2I / Edit models often invent tattoos on bare skin. Block that unless the
 * prompt or Cast appearance explicitly asks for ink.
 */

/** Keep short — Lightning/WAN CFG-1 packs have tight negative budgets. */
export const CLEAN_SKIN_NEGATIVE =
  'tattoo, tattoos, tattoo sleeve, inked skin, body ink, tribal tattoo';

export const CLEAN_SKIN_POSITIVE_LOCK = 'clean unmarked skin with no tattoos or body ink';

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
    return negative?.trim() || undefined;
  }
  const merged = mergeCommaList(negative, CLEAN_SKIN_NEGATIVE);
  return merged || undefined;
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
    appearanceAllowsTattoos(trimmed) ||
    appearanceAllowsTattoos(appearanceOrPrompt) ||
    /clean unmarked skin/i.test(trimmed)
  ) {
    return trimmed;
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${CLEAN_SKIN_POSITIVE_LOCK}.`;
}
