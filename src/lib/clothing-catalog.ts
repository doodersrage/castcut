import { ALL_CLOTHING_CATALOG_ENTRIES } from './clothing-catalog-batches';
import { CLOTHING_CATALOG_FANTASY } from './clothing-catalog-fantasy';
import { categoryLabel } from './clothing-catalog-fields';
import {
  getAthleticSportProfile,
  labelMatchesAnyPattern,
  labelMatchesExcludePatterns,
  promptContainsSportWardrobeConflict,
  type AthleticSport,
} from './athletic-sport-profiles';
import {
  appendCyclingHelmetToSummary,
  sentenceContainsExcludedWardrobe,
} from './athletic-sport-actions';
import { hasDistinctPeopleStructure } from './distinct-people';
import { splitSentences } from './prompt-shape';
import { compactClothingScript, prioritizeWardrobeSummaryItems } from './clothing-quality';
import { promptContainsAvoidedTokensFromList } from './avoidance-options';
import {
  clothingAllowedInScene,
  clothingMatchesGender,
  clothingMatchesGenderForPick,
  entryHasRestrictedContext,
  hintsImplyNoClothing,
  hintsSpecifyDress,
  hintsSpecifyFootwear,
  inferDressLabelFilter,
  inferFootwearLabelFilter,
  extractBriefGarmentPhrases,
  inferClothingContexts,
  inferClothingGender,
  inferSeparateGarmentHints,
  normalizeClothingContextTags,
  PROFESSION_UNIFORM_LABEL_HINTS,
  PROFESSION_KIT_EXTRAS,
  PROFESSION_KIT_FALLBACKS,
  labelMatchesProfessionUniform,
  RESTRICTED_CLOTHING_CONTEXTS,
  sceneAttireShouldOverrideBrief,
  scoreClothingContextMatch,
  scoreClothingLabelAgainstHints,
  type ClothingContextTag,
  type ClothingGenderTag,
  type ClothingPickFilters,
  type WorkProfession,
} from './clothing-tags';

export type ClothingCategory =
  | 'outfit'
  | 'top'
  | 'bottom'
  | 'outerwear'
  | 'footwear'
  | 'accessory'
  | 'swimwear'
  | 'intimate'
  | 'hosiery'
  | 'formalwear'
  | 'dressy-accessory'
  | 'sleepwear'
  | 'underwear'
  | 'socks'
  | 'headwear'
  | 'traditional';

export const ALL_CLOTHING_CATEGORIES: ClothingCategory[] = [
  'outfit',
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
  'swimwear',
  'intimate',
  'hosiery',
  'formalwear',
  'dressy-accessory',
  'sleepwear',
  'underwear',
  'socks',
  'headwear',
  'traditional',
];

export type ClothingCatalogEntry = {
  id: string;
  label: string;
  category: ClothingCategory;
  script: string;
  gender?: ClothingGenderTag;
  contexts?: readonly ClothingContextTag[];
};

export type EnrichedClothingEntry = ClothingCatalogEntry & {
  gender: ClothingGenderTag;
  contexts: ClothingContextTag[];
};

const CATALOG: EnrichedClothingEntry[] = [
  ...(ALL_CLOTHING_CATALOG_ENTRIES as ClothingCatalogEntry[]),
  ...(CLOTHING_CATALOG_FANTASY as ClothingCatalogEntry[]),
].map(enrichEntry);

const BY_ID = new Map(CATALOG.map(entry => [entry.id, entry]));

const BY_CATEGORY = CATALOG.reduce(
  (acc, entry) => {
    (acc[entry.category] ??= []).push(entry);
    return acc;
  },
  {} as Record<ClothingCategory, EnrichedClothingEntry[]>
);

function sceneAllowsFormalwear(contexts: readonly ClothingContextTag[]): boolean {
  return contexts.includes('formal') || contexts.includes('evening');
}

function sceneAllowsHosiery(contexts: readonly ClothingContextTag[]): boolean {
  return (
    contexts.includes('formal') || contexts.includes('evening') || contexts.includes('intimate')
  );
}

function mergeCategoryContexts(
  category: ClothingCategory,
  contexts: ClothingContextTag[],
  text: string
): ClothingContextTag[] {
  const tags = new Set(contexts);

  if (category === 'swimwear') {
    tags.add('swimwear');
    tags.add('beach');
    tags.add('warm');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('cold');
  }

  if (category === 'intimate') {
    tags.add('intimate');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('outdoor');
    if (
      /\b(?:lace|satin|silk|chemise|negligee|garter|bustier|luxury|champagne|embroidered)\b/i.test(
        text
      )
    ) {
      tags.add('evening');
    }
  }

  if (category === 'hosiery') {
    tags.add('hosiery');
    tags.add('formal');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('outdoor');
    if (/\b(?:fishnet|garter|stay-up|sheer)\b/i.test(text)) {
      tags.add('intimate');
    }
    if (/\b(?:opaque|wool|ribbed|winter)\b/i.test(text)) {
      tags.add('cold');
    }
  }

  if (category === 'formalwear') {
    tags.add('formalwear');
    tags.add('formal');
    tags.add('evening');
    tags.delete('casual');
    tags.delete('work');
    tags.delete('athletic');
  }

  if (category === 'dressy-accessory') {
    tags.add('formalwear');
    tags.add('formal');
    tags.add('evening');
    tags.delete('casual');
    tags.delete('work');
  }

  if (category === 'sleepwear') {
    tags.add('sleepwear');
    tags.add('intimate');
    tags.delete('work');
    tags.delete('outdoor');
  }

  if (category === 'underwear') {
    tags.add('underwear');
    tags.add('intimate');
    tags.delete('work');
    tags.delete('outdoor');
  }

  if (category === 'socks') {
    if (/\b(?:dress|argyle)\b/i.test(text)) {
      tags.add('formal');
    }
    if (/\b(?:athletic|compression)\b/i.test(text)) {
      tags.add('athletic');
    }
    if (/\b(?:wool|merino|hiking)\b/i.test(text)) {
      tags.add('outdoor');
    }
    if (/\b(?:wool|winter|thick)\b/i.test(text)) {
      tags.add('cold');
    }
  }

  if (category === 'headwear') {
    if (/\b(?:formal|fascinator|church|cloche|boater)\b/i.test(text)) {
      tags.add('formal');
      tags.add('evening');
    }
    if (/\b(?:sun|bucket|visor)\b/i.test(text)) {
      tags.add('warm');
    }
    if (/\b(?:balaclava|knit|earmuff)\b/i.test(text)) {
      tags.add('cold');
    }
  }

  if (category === 'traditional') {
    tags.add('traditional');
    tags.add('formal');
    tags.delete('casual');
  }

  // Runtime retag: profession kit labels often land as "casual" in old batches.
  if (
    (category === 'outfit' || category === 'outerwear' || category === 'top') &&
    labelMatchesProfessionUniform(text)
  ) {
    tags.add('work');
    tags.add('uniform');
    tags.delete('casual');
  }

  return [...tags];
}

function enrichEntry(raw: ClothingCatalogEntry): EnrichedClothingEntry {
  const compactScript = compactClothingScript(raw.script) || raw.script;
  const text = `${raw.label} ${compactScript}`;
  const baseContexts = raw.contexts?.length
    ? normalizeClothingContextTags([...raw.contexts])
    : inferClothingContexts(text);

  return {
    ...raw,
    script: compactScript,
    gender:
      raw.gender ??
      (raw.category === 'hosiery' ||
      raw.category === 'formalwear' ||
      raw.category === 'dressy-accessory'
        ? 'women'
        : inferClothingGender(text)),
    contexts: mergeCategoryContexts(raw.category, baseContexts, text),
  };
}

export function getClothingCatalogSize(): number {
  return CATALOG.length;
}

export function getClothingEntry(id: string | undefined): EnrichedClothingEntry | null {
  if (!id?.trim()) {
    return null;
  }

  return BY_ID.get(id.trim()) ?? null;
}

export function getClothingScript(id: string | undefined): string | null {
  return getClothingEntry(id)?.script ?? null;
}

export function getClothingLabel(id: string | undefined): string | null {
  return getClothingEntry(id)?.label ?? null;
}

export type ClothingSelectFilters = Pick<ClothingPickFilters, 'gender'>;

export function getClothingSelectOptions(
  categories: ClothingCategory[],
  filters?: ClothingSelectFilters
): Array<{ value: string; label: string; group?: string }> {
  const options: Array<{ value: string; label: string; group?: string }> = [
    { value: '', label: 'Default (random / LLM)' },
  ];

  for (const category of categories) {
    for (const entry of BY_CATEGORY[category] ?? []) {
      if (filters && !clothingMatchesGender(entry.gender, filters.gender)) {
        continue;
      }

      options.push({
        value: entry.id,
        label: entry.label,
        group: categoryLabel(category),
      });
    }
  }

  return options;
}

export function normalizeClothingCatalogId(
  raw: string | undefined,
  allowedCategories?: ClothingCategory[],
  filters?: ClothingSelectFilters
): string {
  if (!raw?.trim()) {
    return '';
  }

  const entry = getClothingEntry(raw);
  if (!entry) {
    return '';
  }

  if (allowedCategories && !allowedCategories.includes(entry.category)) {
    return '';
  }

  if (filters && !clothingMatchesGender(entry.gender, filters.gender)) {
    return '';
  }

  return entry.id;
}

function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }

  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0]! % max;
}

function pick<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[randomInt(items.length)];
}

function isExcluded(id: string, exclude: readonly string[] | undefined): boolean {
  if (!exclude?.length) {
    return false;
  }

  return exclude.includes(id);
}

function filterPoolByGender(
  pool: readonly EnrichedClothingEntry[],
  gender: ClothingPickFilters['gender']
): EnrichedClothingEntry[] {
  const strict = pool.filter(entry =>
    clothingMatchesGenderForPick(entry.gender, entry.contexts, entry.category, gender)
  );
  if (strict.length > 0) {
    return strict;
  }

  const neutral = pool.filter(entry => entry.gender === 'neutral');
  if (neutral.length > 0) {
    return neutral;
  }

  if (gender === 'any') {
    return [...pool];
  }

  return [];
}

const FANTASY_WARDROBE_LABEL =
  /\b(?:wizard|knight|armor|armour|robe|robes|cuirass|chainmail|chain mail|plate|elven|elvish|dwarven|medieval|enchanted|sorcer|warlock|witch|oracle|druid|paladin|ranger|rogue|barbarian|leather armor|mail hauberk|tabard|tunic|cloak|greaves|gauntlets|scale mail|battle mage|ritual robe|arcane vestments|adventurer|necromancer|shaman|priestess|monk robe|fur cloak|travel cloak|enchanted gown|mythic|fantasy|bracers|sabatons|dragonscale|heraldic|spell sigil|cuirass look|ringmaster|magician tailcoat|renaissance faire)\b/i;

const MODERN_STREETWEAR_LABEL =
  /\b(?:jeans|t-shirt|graphic tee|sneaker|hoodie|chinos|loafer|cargo pants|denim jacket|baseball cap|snapback|skater outfit|farmer chore|compression top|palazzo pants|mock-neck sweater|henley|chinos|oxford dress|twinset|pencil skirt)\b/i;

const FANTASY_ROLE_LABEL_HINTS: Array<{ pattern: RegExp; label: RegExp }> = [
  {
    pattern: /\b(?:knight|paladin|crusader)\b/i,
    label: /\b(?:knight|armor|cuirass|plate|mail|paladin|tabard|greaves)\b/i,
  },
  {
    pattern: /\b(?:wizard|sorcer|mage|warlock|spellcaster)\b/i,
    label: /\b(?:wizard|robe|mage|spell|sorcer)\b/i,
  },
  {
    pattern: /\b(?:elf|elven|elvish|ranger)\b/i,
    label: /\b(?:elven|elf|ranger|leather|cloak|tunic|gown)\b/i,
  },
  {
    pattern: /\b(?:witch|necromancer)\b/i,
    label: /\b(?:witch|ritual|robe|necromancer|dark)\b/i,
  },
  {
    pattern: /\b(?:oracle|priestess|druid|cleric|prophetic)\b/i,
    label: /\b(?:oracle|ritual|robe|vestments|druid|cleric|ceremonial|shawl)\b/i,
  },
  {
    pattern: /\b(?:barbarian|warrior|rogue|adventurer)\b/i,
    label: /\b(?:leather|fur|armor|bracers|adventurer|warrior|rogue|barbarian)\b/i,
  },
  {
    pattern: /\b(?:dwarf|dwarven)\b/i,
    label: /\b(?:dwarven|dwarf|mail|hauberk|bronze)\b/i,
  },
];

function inferFantasyGarmentLabelHint(hintCorpus?: string): RegExp | null {
  const value = hintCorpus?.trim() ?? '';
  if (!value) {
    return null;
  }

  for (const { pattern, label } of FANTASY_ROLE_LABEL_HINTS) {
    if (pattern.test(value)) {
      return label;
    }
  }

  return FANTASY_WARDROBE_LABEL;
}

function filterPoolByScene(
  pool: readonly EnrichedClothingEntry[],
  sceneContexts: readonly ClothingContextTag[],
  filters?: Pick<
    ClothingPickFilters,
    'athleticActivity' | 'workWardrobe' | 'explicitCostume' | 'fantasyWardrobe'
  >
): EnrichedClothingEntry[] {
  let working = [...pool];
  const athleticActivity = filters?.athleticActivity || sceneContexts.includes('athletic');
  const workWardrobe = filters?.workWardrobe;
  const explicitCostume = filters?.explicitCostume;
  const fantasyWardrobe = filters?.fantasyWardrobe;

  if (fantasyWardrobe) {
    const fantasyPool = working.filter(
      entry =>
        entry.id.startsWith('fantasy-') ||
        (entry.contexts.includes('costume') && FANTASY_WARDROBE_LABEL.test(entry.label))
    );
    if (fantasyPool.length > 0) {
      working = fantasyPool;
    } else {
      const costumeOnly = working.filter(entry => entry.contexts.includes('costume'));
      if (costumeOnly.length > 0) {
        working = costumeOnly;
      }
    }

    const withoutModern = working.filter(entry => !MODERN_STREETWEAR_LABEL.test(entry.label));
    if (withoutModern.length > 0) {
      working = withoutModern;
    }
  }

  if (!explicitCostume) {
    const withoutCostume = working.filter(entry => !entry.contexts.includes('costume'));
    if (withoutCostume.length > 0) {
      working = withoutCostume;
    }
  }

  if (!workWardrobe) {
    const withoutServiceUniform = working.filter(
      entry =>
        (!entry.contexts.includes('uniform') || entry.contexts.includes('athletic')) &&
        !entry.contexts.includes('work') &&
        !labelMatchesProfessionUniform(entry.label) &&
        !/\b(?:steel-toe|work boot|coveralls|chore coat|hi-vis|scrubs|lab coat|chef hat|firefighter|police duty)\b/i.test(
          entry.label
        )
    );
    if (withoutServiceUniform.length > 0) {
      working = withoutServiceUniform;
    }
  }

  if (athleticActivity) {
    const athleticOnly = working.filter(
      entry =>
        entry.contexts.includes('athletic') ||
        (!entry.contexts.includes('costume') &&
          !entry.contexts.includes('formalwear') &&
          !entry.contexts.includes('formal') &&
          !entry.contexts.includes('evening') &&
          !entry.contexts.includes('uniform') &&
          !entry.contexts.includes('traditional') &&
          !entry.contexts.includes('sleepwear') &&
          !entry.contexts.includes('intimate'))
    );
    if (athleticOnly.length > 0) {
      working = athleticOnly;
    }
  }

  const allowed = working.filter(entry => clothingAllowedInScene(entry.contexts, sceneContexts));

  if (allowed.length > 0) {
    return allowed;
  }

  const sceneRequiresRestricted = sceneContexts.some(tag =>
    RESTRICTED_CLOTHING_CONTEXTS.includes(tag)
  );
  if (sceneRequiresRestricted) {
    return [];
  }

  return working.filter(entry => !entryHasRestrictedContext(entry.contexts));
}

function filterPoolByAvoidedTokens(
  pool: readonly EnrichedClothingEntry[],
  avoidedTokens?: readonly string[]
): readonly EnrichedClothingEntry[] {
  if (!avoidedTokens?.length) {
    return pool;
  }
  const filtered = pool.filter(
    entry => !promptContainsAvoidedTokensFromList(entry.label, avoidedTokens)
  );
  return filtered.length > 0 ? filtered : pool;
}

function pickScoredEntry(
  pool: readonly EnrichedClothingEntry[],
  contexts: readonly ClothingContextTag[],
  exclude: readonly string[] = [],
  filters?: Pick<
    ClothingPickFilters,
    | 'athleticActivity'
    | 'workWardrobe'
    | 'explicitCostume'
    | 'fantasyWardrobe'
    | 'avoidedTokens'
    | 'hintCorpus'
  >
): EnrichedClothingEntry | null {
  if (pool.length === 0) {
    return null;
  }

  const scenePool = filterPoolByAvoidedTokens(
    filterPoolByScene(pool, contexts, filters),
    filters?.avoidedTokens
  );
  if (scenePool.length === 0) {
    return null;
  }

  const scored = scenePool.map(entry => ({
    entry,
    score:
      scoreClothingContextMatch(entry.contexts, contexts) +
      scoreClothingLabelAgainstHints(entry.label, filters?.hintCorpus),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  // Prefer a tight top tier when hint-label matches dominate; otherwise keep the
  // prior "all at top score" behavior for pure context rolls.
  const labelMatched = scored.some(
    item => scoreClothingLabelAgainstHints(item.entry.label, filters?.hintCorpus) > 0
  );
  const tier = scored.filter(item =>
    labelMatched
      ? item.score >= Math.max(topScore - 2, topScore * 0.85)
      : item.score >= topScore || (topScore === 0 && item.score === 0)
  );

  if (tier.length === 0) {
    return null;
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const chosen = pick(tier);
    const candidate = chosen?.entry;
    if (candidate && !isExcluded(candidate.id, exclude)) {
      return candidate;
    }
  }

  const fallback = tier.find(item => !isExcluded(item.entry.id, exclude));
  if (fallback) {
    return fallback.entry;
  }

  const sceneFallback = scenePool.find(entry => !isExcluded(entry.id, exclude));
  return sceneFallback ?? null;
}

function pickFilterFlags(
  filters: ClothingPickFilters
): Pick<
  ClothingPickFilters,
  | 'athleticActivity'
  | 'workWardrobe'
  | 'explicitCostume'
  | 'fantasyWardrobe'
  | 'hintCorpus'
  | 'avoidedTokens'
> {
  return {
    athleticActivity: filters.athleticActivity,
    workWardrobe: filters.workWardrobe,
    explicitCostume: filters.explicitCostume,
    fantasyWardrobe: filters.fantasyWardrobe,
    hintCorpus: filters.hintCorpus,
    avoidedTokens: filters.avoidedTokens,
  };
}

function shouldPreferOutfitBundle(filters: ClothingPickFilters): boolean {
  if (hintsSpecifyDress(filters.hintCorpus)) {
    return true;
  }
  if (filters.explicitCostume && filters.contexts.includes('costume')) {
    return true;
  }
  if (filters.workProfession && filters.workWardrobe) {
    return randomInt(100) < 78;
  }
  if (filters.workWardrobe && filters.contexts.includes('uniform')) {
    return randomInt(100) < 50;
  }
  if (sceneAllowsFormalwear(filters.contexts)) {
    return randomInt(100) < 28;
  }
  return randomInt(100) < 10;
}

function pickProfessionGarment(filters: ClothingPickFilters): EnrichedClothingEntry | null {
  const profession = filters.workProfession;
  if (!profession || !filters.workWardrobe) {
    return null;
  }

  const labelHint = PROFESSION_UNIFORM_LABEL_HINTS[profession];
  if (!labelHint) {
    return null;
  }

  const categories: ClothingCategory[] = ['outfit', 'outerwear', 'top'];
  for (const category of categories) {
    const basePool = (BY_CATEGORY[category] ?? []).filter(entry => labelHint.test(entry.label));
    if (basePool.length === 0) {
      continue;
    }

    const taggedPool = basePool.filter(
      entry => entry.contexts.includes('work') || entry.contexts.includes('uniform')
    );
    const preferred = taggedPool.length > 0 ? taggedPool : basePool;

    const genderPool = filterPoolByGender(preferred, filters.gender);
    const categoryPool = filterPoolByCategory(genderPool, category, filters);
    const pickFlags = pickFilterFlags(filters);
    const picked =
      pickScoredEntry(categoryPool, filters.contexts, filters.excludeIds, pickFlags) ??
      pickScoredEntry(genderPool, filters.contexts, filters.excludeIds, pickFlags);

    if (picked) {
      return picked;
    }
  }

  return professionFallbackEntry(profession);
}

function professionFallbackEntry(profession: WorkProfession): EnrichedClothingEntry {
  const summary = PROFESSION_KIT_FALLBACKS[profession];
  const label = summary.split(',')[0]?.trim() || profession;
  return {
    id: `profession-fallback-${profession.replace(/\s+/g, '-')}`,
    label,
    category: 'outfit',
    script: summary,
    gender: 'neutral',
    contexts: ['work', 'uniform'],
  };
}

function pickFantasyGarment(filters: ClothingPickFilters): EnrichedClothingEntry | null {
  if (!filters.fantasyWardrobe) {
    return null;
  }

  const labelHint = inferFantasyGarmentLabelHint(filters.hintCorpus);
  const categories: ClothingCategory[] = ['outfit', 'outerwear', 'top'];
  const pickFlags = pickFilterFlags(filters);

  for (const category of categories) {
    let basePool = (BY_CATEGORY[category] ?? []).filter(
      entry =>
        entry.id.startsWith('fantasy-') ||
        (entry.contexts.includes('costume') && FANTASY_WARDROBE_LABEL.test(entry.label))
    );

    if (labelHint) {
      const rolePool = basePool.filter(entry => labelHint.test(entry.label));
      if (rolePool.length > 0) {
        basePool = rolePool;
      }
    }

    if (basePool.length === 0) {
      continue;
    }

    const genderPool = filterPoolByGender(basePool, filters.gender);
    const categoryPool = filterPoolByCategory(genderPool, category, filters);
    const picked =
      pickScoredEntry(categoryPool, filters.contexts, filters.excludeIds, pickFlags) ??
      pickScoredEntry(genderPool, filters.contexts, filters.excludeIds, pickFlags);

    if (picked) {
      return picked;
    }
  }

  return null;
}

function pickDressGarment(filters: ClothingPickFilters): EnrichedClothingEntry | null {
  const labelFilter = inferDressLabelFilter(filters.hintCorpus);
  let basePool = (BY_CATEGORY.outfit ?? []).filter(entry => /\bdress\b/i.test(entry.label));
  if (basePool.length === 0) {
    return null;
  }

  if (labelFilter) {
    const styledPool = basePool.filter(entry => labelFilter.test(entry.label));
    if (styledPool.length === 0) {
      return null;
    }
    basePool = styledPool;
  }

  const genderPool = filterPoolByGender(basePool, filters.gender);
  const categoryPool = filterPoolByCategory(genderPool, 'outfit', filters);
  const pickFlags = pickFilterFlags(filters);

  return (
    pickScoredEntry(categoryPool, filters.contexts, filters.excludeIds, pickFlags) ??
    pickScoredEntry(genderPool, filters.contexts, filters.excludeIds, pickFlags)
  );
}

function pickFootwearFromHints(filters: ClothingPickFilters): EnrichedClothingEntry | null {
  const labelFilter = inferFootwearLabelFilter(filters.hintCorpus);
  if (!labelFilter) {
    return null;
  }

  const basePool = (BY_CATEGORY.footwear ?? []).filter(entry => labelFilter.test(entry.label));
  if (basePool.length === 0) {
    return null;
  }

  const genderPool = filterPoolByGender(basePool, filters.gender);
  const categoryPool = filterPoolByCategory(genderPool, 'footwear', filters);
  const pickFlags = pickFilterFlags(filters);

  return (
    pickScoredEntry(categoryPool, filters.contexts, filters.excludeIds, pickFlags) ??
    pickScoredEntry(genderPool, filters.contexts, filters.excludeIds, pickFlags)
  );
}

function pickLayersMatchingBriefSeparates(filters: ClothingPickFilters): {
  wardrobe: EnrichedClothingEntry | null;
  bottom: EnrichedClothingEntry | null;
} {
  const separates = inferSeparateGarmentHints(filters.hintCorpus);
  if (separates.length === 0) {
    return { wardrobe: null, bottom: null };
  }

  let wardrobe: EnrichedClothingEntry | null = null;
  let bottom: EnrichedClothingEntry | null = null;

  for (const hint of separates) {
    for (const category of hint.categories) {
      if (category === 'footwear') {
        continue;
      }
      const picked = pickFromCategoryMatchingLabel(category, filters, hint.label);
      if (!picked) {
        continue;
      }
      if ((category === 'top' || category === 'outerwear' || category === 'outfit') && !wardrobe) {
        wardrobe = picked;
        break;
      }
      if (category === 'bottom' && !bottom) {
        bottom = picked;
        break;
      }
    }
  }

  return { wardrobe, bottom };
}

function pickFootwearMatchingBriefSeparates(
  filters: ClothingPickFilters
): EnrichedClothingEntry | null {
  const separates = inferSeparateGarmentHints(filters.hintCorpus).filter(hint =>
    hint.categories.includes('footwear')
  );
  for (const hint of separates) {
    const picked = pickFromCategoryMatchingLabel('footwear', filters, hint.label);
    if (picked) {
      return picked;
    }
  }
  return null;
}

function pickWardrobeLayers(filters: ClothingPickFilters): {
  wardrobe: EnrichedClothingEntry | null;
  bottom: EnrichedClothingEntry | null;
} {
  const overrideBrief = sceneAttireShouldOverrideBrief({
    hints: filters.hintCorpus,
    contexts: filters.contexts,
    athleticSport: filters.athleticSport,
    athleticActivity: filters.athleticActivity,
    swimwearOnlyCandidate: filters.swimwearOnly || filters.contexts.includes('swimwear'),
  });

  if (filters.lockPrimaryGarment && !overrideBrief) {
    if (hintsSpecifyDress(filters.hintCorpus)) {
      const dress = pickDressGarment(filters);
      if (dress) {
        return { wardrobe: dress, bottom: null };
      }
    }
    const briefLayers = pickLayersMatchingBriefSeparates(filters);
    if (briefLayers.wardrobe || briefLayers.bottom) {
      return briefLayers;
    }
    return { wardrobe: null, bottom: null };
  }

  if (!overrideBrief) {
    const briefLayers = pickLayersMatchingBriefSeparates(filters);
    if (briefLayers.wardrobe && briefLayers.bottom) {
      return briefLayers;
    }
    if (briefLayers.wardrobe || briefLayers.bottom) {
      return {
        wardrobe: briefLayers.wardrobe ?? pickFromCategory('top', filters),
        bottom: briefLayers.bottom ?? pickFromCategory('bottom', filters),
      };
    }
  }

  if (filters.fantasyWardrobe) {
    const fantasyGarment = pickFantasyGarment(filters);
    if (fantasyGarment) {
      return { wardrobe: fantasyGarment, bottom: null };
    }
  }

  if (filters.workWardrobe && filters.workProfession) {
    const professionGarment = pickProfessionGarment(filters);
    if (professionGarment) {
      return { wardrobe: professionGarment, bottom: null };
    }
  }

  if (filters.contexts.includes('swimwear')) {
    const swimwear = pickFromCategory('swimwear', filters);
    if (swimwear) {
      return { wardrobe: swimwear, bottom: null };
    }
    if (filters.swimwearOnly) {
      return { wardrobe: null, bottom: null };
    }
  }

  if (filters.intimateWardrobe && filters.contexts.includes('intimate')) {
    const intimate = pickFromCategory('intimate', filters);
    if (intimate) {
      return { wardrobe: intimate, bottom: null };
    }
  }

  if (filters.athleticActivity || filters.contexts.includes('athletic')) {
    if (filters.athleticSport) {
      const sportLayers = pickSportWardrobeLayers(filters);
      if (sportLayers.wardrobe || sportLayers.bottom) {
        return sportLayers;
      }
    } else {
      const athletic = pickAthleticWardrobeLayers(filters);
      if (athletic.wardrobe || athletic.bottom) {
        return athletic;
      }
    }
  }

  if (
    filters.contexts.includes('cold') &&
    !filters.contexts.includes('warm') &&
    !filters.athleticActivity
  ) {
    const outerwear = pickFromCategory('outerwear', filters);
    const bottom = pickFromCategory('bottom', filters);
    if (outerwear) {
      return { wardrobe: outerwear, bottom };
    }
    if (bottom) {
      return { wardrobe: pickFromCategory('top', filters), bottom };
    }
  }

  if (sceneAllowsFormalwear(filters.contexts) && randomInt(100) < 38) {
    const formalwear = pickFromCategory('formalwear', filters);
    if (formalwear) {
      return { wardrobe: formalwear, bottom: null };
    }
  }

  if (
    (filters.contexts.includes('formal') ||
      filters.contexts.includes('costume') ||
      filters.contexts.includes('traditional')) &&
    randomInt(100) < 22
  ) {
    const traditional = pickFromCategory('traditional', filters);
    if (traditional) {
      return { wardrobe: traditional, bottom: null };
    }
  }

  if (filters.intimateWardrobe && filters.contexts.includes('intimate') && randomInt(100) < 30) {
    const sleepwear = pickFromCategory('sleepwear', filters);
    if (sleepwear) {
      return { wardrobe: sleepwear, bottom: null };
    }
  }

  if (filters.athleticActivity) {
    if (filters.athleticSport) {
      return pickSportWardrobeLayers(filters);
    }
    return pickAthleticWardrobeLayers(filters);
  }

  if (filters.athleticSport) {
    return pickSportWardrobeLayers(filters);
  }

  if (shouldPreferOutfitBundle(filters)) {
    const outfit = pickFromCategory('outfit', filters);
    if (outfit) {
      return { wardrobe: outfit, bottom: null };
    }
  }

  return {
    wardrobe: pickFromCategory('top', filters),
    bottom: pickFromCategory('bottom', filters),
  };
}

function filterPoolByCategory(
  pool: readonly EnrichedClothingEntry[],
  category: ClothingCategory,
  filters: ClothingPickFilters
): readonly EnrichedClothingEntry[] {
  if (pool.length === 0) {
    return pool;
  }

  const contexts = filters.contexts;
  let working = [...pool];

  if (category === 'footwear') {
    if (filters.fantasyWardrobe) {
      const fantasyFootwear = working.filter(
        entry =>
          entry.id.startsWith('fantasy-') ||
          entry.contexts.includes('costume') ||
          /\b(?:boot|greave|sabatons?|riding boot|war boot|leather boot)\b/i.test(entry.label)
      );
      if (fantasyFootwear.length > 0) {
        working = fantasyFootwear.filter(entry => !MODERN_STREETWEAR_LABEL.test(entry.label));
        if (working.length === 0) {
          working = fantasyFootwear;
        }
      }
    } else if (filters.athleticSport) {
      working = [...applyAthleticSportCategoryFilter(working, filters.athleticSport, 'footwear')];
    } else if (filters.athleticActivity || contexts.includes('athletic')) {
      const athletic = working.filter(
        entry =>
          entry.contexts.includes('athletic') ||
          /\b(?:running|cleats|trainer|sneaker|trail runner|soccer|basketball)\b/i.test(entry.label)
      );
      if (athletic.length > 0) {
        working = athletic;
      }
    } else if (contexts.includes('cold') || contexts.includes('wet')) {
      const closed = working.filter(
        entry =>
          entry.contexts.includes('cold') ||
          entry.contexts.includes('wet') ||
          entry.contexts.includes('outdoor') ||
          !/\b(?:sandal|flip-flop|espadrille|slide|heel)\b/i.test(entry.label)
      );
      if (closed.length > 0) {
        working = closed;
      }
    } else if (contexts.includes('beach') || contexts.includes('swimwear')) {
      const open = working.filter(
        entry =>
          entry.contexts.includes('warm') ||
          entry.contexts.includes('beach') ||
          /\b(?:sandal|flip-flop|slide|espadrille|water shoe|beach)\b/i.test(entry.label)
      );
      if (open.length > 0) {
        working = open;
      }
    } else if (contexts.includes('formal') || contexts.includes('evening')) {
      const formal = working.filter(
        entry =>
          entry.contexts.includes('formal') ||
          entry.contexts.includes('evening') ||
          /\b(?:heel|oxford|loafer|pump|stiletto|dress shoe|brogue)\b/i.test(entry.label)
      );
      if (formal.length > 0) {
        working = formal;
      }
    } else if (filters.workWardrobe) {
      const work = working.filter(
        entry =>
          entry.contexts.includes('work') ||
          entry.contexts.includes('outdoor') ||
          /\b(?:work boot|steel-toe|chelsea boot|derby)\b/i.test(entry.label)
      );
      if (work.length > 0) {
        working = work;
      }
    }
  }

  if (
    category === 'headwear' &&
    (contexts.includes('cold') || contexts.includes('wet') || contexts.includes('outdoor'))
  ) {
    const practical = working.filter(
      entry =>
        entry.contexts.includes('cold') ||
        entry.contexts.includes('outdoor') ||
        entry.contexts.includes('wet') ||
        !entry.contexts.includes('formal')
    );
    if (practical.length > 0) {
      working = practical;
    }
  }

  if (filters.athleticSport) {
    working = [...applyAthleticSportCategoryFilter(working, filters.athleticSport, category)];
  }

  if (
    category === 'bottom' &&
    contexts.includes('swimwear') &&
    filters.athleticSport !== 'cycling'
  ) {
    const swim = working.filter(
      entry =>
        entry.contexts.includes('swimwear') ||
        entry.contexts.includes('warm') ||
        /\b(?:swim|board short|rash guard)\b/i.test(entry.label)
    );
    if (swim.length > 0) {
      working = swim;
    }
  }

  return working;
}

function garmentLabelsRedundant(primary: string, secondary: string): boolean {
  const a = primary.toLowerCase().trim();
  const b = secondary.toLowerCase().trim();
  if (!a || !b) {
    return false;
  }

  if (a.includes(b) || b.includes(a)) {
    return true;
  }

  const garmentTypes = [
    'shorts',
    'jeans',
    'pants',
    'skirt',
    'dress',
    'robe',
    'singlet',
    'jersey',
    'boots',
    'shoes',
    'sneakers',
    'sandals',
    'trunks',
    'swimsuit',
    'bikini',
  ];

  return garmentTypes.some(type => a.includes(type) && b.includes(type));
}

function dedupeWardrobeLayers(
  wardrobe: EnrichedClothingEntry | null,
  bottom: EnrichedClothingEntry | null,
  footwear: EnrichedClothingEntry | null
): {
  wardrobe: EnrichedClothingEntry | null;
  bottom: EnrichedClothingEntry | null;
  footwear: EnrichedClothingEntry | null;
} {
  const nextWardrobe = wardrobe;
  let nextBottom = bottom;
  let nextFootwear = footwear;

  if (nextWardrobe && nextBottom && garmentLabelsRedundant(nextWardrobe.label, nextBottom.label)) {
    nextBottom = null;
  }

  if (
    nextWardrobe &&
    nextFootwear &&
    garmentLabelsRedundant(nextWardrobe.label, nextFootwear.label)
  ) {
    nextFootwear = null;
  }

  if (nextBottom && nextFootwear && garmentLabelsRedundant(nextBottom.label, nextFootwear.label)) {
    nextFootwear = null;
  }

  return {
    wardrobe: nextWardrobe,
    bottom: nextBottom,
    footwear: nextFootwear,
  };
}

function shouldPickAccentLayer(filters: ClothingPickFilters, coreLayerCount: number): boolean {
  if (filters.lockPrimaryGarment) {
    return false;
  }

  if (filters.swimwearOnly) {
    return false;
  }

  if (filters.athleticActivity || filters.contexts.includes('swimwear')) {
    return false;
  }

  if (filters.intimateWardrobe && !sceneAllowsFormalwear(filters.contexts)) {
    return coreLayerCount < 3;
  }

  if (coreLayerCount >= 3 && !sceneAllowsFormalwear(filters.contexts)) {
    return false;
  }

  return true;
}

function pickFromCategory(
  category: ClothingCategory,
  filters: ClothingPickFilters
): EnrichedClothingEntry | null {
  const basePool = BY_CATEGORY[category] ?? [];
  if (basePool.length === 0) {
    return null;
  }

  const genderPool = filterPoolByGender(basePool, filters.gender);
  const categoryPool = filterPoolByCategory(genderPool, category, filters);
  const pickFlags = pickFilterFlags(filters);
  let picked = pickScoredEntry(categoryPool, filters.contexts, filters.excludeIds, pickFlags);

  const sceneRequiresRestricted = filters.contexts.some(tag =>
    RESTRICTED_CLOTHING_CONTEXTS.includes(tag)
  );

  if (!picked && filters.contexts.length > 1 && !sceneRequiresRestricted) {
    picked = pickScoredEntry(categoryPool, ['casual'], filters.excludeIds, pickFlags);
  }

  if (!picked && !sceneRequiresRestricted) {
    picked = pickScoredEntry(categoryPool, [], filters.excludeIds, pickFlags);
  }

  return picked;
}

function pickFromCategoryMatchingLabel(
  category: ClothingCategory,
  filters: ClothingPickFilters,
  labelPattern: RegExp
): EnrichedClothingEntry | null {
  return pickFromCategoryMatchingAnyLabel(category, filters, [labelPattern]);
}

function pickFromCategoryMatchingAnyLabel(
  category: ClothingCategory,
  filters: ClothingPickFilters,
  labelPatterns: readonly RegExp[]
): EnrichedClothingEntry | null {
  if (labelPatterns.length === 0) {
    return null;
  }

  const basePool = BY_CATEGORY[category] ?? [];
  if (basePool.length === 0) {
    return null;
  }

  const genderPool = filterPoolByGender(basePool, filters.gender);
  const categoryPool = filterPoolByCategory(genderPool, category, filters);
  const matched = categoryPool.filter(entry => labelMatchesAnyPattern(entry.label, labelPatterns));
  if (matched.length === 0) {
    return null;
  }

  return pickScoredEntry(matched, filters.contexts, filters.excludeIds, pickFilterFlags(filters));
}

function applyAthleticSportCategoryFilter(
  pool: readonly EnrichedClothingEntry[],
  sport: AthleticSport,
  category: ClothingCategory
): readonly EnrichedClothingEntry[] {
  const profile = getAthleticSportProfile(sport);
  if (!profile) {
    return pool;
  }

  let patterns: readonly RegExp[] = [];
  if (category === 'footwear') {
    patterns = profile.footwearLabels;
  } else if (category === 'top' && profile.topLabels?.length) {
    patterns = profile.topLabels;
  } else if (category === 'bottom' && profile.bottomLabels?.length) {
    patterns = profile.bottomLabels;
  } else if (category === 'outfit' && profile.outfitLabels.length > 0) {
    patterns = profile.outfitLabels;
  } else if (category === 'outerwear' && profile.outerwearLabels?.length) {
    patterns = profile.outerwearLabels;
  } else {
    return pool.filter(entry => !labelMatchesExcludePatterns(entry.label, profile.excludeLabels));
  }

  const matched = pool.filter(entry => {
    if (!labelMatchesAnyPattern(entry.label, patterns)) {
      return false;
    }

    if (labelMatchesExcludePatterns(entry.label, profile.excludeLabels)) {
      return false;
    }

    if (
      sport === 'cycling' &&
      category === 'footwear' &&
      /\bcleats\b/i.test(entry.label) &&
      /\bsoccer cleats\b/i.test(entry.label)
    ) {
      return false;
    }

    return true;
  });
  if (matched.length > 0) {
    return matched;
  }

  if (category === 'footwear') {
    const footwearFallback = pool.filter(
      entry =>
        !labelMatchesExcludePatterns(entry.label, profile.excludeLabels) &&
        !(sport === 'cycling' && /\b(?:running shoes|soccer cleats)\b/i.test(entry.label))
    );
    if (footwearFallback.length > 0) {
      return footwearFallback;
    }
  }

  const excluded = pool.filter(
    entry => !labelMatchesExcludePatterns(entry.label, profile.excludeLabels)
  );
  return excluded.length > 0 ? excluded : pool;
}

function pickSportWardrobeLayers(filters: ClothingPickFilters): {
  wardrobe: EnrichedClothingEntry | null;
  bottom: EnrichedClothingEntry | null;
} {
  const profile = getAthleticSportProfile(filters.athleticSport ?? null);
  if (!profile) {
    return { wardrobe: null, bottom: null };
  }

  if (profile.outfitLabels.length > 0) {
    const outfit = pickFromCategoryMatchingAnyLabel('outfit', filters, profile.outfitLabels);
    if (outfit) {
      return { wardrobe: outfit, bottom: null };
    }
  }

  if (profile.outerwearLabels?.length) {
    const outerwear = pickFromCategoryMatchingAnyLabel(
      'outerwear',
      filters,
      profile.outerwearLabels
    );
    if (outerwear) {
      const bottom = profile.bottomLabels?.length
        ? pickFromCategoryMatchingAnyLabel('bottom', filters, profile.bottomLabels)
        : pickFromCategory('bottom', filters);
      return { wardrobe: outerwear, bottom };
    }
  }

  const top = profile.topLabels?.length
    ? pickFromCategoryMatchingAnyLabel('top', filters, profile.topLabels)
    : null;
  let bottom = profile.bottomLabels?.length
    ? pickFromCategoryMatchingAnyLabel('bottom', filters, profile.bottomLabels)
    : null;
  if (top && !bottom && profile.bottomLabels?.length) {
    bottom =
      pickFromCategoryMatchingAnyLabel('bottom', filters, profile.bottomLabels) ??
      pickFromCategory('bottom', filters);
  }
  if (top || bottom) {
    return { wardrobe: top, bottom };
  }

  if (profile.outfitLabels.length > 0) {
    const outfit = pickFromCategoryMatchingAnyLabel('outfit', filters, profile.outfitLabels);
    if (outfit) {
      return { wardrobe: outfit, bottom: null };
    }
  }

  return { wardrobe: null, bottom: null };
}

function pickAthleticWardrobeLayers(filters: ClothingPickFilters): {
  wardrobe: EnrichedClothingEntry | null;
  bottom: EnrichedClothingEntry | null;
} {
  const top = pickFromCategory('top', filters);
  const bottom = pickFromCategory('bottom', filters);
  if (top || bottom) {
    return { wardrobe: top, bottom };
  }

  const outerwear = pickFromCategory('outerwear', filters);
  if (outerwear) {
    return { wardrobe: outerwear, bottom: null };
  }

  return { wardrobe: null, bottom: null };
}

export type RandomCharacterOutfit = {
  wardrobeId: string | null;
  bottomId: string | null;
  footwearId: string | null;
  accessoriesId: string | null;
  wardrobe: string | null;
  footwear: string | null;
  accessories: string | null;
  summary: string;
  filters: ClothingPickFilters;
};

export function pickRandomCharacterOutfit(
  filters: ClothingPickFilters = { gender: 'any', contexts: ['casual'] }
): RandomCharacterOutfit {
  if (filters.skipWardrobeRolls) {
    return {
      wardrobeId: null,
      bottomId: null,
      footwearId: null,
      accessoriesId: null,
      wardrobe: null,
      footwear: null,
      accessories: null,
      summary: '',
      filters,
    };
  }

  const used = new Set(filters.excludeIds ?? []);
  const workingFilters: ClothingPickFilters = {
    ...filters,
    excludeIds: [...used],
  };

  const useIntimateFootwear =
    filters.intimateWardrobe && filters.contexts.includes('intimate') && randomInt(100) < 35;

  const { wardrobe, bottom } = pickWardrobeLayers(workingFilters);
  const footwear =
    useIntimateFootwear || filters.swimwearOnly
      ? null
      : filters.lockPrimaryGarment && hintsSpecifyFootwear(workingFilters.hintCorpus)
        ? pickFootwearFromHints(workingFilters)
        : filters.lockPrimaryGarment
          ? pickFootwearMatchingBriefSeparates(workingFilters)
          : pickFromCategory('footwear', workingFilters);

  const deduped = dedupeWardrobeLayers(wardrobe, bottom, footwear);
  const coreLayerCount = [deduped.wardrobe, deduped.bottom, deduped.footwear].filter(
    Boolean
  ).length;

  let accent: EnrichedClothingEntry | null = null;
  if (shouldPickAccentLayer(filters, coreLayerCount)) {
    if (sceneAllowsFormalwear(filters.contexts) && randomInt(100) < 28) {
      accent = pickFromCategory('dressy-accessory', workingFilters);
    }
    if (!accent && sceneAllowsHosiery(filters.contexts) && randomInt(100) < 22) {
      accent = pickFromCategory('hosiery', workingFilters);
    }
    if (!accent && coreLayerCount < 3 && randomInt(100) < 14) {
      accent = pickFromCategory('headwear', workingFilters);
    }
    if (!accent && coreLayerCount < 3 && randomInt(100) < 18) {
      accent = pickFromCategory('accessory', workingFilters);
    }
  }

  const layers = [deduped.wardrobe, deduped.bottom, deduped.footwear, accent].filter(
    (entry): entry is EnrichedClothingEntry => Boolean(entry)
  );

  for (const entry of layers) {
    used.add(entry.id);
  }

  const labels = layers.map(entry => entry.label);
  if (
    filters.workProfession &&
    filters.workWardrobe &&
    deduped.wardrobe &&
    (PROFESSION_UNIFORM_LABEL_HINTS[filters.workProfession]?.test(deduped.wardrobe.label) ||
      deduped.wardrobe.id.startsWith('profession-fallback-'))
  ) {
    for (const extra of PROFESSION_KIT_EXTRAS[filters.workProfession] ?? []) {
      if (!labels.some(label => label.toLowerCase().includes(extra.toLowerCase()))) {
        labels.push(extra);
      }
      if (labels.length >= 5) {
        break;
      }
    }
  }

  let summary =
    filters.athleticSport === 'cycling'
      ? appendCyclingHelmetToSummary(labels.join(', '), filters.hintCorpus)
      : labels.join(', ');

  if (!summary.trim() && filters.lockPrimaryGarment) {
    summary = extractBriefGarmentPhrases(filters.hintCorpus).join(', ');
  }

  return {
    wardrobeId: deduped.wardrobe?.id ?? null,
    bottomId: deduped.bottom?.id ?? null,
    footwearId: deduped.footwear?.id ?? null,
    accessoriesId: accent?.id ?? null,
    wardrobe: deduped.wardrobe?.script ?? null,
    footwear: deduped.footwear?.script ?? null,
    accessories: accent?.script ?? null,
    summary,
    filters,
  };
}

export function buildOutfitFromLockedWardrobeId(
  wardrobeId: string,
  filters: ClothingPickFilters = { gender: 'any', contexts: ['casual'] }
): RandomCharacterOutfit | null {
  const entry = getClothingEntry(wardrobeId.trim());
  if (!entry) {
    return null;
  }

  const summary =
    filters.athleticSport === 'cycling'
      ? appendCyclingHelmetToSummary(entry.label, filters.hintCorpus)
      : entry.label;

  const result: RandomCharacterOutfit = {
    wardrobeId: null,
    bottomId: null,
    footwearId: null,
    accessoriesId: null,
    wardrobe: null,
    footwear: null,
    accessories: null,
    summary,
    filters,
  };

  switch (entry.category) {
    case 'footwear':
      result.footwearId = entry.id;
      result.footwear = entry.script;
      break;
    case 'bottom':
      result.bottomId = entry.id;
      result.wardrobe = entry.script;
      break;
    default:
      result.wardrobeId = entry.id;
      result.wardrobe = entry.script;
      break;
  }

  return result;
}

export function wardrobeBudgetForPrompt(maxChars: number, peopleCount = 1): number {
  // High-signal labels need more room than filler scripts — allow denser kits.
  const share = peopleCount > 1 ? 0.26 : 0.22;
  const budget = Math.floor(maxChars * share);
  return Math.max(48, Math.min(peopleCount > 1 ? 140 : 168, budget));
}

export type WardrobeAssignmentLike = {
  label?: string;
  summary: string;
  wardrobeId?: string | null;
  bottomId?: string | null;
  footwearId?: string | null;
  accessoriesId?: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function collectWardrobeEntryIds(
  ...sources: Array<{
    wardrobeId?: string | null;
    bottomId?: string | null;
    footwearId?: string | null;
    accessoriesId?: string | null;
  }>
): string[] {
  const ids: string[] = [];
  for (const source of sources) {
    for (const id of [
      source.wardrobeId,
      source.bottomId,
      source.footwearId,
      source.accessoriesId,
    ]) {
      if (id?.trim()) {
        ids.push(id.trim());
      }
    }
  }
  return ids;
}

/** Replace leaked catalog scripts in merged prompts with short labels. */
export function sanitizeCatalogScriptsInPrompt(
  prompt: string,
  entryIds?: readonly string[]
): string {
  if (!prompt.trim() || !entryIds?.length) {
    return prompt.trim();
  }

  let result = prompt;
  for (const id of entryIds) {
    const entry = getClothingEntry(id);
    if (!entry) {
      continue;
    }

    const script = entry.script.trim();
    if (script.length < 24) {
      continue;
    }

    const fullPattern = new RegExp(escapeRegExp(script), 'gi');
    if (fullPattern.test(result)) {
      result = result.replace(fullPattern, entry.label);
      continue;
    }

    const withoutArticle = script.replace(/^a\s+/i, '').trim();
    if (withoutArticle.length >= 20) {
      const partialPattern = new RegExp(`\\ba\\s+${escapeRegExp(withoutArticle)}`, 'gi');
      result = result.replace(partialPattern, entry.label);
    }
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

function wardrobeSummaryPresent(prompt: string, summary: string): boolean {
  const normPrompt = prompt.toLowerCase();
  const chunks = summary
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length >= 5);

  return chunks.some(chunk =>
    normPrompt.includes(chunk.toLowerCase().slice(0, Math.min(24, chunk.length)))
  );
}

function sentenceMatchesWardrobeLabel(sentence: string, label: string | undefined): boolean {
  if (!label?.trim()) {
    return false;
  }

  const lower = sentence.toLowerCase();
  const labelLower = label.toLowerCase();

  if (
    labelLower.includes('left') &&
    /\b(on the left|to the left|left-hand|left side)\b/.test(lower)
  ) {
    return true;
  }

  if (
    labelLower.includes('right') &&
    /\b(on the right|to the right|right-hand|right side)\b/.test(lower)
  ) {
    return true;
  }

  const personNumber = labelLower.match(/person\s+(\d+)/)?.[1];
  if (personNumber && new RegExp(`\\bperson\\s+${personNumber}\\b`, 'i').test(lower)) {
    return true;
  }

  if (personNumber === '3' && /\b(center|middle|between them)\b/.test(lower)) {
    return true;
  }

  return false;
}

function injectWardrobeIntoSentence(sentence: string, wardrobe: string): string {
  if (/\bwearing\b/i.test(sentence)) {
    return sentence;
  }

  const compact = wardrobe.replace(/\.$/, '').trim();
  if (!compact) {
    return sentence;
  }

  const trimmed = sentence.trim();
  if (!trimmed) {
    return `Wearing ${compact}.`;
  }

  if (/[.!?]$/.test(trimmed)) {
    return `${trimmed.slice(0, -1)}, wearing ${compact}${trimmed.at(-1)!}`;
  }

  return `${trimmed}, wearing ${compact}.`;
}

function stripSportConflictGarments(prompt: string, sport: AthleticSport): string {
  const profile = getAthleticSportProfile(sport);
  if (!profile) {
    return prompt;
  }

  let result = prompt;
  const stripPatterns = [
    ...profile.excludeLabels,
    /\b(?:fleece mesh jersey|mesh jersey|compression top|yoga pants)\b/i,
  ];

  for (const pattern of stripPatterns) {
    result = result.replace(new RegExp(pattern.source, 'gi'), '');
  }

  return result
    .replace(/\b(?:her|his|their)\s+[\w-]+\s+and\s+[\w-]+\s*,/gi, '')
    .replace(/\b(?:her|his|their)\s+and\s+/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .trim();
}

function cleanSportStripArtifacts(prompt: string): string {
  return prompt
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => {
      const lower = sentence.toLowerCase();
      if (/\billuminates clinging\b/.test(lower)) {
        return false;
      }
      if (/\b(?:her|his|their)\s+\w+\s+grip the\b/.test(lower)) {
        return false;
      }
      return sentence.trim().length > 0;
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function replaceSportGarmentsInSentence(
  sentence: string,
  summary: string,
  sport: AthleticSport
): string {
  const cleaned = stripSportConflictGarments(sentence, sport);

  if (/\bwearing\b/i.test(cleaned)) {
    return cleaned.replace(
      /\bwearing\b[^,.]*(?:,\s*[^,.]*)*(?=[,.])/i,
      `wearing ${summary.replace(/\.$/, '')}`
    );
  }

  return injectWardrobeIntoSentence(cleaned, summary);
}

function stripDuplicateWardrobeSentences(
  prompt: string,
  assignment: WardrobeAssignmentLike & { filters?: ClothingPickFilters }
): string {
  const sport = assignment.filters?.athleticSport;
  const sentences = splitSentences(prompt);
  let keptPrimaryWardrobe = false;

  const filtered = sentences.filter(sentence => {
    const isExtraWardrobeSentence =
      /\b(?:dressed for|is dressed|outfit)\b/i.test(sentence) ||
      (/\bwearing\b/i.test(sentence) &&
        /\b(?:jacket|nylon|bib shorts|climbing shoes|track pants|singlet)\b/i.test(sentence));

    if (isExtraWardrobeSentence) {
      if (keptPrimaryWardrobe) {
        return false;
      }
      keptPrimaryWardrobe = true;
    }

    if (sport && sentenceContainsExcludedWardrobe(sport, sentence)) {
      return false;
    }

    return true;
  });

  return filtered.join(' ');
}

function finalizeSportWardrobePrompt(
  prompt: string,
  assignment: WardrobeAssignmentLike & { filters?: ClothingPickFilters }
): string {
  return stripDuplicateWardrobeSentences(
    enforceSportWardrobeInPrompt(prompt, assignment),
    assignment
  );
}

function enforceSportWardrobeInPrompt(
  prompt: string,
  assignment: WardrobeAssignmentLike & { filters?: ClothingPickFilters }
): string {
  const sport = assignment.filters?.athleticSport;
  if (!sport || !assignment.summary.trim()) {
    return prompt;
  }

  const hasConflict = promptContainsSportWardrobeConflict(prompt, sport, assignment.summary);

  if (!hasConflict) {
    if (wardrobeSummaryPresent(prompt, assignment.summary)) {
      return stripDuplicateWardrobeSentences(prompt, assignment);
    }

    const integrated =
      integrateSinglePersonWardrobe(prompt, assignment.summary) ??
      mergeAssignedWardrobeIntoPrompt(prompt, assignment.summary, {
        entryIds: collectWardrobeEntryIds(assignment),
      });
    return stripDuplicateWardrobeSentences(integrated, assignment);
  }

  const stripped = cleanSportStripArtifacts(stripSportConflictGarments(prompt, sport));
  const sentences = splitSentences(stripped);
  if (sentences.length === 0) {
    return mergeAssignedWardrobeIntoPrompt(stripped, assignment.summary, {
      entryIds: collectWardrobeEntryIds(assignment),
    });
  }

  const personPattern =
    /\b(man|woman|person|girl|boy|figure|subject|couple|pair|they|he|she|cyclist)\b/i;
  const targetIndex = sentences.findIndex(sentence => personPattern.test(sentence));
  const index = targetIndex >= 0 ? targetIndex : 0;
  const updated = [...sentences];
  updated[index] = replaceSportGarmentsInSentence(updated[index]!, assignment.summary, sport);

  return stripDuplicateWardrobeSentences(updated.join(' '), assignment);
}

function integrateSinglePersonWardrobe(prompt: string, summary: string): string | null {
  const sentences = splitSentences(prompt);
  if (sentences.length === 0) {
    return null;
  }

  const personPattern = /\b(man|woman|person|girl|boy|figure|subject|couple|pair|they|he|she)\b/i;
  const targetIndex = sentences.findIndex(sentence => personPattern.test(sentence));
  const index = targetIndex >= 0 ? targetIndex : 0;

  if (/\bwearing\b/i.test(sentences[index]!)) {
    return null;
  }

  const updated = [...sentences];
  updated[index] = injectWardrobeIntoSentence(updated[index]!, summary);
  return updated.join(' ');
}

function integrateDistinctPeopleWardrobe(
  prompt: string,
  assignments: WardrobeAssignmentLike[]
): string | null {
  if (!hasDistinctPeopleStructure(prompt)) {
    return null;
  }

  const sentences = splitSentences(prompt);
  let changed = false;

  const updated = sentences.map(sentence => {
    if (/\bwearing\b/i.test(sentence)) {
      return sentence;
    }

    for (const assignment of assignments) {
      if (!assignment.summary || !assignment.label) {
        continue;
      }

      if (sentenceMatchesWardrobeLabel(sentence, assignment.label)) {
        changed = true;
        return injectWardrobeIntoSentence(sentence, assignment.summary);
      }
    }

    return sentence;
  });

  return changed ? updated.join(' ') : null;
}

function fitWardrobeIntoPrompt(
  prompt: string,
  summary: string,
  maxChars: number,
  peopleCount = 1
): string {
  const trimmed = prompt.trim();
  if (!summary.trim() || wardrobeSummaryPresent(trimmed, summary)) {
    return trimmed.length <= maxChars ? trimmed : trimmed;
  }

  const budgets = [
    wardrobeBudgetForPrompt(maxChars, peopleCount),
    Math.max(32, Math.floor(wardrobeBudgetForPrompt(maxChars, peopleCount) * 0.65)),
  ];

  for (const budget of budgets) {
    const compact = trimWardrobeSummaryToMaxChars(summary, budget);
    const integrated = integrateSinglePersonWardrobe(trimmed, compact);
    if (integrated && integrated.length <= maxChars) {
      return integrated;
    }
  }

  return trimmed;
}

export function mergeWardrobeAssignmentsIntoPrompt(
  prompt: string,
  assignments: WardrobeAssignmentLike[],
  maxChars?: number
): string {
  const trimmed = prompt.trim();
  if (assignments.length === 0) {
    return trimmed;
  }

  const entryIds = collectWardrobeEntryIds(...assignments);
  const sanitize = (value: string) =>
    entryIds.length > 0 ? sanitizeCatalogScriptsInPrompt(value, entryIds) : value;

  if (assignments.some(assignment => wardrobeSummaryPresent(trimmed, assignment.summary))) {
    if (assignments.length === 1) {
      const enforced = finalizeSportWardrobePrompt(
        trimmed,
        assignments[0] as WardrobeAssignmentLike & { filters?: ClothingPickFilters }
      );
      return sanitize(enforced);
    }
    return sanitize(trimmed);
  }

  if (assignments.length === 1 && !assignments[0]?.label) {
    const assignment = assignments[0]!;
    const summary = assignment.summary;
    let merged = maxChars
      ? fitWardrobeIntoPrompt(trimmed, summary, maxChars, 1)
      : (integrateSinglePersonWardrobe(trimmed, summary) ??
        mergeAssignedWardrobeIntoPrompt(trimmed, summary));
    merged = finalizeSportWardrobePrompt(merged, assignment);
    return sanitize(merged);
  }

  if (maxChars) {
    const integrated = integrateDistinctPeopleWardrobe(trimmed, assignments);
    if (integrated && integrated.length <= maxChars) {
      return sanitize(integrated);
    }

    const perPersonBudget = Math.max(
      32,
      Math.floor(wardrobeBudgetForPrompt(maxChars, assignments.length) / assignments.length)
    );
    const compactAssignments = assignments.map(assignment => ({
      ...assignment,
      summary: trimWardrobeSummaryToMaxChars(assignment.summary, perPersonBudget),
    }));
    const retry = integrateDistinctPeopleWardrobe(trimmed, compactAssignments);
    if (retry && retry.length <= maxChars) {
      return sanitize(retry);
    }

    return sanitize(trimmed);
  }

  const integrated = integrateDistinctPeopleWardrobe(trimmed, assignments);
  if (integrated) {
    return sanitize(integrated);
  }

  const clause = assignments
    .map(assignment => {
      const who = assignment.label ?? 'the subject';
      return `${who} wearing ${assignment.summary.replace(/\.$/, '')}`;
    })
    .join('; ');

  return sanitize(trimmed ? `${clause}. ${trimmed}` : `${clause}.`);
}

export function trimWardrobeSummaryToMaxChars(summary: string, maxChars: number): string {
  const items = prioritizeWardrobeSummaryItems(
    summary
      .split(',')
      .map(part => compactClothingScript(part.trim()))
      .filter(Boolean)
  );

  if (items.length === 0) {
    return compactClothingScript(summary).trim();
  }

  const kept: string[] = [];
  for (const item of items) {
    const candidate = kept.length === 0 ? item : `${kept.join(', ')}, ${item}`;
    if (candidate.length > maxChars) {
      break;
    }
    kept.push(item);
  }

  if (kept.length === 0) {
    return items[0]!.length <= maxChars ? items[0]! : items[0]!.slice(0, maxChars).trim();
  }

  return kept.join(', ');
}

export function mergeAssignedWardrobeIntoPrompt(
  prompt: string,
  wardrobeSummary: string,
  options?: {
    maxWardrobeChars?: number;
    maxTotalChars?: number;
    entryIds?: readonly string[];
  }
): string {
  const trimmed = prompt.trim();
  let summary = wardrobeSummary.trim();
  if (!summary) {
    return trimmed;
  }

  if (options?.maxWardrobeChars) {
    summary = trimWardrobeSummaryToMaxChars(summary, options.maxWardrobeChars);
  }

  if (wardrobeSummaryPresent(trimmed, summary)) {
    return options?.entryIds?.length
      ? sanitizeCatalogScriptsInPrompt(trimmed, options.entryIds)
      : trimmed;
  }

  let merged: string;
  if (options?.maxTotalChars) {
    merged = fitWardrobeIntoPrompt(trimmed, summary, options.maxTotalChars, 1);
  } else {
    merged =
      integrateSinglePersonWardrobe(trimmed, summary) ??
      (trimmed
        ? `${summary.endsWith('.') ? `wearing ${summary}` : `wearing ${summary}.`} ${trimmed}`
        : summary.endsWith('.')
          ? `wearing ${summary}`
          : `wearing ${summary}.`);
  }

  return options?.entryIds?.length
    ? sanitizeCatalogScriptsInPrompt(merged, options.entryIds)
    : merged;
}

export function mergeWardrobeRespectingLimits(
  prompt: string,
  wardrobeSummary: string,
  maxChars: number,
  peopleCount = 1,
  entryIds?: readonly string[]
): string {
  const wardrobeBudget = wardrobeBudgetForPrompt(maxChars, peopleCount);
  return mergeAssignedWardrobeIntoPrompt(prompt, wardrobeSummary, {
    maxWardrobeChars: wardrobeBudget,
    maxTotalChars: maxChars,
    entryIds,
  });
}

export function shouldPickRandomCharacterOutfit(input: {
  presetOptions: {
    wardrobe?: string;
    footwear?: string;
    accessories?: string;
    wardrobeCatalog?: string;
    footwearCatalog?: string;
    accessoriesCatalog?: string;
  };
  hints?: string;
  alwaysIncludeClothing?: boolean;
}): boolean {
  if (hasWardrobeCatalogSelection(input.presetOptions)) {
    return false;
  }

  if (hintsImplyNoClothing(input.hints)) {
    return false;
  }

  // Unchecked "Always include wardrobe" means do not auto-roll catalog outfits.
  return input.alwaysIncludeClothing === true;
}

export { hintsMentionClothing } from './clothing-tags';

export function hasWardrobeCatalogSelection(options: {
  wardrobe?: string;
  footwear?: string;
  accessories?: string;
  wardrobeCatalog?: string;
  footwearCatalog?: string;
  accessoriesCatalog?: string;
}): boolean {
  return Boolean(
    options.wardrobe?.trim() ||
    options.footwear?.trim() ||
    options.accessories?.trim() ||
    options.wardrobeCatalog ||
    options.footwearCatalog ||
    options.accessoriesCatalog
  );
}

export {
  CLOTHING_CATALOG_FIELD_KEYS,
  categoryLabel,
  getClothingCatalogFieldCategories,
  type ClothingCatalogFieldKey,
} from './clothing-catalog-fields';

export type { ClothingPickFilters } from './clothing-tags';
