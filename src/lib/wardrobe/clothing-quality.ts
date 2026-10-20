/**
 * High-signal clothing quality helpers — compact scripts, enrichers, and
 * context-aware wardrobe negatives for system-workflow keepers.
 *
 * Keep this module free of clothing-catalog imports (catalog imports us).
 */

import {
  inferAthleticSport,
  hintsFantasyWardrobe,
  hintsWorkWardrobeAllowed,
  inferWorkProfession,
  type ClothingPickFilters,
} from './clothing-tags';

/** Filler phrases that burn wardrobe budget without helping diffusion models. */
export const CLOTHING_FILLER_PHRASES =
  /\b(?:and\s+)?(?:natural fabric creases|visible fabric weave|believable drape|believable wear|fine surface textures?|readable material weight|fine detail|natural placement on the body|displaying a distinct fabric weave|rendered with readable shape|showing sole wear, material scuffing, and believable weight on the foot)\b/gi;

const HIGH_SIGNAL_TOKEN =
  /\b(?:fit|fitted|slim|relaxed|oversized|cropped|high-waist|low-rise|tailored|coverage|scoop|v-neck|crew|midi|maxi|mini|sheer|opaque|matte|glossy|ribbed|quilted|padded|structured|layer|layered|button|zip|lace|mesh|denim|leather|wool|silk|satin|cotton|linen|jersey|technical|gore-tex|hi-vis|bib|helmet|cleats|sneakers|boots|heels|kit|uniform|scrubs|armor|robe|cloak)\b/i;

/**
 * Strip low-signal filler from catalog scripts / enricher boilerplate.
 * Prefer silhouette, color, material, coverage — what models actually follow.
 */
export function compactClothingScript(value: string): string {
  const cleaned = value
    .replace(CLOTHING_FILLER_PHRASES, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/\.\s*$/g, '')
    .trim();
  return cleaned;
}

/**
 * High-signal enrichers for Character preset custom text — coverage + material,
 * not generic crease boilerplate.
 */
export function enrichWardrobeHighSignal(value: string): string {
  const base = withArticle(value.trim());
  if (!base) {
    return '';
  }
  if (HIGH_SIGNAL_TOKEN.test(base) && base.length > 24) {
    return base;
  }
  return `${base}, clear silhouette and fabric coverage`;
}

export function enrichFootwearHighSignal(value: string): string {
  const base = withArticle(value.trim());
  if (!base) {
    return '';
  }
  return `${base}, grounded on the feet with readable sole contact`;
}

export function enrichAccessoriesHighSignal(value: string): string {
  const base = withArticle(value.trim());
  if (!base) {
    return '';
  }
  return `${base}, natural scale and placement`;
}

function withArticle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /^(?:a|an|the)\b/i.test(trimmed) ? trimmed : `a ${trimmed}`;
}

/**
 * Prefer items with high-signal tokens when trimming wardrobe budgets.
 * Keeps primary layers (first items) then high-signal accents.
 */
export function prioritizeWardrobeSummaryItems(items: string[]): string[] {
  if (items.length <= 2) {
    return items;
  }
  const primary = items.slice(0, 2);
  const rest = items.slice(2);
  const scored = rest
    .map((item, index) => ({
      item,
      index,
      score: (HIGH_SIGNAL_TOKEN.test(item) ? 4 : 0) + Math.max(0, 3 - index),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return [...primary, ...scored.map(entry => entry.item)];
}

/** Context-aware wardrobe negatives for queue steering. */
export function buildClothingNegativePack(input: {
  hints?: string;
  tool?: string;
  sport?: string | null;
  filters?: ClothingPickFilters;
}): string {
  const hints = input.hints?.trim() ?? '';
  const sport = input.sport ?? input.filters?.athleticSport ?? inferAthleticSport(hints);
  const parts: string[] = [
    'wrong outfit layers',
    'mismatched clothing',
    'clothing clipping through body',
    'floating garments',
    'duplicate outfits',
  ];

  if (sport || input.filters?.athleticActivity) {
    parts.push(
      'street clothes on athlete',
      'casual jeans on sport kit',
      'hoodie over race kit',
      'missing athletic bottoms',
      'barefoot athlete',
      'wrong sport uniform'
    );
  }

  if (sport === 'cycling') {
    parts.push(
      'no helmet on cyclist',
      'loose jeans while cycling',
      'sneakers clipped into pedals wrongly'
    );
  }

  if (sport === 'running' || sport === 'track_field') {
    parts.push('topless runner', 'bottomless runner', 'bare legs without shorts or tights');
  }

  if (input.filters?.swimwearOnly || /\b(?:swim|beach|pool)\b/i.test(hints)) {
    parts.push('street clothes over swimwear', 'jacket on swimmer', 'dress shoes at pool');
  }

  if (input.filters?.fantasyWardrobe || hintsFantasyWardrobe(hints)) {
    parts.push('modern jeans', 'sneakers', 'hoodie', 't-shirt logo', 'contemporary streetwear');
  }

  if (
    input.filters?.workWardrobe ||
    hintsWorkWardrobeAllowed(hints) ||
    inferWorkProfession(hints)
  ) {
    parts.push('wrong uniform', 'party dress at work', 'athletic kit at office');
    const profession = input.filters?.workProfession ?? inferWorkProfession(hints);
    if (profession) {
      parts.push(...professionNegativeExtras(profession));
    }
  }

  if (input.tool === 'character' || input.tool === 'duo' || input.tool === 'generate') {
    parts.push('wardrobe text overlay', 'clothing label watermark');
  }

  return [...new Set(parts)].join(', ');
}

function professionNegativeExtras(profession: string): string[] {
  switch (profession) {
    case 'chef':
      return ['cocktail dress in kitchen', 'open-toe heels in kitchen', 'loose scarf near stove'];
    case 'firefighter':
      return ['street hoodie on firefighter', 'sneakers with turnout gear'];
    case 'nurse':
    case 'doctor':
    case 'paramedic':
      return ['evening gown in clinic', 'athletic jersey in hospital'];
    case 'construction worker':
    case 'warehouse worker':
      return ['dress shoes on jobsite', 'formal suit on construction site'];
    case 'police officer':
    case 'soldier':
      return ['casual streetwear on duty', 'party outfit in uniform scene'];
    case 'waiter':
    case 'bartender':
    case 'barista':
      return ['athletic kit in service role', 'beachwear at work'];
    case 'referee':
      return ['team jersey mistaken for referee', 'casual jeans officiating'];
    case 'mail carrier':
      return ['formal gown on mail route', 'barefoot mail carrier'];
    case 'sailor':
      return ['business suit on deck', 'heels on ship deck'];
    case 'mechanic':
      return ['white dress shirt without coveralls', 'open sandals in shop'];
    default:
      return [];
  }
}
