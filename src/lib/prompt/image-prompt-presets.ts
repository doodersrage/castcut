import type { DetailLevel } from './detail-level';

export type ImagePromptDescriptionPreset =
  'standard' | 'pose-and-layout' | 'portrait-detail' | 'scene-composition' | 'wardrobe-props';

export type ImagePromptPresetDefinition = {
  id: ImagePromptDescriptionPreset;
  label: string;
  summary: string;
  suggestedDetail?: DetailLevel;
  systemAddendum: string;
  userAddendum: string;
};

export const IMAGE_PROMPT_DESCRIPTION_PRESETS: ImagePromptPresetDefinition[] = [
  {
    id: 'standard',
    label: 'Standard',
    summary: 'Balanced subject, setting, pose, and atmosphere.',
    systemAddendum: `When people or humanoid figures appear, include concrete pose and placement detail:
- Facing direction (profile, three-quarter, straight-on), torso orientation, and head tilt
- Limb positions: what each arm/hand and leg/foot is doing; weight on which foot if visible
- Gaze direction and expression when readable
- Frame placement: left/center/right, foreground/midground, and shot scale (close-up, waist-up, full body)
- Spatial relationships to other people, props, furniture, or architecture`,
    userAddendum:
      'Include pose, facing direction, limb positions, and where subjects sit in the frame—not just who they are.',
  },
  {
    id: 'pose-and-layout',
    label: 'Pose & layout',
    summary: 'Prioritize body pose, facing, limbs, and position in frame.',
    suggestedDetail: 'rich',
    systemAddendum: `PRIORITY: POSE AND SPATIAL LAYOUT (mandatory when people appear).
- Lead with body mechanics: standing/sitting/lying, facing angle, torso twist, shoulder line
- Describe each visible limb: raised/bent/crossed arms, hand placement, leg stance, foot direction
- State gaze and head angle relative to camera
- Place the subject in the frame: rule-of-thirds position, foreground vs midground, negative space
- Note interactions: leaning on, holding, reaching toward, or occluding other elements
- Do NOT reduce people to "a woman" or "a man" without pose and placement detail`,
    userAddendum:
      'Write like a director blocking a shot: pose, facing, limbs, weight, gaze, and exact placement in frame.',
  },
  {
    id: 'portrait-detail',
    label: 'Portrait & face',
    summary: 'Face, hair, expression, and head angle.',
    suggestedDetail: 'rich',
    systemAddendum: `PRIORITY: PORTRAIT AND FACIAL DETAIL (mandatory when faces are visible).
- Hair: length, color, texture, parting, and styling
- Face: expression, eye direction, brow, mouth shape; approximate age read if visible
- Head pose: tilt, turn, chin up/down relative to camera
- Visible neck, shoulders, and neckline; ear/jewelry if present
- Keep background to one short phrase unless it defines the portrait context`,
    userAddendum:
      'Emphasize facial expression, hair, head angle, and gaze—not a generic character label.',
  },
  {
    id: 'scene-composition',
    label: 'Composition',
    summary: 'Camera angle, depth layers, and spatial layout.',
    suggestedDetail: 'rich',
    systemAddendum: `PRIORITY: COMPOSITION AND CAMERA (mandatory).
- Camera angle: eye-level, low, high, dutch tilt; estimated focal length feel (wide vs telephoto)
- Depth layers: foreground, midground, background elements and what sits in each
- Subject scale in frame: extreme close-up, medium, wide, establishing
- Leading lines, symmetry, framing devices (doorways, windows, arches)
- Light direction relative to camera and subjects`,
    userAddendum:
      'Describe how the scene is framed and layered in depth—not only what objects exist.',
  },
  {
    id: 'wardrobe-props',
    label: 'Wardrobe & props',
    summary: 'Outfit, accessories, and held objects in detail.',
    suggestedDetail: 'balanced',
    systemAddendum: `PRIORITY: WARDROBE AND PROPS (mandatory when visible).
- Garments: type, fit, color, material, layers, patterns, footwear
- Accessories: bags, hats, glasses, jewelry, belts, gloves
- Held or nearby props: what hands touch, carry, or rest on
- Tie props to pose: how clothing drapes or moves with the body
- People still need a brief pose phrase so outfits read in context`,
    userAddendum:
      'List clothing, accessories, and props concretely—and note how the body wears or holds them.',
  },
];

const PRESET_BY_ID = new Map(IMAGE_PROMPT_DESCRIPTION_PRESETS.map(preset => [preset.id, preset]));

export function normalizeImagePromptDescriptionPreset(
  value: unknown
): ImagePromptDescriptionPreset {
  if (typeof value === 'string' && PRESET_BY_ID.has(value as ImagePromptDescriptionPreset)) {
    return value as ImagePromptDescriptionPreset;
  }
  return 'standard';
}

export function getImagePromptPreset(
  id: ImagePromptDescriptionPreset
): ImagePromptPresetDefinition {
  return PRESET_BY_ID.get(id) ?? PRESET_BY_ID.get('standard')!;
}

export function mergeImagePromptHints(
  extraHints: string | undefined,
  presetId: ImagePromptDescriptionPreset
): string | undefined {
  const preset = getImagePromptPreset(presetId);
  const parts = [preset.userAddendum, extraHints?.trim()].filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join('\n\n');
}
