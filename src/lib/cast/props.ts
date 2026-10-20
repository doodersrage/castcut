/**
 * Things a Cast owns that should look the same every time: her phone, her bag, her car, her dog
 * (2026-10-14, roadmap review "prop continuity"). Day's beats name them loosely ("scrolling her
 * phone", "walking the dog"), so each still drew a new one. When a beat mentions a prop, the
 * still gets one line describing hers.
 */

import {
  getCharacter,
  upsertCharacter,
  type CastProp,
  type CharacterRecord,
} from '../character/os';

export type { CastProp };

export const CAST_PROPS_MAX = 8;
export const CAST_PROP_NAME_MAX = 30;
export const CAST_PROP_LOOKS_MAX = 100;

export const CAST_PROP_PRESETS: Array<{ name: string; looks: string }> = [
  { name: 'phone', looks: 'rose-gold with a clear case' },
  { name: 'bag', looks: 'a tan leather crossbody bag with a gold clasp' },
  { name: 'dog', looks: 'a golden retriever with a red collar' },
  { name: 'car', looks: 'a small pale-blue hatchback' },
  { name: 'bike', looks: 'a mint-green city bike with a wicker basket' },
  { name: 'mug', looks: 'a chunky speckled cream mug' },
  { name: 'laptop', looks: 'a silver laptop with a few stickers on the lid' },
];

/** Words a beat uses for a prop besides its own name. */
const PROP_ALIASES: Record<string, string[]> = {
  phone: [
    'smartphone',
    'cellphone',
    'cell phone',
    'mobile',
    'selfie',
    'texting',
    'texts',
    'scrolling',
    'phone call',
  ],
  bag: ['handbag', 'purse', 'tote', 'shoulder bag', 'crossbody'],
  dog: ['puppy', 'pup'],
  cat: ['kitten'],
  car: ['hatchback', 'sedan', 'convertible'],
  bike: ['bicycle', 'cycling', 'cycles'],
  mug: ['coffee cup', 'tea cup', 'cup of coffee', 'cup of tea'],
  laptop: ['notebook computer'],
  guitar: ['acoustic guitar'],
  camera: ['film camera'],
  headphones: ['earbuds', 'headset'],
  backpack: ['rucksack'],
  umbrella: ['brolly'],
};

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function normalizeCastProps(raw: unknown): CastProp[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const props: CastProp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Partial<CastProp>;
    const name = cleanText(record.name, CAST_PROP_NAME_MAX)
      .toLowerCase()
      .replace(/^(?:her|his|a|an|the)\s+/, '');
    const looks = cleanText(record.looks, CAST_PROP_LOOKS_MAX).replace(/[.;]+$/, '');
    if (!name || !looks) continue;
    if (props.some(prop => prop.name === name)) continue;
    props.push({ id: cleanText(record.id, 40) || `prop-${props.length + 1}`, name, looks });
    if (props.length >= CAST_PROPS_MAX) break;
  }
  return props.length ? props : undefined;
}

export function newCastPropId(): string {
  return `prop-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function saveCastProps(castId: string, props: CastProp[]): CharacterRecord | undefined {
  const character = getCharacter(castId.trim());
  if (!character) return undefined;
  const next = normalizeCastProps(props);
  if (next) {
    upsertCharacter({ ...character, props: next });
  } else {
    const { props: _dropped, ...rest } = character;
    void _dropped;
    upsertCharacter(rest);
  }
  return getCharacter(character.id);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The beat's words that call up this prop (its name, a plural, its aliases). */
export function castPropMentioned(
  prop: Pick<CastProp, 'name'>,
  text: string | null | undefined
): boolean {
  const body = text ?? '';
  if (!body.trim()) return false;
  const words = [prop.name, ...(PROP_ALIASES[prop.name] ?? [])];
  return words.some(word => new RegExp(`\\b${escapeRe(word)}(?:s|es)?\\b`, 'i').test(body));
}

/** "rose-gold with a clear case" → "Her phone is rose-gold with a clear case"; "a golden retriever…" → "Her dog is a golden retriever…". */
export function castPropSentence(prop: CastProp): string {
  return `Her ${prop.name} is ${prop.looks}`;
}

/**
 * The line a Day still carries for the props its beat (or Setting) mentions, or ''. Written for
 * a woman like the rest of Day's text (a man lead's prompt is swapped whole).
 */
export function castPropsLine(
  props: CastProp[] | undefined,
  input: { beat?: string | null; setting?: string | null }
): string {
  const text = `${input.beat ?? ''} ${input.setting ?? ''}`;
  const named = (props ?? []).filter(prop => castPropMentioned(prop, text));
  if (!named.length) return '';
  return `${named.map(castPropSentence).join('. ')} — the same one every time.`;
}
