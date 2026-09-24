/**
 * Layouts a photo can be filed under in the pose library: single-body postures and two-person
 * sex layouts. Kept dependency-free so Settings can list them without loading the pose-guide
 * module (the import itself is loaded on demand).
 */

export const POSE_IMPORT_LAYOUTS: readonly string[] = [
  'stand',
  'walk',
  'run',
  'sit',
  'crouch',
  'kneel',
  'reach',
  'lean',
  'lie',
  'jump',
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
