import type { SelectOption } from '../app/select-option';

export type FantasyShotFraming = 'portrait' | 'full-body' | 'action' | 'wide';

export const FANTASY_SHOT_FRAMING_LINES: Record<FantasyShotFraming, string> = {
  portrait: 'tight portrait framing on face, gear, expression, and readable magical detail',
  'full-body':
    'full-body framing from head to toe with readable armor, robes, wings, or proportions',
  action:
    'dynamic action framing: mid-motion body with visible momentum, spell energy, and environment interaction—never a static standing pose',
  wide: 'wide environmental framing with layered depth and the subject anchored in mythic surroundings',
};

export function resolveFantasyShotFraming(
  focus: ReturnType<typeof resolveFantasyFocus>,
  portraitStyle?: FantasyShotFraming
): FantasyShotFraming {
  if (focus === 'environment') {
    return 'wide';
  }

  return portraitStyle ?? 'portrait';
}

export function getFantasyShotFramingLine(framing: FantasyShotFraming): string {
  return FANTASY_SHOT_FRAMING_LINES[framing];
}

export type FantasyFocus = '' | 'character' | 'creature' | 'environment' | 'ensemble';

export type FantasySubgenre =
  | ''
  | 'high-fantasy'
  | 'dark-fantasy'
  | 'fairy-tale'
  | 'sword-sorcery'
  | 'celestial'
  | 'eldritch'
  | 'steampunk-fantasy'
  | 'mythic'
  | 'urban-fantasy';

export type FantasySettingArchetype =
  | ''
  | 'enchanted-forest'
  | 'dragon-lair'
  | 'floating-castle'
  | 'ancient-ruins'
  | 'crystal-cavern'
  | 'witch-cottage'
  | 'battlefield'
  | 'celestial-spire'
  | 'underdark'
  | 'fairy-grove'
  | 'volcanic-shrine'
  | 'ice-palace'
  | 'sky-shrine';

export type FantasySubjectRole =
  | ''
  | 'knight'
  | 'wizard'
  | 'elf-ranger'
  | 'fairy'
  | 'dragon'
  | 'phoenix'
  | 'golem'
  | 'demon'
  | 'angel'
  | 'beast'
  | 'witch'
  | 'oracle'
  | 'vampire';

export type FantasyMagicElement =
  | ''
  | 'arcane-glow'
  | 'holy-light'
  | 'necrotic-mist'
  | 'fairy-dust'
  | 'lightning'
  | 'fire-runes'
  | 'ice-crystals'
  | 'nature-vines'
  | 'blood-moon'
  | 'astral-rift'
  | 'shadow-weave';

export type FantasyAtmosphere =
  '' | 'epic' | 'ominous' | 'whimsical' | 'serene' | 'chaotic' | 'mystical' | 'melancholic';

export type FantasyTimeOfDay = '' | 'dawn' | 'noon' | 'dusk' | 'midnight' | 'eternal-twilight';

export type FantasyScale = '' | 'intimate' | 'grand' | 'monumental';

export type FantasyCameraAngle = '' | 'eye-level' | 'low-hero' | 'aerial';

export type FantasyLightingStyle =
  '' | 'rim-lit' | 'moonlight' | 'torchlight' | 'bioluminescent' | 'god-rays' | 'storm-light';

export type FantasyColorPalette =
  '' | 'jewel-tones' | 'muted-earth' | 'high-contrast' | 'monochrome-blue' | 'ember-gold';

export type FantasyPresetOptions = {
  focus?: FantasyFocus;
  subgenre?: FantasySubgenre;
  settingArchetype?: FantasySettingArchetype;
  subjectRole?: FantasySubjectRole;
  magicElement?: FantasyMagicElement;
  atmosphere?: FantasyAtmosphere;
  timeOfDay?: FantasyTimeOfDay;
  scale?: FantasyScale;
  cameraAngle?: FantasyCameraAngle;
  lightingStyle?: FantasyLightingStyle;
  colorPalette?: FantasyColorPalette;
  fantasyDetail?: string;
};

export type FantasyPresetUiField = {
  kind: 'select' | 'text';
  key: keyof FantasyPresetOptions;
  label: string;
  placeholder?: string;
};

export type FantasyPresetUiSection = {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  fields: FantasyPresetUiField[];
};

const SELECT_REGISTRY = {
  focus: [
    { value: '', label: 'Auto (from hints)' },
    {
      value: 'character',
      label: 'Character hero',
      script: 'one fantasy character as the clear hero subject,',
    },
    {
      value: 'creature',
      label: 'Creature focus',
      script: 'one fantastical creature as the dominant subject,',
    },
    {
      value: 'environment',
      label: 'Environment only',
      script: 'environment-only fantasy scene with no people, creatures, or silhouettes,',
    },
    {
      value: 'ensemble',
      label: 'Small ensemble',
      script: 'a small fantasy ensemble of two or three figures, no crowd,',
    },
  ] satisfies SelectOption<FantasyFocus>[],
  subgenre: [
    { value: '', label: 'Any subgenre' },
    {
      value: 'high-fantasy',
      label: 'High fantasy',
      script: 'high fantasy tone with heroic scale and luminous wonder,',
    },
    {
      value: 'dark-fantasy',
      label: 'Dark fantasy',
      script: 'dark fantasy tone with dread, decay, and dangerous beauty,',
    },
    {
      value: 'fairy-tale',
      label: 'Fairy tale',
      script: 'storybook fairy-tale tone with whimsical enchantment,',
    },
    {
      value: 'sword-sorcery',
      label: 'Sword & sorcery',
      script: 'gritty sword-and-sorcery tone with worn steel and spellcraft,',
    },
    {
      value: 'celestial',
      label: 'Celestial',
      script: 'celestial mythic tone with divine scale and starlight,',
    },
    {
      value: 'eldritch',
      label: 'Eldritch',
      script: 'eldritch weird-fantasy tone with uncanny geometry and forbidden magic,',
    },
    {
      value: 'steampunk-fantasy',
      label: 'Steampunk fantasy',
      script: 'steampunk fantasy tone with brass, gears, and arcane machinery,',
    },
    {
      value: 'mythic',
      label: 'Mythic',
      script: 'ancient mythic tone with legendary symbolism and timeless weight,',
    },
    {
      value: 'urban-fantasy',
      label: 'Urban fantasy',
      script: 'urban fantasy tone where magic hides in modern streets and neon alleys,',
    },
  ] satisfies SelectOption<FantasySubgenre>[],
  settingArchetype: [
    { value: '', label: 'Random setting' },
    {
      value: 'enchanted-forest',
      label: 'Enchanted forest',
      script: 'an enchanted forest with glowing flora and ancient trees,',
    },
    {
      value: 'dragon-lair',
      label: 'Dragon lair',
      script: 'a dragon lair piled with gold, smoke, and volcanic stone,',
    },
    {
      value: 'floating-castle',
      label: 'Floating castle',
      script: 'a floating castle above cloud seas with hanging bridges,',
    },
    {
      value: 'ancient-ruins',
      label: 'Ancient ruins',
      script: 'overgrown ancient ruins with cracked rune pillars,',
    },
    {
      value: 'crystal-cavern',
      label: 'Crystal cavern',
      script: 'a crystal cavern with refracted light and mineral spires,',
    },
    {
      value: 'witch-cottage',
      label: 'Witch cottage',
      script: 'a witch cottage clearing with herbs, lanterns, and twisted roots,',
    },
    {
      value: 'battlefield',
      label: 'Battlefield',
      script: 'a mythic battlefield with broken banners and scorched earth,',
    },
    {
      value: 'celestial-spire',
      label: 'Celestial spire',
      script: 'a celestial spire rising through clouds toward star fields,',
    },
    {
      value: 'underdark',
      label: 'Underdark',
      script: 'an underdark cavern with bioluminescent fungi and black water,',
    },
    {
      value: 'fairy-grove',
      label: 'Fairy grove',
      script: 'a hidden fairy grove with mushroom circles and pollen light,',
    },
    {
      value: 'volcanic-shrine',
      label: 'Volcanic shrine',
      script: 'a volcanic shrine with lava channels and obsidian statues,',
    },
    {
      value: 'ice-palace',
      label: 'Ice palace',
      script: 'an ice palace with frost-carved arches and frozen waterfalls,',
    },
    {
      value: 'sky-shrine',
      label: 'Sky shrine',
      script: 'a sky shrine on floating stone terraces above cloud seas,',
    },
  ] satisfies SelectOption<FantasySettingArchetype>[],
  subjectRole: [
    { value: '', label: 'Any subject' },
    { value: 'knight', label: 'Knight', script: 'a battle-worn knight in ornate fantasy armor,' },
    {
      value: 'wizard',
      label: 'Wizard',
      script: 'a robed wizard channeling controlled spell energy,',
    },
    {
      value: 'elf-ranger',
      label: 'Elf ranger',
      script: 'an elven ranger with elegant gear and forest poise,',
    },
    {
      value: 'fairy',
      label: 'Fairy',
      script: 'a luminous fairy with iridescent wings and delicate presence,',
    },
    {
      value: 'dragon',
      label: 'Dragon',
      script: 'a majestic dragon with detailed scales and smoke,',
    },
    { value: 'phoenix', label: 'Phoenix', script: 'a phoenix trailing embers and rebirth fire,' },
    { value: 'golem', label: 'Golem', script: 'a stone golem with glowing rune seams,' },
    {
      value: 'demon',
      label: 'Demon',
      script: 'a horned demon with infernal silhouette and controlled menace,',
    },
    {
      value: 'angel',
      label: 'Angel',
      script: 'a winged angel with radiant feathers and solemn grace,',
    },
    {
      value: 'beast',
      label: 'Mythic beast',
      script: 'a mythic beast with impossible anatomy and primal power,',
    },
    { value: 'witch', label: 'Witch', script: 'a witch with ritual garments and arcane focus,' },
    {
      value: 'oracle',
      label: 'Oracle',
      script: 'an oracle with symbolic robes and prophetic atmosphere,',
    },
    {
      value: 'vampire',
      label: 'Vampire',
      script: 'a vampire aristocrat with pale skin, elegant garments, and restrained menace,',
    },
  ] satisfies SelectOption<FantasySubjectRole>[],
  magicElement: [
    { value: '', label: 'No specific magic' },
    {
      value: 'arcane-glow',
      label: 'Arcane glow',
      script: 'swirling arcane glow and floating sigils,',
    },
    {
      value: 'holy-light',
      label: 'Holy light',
      script: 'columns of holy light and drifting motes,',
    },
    {
      value: 'necrotic-mist',
      label: 'Necrotic mist',
      script: 'necrotic green mist and withering sparks,',
    },
    {
      value: 'fairy-dust',
      label: 'Fairy dust',
      script: 'glittering fairy dust and soft particle trails,',
    },
    { value: 'lightning', label: 'Lightning', script: 'forked spell lightning and ionized air,' },
    {
      value: 'fire-runes',
      label: 'Fire runes',
      script: 'burning fire runes orbiting the subject,',
    },
    {
      value: 'ice-crystals',
      label: 'Ice crystals',
      script: 'sharp ice crystals suspended in cold vapor,',
    },
    {
      value: 'nature-vines',
      label: 'Nature vines',
      script: 'living nature vines and blooming arcane flora,',
    },
    { value: 'blood-moon', label: 'Blood moon', script: 'blood moon light and crimson sky haze,' },
    {
      value: 'astral-rift',
      label: 'Astral rift',
      script: 'a tearing astral rift with starfield fragments,',
    },
    {
      value: 'shadow-weave',
      label: 'Shadow weave',
      script: 'living shadow threads and ink-black spell ribbons,',
    },
  ] satisfies SelectOption<FantasyMagicElement>[],
  atmosphere: [
    { value: '', label: 'Natural tone' },
    { value: 'epic', label: 'Epic', script: 'epic triumphant atmosphere,' },
    { value: 'ominous', label: 'Ominous', script: 'ominous foreboding atmosphere,' },
    { value: 'whimsical', label: 'Whimsical', script: 'whimsical playful atmosphere,' },
    { value: 'serene', label: 'Serene', script: 'serene contemplative atmosphere,' },
    { value: 'chaotic', label: 'Chaotic', script: 'chaotic volatile atmosphere,' },
    { value: 'mystical', label: 'Mystical', script: 'mystical dreamlike atmosphere,' },
    {
      value: 'melancholic',
      label: 'Melancholic',
      script: 'melancholic bittersweet atmosphere with quiet emotional weight,',
    },
  ] satisfies SelectOption<FantasyAtmosphere>[],
  timeOfDay: [
    { value: '', label: 'Any time' },
    { value: 'dawn', label: 'Dawn', script: 'pale dawn light with mist,' },
    { value: 'noon', label: 'Noon', script: 'hard noon light with strong shadows,' },
    { value: 'dusk', label: 'Dusk', script: 'amber dusk light with long shadows,' },
    {
      value: 'midnight',
      label: 'Midnight',
      script: 'deep midnight darkness with selective highlights,',
    },
    {
      value: 'eternal-twilight',
      label: 'Eternal twilight',
      script: 'eternal twilight with neither day nor night,',
    },
  ] satisfies SelectOption<FantasyTimeOfDay>[],
  scale: [
    { value: '', label: 'Natural epic scale' },
    { value: 'intimate', label: 'Intimate', script: 'intimate close-scale staging,' },
    { value: 'grand', label: 'Grand', script: 'grand cinematic scale,' },
    {
      value: 'monumental',
      label: 'Monumental',
      script: 'monumental mythic scale with vast surroundings,',
    },
  ] satisfies SelectOption<FantasyScale>[],
  cameraAngle: [
    { value: '', label: 'Default angle' },
    {
      value: 'eye-level',
      label: 'Eye level',
      script: 'eye-level camera aligned with the subject,',
    },
    { value: 'low-hero', label: 'Low hero angle', script: 'low hero-angle view from below,' },
    { value: 'aerial', label: 'Aerial', script: 'aerial downward perspective,' },
  ] satisfies SelectOption<FantasyCameraAngle>[],
  lightingStyle: [
    { value: '', label: 'Default lighting' },
    {
      value: 'rim-lit',
      label: 'Rim lit',
      script: 'strong rim lighting separating subject from background,',
    },
    { value: 'moonlight', label: 'Moonlight', script: 'cool moonlight with silver highlights,' },
    { value: 'torchlight', label: 'Torchlight', script: 'flickering warm torchlight,' },
    {
      value: 'bioluminescent',
      label: 'Bioluminescent',
      script: 'bioluminescent environmental glow,',
    },
    { value: 'god-rays', label: 'God rays', script: 'volumetric god rays through dust or mist,' },
    {
      value: 'storm-light',
      label: 'Storm light',
      script: 'storm light with dramatic cloud breaks,',
    },
  ] satisfies SelectOption<FantasyLightingStyle>[],
  colorPalette: [
    { value: '', label: 'Natural palette' },
    { value: 'jewel-tones', label: 'Jewel tones', script: 'rich jewel-tone color palette,' },
    { value: 'muted-earth', label: 'Muted earth', script: 'muted earthy fantasy palette,' },
    { value: 'high-contrast', label: 'High contrast', script: 'high-contrast fantasy palette,' },
    {
      value: 'monochrome-blue',
      label: 'Monochrome blue',
      script: 'monochrome blue fantasy palette,',
    },
    { value: 'ember-gold', label: 'Ember & gold', script: 'ember and gold fantasy palette,' },
  ] satisfies SelectOption<FantasyColorPalette>[],
} as const;

const PRESET_SELECT_KEYS = [
  'focus',
  'subgenre',
  'settingArchetype',
  'subjectRole',
  'magicElement',
  'atmosphere',
  'timeOfDay',
  'scale',
  'cameraAngle',
  'lightingStyle',
  'colorPalette',
] as const satisfies readonly (keyof FantasyPresetOptions)[];

export const FANTASY_PRESET_UI_SECTIONS: FantasyPresetUiSection[] = [
  {
    id: 'concept',
    title: 'Concept',
    description: 'Focus, genre, and subject role.',
    defaultOpen: true,
    fields: [
      { kind: 'select', key: 'focus', label: 'Scene focus' },
      { kind: 'select', key: 'subgenre', label: 'Subgenre' },
      { kind: 'select', key: 'subjectRole', label: 'Subject role' },
      {
        kind: 'text',
        key: 'fantasyDetail',
        label: 'Extra detail',
        placeholder: 'e.g. silver antlers, torn cloak, floating runestones',
      },
    ],
  },
  {
    id: 'world',
    title: 'World & magic',
    fields: [
      { kind: 'select', key: 'settingArchetype', label: 'Setting' },
      { kind: 'select', key: 'magicElement', label: 'Magic element' },
      { kind: 'select', key: 'atmosphere', label: 'Tone / mood' },
      { kind: 'select', key: 'timeOfDay', label: 'Time of day' },
    ],
  },
  {
    id: 'cinema',
    title: 'Cinematic framing',
    description:
      'Epic scale and camera angle—use Shot scale above for portrait, full body, action, or wide.',
    fields: [
      { kind: 'select', key: 'scale', label: 'Epic scale' },
      { kind: 'select', key: 'cameraAngle', label: 'Camera angle' },
    ],
  },
  {
    id: 'look',
    title: 'Light & color',
    fields: [
      { kind: 'select', key: 'lightingStyle', label: 'Lighting' },
      { kind: 'select', key: 'colorPalette', label: 'Color palette' },
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
  return options.find(option => option.value === (value ?? ''))?.script ?? null;
}

export function getSelectOptionsForFantasyPresetKey(
  key: keyof FantasyPresetOptions
): ReadonlyArray<{ value: string; label: string }> {
  if (key in SELECT_REGISTRY) {
    return SELECT_REGISTRY[key as keyof typeof SELECT_REGISTRY].map(({ value, label }) => ({
      value,
      label,
    }));
  }
  return [];
}

export function normalizeFantasyPresetOptions(
  input?: Partial<Record<keyof FantasyPresetOptions, string>> | null
): FantasyPresetOptions {
  const normalized = {} as FantasyPresetOptions;

  for (const key of PRESET_SELECT_KEYS) {
    const allowed = SELECT_REGISTRY[key].map(option => option.value);
    normalized[key] = pickOption(
      typeof input?.[key] === 'string' ? input[key] : undefined,
      allowed
    ) as never;
  }

  normalized.fantasyDetail =
    typeof input?.fantasyDetail === 'string' ? input.fantasyDetail.trim() : '';

  const legacyCamera = typeof input?.cameraAngle === 'string' ? input.cameraAngle : '';
  if (legacyCamera === 'wide-establishing' && !normalized.scale) {
    normalized.scale = 'grand';
  }

  return normalized;
}

export function presetOptionsFromFantasyCache(
  cache: Partial<FantasyPresetOptions>
): FantasyPresetOptions {
  return normalizeFantasyPresetOptions(cache);
}

export function clearFantasyPresetPatch(): Partial<FantasyPresetOptions> {
  return {
    focus: '',
    subgenre: '',
    settingArchetype: '',
    subjectRole: '',
    magicElement: '',
    atmosphere: '',
    timeOfDay: '',
    scale: '',
    cameraAngle: '',
    lightingStyle: '',
    colorPalette: '',
    fantasyDetail: '',
  };
}

export function countFantasyPresetSelections(options: FantasyPresetOptions): number {
  let count = 0;
  for (const key of PRESET_SELECT_KEYS) {
    if (options[key]) {
      count += 1;
    }
  }
  if (options.fantasyDetail) {
    count += 1;
  }
  return count;
}

export function hasFantasyPresetOptions(options: FantasyPresetOptions): boolean {
  return countFantasyPresetSelections(options) > 0;
}

export function getFantasyPresetScriptLines(options: FantasyPresetOptions): string[] {
  const lines: string[] = [];

  for (const key of PRESET_SELECT_KEYS) {
    const line = scriptForKey(key, options[key] as string | undefined);
    if (line) {
      lines.push(line);
    }
  }

  if (options.fantasyDetail) {
    lines.push(`${options.fantasyDetail.replace(/\.$/, '')},`);
  }

  return lines;
}

export function buildFantasyPresetBlock(options: FantasyPresetOptions): string | null {
  const lines = getFantasyPresetScriptLines(options);
  if (lines.length === 0) {
    return null;
  }

  return [
    'FANTASY PRESET (mandatory — weave these phrases naturally into the finished prompt; do not list them as bullets):',
    ...lines,
  ].join('\n');
}

export function buildFantasyPresetUserDirective(options: FantasyPresetOptions): string | null {
  if (!hasFantasyPresetOptions(options)) {
    return null;
  }

  return 'Follow every phrase in the FANTASY PRESET block exactly. They override conflicting random ingredients.';
}

export function countFantasyPresetSectionSelections(
  options: FantasyPresetOptions,
  sectionId: string
): number {
  const section = FANTASY_PRESET_UI_SECTIONS.find(item => item.id === sectionId);
  if (!section) {
    return 0;
  }

  return section.fields.reduce((count, field) => {
    if (field.kind === 'text') {
      return count + (options.fantasyDetail ? 1 : 0);
    }
    return count + (options[field.key] ? 1 : 0);
  }, 0);
}

export function resolveFantasyFocus(
  options: FantasyPresetOptions,
  hints?: string
): FantasyFocus | 'character' | 'creature' | 'environment' | 'ensemble' {
  if (options.focus) {
    return options.focus;
  }

  const text = hints?.toLowerCase() ?? '';
  if (/\b(no people|environment only|landscape only|no figures)\b/.test(text)) {
    return 'environment';
  }
  if (/\b(dragon|phoenix|golem|beast|creature|monster|griffin|wyvern)\b/.test(text)) {
    return 'creature';
  }
  if (/\b(two|three|ensemble|party|duo|group of)\b/.test(text)) {
    return 'ensemble';
  }
  if (/\b(knight|wizard|witch|elf|ranger|oracle|hero|mage|warrior)\b/.test(text)) {
    return 'character';
  }

  return 'character';
}
