/**
 * Wildcards / dynamic prompts: `__name__` token expansion (list-based) and
 * `{a|b|c}` inline choice groups. Pure module — no DOM/browser APIs — so it
 * can run in both the browser (queue prep) and node (tests, server prep).
 *
 * Deterministic when a `seed` is supplied (same seed + text always expands
 * the same way); omit `seed` for a fresh random roll each call.
 */

export type WildcardMap = Record<string, string[]>;

/** Small inline defaults so `__color__` / `__weather__` etc. work with zero setup. */
export const DEFAULT_WILDCARDS: WildcardMap = {
  color: [
    'red',
    'crimson',
    'amber',
    'gold',
    'emerald',
    'teal',
    'azure',
    'cobalt',
    'violet',
    'magenta',
    'charcoal',
    'silver',
  ],
  weather: [
    'sunny',
    'overcast',
    'light rain',
    'foggy',
    'stormy',
    'snowy',
    'misty',
    'clear skies',
    'golden hour haze',
    'dramatic clouds',
  ],
  mood: [
    'serene',
    'dramatic',
    'playful',
    'mysterious',
    'melancholic',
    'joyful',
    'tense',
    'dreamy',
    'triumphant',
    'intimate',
  ],
  season: ['spring', 'summer', 'autumn', 'winter'],
  timeofday: [
    'dawn',
    'early morning',
    'midday',
    'golden hour',
    'dusk',
    'twilight',
    'night',
    'midnight',
  ],
  texture: [
    'glossy',
    'matte',
    'weathered',
    'polished',
    'rough-hewn',
    'silky',
    'rugged',
    'pristine',
  ],
  expression: [
    'confident smile',
    'soft gaze',
    'determined stare',
    'gentle smile',
    'focused expression',
    'quiet laugh',
  ],
  animal: ['fox', 'wolf', 'hawk', 'owl', 'panther', 'stag', 'raven', 'lynx'],
};

/** 32-bit string hash (FNV-ish) — used to derive a numeric PRNG seed from a string. */
function hashStringToSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/** mulberry32 — tiny, fast, decent-quality deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a `() => number` in `[0, 1)`. Same seed always yields the same
 * sequence — omit `seed` (or pass an empty string) for `Math.random`.
 */
export function createDeterministicRandom(seed?: string | number | null): () => number {
  if (seed === undefined || seed === null || seed === '') {
    return Math.random;
  }
  const numericSeed =
    typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hashStringToSeed(String(seed));
  return mulberry32(numericSeed);
}

function normalizeWildcardName(name: string): string {
  return name.trim().toLowerCase();
}

/** Later maps win on key collisions; empty/invalid lists are ignored. */
export function mergeWildcardMaps(...maps: Array<WildcardMap | undefined | null>): WildcardMap {
  const merged: WildcardMap = {};
  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [key, values] of Object.entries(map)) {
      if (!Array.isArray(values)) {
        continue;
      }
      const cleaned = values
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean);
      if (cleaned.length === 0) {
        continue;
      }
      merged[normalizeWildcardName(key)] = cleaned;
    }
  }
  return merged;
}

/** Parses one `name.txt`-style file: one entry per line, `#`/`//` comments and blank lines ignored. */
export function parseWildcardListFile(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

const CHOICE_GROUP_RE = /\{([^{}|]+(?:\|[^{}|]+)+)\}/g;
const WILDCARD_TOKEN_RE = /__([a-zA-Z0-9_-]+)__/g;

/** Safety cap so a malformed/self-referential wildcard list can't loop forever. */
const MAX_EXPAND_PASSES = 5;

export type ExpandWildcardsOptions = {
  /** Extra/override wildcard lists merged on top of `DEFAULT_WILDCARDS`. */
  wildcards?: WildcardMap;
  /** Deterministic seed — same seed + text always expands identically. */
  seed?: string | number | null;
};

/**
 * Expands `__name__` list wildcards and `{a|b|c}` inline choice groups in
 * `text`. Unknown `__name__` tokens are left untouched (rather than deleted)
 * so a typo is visible in the resulting prompt instead of silently vanishing.
 */
export function expandWildcardText(text: string, options?: ExpandWildcardsOptions): string {
  if (!text) {
    return text;
  }

  const wildcards = mergeWildcardMaps(DEFAULT_WILDCARDS, options?.wildcards);
  const random = createDeterministicRandom(options?.seed);

  const pickFrom = (choices: string[]): string => {
    if (choices.length === 0) {
      return '';
    }
    const index = Math.min(choices.length - 1, Math.floor(random() * choices.length));
    return choices[index]!;
  };

  let result = text;
  for (let pass = 0; pass < MAX_EXPAND_PASSES; pass += 1) {
    let changed = false;

    result = result.replace(CHOICE_GROUP_RE, (_match, group: string) => {
      const choices = group
        .split('|')
        .map(choice => choice.trim())
        .filter(Boolean);
      if (choices.length === 0) {
        return '';
      }
      changed = true;
      return pickFrom(choices);
    });

    result = result.replace(WILDCARD_TOKEN_RE, (fullMatch, name: string) => {
      const list = wildcards[normalizeWildcardName(name)];
      if (!list || list.length === 0) {
        return fullMatch;
      }
      changed = true;
      return pickFrom(list);
    });

    if (!changed) {
      break;
    }
  }

  return result;
}

/** True when `text` contains a `__name__` token or `{a|b|c}` choice group. */
export function textHasWildcardTokens(text: string | undefined | null): boolean {
  if (!text) {
    return false;
  }
  CHOICE_GROUP_RE.lastIndex = 0;
  WILDCARD_TOKEN_RE.lastIndex = 0;
  return CHOICE_GROUP_RE.test(text) || WILDCARD_TOKEN_RE.test(text);
}

/**
 * Best-effort loader for `public/wildcards/<name>.txt` lists — fetches each
 * name and parses it with `parseWildcardListFile`. Missing/failed fetches are
 * skipped silently so callers can pass a broad "wanted" list without needing
 * every file to exist. No-op (returns `{}`) outside the browser.
 */
export async function loadWildcardsFromPublicDir(names: string[]): Promise<WildcardMap> {
  if (typeof fetch === 'undefined' || names.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    names.map(async (name): Promise<[string, string[]] | null> => {
      const trimmed = normalizeWildcardName(name);
      if (!trimmed) {
        return null;
      }
      try {
        const response = await fetch(`/wildcards/${encodeURIComponent(trimmed)}.txt`);
        if (!response.ok) {
          return null;
        }
        const list = parseWildcardListFile(await response.text());
        return list.length > 0 ? [trimmed, list] : null;
      } catch {
        return null;
      }
    })
  );

  const result: WildcardMap = {};
  for (const entry of entries) {
    if (entry) {
      result[entry[0]] = entry[1];
    }
  }
  return result;
}
