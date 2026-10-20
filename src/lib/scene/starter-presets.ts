import { SPORT_PRESETS, type SportPreset } from './sport-presets';
import { buildGeneratedSceneStarters } from './starter-generated';
import { withSceneStarterTags, filterSceneStarters } from './starter-filter';
import type { SceneStarterCategory, SceneStarterPreset } from './starter-types';

export type { SceneStarterCategory, SceneStarterPreset } from './starter-types';
export { SCENE_STARTER_CATEGORIES } from './starter-types';
export {
  filterSceneStarters,
  withSceneStarterTags,
  inferSceneStarterTags,
  SCENE_STARTER_TAG_OPTIONS,
  DEFAULT_SCENE_STARTER_FILTER,
  type SceneStarterFilterState,
  type SceneStarterFramingFilter,
} from './starter-filter';

function fromSportPreset(preset: SportPreset): SceneStarterPreset {
  return {
    id: preset.id,
    label: preset.label,
    hints: preset.hints,
    category: 'sport',
    portraitStyle: preset.portraitStyle,
    duo: preset.duo,
    teamKit: preset.teamKit,
  };
}

const NON_SPORT_SCENE_STARTERS: readonly SceneStarterPreset[] = [
  {
    id: 'studio-portrait-soft',
    label: 'Soft studio portrait',
    hints:
      'young woman in her twenties, soft window light, neutral studio backdrop, natural expression',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'editorial-beauty',
    label: 'Editorial beauty',
    hints:
      'close beauty portrait, dewy skin, subtle makeup, catchlight in the eyes, magazine lighting',
    category: 'portrait',
    portraitStyle: 'portrait',
    suggestedModel: 'flux-2-klein',
  },
  {
    id: 'full-body-street-style',
    label: 'Full-body street style',
    hints: 'fashion-forward woman, full-body street style pose, clean sidewalk, overcast daylight',
    category: 'portrait',
    portraitStyle: 'full-body',
  },
  {
    id: 'neon-alley-rain',
    label: 'Neon alley rain',
    hints: 'neon-lit alley at night, rain-slick pavement, steam, moody cyan and magenta signage',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'rooftop-skyline',
    label: 'Rooftop skyline',
    hints: 'city rooftop at blue hour, glass railing, distant skyline bokeh, wind in hair',
    category: 'urban',
    portraitStyle: 'portrait',
  },
  {
    id: 'subway-platform',
    label: 'Subway platform',
    hints: 'underground subway platform, tiled walls, arriving train light streak, cinematic depth',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'forest-morning-mist',
    label: 'Forest mist',
    hints: 'misty old-growth forest, sun rays through tall pines, fern floor, quiet atmosphere',
    category: 'nature',
  },
  {
    id: 'coastal-cliffs',
    label: 'Coastal cliffs',
    hints: 'dramatic coastal cliffs, wild grass, crashing waves, golden hour wind',
    category: 'nature',
    portraitStyle: 'full-body',
  },
  {
    id: 'desert-highway',
    label: 'Desert highway',
    hints: 'empty desert highway vanishing point, heat shimmer, red rock mesas, harsh midday sun',
    category: 'nature',
  },
  {
    id: 'cafe-window-seat',
    label: 'Café window seat',
    hints:
      'woman reading by a café window, latte on the table, rainy street outside, warm interior glow',
    category: 'lifestyle',
    portraitStyle: 'portrait',
  },
  {
    id: 'farmers-market',
    label: 'Farmers market',
    hints: 'bustling farmers market stalls, fresh flowers and produce, candid shopping moment',
    category: 'lifestyle',
    portraitStyle: 'full-body',
  },
  {
    id: 'kitchen-morning',
    label: 'Kitchen morning',
    hints: 'sunlit kitchen, pouring coffee, marble counter, plants on the windowsill, calm routine',
    category: 'lifestyle',
    portraitStyle: 'portrait',
  },
  {
    id: 'runway-spotlight',
    label: 'Runway spotlight',
    hints:
      'model on a minimalist runway, sharp spotlight, structured couture silhouette, confident stride',
    category: 'fashion',
    portraitStyle: 'full-body',
  },
  {
    id: 'mirror-duotone',
    label: 'Mirror dressing room',
    hints:
      'dressing room mirror, trying on a tailored blazer, soft bulb lights, intimate fashion moment',
    category: 'fashion',
    portraitStyle: 'portrait',
  },
  {
    id: 'editorial-red-fabric',
    label: 'Red fabric editorial',
    hints: 'high-fashion editorial, flowing red fabric motion, dramatic studio lighting, bold pose',
    category: 'fashion',
    portraitStyle: 'action',
  },
  {
    id: 'cyberpunk-market',
    label: 'Cyberpunk market',
    hints:
      'crowded cyberpunk night market, holographic ads, wet asphalt, chrome and neon reflections',
    category: 'scifi',
  },
  {
    id: 'space-station-window',
    label: 'Space station',
    hints:
      'space station observation window, curved Earth horizon, sterile interior panels, soft rim light',
    category: 'scifi',
    portraitStyle: 'portrait',
  },
  {
    id: 'solarpunk-garden',
    label: 'Solarpunk garden',
    hints:
      'solarpunk rooftop garden, solar panels integrated with vines, bright optimistic future city',
    category: 'scifi',
  },
  {
    id: 'fireplace-reading',
    label: 'Fireplace reading',
    hints: 'cozy armchair by a fireplace, blanket, open book, warm amber light, hygge mood',
    category: 'cozy',
    portraitStyle: 'portrait',
  },
  {
    id: 'rainy-bookshop',
    label: 'Rainy bookshop',
    hints: 'small bookshop interior, rain on the front window, stacked novels, warm lamp glow',
    category: 'cozy',
  },
  {
    id: 'bakery-morning',
    label: 'Bakery morning',
    hints:
      'artisan bakery at dawn, fresh bread on wooden racks, flour dust in sunbeams, inviting warmth',
    category: 'cozy',
  },
  {
    id: 'rooftop-duo-sunset',
    label: 'Rooftop duo sunset',
    hints:
      'two friends laughing on a rooftop at sunset, city skyline behind them, casual summer outfits',
    category: 'lifestyle',
    portraitStyle: 'portrait',
    duo: true,
  },
  {
    id: 'market-duo',
    label: 'Market stroll duo',
    hints: 'two women browsing a colorful street market together, woven bags, candid conversation',
    category: 'lifestyle',
    portraitStyle: 'full-body',
    duo: true,
  },
  {
    id: 'dance-duo',
    label: 'Dance partners',
    hints:
      'two dance partners mid-spin in a dim studio, motion blur on fabric, spotlight edge light',
    category: 'portrait',
    portraitStyle: 'action',
    duo: true,
  },
  {
    id: 'golden-hour-profile',
    label: 'Golden hour profile',
    hints:
      'profile portrait at golden hour, warm rim light on hair, soft bokeh field behind, relaxed gaze',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'dramatic-bw-portrait',
    label: 'Dramatic B&W',
    hints:
      'high-contrast black and white portrait, single hard key light, deep shadows, intense eye contact',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'vintage-film-portrait',
    label: 'Vintage film look',
    hints:
      '35mm film portrait aesthetic, subtle grain, muted tones, candid half-smile, shallow depth of field',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'over-shoulder-glance',
    label: 'Over-shoulder glance',
    hints:
      'over-the-shoulder glance back at camera, wind-blown hair, soft backlight, intimate framing',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'steam-shower-portrait',
    label: 'Steam & wet hair',
    hints:
      'portrait with wet hair and fine steam in the air, diffused bathroom light, glossy skin highlights',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'outdoor-headshot',
    label: 'Outdoor headshot',
    hints:
      'clean outdoor headshot, open shade under trees, crisp focus on eyes, professional but natural',
    category: 'portrait',
    portraitStyle: 'portrait',
  },
  {
    id: 'parking-garage-concrete',
    label: 'Parking garage',
    hints:
      'multi-level parking garage, concrete pillars, fluorescent strips, lone figure, cinematic symmetry',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'bridge-night-traffic',
    label: 'Bridge at night',
    hints:
      'suspension bridge at night, long exposure traffic trails, cold blue ambient, windy open walkway',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'graffiti-tunnel',
    label: 'Graffiti tunnel',
    hints:
      'colorful graffiti tunnel, layered street art, gritty texture, directional daylight at the far end',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'crosswalk-rush',
    label: 'Crosswalk rush',
    hints:
      'busy city crosswalk, blurred pedestrians, sharp subject mid-stride, glass towers reflecting clouds',
    category: 'urban',
    portraitStyle: 'action',
  },
  {
    id: 'fire-escape-stairs',
    label: 'Fire escape',
    hints:
      'metal fire escape stairs on brick building, late afternoon sun, urban texture, upward angle',
    category: 'urban',
    portraitStyle: 'full-body',
  },
  {
    id: 'lantern-lit-alley',
    label: 'Lantern alley',
    hints: 'narrow old-town alley, paper lanterns overhead, stone cobbles, warm evening atmosphere',
    category: 'urban',
    portraitStyle: 'portrait',
  },
  {
    id: 'alpine-lake-mirror',
    label: 'Alpine lake',
    hints:
      'mirror-still alpine lake, snow peaks reflected, clear cold air, rocky shoreline foreground',
    category: 'nature',
    portraitStyle: 'full-body',
  },
  {
    id: 'waterfall-canyon',
    label: 'Waterfall canyon',
    hints: 'tall waterfall in a mossy canyon, mist rainbow, wet black rocks, lush ferns',
    category: 'nature',
  },
  {
    id: 'lavender-field',
    label: 'Lavender field',
    hints: 'endless lavender rows in bloom, purple haze, distant farmhouse, soft summer haze',
    category: 'nature',
    portraitStyle: 'full-body',
  },
  {
    id: 'snowy-pine-forest',
    label: 'Snowy pines',
    hints: 'snow-covered pine forest, falling flakes, muffled silence, breath visible in cold air',
    category: 'nature',
    portraitStyle: 'full-body',
  },
  {
    id: 'prairie-thunderhead',
    label: 'Prairie storm',
    hints:
      'wide prairie grassland, massive thunderhead on horizon, wind-bent stalks, dramatic storm light',
    category: 'nature',
  },
  {
    id: 'tide-pools-sunset',
    label: 'Tide pools sunset',
    hints: 'rocky tide pools at sunset, orange sky reflection, sea anemones and wet stone texture',
    category: 'nature',
    portraitStyle: 'portrait',
  },
  {
    id: 'autumn-maple-path',
    label: 'Autumn maple path',
    hints: 'tree-lined path covered in red maple leaves, dappled gold light, crisp fall atmosphere',
    category: 'nature',
    portraitStyle: 'full-body',
  },
  {
    id: 'yoga-sunrise-deck',
    label: 'Yoga sunrise',
    hints:
      'woman in yoga pose on a wooden deck at sunrise, soft mist over hills, calm focused expression',
    category: 'lifestyle',
    portraitStyle: 'full-body',
  },
  {
    id: 'record-store-browse',
    label: 'Record store',
    hints:
      'browsing vinyl records in a cramped record shop, colorful album spines, warm tungsten bulbs',
    category: 'lifestyle',
    portraitStyle: 'portrait',
  },
  {
    id: 'park-picnic',
    label: 'Park picnic',
    hints:
      'picnic blanket in a city park, wicker basket, wine glasses, dappled shade under oak trees',
    category: 'lifestyle',
    portraitStyle: 'full-body',
  },
  {
    id: 'bike-commute-morning',
    label: 'Bike commute',
    hints: 'city bike commute at morning rush, messenger bag, helmet, bike lane, soft side light',
    category: 'lifestyle',
    portraitStyle: 'action',
  },
  {
    id: 'easel-painting',
    label: 'Painting at easel',
    hints:
      'artist at easel in a sunlit studio, paint-stained smock, brush mid-stroke, scattered tubes and rags',
    category: 'lifestyle',
    portraitStyle: 'portrait',
  },
  {
    id: 'poolside-lounge',
    label: 'Poolside lounge',
    hints:
      'mid-century poolside lounge chair, turquoise water, palm shadows, retro summer vacation mood',
    category: 'lifestyle',
    portraitStyle: 'full-body',
  },
  {
    id: 'leather-jacket-night',
    label: 'Leather jacket night',
    hints:
      'black leather jacket under sodium streetlight, moody night portrait, urban grit, confident stance',
    category: 'fashion',
    portraitStyle: 'portrait',
  },
  {
    id: 'sheer-fabric-wind',
    label: 'Sheer fabric wind',
    hints:
      'flowing sheer fabric caught in wind, backlit silhouette layers, elegant motion, studio haze',
    category: 'fashion',
    portraitStyle: 'action',
  },
  {
    id: 'vintage-thrift-mirror',
    label: 'Vintage thrift',
    hints:
      'vintage thrift store mirror selfie moment, eclectic racks, retro sunglasses, playful pose',
    category: 'fashion',
    portraitStyle: 'portrait',
  },
  {
    id: 'monochrome-power-suit',
    label: 'Power suit',
    hints: 'sharp monochrome tailored suit, minimalist gray backdrop, power stance, glossy heels',
    category: 'fashion',
    portraitStyle: 'full-body',
  },
  {
    id: 'avant-garde-headpiece',
    label: 'Avant-garde headpiece',
    hints:
      'sculptural avant-garde headpiece, geometric makeup, stark white cyclorama, editorial pose',
    category: 'fashion',
    portraitStyle: 'portrait',
  },
  {
    id: 'denim-jacket-golden-hour',
    label: 'Denim golden hour',
    hints:
      'classic denim jacket in golden hour field, relaxed candid laugh, warm lens flare, natural hair',
    category: 'fashion',
    portraitStyle: 'portrait',
  },
  {
    id: 'mech-hangar',
    label: 'Mech hangar',
    hints:
      'vast mech hangar bay, towering robotic frame, orange maintenance lights, industrial scale',
    category: 'scifi',
    portraitStyle: 'full-body',
  },
  {
    id: 'android-portrait',
    label: 'Android portrait',
    hints:
      'humanoid android portrait, subtle synthetic skin seams, soft LED accent lines, sterile lab backdrop',
    category: 'scifi',
    portraitStyle: 'portrait',
  },
  {
    id: 'underwater-dome-city',
    label: 'Underwater dome city',
    hints:
      'futuristic underwater dome city, curved glass walls, bioluminescent reef outside, teal ambient glow',
    category: 'scifi',
  },
  {
    id: 'overgrown-ruins-future',
    label: 'Overgrown ruins',
    hints:
      'post-collapse city ruins reclaimed by vines, cracked concrete, distant monorail skeleton, quiet decay',
    category: 'scifi',
    portraitStyle: 'full-body',
  },
  {
    id: 'hologram-neon-portrait',
    label: 'Hologram portrait',
    hints:
      'portrait lit by floating holographic UI panels, cyan data glyphs, dark room, tech-noir mood',
    category: 'scifi',
    portraitStyle: 'portrait',
  },
  {
    id: 'cabin-blizzard',
    label: 'Cabin blizzard',
    hints:
      'log cabin interior during a blizzard, frost on window panes, wool blanket, flickering stove light',
    category: 'cozy',
    portraitStyle: 'portrait',
  },
  {
    id: 'tea-corner-window',
    label: 'Tea by the window',
    hints:
      'steaming teacup on a windowsill tray, rain streaks on glass, soft knit sweater, quiet afternoon',
    category: 'cozy',
    portraitStyle: 'portrait',
  },
  {
    id: 'string-lights-bedroom',
    label: 'String lights bedroom',
    hints:
      'bedroom with warm string lights, rumpled linen, open journal on bed, intimate evening calm',
    category: 'cozy',
  },
  {
    id: 'library-reading-nook',
    label: 'Library nook',
    hints:
      'wood-paneled library reading nook, leather armchair, green banker lamp, tall shelves of books',
    category: 'cozy',
    portraitStyle: 'portrait',
  },
  {
    id: 'coffee-date-duo',
    label: 'Coffee date duo',
    hints:
      'two people sharing coffee at a small table, latte art, candid laughter, warm café interior',
    category: 'lifestyle',
    portraitStyle: 'portrait',
    duo: true,
  },
  {
    id: 'hiking-trail-duo',
    label: 'Hiking trail duo',
    hints:
      'two hikers on a mountain trail, backpacks, trekking poles, alpine vista ahead, morning light',
    category: 'nature',
    portraitStyle: 'action',
    duo: true,
  },
  {
    id: 'crosswalk-duo-night',
    label: 'Crosswalk duo night',
    hints:
      'two friends crossing a wet city street at night, neon reflections, umbrellas, cinematic wide shot',
    category: 'urban',
    portraitStyle: 'full-body',
    duo: true,
  },
  {
    id: 'editorial-duo-monochrome',
    label: 'Editorial duo',
    hints:
      'two models in coordinated monochrome outfits, minimalist studio, synchronized poses, fashion editorial',
    category: 'fashion',
    portraitStyle: 'full-body',
    duo: true,
  },
  {
    id: 'kitchen-cooking-duo',
    label: 'Cooking together',
    hints:
      'two people cooking together in a bright kitchen, chopping vegetables, shared cutting board, playful teamwork',
    category: 'lifestyle',
    portraitStyle: 'action',
    duo: true,
  },
];

/** Drop duplicate labels; prefer curated presets over generated ones. */
export function dedupeSceneStarterPresets(
  presets: readonly SceneStarterPreset[]
): SceneStarterPreset[] {
  const byLabel = new Map<string, SceneStarterPreset>();
  for (const preset of presets) {
    const key = preset.label.trim().toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, preset);
      continue;
    }
    if (existing.id.startsWith('gen-') && !preset.id.startsWith('gen-')) {
      byLabel.set(key, preset);
    }
  }
  return [...byLabel.values()];
}

export const SCENE_STARTER_PRESETS: readonly SceneStarterPreset[] = dedupeSceneStarterPresets([
  ...SPORT_PRESETS.map(fromSportPreset).map(withSceneStarterTags),
  ...NON_SPORT_SCENE_STARTERS.map(withSceneStarterTags),
  ...buildGeneratedSceneStarters().map(withSceneStarterTags),
]);

export function getSceneStarterPreset(id: string): SceneStarterPreset | undefined {
  return SCENE_STARTER_PRESETS.find(preset => preset.id === id);
}

export function sceneStartersForCategory(
  category: SceneStarterCategory | 'all',
  mode: 'solo' | 'duo' | 'all' = 'all'
): SceneStarterPreset[] {
  return filterSceneStarters(
    SCENE_STARTER_PRESETS,
    { category, framing: 'all', query: '', tags: [] },
    mode
  );
}

export function getAllSceneStarterPresets(
  userPresets: readonly SceneStarterPreset[] = []
): SceneStarterPreset[] {
  return [...userPresets, ...SCENE_STARTER_PRESETS];
}
