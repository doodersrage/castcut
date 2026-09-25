/**
 * Layouts a photo can be filed under in the pose library: every pose the picker offers
 * (postures, everyday gestures, two-person and sport poses) plus the two-person sex layouts.
 * Kept dependency-free so Settings can list them without loading the pose-guide module (the
 * import itself is loaded on demand).
 */

import { POSE_PICKER_GROUPS, type PosePickerGroup } from '@/lib/pose-layout-labels';

const INTIMATE_IMPORT_LAYOUTS: readonly string[] = [
  'missionary',
  'mating_press',
  'straddle',
  'reverse_straddle',
  'bent',
  'prone',
  'spoon',
  'scissors',
  'standing',
  'wall',
  'lift',
  'oral',
  'sixty_nine',
  'facesit',
  'kneeling',
  'lap',
  'afterglow',
  'undress',
  'solo',
];

/** Import menu groups: the picker's groups, then Intimate. */
export const POSE_IMPORT_GROUPS: readonly PosePickerGroup[] = [
  ...POSE_PICKER_GROUPS,
  { label: 'Intimate', ids: INTIMATE_IMPORT_LAYOUTS },
];

export const POSE_IMPORT_LAYOUTS: readonly string[] = POSE_IMPORT_GROUPS.flatMap(
  group => group.ids
);
