import type { SelectOption } from '../app/select-option';

export type PetSpeciesOption = '' | 'dog' | 'cat' | 'rabbit' | 'bird' | 'small-pet' | 'reptile';

export type PetPairMode = '' | 'solo' | 'pair';

export type PetAgeStage = '' | 'baby' | 'adult' | 'senior';

export type PetCoatStyle =
  | ''
  | 'short-smooth'
  | 'long-fluffy'
  | 'curly'
  | 'wire-textured'
  | 'spotted'
  | 'striped'
  | 'tricolor'
  | 'monochrome'
  | 'wet-fur'
  | 'seasonal-thick';

export type PetExpression =
  '' | 'playful' | 'calm' | 'alert' | 'sleepy' | 'curious' | 'mischievous' | 'regal' | 'shy';

export type PetActivity =
  | ''
  | 'resting'
  | 'playing'
  | 'running'
  | 'fetching'
  | 'grooming'
  | 'exploring'
  | 'swimming'
  | 'jumping'
  | 'perched'
  | 'nibbling'
  | 'cuddling'
  | 'training';

export type PetSettingVibe =
  | ''
  | 'living-room'
  | 'dog-park'
  | 'backyard'
  | 'forest-trail'
  | 'beach'
  | 'snow-yard'
  | 'cafe-patio'
  | 'garden'
  | 'windowsill'
  | 'studio'
  | 'farm-meadow'
  | 'urban-street'
  | 'aquarium';

export type PetCameraAngle =
  '' | 'eye-level' | 'low-angle' | 'close-up-macro' | 'shallow-dof-portrait';

export type PetLightingStyle =
  | ''
  | 'golden-hour'
  | 'soft-window'
  | 'bright-daylight'
  | 'overcast'
  | 'cozy-lamp'
  | 'studio-softbox'
  | 'rainy-day';

export type PetAccessory =
  | ''
  | 'collar'
  | 'bandana'
  | 'harness'
  | 'toy-ball'
  | 'toy-rope'
  | 'bowtie'
  | 'flower-crown'
  | 'sweater';

export type PetPresetOptions = {
  species?: PetSpeciesOption;
  pairMode?: PetPairMode;
  ageStage?: PetAgeStage;
  coatStyle?: PetCoatStyle;
  expression?: PetExpression;
  activity?: PetActivity;
  settingVibe?: PetSettingVibe;
  cameraAngle?: PetCameraAngle;
  lightingStyle?: PetLightingStyle;
  accessory?: PetAccessory;
  petDetail?: string;
};

export type PetPresetUiField = {
  kind: 'select' | 'text';
  key: keyof PetPresetOptions;
  label: string;
  placeholder?: string;
};

export type PetPresetUiSection = {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  fields: PetPresetUiField[];
};

const SELECT_REGISTRY = {
  species: [
    { value: '', label: 'Auto (from hints)' },
    {
      value: 'dog',
      label: 'Dog',
      script: 'a dog with breed-appropriate anatomy and natural canine proportions,',
    },
    {
      value: 'cat',
      label: 'Cat',
      script: 'a cat with feline proportions, whiskers, and expressive ears,',
    },
    {
      value: 'rabbit',
      label: 'Rabbit',
      script: 'a rabbit with soft fur, twitching nose, and long ears,',
    },
    {
      value: 'bird',
      label: 'Bird',
      script: 'a bird with detailed plumage, beak, and alert posture,',
    },
    {
      value: 'small-pet',
      label: 'Small pet',
      script: 'a small companion animal with compact proportions and clear species read,',
    },
    {
      value: 'reptile',
      label: 'Reptile',
      script: 'a reptile with believable scales, claws, and species-appropriate anatomy,',
    },
  ] satisfies SelectOption<PetSpeciesOption>[],
  pairMode: [
    { value: '', label: 'Auto (from hints)' },
    {
      value: 'solo',
      label: 'Solo pet',
      script: 'solo pet only, no extra animals or people in frame,',
    },
    {
      value: 'pair',
      label: 'Pair',
      script: 'exactly two animals interacting, balanced pair framing, no extras,',
    },
  ] satisfies SelectOption<PetPairMode>[],
  ageStage: [
    { value: '', label: 'Any age' },
    {
      value: 'baby',
      label: 'Baby / puppy / kitten',
      script: 'young baby proportions with oversized paws or ears and soft juvenile features,',
    },
    {
      value: 'adult',
      label: 'Adult',
      script: 'mature adult proportions with fully developed features,',
    },
    {
      value: 'senior',
      label: 'Senior',
      script: 'gentle senior read with softened muzzle, calm posture, and dignified expression,',
    },
  ] satisfies SelectOption<PetAgeStage>[],
  coatStyle: [
    { value: '', label: 'Default coat' },
    {
      value: 'short-smooth',
      label: 'Short & smooth',
      script: 'short smooth coat with clean fur texture,',
    },
    {
      value: 'long-fluffy',
      label: 'Long & fluffy',
      script: 'long fluffy fur with visible volume and soft texture,',
    },
    { value: 'curly', label: 'Curly', script: 'curly coat with springy texture,' },
    {
      value: 'wire-textured',
      label: 'Wire / coarse',
      script: 'wire-textured coarse fur with rugged detail,',
    },
    { value: 'spotted', label: 'Spotted', script: 'distinct spotted markings across the coat,' },
    { value: 'striped', label: 'Striped / tabby', script: 'striped tabby-style markings,' },
    { value: 'tricolor', label: 'Tricolor', script: 'tricolor patchwork markings,' },
    { value: 'monochrome', label: 'Monochrome', script: 'monochrome coat in one dominant tone,' },
    {
      value: 'wet-fur',
      label: 'Wet fur',
      script: 'damp fur clinging with water droplets and glossy texture,',
    },
    {
      value: 'seasonal-thick',
      label: 'Thick seasonal coat',
      script: 'thick seasonal coat with dense underfur,',
    },
  ] satisfies SelectOption<PetCoatStyle>[],
  expression: [
    { value: '', label: 'Natural expression' },
    { value: 'playful', label: 'Playful', script: 'playful bright-eyed expression,' },
    { value: 'calm', label: 'Calm', script: 'calm relaxed expression,' },
    { value: 'alert', label: 'Alert', script: 'alert focused expression with engaged ears,' },
    { value: 'sleepy', label: 'Sleepy', script: 'sleepy half-lidded expression,' },
    { value: 'curious', label: 'Curious', script: 'curious inquisitive expression,' },
    { value: 'mischievous', label: 'Mischievous', script: 'mischievous cheeky expression,' },
    { value: 'regal', label: 'Regal', script: 'regal composed expression,' },
    { value: 'shy', label: 'Shy', script: 'shy gentle expression,' },
  ] satisfies SelectOption<PetExpression>[],
  activity: [
    { value: '', label: 'Default activity' },
    { value: 'resting', label: 'Resting', script: 'resting comfortably with relaxed posture,' },
    { value: 'playing', label: 'Playing', script: 'actively playing with engaged movement,' },
    { value: 'running', label: 'Running', script: 'running with dynamic stride and motion,' },
    { value: 'fetching', label: 'Fetching', script: 'fetching or carrying a toy mid-motion,' },
    { value: 'grooming', label: 'Grooming', script: 'self-grooming with tongue or paw detail,' },
    {
      value: 'exploring',
      label: 'Exploring',
      script: 'exploring with nose forward and curious posture,',
    },
    { value: 'swimming', label: 'Swimming', script: 'swimming with splashing water and wet fur,' },
    { value: 'jumping', label: 'Jumping', script: 'mid-jump with suspended motion,' },
    { value: 'perched', label: 'Perched', script: 'perched securely with balanced footing,' },
    {
      value: 'nibbling',
      label: 'Nibbling / eating',
      script: 'nibbling food or treats with whiskers forward,',
    },
    { value: 'cuddling', label: 'Cuddling', script: 'cuddled up in a cozy nest or blanket,' },
    {
      value: 'training',
      label: 'Training / tricks',
      script: 'performing a trained trick with focused attention and engaged posture,',
    },
  ] satisfies SelectOption<PetActivity>[],
  settingVibe: [
    { value: '', label: 'Random setting' },
    {
      value: 'living-room',
      label: 'Living room',
      script: 'cozy living room with rug and houseplants,',
    },
    { value: 'dog-park', label: 'Dog park', script: 'sunny dog park with grass and fence,' },
    { value: 'backyard', label: 'Backyard', script: 'backyard patio with potted plants,' },
    {
      value: 'forest-trail',
      label: 'Forest trail',
      script: 'forest trail with moss and dappled shade,',
    },
    { value: 'beach', label: 'Beach', script: 'beach boardwalk with soft sand and sea air,' },
    {
      value: 'snow-yard',
      label: 'Snowy yard',
      script: 'snowy yard with paw prints and crisp cold air,',
    },
    { value: 'cafe-patio', label: 'Café patio', script: 'pet-friendly café patio with warm wood,' },
    { value: 'garden', label: 'Garden', script: 'cottage garden path with flowers and clover,' },
    { value: 'windowsill', label: 'Windowsill', script: 'sunlit windowsill with soft curtains,' },
    {
      value: 'studio',
      label: 'Studio',
      script: 'clean pet portrait studio with neutral backdrop,',
    },
    {
      value: 'farm-meadow',
      label: 'Farm meadow',
      script: 'farm meadow with wildflowers and open sky,',
    },
    {
      value: 'urban-street',
      label: 'Urban street',
      script: 'quiet urban sidewalk with soft city bokeh,',
    },
    {
      value: 'aquarium',
      label: 'Aquarium / terrarium',
      script: 'glass terrarium or aquarium habitat with controlled lighting and habitat detail,',
    },
  ] satisfies SelectOption<PetSettingVibe>[],
  cameraAngle: [
    { value: '', label: 'Default angle' },
    { value: 'eye-level', label: 'Eye level', script: 'eye-level camera aligned with the pet,' },
    { value: 'low-angle', label: 'Low angle', script: 'low-angle hero view from ground level,' },
    {
      value: 'close-up-macro',
      label: 'Macro lens',
      script: 'macro lens detail on eyes, fur, and whiskers,',
    },
    {
      value: 'shallow-dof-portrait',
      label: 'Shallow DOF lens',
      script: 'shallow depth of field with creamy background blur,',
    },
  ] satisfies SelectOption<PetCameraAngle>[],
  lightingStyle: [
    { value: '', label: 'Default lighting' },
    {
      value: 'golden-hour',
      label: 'Golden hour',
      script: 'golden hour warmth with rim light on fur,',
    },
    {
      value: 'soft-window',
      label: 'Soft window light',
      script: 'soft window light with gentle shadows,',
    },
    {
      value: 'bright-daylight',
      label: 'Bright daylight',
      script: 'bright midday daylight with crisp detail,',
    },
    { value: 'overcast', label: 'Overcast', script: 'overcast even daylight,' },
    { value: 'cozy-lamp', label: 'Cozy lamp glow', script: 'cozy indoor lamp glow,' },
    {
      value: 'studio-softbox',
      label: 'Studio softbox',
      script: 'studio softbox lighting with clean highlights,',
    },
    {
      value: 'rainy-day',
      label: 'Rainy day',
      script: 'rainy overcast light with wet surfaces and soft reflections,',
    },
  ] satisfies SelectOption<PetLightingStyle>[],
  accessory: [
    { value: '', label: 'No accessory' },
    { value: 'collar', label: 'Collar', script: 'wearing a simple collar,' },
    { value: 'bandana', label: 'Bandana', script: 'wearing a colorful bandana,' },
    { value: 'harness', label: 'Harness', script: 'wearing a fitted harness,' },
    { value: 'toy-ball', label: 'Toy ball', script: 'with a toy ball nearby or in mouth,' },
    { value: 'toy-rope', label: 'Toy rope', script: 'with a rope toy in playful reach,' },
    { value: 'bowtie', label: 'Bow tie', script: 'wearing a neat bow tie,' },
    { value: 'flower-crown', label: 'Flower crown', script: 'wearing a delicate flower crown,' },
    { value: 'sweater', label: 'Sweater', script: 'wearing a cozy knit pet sweater,' },
  ] satisfies SelectOption<PetAccessory>[],
} as const;

const PRESET_SELECT_KEYS = [
  'species',
  'pairMode',
  'ageStage',
  'coatStyle',
  'expression',
  'activity',
  'settingVibe',
  'cameraAngle',
  'lightingStyle',
  'accessory',
] as const satisfies readonly (keyof PetPresetOptions)[];

const SCRIPT_KEY_ORDER = PRESET_SELECT_KEYS;

export const PET_PRESET_UI_SECTIONS: PetPresetUiSection[] = [
  {
    id: 'subject',
    title: 'Subject',
    description: 'Species, count, age, and coat read.',
    defaultOpen: true,
    fields: [
      { kind: 'select', key: 'species', label: 'Species' },
      { kind: 'select', key: 'pairMode', label: 'Count' },
      { kind: 'select', key: 'ageStage', label: 'Age' },
      { kind: 'select', key: 'coatStyle', label: 'Coat / markings' },
    ],
  },
  {
    id: 'performance',
    title: 'Behavior & expression',
    fields: [
      { kind: 'select', key: 'expression', label: 'Expression' },
      { kind: 'select', key: 'activity', label: 'Activity' },
      { kind: 'select', key: 'accessory', label: 'Accessory / prop' },
      {
        kind: 'text',
        key: 'petDetail',
        label: 'Extra detail',
        placeholder: 'e.g. heterochromia, floppy left ear, mud on paws',
      },
    ],
  },
  {
    id: 'scene',
    title: 'Setting & light',
    fields: [
      { kind: 'select', key: 'settingVibe', label: 'Setting' },
      { kind: 'select', key: 'cameraAngle', label: 'Camera angle & lens' },
      { kind: 'select', key: 'lightingStyle', label: 'Lighting' },
    ],
  },
];

function pickOption<T extends string>(value: string | undefined, allowed: readonly T[]): T {
  return allowed.includes(value as T) ? (value as T) : ('' as T);
}

function scriptForKey(
  key: (typeof PRESET_SELECT_KEYS)[number],
  value: string | undefined
): string | null {
  const options = SELECT_REGISTRY[key];
  const match = options.find(option => option.value === (value ?? ''));
  return match?.script ?? null;
}

export function getSelectOptionsForPetPresetKey(
  key: keyof PetPresetOptions
): ReadonlyArray<{ value: string; label: string }> {
  if (key in SELECT_REGISTRY) {
    return SELECT_REGISTRY[key as keyof typeof SELECT_REGISTRY].map(({ value, label }) => ({
      value,
      label,
    }));
  }
  return [];
}

export function normalizePetPresetOptions(
  input?: Partial<Record<keyof PetPresetOptions, string>> | null
): PetPresetOptions {
  const normalized = {} as PetPresetOptions;

  for (const key of PRESET_SELECT_KEYS) {
    const allowed = SELECT_REGISTRY[key].map(option => option.value);
    normalized[key] = pickOption(
      typeof input?.[key] === 'string' ? input[key] : undefined,
      allowed
    ) as never;
  }

  normalized.petDetail = typeof input?.petDetail === 'string' ? input.petDetail.trim() : '';

  return normalized;
}

export function presetOptionsFromPetCache(cache: Partial<PetPresetOptions>): PetPresetOptions {
  return normalizePetPresetOptions(cache);
}

export function clearPetPresetPatch(): Partial<PetPresetOptions> {
  return {
    species: '',
    pairMode: '',
    ageStage: '',
    coatStyle: '',
    expression: '',
    activity: '',
    settingVibe: '',
    cameraAngle: '',
    lightingStyle: '',
    accessory: '',
    petDetail: '',
  };
}

export function countPetPresetSelections(options: PetPresetOptions): number {
  let count = 0;
  for (const key of PRESET_SELECT_KEYS) {
    if (options[key]) {
      count += 1;
    }
  }
  if (options.petDetail) {
    count += 1;
  }
  return count;
}

export function hasPetPresetOptions(options: PetPresetOptions): boolean {
  return countPetPresetSelections(options) > 0;
}

export function getPetPresetScriptLines(options: PetPresetOptions): string[] {
  const lines: string[] = [];

  for (const key of SCRIPT_KEY_ORDER) {
    const line = scriptForKey(key, options[key] as string | undefined);
    if (line) {
      lines.push(line);
    }
  }

  if (options.petDetail) {
    lines.push(`${options.petDetail.replace(/\.$/, '')},`);
  }

  return lines;
}

export function buildPetPresetBlock(options: PetPresetOptions): string | null {
  const lines = getPetPresetScriptLines(options);
  if (lines.length === 0) {
    return null;
  }

  return [
    'PET PRESET (mandatory — weave these phrases naturally into the finished prompt; do not list them as bullets):',
    ...lines,
  ].join('\n');
}

export function buildPetPresetUserDirective(options: PetPresetOptions): string | null {
  if (!hasPetPresetOptions(options)) {
    return null;
  }

  return 'Follow every phrase in the PET PRESET block exactly. They override conflicting random ingredients.';
}

export function countPetPresetSectionSelections(
  options: PetPresetOptions,
  sectionId: string
): number {
  const section = PET_PRESET_UI_SECTIONS.find(item => item.id === sectionId);
  if (!section) {
    return 0;
  }

  return section.fields.reduce((count, field) => {
    if (field.kind === 'text') {
      return count + (options.petDetail ? 1 : 0);
    }
    return count + (options[field.key] ? 1 : 0);
  }, 0);
}

export function speciesHintFromPreset(species: PetSpeciesOption | undefined): string | null {
  switch (species) {
    case 'dog':
      return 'dog';
    case 'cat':
      return 'cat';
    case 'rabbit':
      return 'rabbit';
    case 'bird':
      return 'bird';
    case 'small-pet':
      return 'small pet';
    default:
      return null;
  }
}

export function pairHintFromPreset(pairMode: PetPairMode | undefined): string | null {
  if (pairMode === 'pair') {
    return 'two pets';
  }
  if (pairMode === 'solo') {
    return 'solo pet';
  }
  return null;
}
