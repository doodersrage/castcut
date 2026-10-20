import {
  CLOTHING_CATALOG_FIELD_KEYS,
  getClothingCatalogFieldCategories,
} from '../wardrobe/clothing-catalog-fields';
import {
  collectWardrobeEntryIds,
  getClothingLabel,
  getClothingScript,
  normalizeClothingCatalogId,
  sanitizeCatalogScriptsInPrompt,
} from '../wardrobe/clothing-catalog';
import {
  enrichAccessoriesHighSignal,
  enrichFootwearHighSignal,
  enrichWardrobeHighSignal,
} from '../wardrobe/clothing-quality';

import {
  PRESET_SELECT_KEYS,
  PRESET_TEXT_KEYS,
  VALID_OPTION_VALUES,
  buildPoseAnchorLine,
  buildPoseAnchorUserDirective,
  countCharacterPresetSelections,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  integratePoseAnchorIntoPrompt,
  normalizePresetMatchText,
  pickOption,
  poseAnchorPresent,
  scriptForKey,
  withArticle,
  type CharacterPresetOptions,
} from './preset-shared';

function enrichWardrobe(value: string): string {
  return enrichWardrobeHighSignal(value);
}

function enrichFootwear(value: string): string {
  return enrichFootwearHighSignal(value);
}

function enrichAccessories(value: string): string {
  return enrichAccessoriesHighSignal(value);
}

function enrichProp(value: string): string {
  const base = withArticle(value);
  return `holding ${base}, with convincing grip pressure, object weight, and natural hand placement`;
}

function enrichHairColor(value: string): string {
  const base = value.trim();
  if (!base) {
    return '';
  }

  return `with ${base} hair showing natural root variation, strand separation, and realistic light response`;
}

export function normalizeCharacterPresetOptions(
  input?: Partial<Record<keyof CharacterPresetOptions, string | undefined>> | null,
  options?: { clothingGender?: 'women' | 'men' | 'any' }
): CharacterPresetOptions {
  const normalized = {} as CharacterPresetOptions;
  const clothingFilters = options?.clothingGender ? { gender: options.clothingGender } : undefined;

  for (const key of PRESET_SELECT_KEYS) {
    normalized[key as keyof CharacterPresetOptions] = pickOption(
      input?.[key as keyof CharacterPresetOptions],
      VALID_OPTION_VALUES[key]!
    ) as never;
  }

  normalized.poseTarget = input?.poseTarget?.trim() ?? '';
  for (const key of CLOTHING_CATALOG_FIELD_KEYS) {
    normalized[key] = normalizeClothingCatalogId(
      input?.[key],
      getClothingCatalogFieldCategories(key),
      clothingFilters
    );
  }
  for (const key of PRESET_TEXT_KEYS) {
    normalized[key] = input?.[key]?.trim() ?? '';
  }

  return normalized;
}

export function buildCharacterPresetBlock(options: CharacterPresetOptions): string | null {
  const lines = getCharacterPresetScriptLines(options);

  if (lines.length === 0) {
    return null;
  }

  return [
    'CHARACTER PRESET (mandatory — weave these phrases naturally into the finished prompt; do not list them as bullets):',
    ...lines,
  ].join('\n');
}

export function getCharacterPresetScriptLines(options: CharacterPresetOptions): string[] {
  const lines: string[] = [];

  for (const key of [
    'headcount',
    'aesthetic',
    'filmStock',
    'shotFraming',
    'cameraAngle',
    'depthOfField',
    'lighting',
    'atmosphere',
    'colorPalette',
    'bodyType',
    'posture',
    'energy',
    'expression',
    'gaze',
    'makeup',
    'realism',
    'hairStyle',
    'handPose',
  ] as const) {
    const line = scriptForKey(key, options[key]);
    if (line) {
      lines.push(line);
    }
  }

  if (options.hairColor) {
    const hairColorLine = enrichHairColor(options.hairColor);
    if (hairColorLine) {
      lines.push(`${hairColorLine},`);
    }
  }

  if (options.poseAction && options.poseTarget) {
    const poseLine = buildPoseAnchorLine(options);
    if (poseLine) {
      lines.push(poseLine);
    }
  }

  if (options.headcount === 'duo' && options.duoDynamic) {
    const duoLine = scriptForKey('duoDynamic', options.duoDynamic);
    if (duoLine) {
      lines.push(duoLine);
    }
  }

  if (options.wardrobe?.trim()) {
    lines.push(`wearing ${enrichWardrobe(options.wardrobe)},`);
  } else {
    const catalogWardrobe =
      getClothingLabel(options.wardrobeCatalog) ?? getClothingScript(options.wardrobeCatalog);
    if (catalogWardrobe) {
      lines.push(`wearing ${catalogWardrobe},`);
    }
  }

  if (options.footwear?.trim()) {
    lines.push(`wearing ${enrichFootwear(options.footwear)},`);
  } else {
    const catalogFootwear =
      getClothingLabel(options.footwearCatalog) ?? getClothingScript(options.footwearCatalog);
    if (catalogFootwear) {
      lines.push(`wearing ${catalogFootwear},`);
    }
  }

  if (options.accessories?.trim()) {
    lines.push(`wearing ${enrichAccessories(options.accessories)},`);
  } else {
    const catalogAccessories =
      getClothingLabel(options.accessoriesCatalog) ?? getClothingScript(options.accessoriesCatalog);
    if (catalogAccessories) {
      lines.push(`wearing ${catalogAccessories},`);
    }
  }

  if (options.prop) {
    lines.push(`${enrichProp(options.prop)},`);
  }

  return lines;
}

export function buildCharacterPresetSanitizeContext(
  hints: string | undefined,
  seed: string,
  options: CharacterPresetOptions
): string {
  const presetSummary = getCharacterPresetScriptLines(options).join(' ');
  return [hints?.trim(), presetSummary, seed].filter(Boolean).join('\n');
}

function presetLinePresent(
  prompt: string,
  line: string,
  options?: CharacterPresetOptions
): boolean {
  const poseLine = options && hasPoseAnchor(options) ? buildPoseAnchorLine(options) : null;
  if (poseLine && line === poseLine && options) {
    return poseAnchorPresent(prompt, options);
  }

  const normPrompt = normalizePresetMatchText(prompt);
  const normLine = normalizePresetMatchText(line);

  if (!normLine) {
    return true;
  }

  if (normLine.length <= 24) {
    return normPrompt.includes(normLine);
  }

  const words = normLine.match(/\b[a-z]{4,}\b/g) ?? [];
  if (words.length === 0) {
    return normPrompt.includes(normLine.slice(0, 24));
  }

  const hits = words.filter(word => normPrompt.includes(word)).length;
  return hits / words.length >= 0.45;
}

function weavePresetLines(lines: string[]): string {
  return lines
    .map(line => line.trim().replace(/,\s*$/, ''))
    .filter(Boolean)
    .map(line => (/[.!?]$/.test(line) ? line : `${line}.`))
    .join(' ');
}

export function mergeCharacterPresetsIntoPrompt(
  prompt: string,
  options: CharacterPresetOptions
): string {
  const lines = getCharacterPresetScriptLines(options);
  if (lines.length === 0) {
    return prompt.trim();
  }

  const poseLine = buildPoseAnchorLine(options);
  const otherLines = poseLine ? lines.filter(line => line !== poseLine) : lines;

  let result = integratePoseAnchorIntoPrompt(prompt, options);

  const missing = otherLines.filter(line => !presetLinePresent(result, line, options));

  if (missing.length > 0) {
    const prefix = weavePresetLines(missing);
    result = result ? `${prefix} ${result}` : prefix;
  }

  const presetCatalogIds = collectWardrobeEntryIds({
    wardrobeId: options.wardrobeCatalog,
    footwearId: options.footwearCatalog,
    accessoriesId: options.accessoriesCatalog,
  });

  return sanitizeCatalogScriptsInPrompt(result.replace(/\s+/g, ' ').trim(), presetCatalogIds);
}

export function buildPresetWardrobeSummary(options: CharacterPresetOptions): string | null {
  const labels = [
    options.wardrobe?.trim() || getClothingLabel(options.wardrobeCatalog) || null,
    options.footwear?.trim() || getClothingLabel(options.footwearCatalog) || null,
    options.accessories?.trim() || getClothingLabel(options.accessoriesCatalog) || null,
  ].filter((label): label is string => Boolean(label?.trim()));

  return labels.length > 0 ? labels.join(', ') : null;
}

export function buildCharacterPresetUserDirective(options: CharacterPresetOptions): string | null {
  if (!hasCharacterPresetOptions(options)) {
    return null;
  }

  const count = countCharacterPresetSelections(options);
  const parts = [
    `PRESET ENFORCEMENT (mandatory): ${count} character preset(s) are active.`,
    'Your output MUST include every detail from the CHARACTER PRESET block—lens, lighting, physique, expression, pose anchor, wardrobe, and props.',
    'Rephrase for natural prose, but do not omit or replace preset details with generic description.',
  ];

  const poseDirective = buildPoseAnchorUserDirective(options);
  if (poseDirective) {
    parts.push(poseDirective);
  }

  return parts.join(' ');
}
