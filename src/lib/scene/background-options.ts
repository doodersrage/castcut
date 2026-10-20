import type { SelectOption } from '../app/select-option';

export type BackgroundRoomPerspective =
  | ''
  | 'deep-room'
  | 'shallow-corner'
  | 'flat-parallel'
  | 'one-point-corridor'
  | 'elevated-overview'
  | 'ground-level-intimate'
  | 'wide-exterior'
  | 'isometric-diagram';

export type BackgroundDepthFocus =
  '' | 'deep-focus' | 'shallow-bokeh' | 'tilt-shift' | 'rack-focus' | 'atmospheric-falloff';

export type BackgroundSpatialScale =
  '' | 'intimate-room' | 'medium-interior' | 'grand-architectural' | 'expansive-landscape';

export type BackgroundEnvironmentArchetype =
  | ''
  | 'bedroom'
  | 'home-office'
  | 'workshop'
  | 'warehouse'
  | 'cafe'
  | 'library'
  | 'server-room'
  | 'street-alley'
  | 'rooftop'
  | 'forest-path'
  | 'coastal-shore';

export type BackgroundLightSource =
  | ''
  | 'direct-sunlight'
  | 'overcast-daylight'
  | 'night-lamp'
  | 'golden-window'
  | 'fluorescent-office'
  | 'candlelight-warm'
  | 'neon-signage'
  | 'moonlight-blue'
  | 'skylight-well'
  | 'fireplace-hearth'
  | 'stage-spotlight';

export type BackgroundAtmosphere =
  | ''
  | 'clear-crisp'
  | 'light-rain'
  | 'fog-haze'
  | 'dust-particles'
  | 'falling-snow'
  | 'steam-humidity'
  | 'smoke-haze';

export type BackgroundColorPalette =
  | ''
  | 'warm-natural'
  | 'cool-desaturated'
  | 'high-contrast'
  | 'muted-earth'
  | 'monochrome'
  | 'teal-orange'
  | 'pastel-soft';

export type BackgroundRoomState =
  | ''
  | 'lived-in-cluttered'
  | 'minimalist-clean'
  | 'staged-midrange'
  | 'industrial-raw'
  | 'abandoned-decay'
  | 'retail-commercial'
  | 'archive-storage'
  | 'workshop-hobbyist';

export type BackgroundSurfaceMaterial =
  | 'wood-grain'
  | 'matte-drywall'
  | 'transparent-glass'
  | 'weathered-brick'
  | 'polished-metal'
  | 'fabric-textiles'
  | 'stone-tile'
  | 'raw-concrete'
  | 'wallpaper-pattern'
  | 'rust-patina'
  | 'wet-surfaces'
  | 'plant-organic';

export type BackgroundPresetOptions = {
  roomPerspective?: BackgroundRoomPerspective;
  depthFocus?: BackgroundDepthFocus;
  spatialScale?: BackgroundSpatialScale;
  environmentArchetype?: BackgroundEnvironmentArchetype;
  lightSource?: BackgroundLightSource;
  atmosphere?: BackgroundAtmosphere;
  colorPalette?: BackgroundColorPalette;
  roomState?: BackgroundRoomState;
  surfaceMaterials?: BackgroundSurfaceMaterial[];
  environmentDetail?: string;
};

export type BackgroundPresetUiField =
  | {
      kind: 'select';
      key: keyof BackgroundPresetOptions;
      label: string;
    }
  | {
      kind: 'text';
      key: 'environmentDetail';
      label: string;
      placeholder?: string;
    };

export type BackgroundPresetUiSection = {
  id: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  fields: BackgroundPresetUiField[];
};

export const BACKGROUND_ROOM_PERSPECTIVE_OPTIONS: SelectOption<BackgroundRoomPerspective>[] = [
  { value: '', label: 'Default (natural perspective)' },
  {
    value: 'deep-room',
    label: 'Deep room perspective',
    script:
      'a balanced wide-angle architectural perspective looking straight down the length of the room,',
  },
  {
    value: 'shallow-corner',
    label: 'Shallow / angled corner',
    script: 'a three-quarter corner perspective framing the intersection of two distinct walls,',
  },
  {
    value: 'flat-parallel',
    label: 'Flat / parallel wall',
    script: 'a flat, parallel-plane composition framed directly against the back wall,',
  },
  {
    value: 'one-point-corridor',
    label: 'One-point corridor',
    script:
      'a one-point perspective corridor composition drawing the eye through aligned walls and floor lines,',
  },
  {
    value: 'elevated-overview',
    label: 'Elevated overview',
    script:
      'a slightly elevated overview perspective looking down across the floor plane and architectural layout,',
  },
  {
    value: 'ground-level-intimate',
    label: 'Ground-level intimate',
    script:
      'a low, ground-level perspective that emphasizes nearby surfaces and intimate spatial depth,',
  },
  {
    value: 'wide-exterior',
    label: 'Wide exterior establishing',
    script:
      'a wide exterior establishing shot with layered foreground, midground, and distant background planes,',
  },
  {
    value: 'isometric-diagram',
    label: 'Isometric / diagrammatic',
    script:
      'a clean isometric-style architectural read with readable wall planes and orthogonal depth cues,',
  },
];

export const BACKGROUND_DEPTH_FOCUS_OPTIONS: SelectOption<BackgroundDepthFocus>[] = [
  { value: '', label: 'Default (natural depth)' },
  {
    value: 'deep-focus',
    label: 'Sharp & detailed (deep focus)',
    script:
      'utilizing an evenly distributed deep depth of field where background structures maintain razor-sharp clarity and geometric alignment,',
  },
  {
    value: 'shallow-bokeh',
    label: 'Soft ambient separation (bokeh)',
    script:
      'utilizing a shallow depth of field that gently separates the foreground from a softly blurred, structurally coherent background,',
  },
  {
    value: 'tilt-shift',
    label: 'Tilt-shift miniature',
    script:
      'utilizing tilt-shift depth bands that keep a horizontal slice of architecture sharp while softening near and far planes,',
  },
  {
    value: 'rack-focus',
    label: 'Rack focus (foreground anchor)',
    script:
      'utilizing rack focus that keeps a nearby foreground element sharp while the background falls into a readable soft blur,',
  },
  {
    value: 'atmospheric-falloff',
    label: 'Atmospheric depth falloff',
    script:
      'utilizing natural atmospheric perspective where distant structures lose contrast and soften into haze,',
  },
];

export const BACKGROUND_SPATIAL_SCALE_OPTIONS: SelectOption<BackgroundSpatialScale>[] = [
  { value: '', label: 'Default (natural scale)' },
  {
    value: 'intimate-room',
    label: 'Intimate / small room',
    script:
      'an intimate, compact interior scale where walls and furniture feel close and enclosing,',
  },
  {
    value: 'medium-interior',
    label: 'Medium interior',
    script:
      'a believable medium-scale interior with balanced proportions and readable walkable space,',
  },
  {
    value: 'grand-architectural',
    label: 'Grand / cavernous',
    script:
      'a grand, cavernous architectural scale with tall ceilings, long sight lines, and imposing volume,',
  },
  {
    value: 'expansive-landscape',
    label: 'Expansive landscape',
    script:
      'an expansive outdoor or open-plan scale with wide horizons and layered environmental depth,',
  },
];

export const BACKGROUND_ENVIRONMENT_ARCHETYPE_OPTIONS: SelectOption<BackgroundEnvironmentArchetype>[] =
  [
    { value: '', label: 'Default (no archetype)' },
    {
      value: 'bedroom',
      label: 'Bedroom',
      script:
        'a believable residential bedroom interior with a bed, side tables, and personal everyday objects,',
    },
    {
      value: 'home-office',
      label: 'Home office',
      script:
        'a functional home office with desk, chair, monitor, cables, and practical workspace clutter,',
    },
    {
      value: 'workshop',
      label: 'Workshop / maker space',
      script:
        'a hands-on workshop with workbench, tools, hardware bins, and authentic maker-space wear,',
    },
    {
      value: 'warehouse',
      label: 'Warehouse / storage',
      script:
        'a utilitarian warehouse or storage bay with shelving, pallets, and industrial floor markings,',
    },
    {
      value: 'cafe',
      label: 'Café / restaurant',
      script:
        'a cozy café or restaurant interior with tables, chairs, counter service, and ambient dining props,',
    },
    {
      value: 'library',
      label: 'Library / study',
      script:
        'a quiet library or study with bookshelves, reading tables, and archival paper textures,',
    },
    {
      value: 'server-room',
      label: 'Server room / data center',
      script:
        'a server room or data center aisle with rack cabinets, cable trays, status LEDs, and raised flooring,',
    },
    {
      value: 'street-alley',
      label: 'Street / alley',
      script:
        'an urban street or alley with pavement, storefronts, signage, and grounded city-scale props,',
    },
    {
      value: 'rooftop',
      label: 'Rooftop / skyline',
      script:
        'a rooftop or elevated terrace with parapet edges, distant skyline layers, and open-air depth,',
    },
    {
      value: 'forest-path',
      label: 'Forest path',
      script:
        'a forest path with tree trunks, leaf litter, dappled ground cover, and natural canopy depth,',
    },
    {
      value: 'coastal-shore',
      label: 'Coastal shore',
      script:
        'a coastal shoreline with sand or rock foreground, water reflections, and horizon depth,',
    },
  ];

export const BACKGROUND_LIGHT_SOURCE_OPTIONS: SelectOption<BackgroundLightSource>[] = [
  { value: '', label: 'Default (balanced light)' },
  {
    value: 'direct-sunlight',
    label: 'Direct sunlight / window rays',
    script:
      'harsh, directional sunlight filtering at an angle through window blinds, casting sharp, high-contrast geometric shadows across the floor,',
  },
  {
    value: 'overcast-daylight',
    label: 'Overcast / soft daylight',
    script:
      'diffused, cool ambient daylight from a nearby window, creating soft, even illumination and smooth gradient shadows,',
  },
  {
    value: 'night-lamp',
    label: 'Night / moody interior lamp',
    script:
      'warm, localized ambient light emitting from a single bedside lamp, casting rich, deep shadows and soft amber highlights,',
  },
  {
    value: 'golden-window',
    label: 'Golden hour window',
    script:
      'warm golden-hour light streaming through a large window, painting long soft shadows and amber wall gradients,',
  },
  {
    value: 'fluorescent-office',
    label: 'Fluorescent / office overhead',
    script:
      'cool overhead fluorescent panels casting flat institutional light with slight green cast and minimal shadow depth,',
  },
  {
    value: 'candlelight-warm',
    label: 'Candlelight warm',
    script:
      'flickering warm candlelight creating intimate pools of amber illumination and deep surrounding shadow,',
  },
  {
    value: 'neon-signage',
    label: 'Neon signage / night city',
    script:
      'colorful neon signage casting saturated magenta and cyan spill light across nearby surfaces at night,',
  },
  {
    value: 'moonlight-blue',
    label: 'Cool moonlight',
    script:
      'cool blue moonlight filtering through windows or open sky, creating silvery highlights and deep blue shadows,',
  },
  {
    value: 'skylight-well',
    label: 'Skylight / light well',
    script:
      'soft top-down skylight illumination washing walls and floor with even, natural overhead light,',
  },
  {
    value: 'fireplace-hearth',
    label: 'Fireplace / hearth glow',
    script:
      'warm hearth glow from a fireplace casting flickering orange light and long soft shadows across the room,',
  },
  {
    value: 'stage-spotlight',
    label: 'Stage spotlight',
    script:
      'a dramatic stage-style spotlight beam cutting through ambient darkness with visible light falloff,',
  },
];

export const BACKGROUND_ATMOSPHERE_OPTIONS: SelectOption<BackgroundAtmosphere>[] = [
  { value: '', label: 'Default (clear air)' },
  {
    value: 'clear-crisp',
    label: 'Clear & crisp air',
    script: 'with crisp, clean air and high edge clarity across distant architectural details,',
  },
  {
    value: 'light-rain',
    label: 'Light rain / wet surfaces',
    script: 'with light rain in the air and wet reflective surfaces catching specular highlights,',
  },
  {
    value: 'fog-haze',
    label: 'Fog / low haze',
    script:
      'with soft fog or low atmospheric haze that gently obscures distant depth while keeping foreground readable,',
  },
  {
    value: 'dust-particles',
    label: 'Dust motes / particulate',
    script:
      'with visible dust motes and particulate suspended in light beams, adding tactile air volume,',
  },
  {
    value: 'falling-snow',
    label: 'Falling snow',
    script: 'with gently falling snow and cool ambient diffusion across surfaces and sky,',
  },
  {
    value: 'steam-humidity',
    label: 'Steam / humid air',
    script:
      'with steam or humid air softening contrast and creating layered translucent atmosphere,',
  },
  {
    value: 'smoke-haze',
    label: 'Smoke / cinematic haze',
    script: 'with cinematic smoke haze diffusing light and adding moody volumetric depth,',
  },
];

export const BACKGROUND_COLOR_PALETTE_OPTIONS: SelectOption<BackgroundColorPalette>[] = [
  { value: '', label: 'Default (natural palette)' },
  {
    value: 'warm-natural',
    label: 'Warm natural tones',
    script:
      'rendered in warm natural tones with amber wood, cream walls, and earthy shadow gradients,',
  },
  {
    value: 'cool-desaturated',
    label: 'Cool & desaturated',
    script:
      'rendered in cool, desaturated tones with slate blues, gray neutrals, and restrained saturation,',
  },
  {
    value: 'high-contrast',
    label: 'High contrast',
    script: 'rendered with high contrast between bright highlights and deep shadow pockets,',
  },
  {
    value: 'muted-earth',
    label: 'Muted earth tones',
    script: 'rendered in muted earth tones—olive, umber, sand, and weathered neutral pigments,',
  },
  {
    value: 'monochrome',
    label: 'Monochrome / near B&W',
    script:
      'rendered in a near-monochrome palette with subtle tonal separation and minimal color cast,',
  },
  {
    value: 'teal-orange',
    label: 'Teal & orange cinematic',
    script:
      'rendered with cinematic teal shadows and warm orange highlights across the environment,',
  },
  {
    value: 'pastel-soft',
    label: 'Soft pastels',
    script: 'rendered in soft pastel colors with gentle saturation and airy tonal transitions,',
  },
];

export const BACKGROUND_ROOM_STATE_OPTIONS: SelectOption<BackgroundRoomState>[] = [
  { value: '', label: 'Default (neutral room state)' },
  {
    value: 'lived-in-cluttered',
    label: 'Lived-in & cluttered (tech/hobbyist)',
    script:
      'a highly detailed, authentically messy interior scattered with realistic physical props, giving the space a natural, lived-in character,',
  },
  {
    value: 'minimalist-clean',
    label: 'Minimalist & clean',
    script:
      'a pristine, minimalist interior space with clean architectural lines and uncluttered geometric surfaces,',
  },
  {
    value: 'staged-midrange',
    label: 'Staged / curated',
    script:
      'a carefully staged interior with intentional prop placement, balanced negative space, and believable everyday objects,',
  },
  {
    value: 'industrial-raw',
    label: 'Industrial / raw',
    script:
      'a raw industrial interior with exposed structure, utilitarian surfaces, and honest material wear,',
  },
  {
    value: 'abandoned-decay',
    label: 'Abandoned / decay',
    script:
      'an abandoned space with peeling paint, dust accumulation, and believable signs of neglect,',
  },
  {
    value: 'retail-commercial',
    label: 'Retail / commercial',
    script:
      'a commercial retail interior with product displays, signage, and practical customer-facing layout,',
  },
  {
    value: 'archive-storage',
    label: 'Archive / storage stacks',
    script:
      'an archive or storage space with labeled boxes, stacked shelves, and organized paper clutter,',
  },
  {
    value: 'workshop-hobbyist',
    label: 'Hobbyist workbench zone',
    script:
      'a hobbyist work zone with bench tools, parts bins, cables, and authentic project-in-progress clutter,',
  },
];

export const BACKGROUND_SURFACE_MATERIAL_OPTIONS: Array<{
  value: BackgroundSurfaceMaterial;
  label: string;
  script: string;
}> = [
  {
    value: 'wood-grain',
    label: 'Visible wood grain',
    script: 'showing authentic, coarse wood grain textures on the furniture and panels,',
  },
  {
    value: 'matte-drywall',
    label: 'Matte drywall / plaster',
    script:
      'with matte, non-reflective drywall textures and subtle paint imperfections on the walls,',
  },
  {
    value: 'transparent-glass',
    label: 'Transparent glass',
    script: 'featuring realistic glass reflections and sharp refractions on windows and frames,',
  },
  {
    value: 'weathered-brick',
    label: 'Weathered brick / concrete',
    script: 'showcasing gritty, tactile weathered brickwork with physical depth,',
  },
  {
    value: 'polished-metal',
    label: 'Polished metal',
    script:
      'showing brushed and polished metal surfaces with directional specular highlights and fine scratches,',
  },
  {
    value: 'fabric-textiles',
    label: 'Fabric & textiles',
    script:
      'featuring believable fabric weave, folds, and textile depth on upholstery and soft surfaces,',
  },
  {
    value: 'stone-tile',
    label: 'Stone & tile',
    script:
      'showing stone and ceramic tile surfaces with grout lines, micro-texture, and realistic wear patterns,',
  },
  {
    value: 'raw-concrete',
    label: 'Raw concrete',
    script:
      'showing raw poured concrete with aggregate texture, form lines, and honest surface imperfections,',
  },
  {
    value: 'wallpaper-pattern',
    label: 'Wallpaper / patterned surfaces',
    script:
      'featuring wallpaper or patterned wall surfaces with readable repeat texture and subtle edge wear,',
  },
  {
    value: 'rust-patina',
    label: 'Rust & patina',
    script:
      'showing oxidized metal, rust patina, and aged surface discoloration with tactile depth,',
  },
  {
    value: 'wet-surfaces',
    label: 'Wet / reflective surfaces',
    script:
      'featuring wet or glossy surfaces with believable reflections, puddles, and specular highlights,',
  },
  {
    value: 'plant-organic',
    label: 'Plants & organic matter',
    script:
      'featuring living plants, soil, leaf texture, and organic surface variation for natural realism,',
  },
];

export const BACKGROUND_PRESET_UI_SECTIONS: BackgroundPresetUiSection[] = [
  {
    id: 'setting',
    title: 'Place & scale',
    description: 'Common interior and exterior environment templates.',
    defaultOpen: true,
    fields: [
      {
        kind: 'select',
        key: 'environmentArchetype',
        label: 'Environment archetype',
      },
      { kind: 'select', key: 'spatialScale', label: 'Spatial scale' },
    ],
  },
  {
    id: 'layout',
    title: 'Spatial layout & depth',
    description: 'Perspective, geometry, and focus control.',
    fields: [
      { kind: 'select', key: 'roomPerspective', label: 'Room depth & perspective' },
      { kind: 'select', key: 'depthFocus', label: 'Background focus control' },
    ],
  },
  {
    id: 'environment',
    title: 'Light, air & palette',
    description: 'Weather, palette, light direction, and room state.',
    fields: [
      { kind: 'select', key: 'lightSource', label: 'Primary light source' },
      { kind: 'select', key: 'atmosphere', label: 'Atmosphere & weather' },
      { kind: 'select', key: 'colorPalette', label: 'Color palette' },
      { kind: 'select', key: 'roomState', label: 'Room state & clutter' },
    ],
  },
  {
    id: 'custom',
    title: 'Custom environment',
    description: 'Anchors your description to the floor plane and architecture.',
    fields: [
      {
        kind: 'text',
        key: 'environmentDetail',
        label: 'Environment details',
        placeholder: 'a cozy bedroom with a messy workbench',
      },
    ],
  },
];

const SELECT_OPTION_REGISTRY: Record<string, SelectOption<string>[]> = {
  environmentArchetype: BACKGROUND_ENVIRONMENT_ARCHETYPE_OPTIONS,
  spatialScale: BACKGROUND_SPATIAL_SCALE_OPTIONS,
  roomPerspective: BACKGROUND_ROOM_PERSPECTIVE_OPTIONS,
  depthFocus: BACKGROUND_DEPTH_FOCUS_OPTIONS,
  lightSource: BACKGROUND_LIGHT_SOURCE_OPTIONS,
  atmosphere: BACKGROUND_ATMOSPHERE_OPTIONS,
  colorPalette: BACKGROUND_COLOR_PALETTE_OPTIONS,
  roomState: BACKGROUND_ROOM_STATE_OPTIONS,
};

const PRESET_SCRIPT_KEY_ORDER = [
  'environmentArchetype',
  'spatialScale',
  'roomPerspective',
  'depthFocus',
  'atmosphere',
  'colorPalette',
  'lightSource',
  'roomState',
] as const;

const PRESET_SELECT_KEYS = [...PRESET_SCRIPT_KEY_ORDER] as (keyof BackgroundPresetOptions)[];

const VALID_OPTION_VALUES = Object.fromEntries(
  PRESET_SELECT_KEYS.map(key => [
    key,
    new Set(SELECT_OPTION_REGISTRY[key].map(option => option.value)),
  ])
) as Record<string, Set<string>>;

const VALID_SURFACE_MATERIALS = new Set(
  BACKGROUND_SURFACE_MATERIAL_OPTIONS.map(option => option.value)
);

export const BACKGROUND_PRESET_FIELD_KEYS: (keyof BackgroundPresetOptions)[] = [
  ...PRESET_SELECT_KEYS,
  'surfaceMaterials',
  'environmentDetail',
];

function scriptFor<T extends string>(
  options: SelectOption<T>[],
  value: T | undefined
): string | null {
  if (!value) {
    return null;
  }

  return options.find(option => option.value === value)?.script ?? null;
}

function scriptForKey(
  key: keyof typeof SELECT_OPTION_REGISTRY,
  value: string | undefined
): string | null {
  if (!value) {
    return null;
  }

  return scriptFor(SELECT_OPTION_REGISTRY[key], value);
}

function pickOption<T extends string>(raw: string | undefined, allowed: Set<string>): T | '' {
  return raw && allowed.has(raw) ? (raw as T) : '';
}

function parseSurfaceMaterials(raw: string | string[] | undefined): BackgroundSurfaceMaterial[] {
  const parts = Array.isArray(raw)
    ? raw
    : (raw ?? '')
        .split(/[,;|]+/)
        .map(part => part.trim())
        .filter(Boolean);

  return parts.filter((part): part is BackgroundSurfaceMaterial =>
    VALID_SURFACE_MATERIALS.has(part as BackgroundSurfaceMaterial)
  );
}

function withEnvironmentArticle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^the environment is\b/i.test(trimmed)) {
    return trimmed;
  }

  return /^(?:a|an|the)\b/i.test(trimmed) ? trimmed : `a ${trimmed}`;
}

function enrichEnvironmentDetail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const anchorSuffix =
    'where all architectural lines, electrical outlets, and furniture bases are firmly anchored horizontally to the floor plane.';

  if (/^the environment is\b/i.test(trimmed)) {
    const body = trimmed.replace(/^the environment is\s+/i, '').replace(/[.!?]\s*$/, '');
    return `The environment is ${body}, ${anchorSuffix}`;
  }

  return `The environment is ${withEnvironmentArticle(trimmed)}, ${anchorSuffix}`;
}

export function normalizeBackgroundPresetOptions(
  input?: Partial<Record<keyof BackgroundPresetOptions, string | string[]>> | null
): BackgroundPresetOptions {
  const normalized = {} as BackgroundPresetOptions;

  for (const key of PRESET_SELECT_KEYS) {
    normalized[key] = pickOption(
      typeof input?.[key] === 'string' ? input[key] : undefined,
      VALID_OPTION_VALUES[key]!
    ) as never;
  }

  normalized.surfaceMaterials = parseSurfaceMaterials(input?.surfaceMaterials);
  normalized.environmentDetail =
    typeof input?.environmentDetail === 'string' ? input.environmentDetail.trim() : '';

  return normalized;
}

export function presetOptionsFromBackgroundCache(
  cache: Partial<
    Omit<BackgroundPresetOptions, 'surfaceMaterials'> & {
      surfaceMaterials?: string | string[];
    }
  >
): BackgroundPresetOptions {
  return normalizeBackgroundPresetOptions({
    environmentArchetype: cache.environmentArchetype,
    spatialScale: cache.spatialScale,
    roomPerspective: cache.roomPerspective,
    depthFocus: cache.depthFocus,
    lightSource: cache.lightSource,
    atmosphere: cache.atmosphere,
    colorPalette: cache.colorPalette,
    roomState: cache.roomState,
    surfaceMaterials: cache.surfaceMaterials,
    environmentDetail: cache.environmentDetail,
  });
}

export function clearBackgroundPresetPatch(): Partial<
  Omit<BackgroundPresetOptions, 'surfaceMaterials'> & {
    surfaceMaterials?: string;
  }
> {
  return {
    environmentArchetype: '',
    spatialScale: '',
    roomPerspective: '',
    depthFocus: '',
    lightSource: '',
    atmosphere: '',
    colorPalette: '',
    roomState: '',
    surfaceMaterials: '',
    environmentDetail: '',
  };
}

export function toggleBackgroundSurfaceMaterial(
  current: string | undefined,
  material: BackgroundSurfaceMaterial,
  enabled: boolean
): string {
  const next = new Set(parseSurfaceMaterials(current));
  if (enabled) {
    next.add(material);
  } else {
    next.delete(material);
  }

  return [...next].join(',');
}

export function getBackgroundPresetScriptLines(options: BackgroundPresetOptions): string[] {
  const lines: string[] = [];

  for (const key of PRESET_SCRIPT_KEY_ORDER) {
    const line = scriptForKey(
      key as keyof typeof SELECT_OPTION_REGISTRY,
      options[key] as string | undefined
    );
    if (line) {
      lines.push(line);
    }
  }

  for (const material of options.surfaceMaterials ?? []) {
    const script = BACKGROUND_SURFACE_MATERIAL_OPTIONS.find(
      option => option.value === material
    )?.script;
    if (script) {
      lines.push(script);
    }
  }

  if (options.environmentDetail) {
    lines.push(enrichEnvironmentDetail(options.environmentDetail));
  }

  return lines;
}

export function buildBackgroundPresetBlock(options: BackgroundPresetOptions): string | null {
  const lines = getBackgroundPresetScriptLines(options);
  if (lines.length === 0) {
    return null;
  }

  return [
    'BACKGROUND PRESET (mandatory — weave these phrases naturally into the finished prompt; do not list them as bullets):',
    ...lines,
  ].join('\n');
}

export function buildBackgroundPresetSanitizeContext(
  seed: string,
  options: BackgroundPresetOptions,
  extras?: string[]
): string {
  const presetSummary = getBackgroundPresetScriptLines(options).join(' ');
  return [presetSummary, ...(extras ?? []), seed].filter(Boolean).join('\n');
}

function normalizePresetMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function presetLinePresent(prompt: string, line: string): boolean {
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

export function mergeBackgroundPresetsIntoPrompt(
  prompt: string,
  options: BackgroundPresetOptions
): string {
  const lines = getBackgroundPresetScriptLines(options);
  if (lines.length === 0) {
    return prompt.trim();
  }

  const trimmed = prompt.trim();
  const missing = lines.filter(line => !presetLinePresent(trimmed, line));

  if (missing.length === 0) {
    return trimmed;
  }

  const prefix = weavePresetLines(missing);
  if (!trimmed) {
    return prefix;
  }

  return `${prefix} ${trimmed}`.replace(/\s+/g, ' ').trim();
}

export function countBackgroundPresetSelections(options: BackgroundPresetOptions): number {
  let count = 0;

  for (const key of PRESET_SELECT_KEYS) {
    if (options[key]) {
      count += 1;
    }
  }

  count += options.surfaceMaterials?.length ?? 0;

  if (options.environmentDetail) {
    count += 1;
  }

  return count;
}

export function countBackgroundPresetSectionSelections(
  sectionId: string,
  options: BackgroundPresetOptions
): number {
  const section = BACKGROUND_PRESET_UI_SECTIONS.find(item => item.id === sectionId);
  if (!section) {
    return 0;
  }

  let count = 0;

  for (const field of section.fields) {
    if (field.kind === 'select' && options[field.key]) {
      count += 1;
    }

    if (field.kind === 'text' && options.environmentDetail) {
      count += 1;
    }
  }

  if (section.id === 'materials') {
    count += options.surfaceMaterials?.length ?? 0;
  }

  return count;
}

export function hasBackgroundPresetOptions(options: BackgroundPresetOptions): boolean {
  return countBackgroundPresetSelections(options) > 0;
}

export function buildBackgroundPresetUserDirective(
  options: BackgroundPresetOptions
): string | null {
  if (!hasBackgroundPresetOptions(options)) {
    return null;
  }

  const count = countBackgroundPresetSelections(options);
  return [
    `PRESET ENFORCEMENT (mandatory): ${count} background preset(s) are active.`,
    'Your output MUST include every detail from the BACKGROUND PRESET block—archetype, scale, perspective, depth, atmosphere, palette, lighting, room state, materials, and custom environment anchors.',
    'Rephrase for natural prose, but do not omit preset geometry, material, or lighting details.',
    'Keep all furniture and architecture anchored to the floor plane with no floating clip-art props.',
  ].join(' ');
}

export function getSelectOptionsForBackgroundPresetKey(
  key: keyof BackgroundPresetOptions
): SelectOption<string>[] {
  return SELECT_OPTION_REGISTRY[key as string] ?? [{ value: '', label: 'Default' }];
}
