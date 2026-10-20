import { CLOTHING_CATALOG_FIELD_KEYS } from '../wardrobe/clothing-catalog-fields';

import {
  CHARACTER_AESTHETIC_OPTIONS,
  CHARACTER_ATMOSPHERE_OPTIONS,
  CHARACTER_BODY_TYPE_OPTIONS,
  CHARACTER_CAMERA_ANGLE_OPTIONS,
  CHARACTER_COLOR_PALETTE_OPTIONS,
  CHARACTER_DEPTH_OF_FIELD_OPTIONS,
  CHARACTER_DUO_DYNAMIC_OPTIONS,
  CHARACTER_ENERGY_OPTIONS,
  CHARACTER_EXPRESSION_OPTIONS,
  CHARACTER_FILM_STOCK_OPTIONS,
  CHARACTER_GAZE_OPTIONS,
  CHARACTER_HAIR_STYLE_OPTIONS,
  CHARACTER_HAND_POSE_OPTIONS,
  CHARACTER_HEADCOUNT_OPTIONS,
  CHARACTER_LIGHTING_OPTIONS,
  CHARACTER_MAKEUP_OPTIONS,
  CHARACTER_POSE_ACTION_OPTIONS,
  CHARACTER_POSE_TARGET_PLACEHOLDERS,
  CHARACTER_POSTURE_OPTIONS,
  CHARACTER_PRESET_FIELD_KEYS,
  CHARACTER_PRESET_UI_SECTIONS,
  CHARACTER_REALISM_OPTIONS,
  CHARACTER_SHOT_FRAMING_OPTIONS,
  PRESET_SELECT_KEYS,
  PRESET_TEXT_KEYS,
  SELECT_OPTION_REGISTRY,
  VALID_OPTION_VALUES,
  buildPoseAnchorClause,
  buildPoseAnchorLine,
  buildPoseAnchorUserDirective,
  countCharacterPresetSelections,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  integratePoseAnchorIntoPrompt,
  pickOption,
  poseAnchorPresent,
  textFieldIsActive,
  type CharacterAesthetic,
  type CharacterAtmosphere,
  type CharacterBodyType,
  type CharacterCameraAngle,
  type CharacterClothingCatalogPresetKey,
  type CharacterColorPalette,
  type CharacterDepthOfField,
  type CharacterDuoDynamic,
  type CharacterEnergy,
  type CharacterExpression,
  type CharacterFilmStock,
  type CharacterGaze,
  type CharacterHairStyle,
  type CharacterHandPose,
  type CharacterHeadcount,
  type CharacterLighting,
  type CharacterMakeup,
  type CharacterPoseAction,
  type CharacterPosture,
  type CharacterPresetOptions,
  type CharacterPresetUiField,
  type CharacterPresetUiSection,
  type CharacterRealism,
  type CharacterSelectPresetKey,
  type CharacterShotFraming,
  type CharacterTextPresetKey,
  type SelectOption,
} from './preset-shared';

export {
  CHARACTER_AESTHETIC_OPTIONS,
  CHARACTER_ATMOSPHERE_OPTIONS,
  CHARACTER_BODY_TYPE_OPTIONS,
  CHARACTER_CAMERA_ANGLE_OPTIONS,
  CHARACTER_COLOR_PALETTE_OPTIONS,
  CHARACTER_DEPTH_OF_FIELD_OPTIONS,
  CHARACTER_DUO_DYNAMIC_OPTIONS,
  CHARACTER_ENERGY_OPTIONS,
  CHARACTER_EXPRESSION_OPTIONS,
  CHARACTER_FILM_STOCK_OPTIONS,
  CHARACTER_GAZE_OPTIONS,
  CHARACTER_HAIR_STYLE_OPTIONS,
  CHARACTER_HAND_POSE_OPTIONS,
  CHARACTER_HEADCOUNT_OPTIONS,
  CHARACTER_LIGHTING_OPTIONS,
  CHARACTER_MAKEUP_OPTIONS,
  CHARACTER_POSE_ACTION_OPTIONS,
  CHARACTER_POSE_TARGET_PLACEHOLDERS,
  CHARACTER_POSTURE_OPTIONS,
  CHARACTER_PRESET_FIELD_KEYS,
  CHARACTER_PRESET_UI_SECTIONS,
  CHARACTER_REALISM_OPTIONS,
  CHARACTER_SHOT_FRAMING_OPTIONS,
  buildPoseAnchorClause,
  buildPoseAnchorLine,
  buildPoseAnchorUserDirective,
  countCharacterPresetSelections,
  hasCharacterPresetOptions,
  hasPoseAnchor,
  integratePoseAnchorIntoPrompt,
  poseAnchorPresent,
  type CharacterAesthetic,
  type CharacterAtmosphere,
  type CharacterBodyType,
  type CharacterCameraAngle,
  type CharacterClothingCatalogPresetKey,
  type CharacterColorPalette,
  type CharacterDepthOfField,
  type CharacterDuoDynamic,
  type CharacterEnergy,
  type CharacterExpression,
  type CharacterFilmStock,
  type CharacterGaze,
  type CharacterHairStyle,
  type CharacterHandPose,
  type CharacterHeadcount,
  type CharacterLighting,
  type CharacterMakeup,
  type CharacterPoseAction,
  type CharacterPosture,
  type CharacterPresetOptions,
  type CharacterPresetUiField,
  type CharacterPresetUiSection,
  type CharacterRealism,
  type CharacterSelectPresetKey,
  type CharacterShotFraming,
  type CharacterTextPresetKey,
};

// Note: wardrobe/footwear/accessories/prop/hairColor enrichment lives in
// character-options-catalog.ts, which is what's actually wired into prompt
// building. These were a stale duplicate copy that nothing here called.

export function normalizeCharacterPresetOptionsClient(
  input?: Partial<Record<keyof CharacterPresetOptions, string | undefined>> | null
): CharacterPresetOptions {
  const normalized = {} as CharacterPresetOptions;

  for (const key of PRESET_SELECT_KEYS) {
    normalized[key as keyof CharacterPresetOptions] = pickOption(
      input?.[key as keyof CharacterPresetOptions],
      VALID_OPTION_VALUES[key]!
    ) as never;
  }

  normalized.poseTarget = input?.poseTarget?.trim() ?? '';
  for (const key of CLOTHING_CATALOG_FIELD_KEYS) {
    normalized[key] = input?.[key]?.trim() ?? '';
  }
  for (const key of PRESET_TEXT_KEYS) {
    normalized[key] = input?.[key]?.trim() ?? '';
  }

  return normalized;
}

export function presetOptionsFromCache(
  cache: Partial<CharacterPresetOptions> & { hints?: string }
): CharacterPresetOptions {
  return normalizeCharacterPresetOptionsClient(cache);
}

export function clearCharacterPresetPatch(): Partial<CharacterPresetOptions> {
  return Object.fromEntries(
    CHARACTER_PRESET_FIELD_KEYS.map(key => [key, ''])
  ) as Partial<CharacterPresetOptions>;
}

export function countCharacterPresetSectionSelections(
  sectionId: string,
  options: CharacterPresetOptions
): number {
  const section = CHARACTER_PRESET_UI_SECTIONS.find(item => item.id === sectionId);
  if (!section || (section.showWhen && !section.showWhen(options))) {
    return 0;
  }

  let count = 0;

  for (const field of section.fields) {
    if (!shouldShowPresetField(field, options)) {
      continue;
    }

    if (field.kind === 'select') {
      if (field.key === 'poseAction') {
        continue;
      }

      if (options[field.key as keyof CharacterPresetOptions]) {
        count += 1;
      }
      continue;
    }

    if (field.kind === 'clothing-catalog') {
      if (options[field.key]) {
        count += 1;
      }
      continue;
    }

    if (textFieldIsActive(field.key, options)) {
      count += 1;
    }
  }

  if (options.poseAction && options.poseTarget) {
    const hasPoseAnchor = section.fields.some(
      field => field.key === 'poseAction' || field.key === 'poseTarget'
    );
    if (hasPoseAnchor) {
      count += 1;
    }
  }

  return count;
}

export function getSelectOptionsForPresetKey(
  key: keyof CharacterPresetOptions
): SelectOption<string>[] {
  return SELECT_OPTION_REGISTRY[key as string] ?? [{ value: '', label: 'Default' }];
}

export function isDuoHeadcount(options: CharacterPresetOptions): boolean {
  return options.headcount === 'duo';
}

export function shouldShowPresetField(
  field: CharacterPresetUiField,
  options: CharacterPresetOptions
): boolean {
  if (field.kind === 'text' && field.requires === 'poseAction') {
    return Boolean(options.poseAction);
  }

  if (field.kind === 'select' && field.key === 'duoDynamic') {
    return options.headcount === 'duo';
  }

  return true;
}
