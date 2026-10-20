import { parseSettingHint } from '../prompt/hint-location';
import { getPetPresetScriptLines, type PetPresetOptions } from './pet-options';
import { parsePetHints, type PetSpecies } from './pet-hints';
import { pickSceneLocation, type RandomSeedBundle } from '../specialized/scene-pools';

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

const PET_LIGHTING = [
  'soft window light with gentle shadows',
  'golden hour warmth with rim light on fur',
  'overcast daylight with even exposure',
  'dappled shade under trees',
  'cozy indoor lamp glow',
  'bright midday sun with crisp detail',
  'blue-hour cool ambient light',
];

const PET_MOODS = [
  'playful and alert',
  'calm and cozy',
  'curious and attentive',
  'joyful and energetic',
  'serene and relaxed',
  'mischievous and lively',
];

const PET_SETTINGS = [
  'sunlit living room with a rug and houseplants',
  'neighborhood dog park with grass and fence',
  'quiet suburban sidewalk with fallen leaves',
  'cozy kitchen with warm wood floors',
  'backyard patio with potted herbs',
  'forest trail with moss and ferns',
  'snowy yard with paw prints',
  'beach boardwalk with soft sand',
  'farm meadow with wildflowers',
  'urban apartment balcony with city bokeh',
  'pet-friendly café patio',
  'cottage garden path',
];

const DOG_SUBJECTS = [
  'golden retriever with a glossy coat',
  'pembroke corgi with expressive ears',
  'border collie with intelligent eyes',
  'french bulldog with a compact build',
  'siberian husky with thick fur',
  'beagle with a tricolor coat',
  'australian shepherd with merle markings',
  'labrador retriever with a wet nose',
  'shiba inu with a curled tail',
  'dachshund with a long body',
];

const CAT_SUBJECTS = [
  'tabby cat with striped fur',
  'fluffy maine coon with tufted ears',
  'ragdoll cat with blue eyes',
  'siamese cat with dark points',
  'calico cat with patchy fur',
  'black cat with bright eyes',
  'orange tabby with white chest fur',
  'scottish fold with rounded ears',
];

const RABBIT_SUBJECTS = [
  'holland lop rabbit with floppy ears',
  'white angora rabbit with soft fur',
  'brown rabbit with twitching nose',
];

const BIRD_SUBJECTS = [
  'colorful macaw parrot',
  'cockatiel with crest feathers',
  'budgerigar with bright plumage',
  'african grey parrot with detailed feathers',
];

const OTHER_SUBJECTS = [
  'guinea pig with rounded cheeks',
  'ferret with a sleek body',
  'hedgehog with tiny quills',
];

const REPTILE_SUBJECTS = [
  'bearded dragon with textured scales',
  'leopard gecko with spotted pattern',
  'corn snake with smooth coiled body',
  'tortoise with weathered shell detail',
];

const PORTRAIT_POSES = [
  'close portrait framing on face, eyes, whiskers, and fur texture',
  'head-and-shoulders pose with alert ears and soft expression',
  'curled resting pose with paws tucked neatly',
];

const FULL_BODY_POSES = [
  'full-body pose from head to paws with readable posture',
  'standing pose on all fours with tail visible',
  'sitting pose with balanced weight and clear silhouette',
];

const ACTION_POSES = [
  'mid-leap with ears back and fur reacting to motion',
  'sprinting with paws kicking up dust or grass',
  'catching a toy with stretched neck and focused eyes',
  'shaking off water with droplets frozen in motion',
  'pouncing on a toy with engaged muscles',
  'sniffing the ground with nose forward and tail raised',
];

function subjectsForSpecies(species: PetSpecies | null): readonly string[] {
  switch (species) {
    case 'dog':
      return DOG_SUBJECTS;
    case 'cat':
      return CAT_SUBJECTS;
    case 'rabbit':
      return RABBIT_SUBJECTS;
    case 'bird':
      return BIRD_SUBJECTS;
    case 'other':
      return [...OTHER_SUBJECTS, ...REPTILE_SUBJECTS];
    default:
      return [
        ...DOG_SUBJECTS,
        ...CAT_SUBJECTS,
        ...RABBIT_SUBJECTS,
        ...BIRD_SUBJECTS,
        ...OTHER_SUBJECTS,
        ...REPTILE_SUBJECTS,
      ];
  }
}

function pickPetSubject(parsed: ReturnType<typeof parsePetHints>): string {
  if (parsed.breedHint) {
    return parsed.breedHint;
  }

  return pick(subjectsForSpecies(parsed.species));
}

function pickPetPose(portraitStyle: 'portrait' | 'full-body' | 'action'): string {
  switch (portraitStyle) {
    case 'action':
      return pick(ACTION_POSES);
    case 'full-body':
      return pick(FULL_BODY_POSES);
    case 'portrait':
    default:
      return pick(PORTRAIT_POSES);
  }
}

function mapPresetSpecies(species: PetPresetOptions['species']): PetSpecies | null {
  switch (species) {
    case 'dog':
    case 'cat':
    case 'rabbit':
    case 'bird':
      return species;
    case 'small-pet':
      return 'other';
    default:
      return null;
  }
}

function settingFromPreset(presetOptions?: PetPresetOptions): string | null {
  if (!presetOptions?.settingVibe) {
    return null;
  }

  const [line] = getPetPresetScriptLines({ settingVibe: presetOptions.settingVibe });
  return line?.replace(/,$/, '') ?? null;
}

function pickPetSetting(
  hints: string | undefined,
  recentLocations: string[],
  presetOptions?: PetPresetOptions,
  avoidedTokens?: string[]
): string {
  const settingHint = parseSettingHint(hints);
  if (settingHint.location) {
    return settingHint.location;
  }

  const presetSetting = settingFromPreset(presetOptions);
  if (presetSetting) {
    return presetSetting;
  }

  const sceneLocation = pickSceneLocation(recentLocations, avoidedTokens);
  if (Math.random() < 0.45) {
    return `${pick(PET_SETTINGS)}, ${sceneLocation}`;
  }

  return sceneLocation;
}

export function buildRandomPetSeed(
  hints?: string,
  portraitStyle: 'portrait' | 'full-body' | 'action' = 'portrait',
  recentLocations: string[] = [],
  presetOptions: PetPresetOptions = {},
  avoidedTokens?: string[]
): RandomSeedBundle {
  const parsed = parsePetHints(hints, {
    ...(presetOptions.species ? { species: mapPresetSpecies(presetOptions.species) } : {}),
    ...(presetOptions.pairMode === 'pair'
      ? { pair: true }
      : presetOptions.pairMode === 'solo'
        ? { pair: false }
        : {}),
  });
  const location = pickPetSetting(hints, recentLocations, presetOptions, avoidedTokens);
  const presetLines = getPetPresetScriptLines({
    ...presetOptions,
    settingVibe: undefined,
  });

  const parts = [
    parsed.pair
      ? 'two animals only, balanced pair framing, no people or human hands'
      : 'solo pet only, no people, human hands, or extra animals',
    pickPetSubject(parsed),
    pickPetPose(portraitStyle),
    ...presetLines,
    location,
    presetOptions.lightingStyle ? null : pick(PET_LIGHTING),
    pick(PET_MOODS),
  ].filter(Boolean) as string[];

  return { seed: parts.join(', '), location };
}
