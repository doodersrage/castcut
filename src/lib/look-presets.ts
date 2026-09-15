/**
 * One-tap look presets for Moodboard — skip blank-tile friction.
 */

import type { LookPack } from './look-pack';
import type { MoodboardTile } from './moodboard-scene';
import { newMoodboardTileId } from './moodboard-scene';

export type LookPresetId =
  | 'cozy'
  | 'noir'
  | 'golden'
  | 'street'
  | 'coastal'
  | 'editorial'
  | 'forest'
  | 'club'
  | 'winter'
  | 'desert'
  | 'loft'
  | 'retro';

export type LookPreset = {
  id: LookPresetId;
  label: string;
  hint: string;
  pack: Omit<LookPack, 'characterId' | 'savedAt' | 'version' | 'source'>;
  tiles: Array<Pick<MoodboardTile, 'role' | 'label' | 'notes'>>;
};

export const LOOK_PRESETS: LookPreset[] = [
  {
    id: 'cozy',
    label: 'Cozy',
    hint: 'Warm interiors, soft daylight',
    pack: {
      moodNotes: 'cozy, intimate, lived-in calm',
      lightingNotes: 'soft window light, warm practicals',
      locationNotes: 'apartment kitchen, reading nook, rainy café',
      styleNotes: 'documentary stills, shallow depth, gentle contrast',
      paletteNotes: 'cream, terracotta, soft wood',
      vibePrompt: 'a quiet cozy day at home',
      instruction: 'natural candid framing, subject clear, warm atmosphere',
    },
    tiles: [
      { role: 'mood', label: 'Cozy', notes: 'intimate, calm, lived-in' },
      { role: 'lighting', label: 'Window light', notes: 'soft morning sun through curtains' },
      { role: 'location', label: 'Home', notes: 'kitchen nook and reading chair' },
      { role: 'palette', label: 'Warm neutrals', notes: 'cream, terracotta, wood' },
    ],
  },
  {
    id: 'noir',
    label: 'Noir',
    hint: 'High contrast, night streets',
    pack: {
      moodNotes: 'noir, tense, cinematic shadow',
      lightingNotes: 'hard rim light, neon spill, deep blacks',
      locationNotes: 'rain-slick alley, subway platform, late bar',
      styleNotes: 'widescreen stills, grain, dramatic contrast',
      paletteNotes: 'ink black, steel blue, neon magenta',
      vibePrompt: 'a noir night walking the city',
      instruction: 'cinematic framing, silhouettes, wet reflections',
    },
    tiles: [
      { role: 'mood', label: 'Noir', notes: 'tense, shadowy, mysterious' },
      { role: 'lighting', label: 'Neon rim', notes: 'hard contrast, colored spill' },
      { role: 'location', label: 'Night city', notes: 'wet streets, subway, late bar' },
      { role: 'style', label: 'Film grain', notes: 'widescreen, dramatic blacks' },
    ],
  },
  {
    id: 'golden',
    label: 'Golden hour',
    hint: 'Sunset glow, outdoor',
    pack: {
      moodNotes: 'hopeful, romantic, open air',
      lightingNotes: 'golden-hour backlight, long shadows',
      locationNotes: 'rooftop, park path, riverside',
      styleNotes: 'candid lifestyle, soft flare, filmic color',
      paletteNotes: 'amber, peach, soft sky blue',
      vibePrompt: 'golden hour wandering outdoors',
      instruction: 'subject backlit, warm skin, readable environment',
    },
    tiles: [
      { role: 'mood', label: 'Golden', notes: 'hopeful, open, romantic' },
      { role: 'lighting', label: 'Sunset', notes: 'warm backlight, long shadows' },
      { role: 'location', label: 'Outdoors', notes: 'rooftop, park, riverside' },
      { role: 'palette', label: 'Amber sky', notes: 'peach, amber, soft blue' },
    ],
  },
  {
    id: 'street',
    label: 'Street',
    hint: 'Candid day-in-the-city',
    pack: {
      moodNotes: 'documentary, energetic, everyday',
      lightingNotes: 'overcast daylight, storefront spill',
      locationNotes: 'crosswalk, café terrace, market',
      styleNotes: 'street photography, decisive moment',
      paletteNotes: 'denim, concrete, muted primaries',
      vibePrompt: 'a candid day walking the neighborhood',
      instruction: 'natural street framing, motion implied, clear subject',
    },
    tiles: [
      { role: 'mood', label: 'Street', notes: 'candid, energetic, everyday' },
      { role: 'lighting', label: 'Daylight', notes: 'overcast, storefront spill' },
      { role: 'location', label: 'Neighborhood', notes: 'crosswalk, café, market' },
      { role: 'style', label: 'Decisive moment', notes: 'street photo energy' },
    ],
  },
  {
    id: 'coastal',
    label: 'Coastal',
    hint: 'Salt air, bright haze',
    pack: {
      moodNotes: 'breezy, open, sun-washed calm',
      lightingNotes: 'bright overcast coastal light, soft speculars',
      locationNotes: 'boardwalk, dune path, harbor pier',
      styleNotes: 'lifestyle stills, airy depth, clean horizon',
      paletteNotes: 'seafoam, sand, bleached white, sky blue',
      vibePrompt: 'a coastal afternoon by the water',
      instruction: 'open framing, wind in hair, readable shoreline',
    },
    tiles: [
      { role: 'mood', label: 'Coastal', notes: 'breezy, open, sun-washed' },
      { role: 'lighting', label: 'Sea light', notes: 'bright haze, soft speculars' },
      { role: 'location', label: 'Shore', notes: 'boardwalk, dunes, pier' },
      { role: 'palette', label: 'Seafoam', notes: 'sand, white, sky blue' },
    ],
  },
  {
    id: 'editorial',
    label: 'Editorial',
    hint: 'Fashion studio polish',
    pack: {
      moodNotes: 'editorial, poised, high-fashion calm',
      lightingNotes: 'beauty key light, soft fill, crisp catchlights',
      locationNotes: 'seamless studio, loft cyclorama, clean backdrop',
      styleNotes: 'magazine stills, precise pose, shallow depth',
      paletteNotes: 'ivory, charcoal, muted jewel accents',
      vibePrompt: 'an editorial portrait session in studio',
      instruction: 'clean silhouette, fashion framing, polished skin light',
    },
    tiles: [
      { role: 'mood', label: 'Editorial', notes: 'poised, polished, fashion' },
      { role: 'lighting', label: 'Beauty key', notes: 'soft fill, crisp catchlights' },
      { role: 'location', label: 'Studio', notes: 'seamless, cyclorama, loft' },
      { role: 'style', label: 'Magazine', notes: 'precise pose, shallow depth' },
    ],
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'Moss green, soft canopy',
    pack: {
      moodNotes: 'quiet, grounded, nature immersion',
      lightingNotes: 'dappled canopy light, soft green bounce',
      locationNotes: 'woodland path, creek bridge, fern clearing',
      styleNotes: 'nature documentary stills, organic texture',
      paletteNotes: 'moss, pine, bark brown, mist gray',
      vibePrompt: 'a quiet walk under the forest canopy',
      instruction: 'subject among trees, soft greens, readable depth',
    },
    tiles: [
      { role: 'mood', label: 'Forest', notes: 'quiet, grounded, immersive' },
      { role: 'lighting', label: 'Canopy', notes: 'dappled light, green bounce' },
      { role: 'location', label: 'Woods', notes: 'path, creek, fern clearing' },
      { role: 'palette', label: 'Moss', notes: 'pine, bark, mist gray' },
    ],
  },
  {
    id: 'club',
    label: 'Club night',
    hint: 'Color gels, dance floor',
    pack: {
      moodNotes: 'electric, playful, late-night energy',
      lightingNotes: 'color gels, strobe accents, haze beams',
      locationNotes: 'dance floor, DJ booth edge, neon hallway',
      styleNotes: 'nightlife stills, motion blur accents, vivid contrast',
      paletteNotes: 'violet, cyan, hot pink, deep black',
      vibePrompt: 'a charged night out on the dance floor',
      instruction: 'subject lit by gels, lively motion, clear face when possible',
    },
    tiles: [
      { role: 'mood', label: 'Club', notes: 'electric, playful, late-night' },
      { role: 'lighting', label: 'Gels', notes: 'strobe accents, haze beams' },
      { role: 'location', label: 'Venue', notes: 'dance floor, DJ booth, neon hall' },
      { role: 'palette', label: 'Neon', notes: 'violet, cyan, hot pink' },
    ],
  },
  {
    id: 'winter',
    label: 'Winter',
    hint: 'Cold air, soft snow light',
    pack: {
      moodNotes: 'crisp, quiet, winter solitude',
      lightingNotes: 'overcast snow light, cool fill, pale highlights',
      locationNotes: 'snowy street, park bench, frosted window café',
      styleNotes: 'quiet documentary, breath-in-air detail, soft grain',
      paletteNotes: 'ice blue, wool gray, crimson scarf accent',
      vibePrompt: 'a quiet winter day in the cold air',
      instruction: 'cool atmosphere, visible breath optional, clear subject',
    },
    tiles: [
      { role: 'mood', label: 'Winter', notes: 'crisp, quiet, solitary' },
      { role: 'lighting', label: 'Snow light', notes: 'overcast cool fill' },
      { role: 'location', label: 'Cold city', notes: 'snowy street, park, café window' },
      { role: 'palette', label: 'Ice', notes: 'blue, wool gray, crimson accent' },
    ],
  },
  {
    id: 'desert',
    label: 'Desert',
    hint: 'Sun-bleached, wide sky',
    pack: {
      moodNotes: 'vast, sun-struck, dry heat calm',
      lightingNotes: 'hard noon sun, long hard shadows, heat shimmer',
      locationNotes: 'dust road, canyon overlook, adobe courtyard',
      styleNotes: 'wide stills, bleached highlights, graphic silhouette',
      paletteNotes: 'sand, terracotta, bleached denim, cobalt sky',
      vibePrompt: 'a sun-bleached afternoon in open desert light',
      instruction: 'wide framing, hard sun, readable horizon and subject',
    },
    tiles: [
      { role: 'mood', label: 'Desert', notes: 'vast, sun-struck, dry heat' },
      { role: 'lighting', label: 'Hard sun', notes: 'noon light, heat shimmer' },
      { role: 'location', label: 'Arid', notes: 'dust road, canyon, adobe' },
      { role: 'palette', label: 'Sand', notes: 'terracotta, denim, cobalt sky' },
    ],
  },
  {
    id: 'loft',
    label: 'Loft',
    hint: 'Industrial windows, concrete',
    pack: {
      moodNotes: 'urban loft, creative, understated cool',
      lightingNotes: 'tall north window light, soft falloff on concrete',
      locationNotes: 'converted loft, brick wall, steel staircase',
      styleNotes: 'architectural lifestyle stills, clean lines',
      paletteNotes: 'concrete gray, raw wood, black steel, white linen',
      vibePrompt: 'a calm afternoon in an industrial loft',
      instruction: 'architecture readable, soft window key, clear subject',
    },
    tiles: [
      { role: 'mood', label: 'Loft', notes: 'urban, creative, understated' },
      { role: 'lighting', label: 'North window', notes: 'soft falloff on concrete' },
      { role: 'location', label: 'Industrial', notes: 'brick, steel stair, loft' },
      { role: 'palette', label: 'Concrete', notes: 'wood, steel, linen white' },
    ],
  },
  {
    id: 'retro',
    label: 'Retro film',
    hint: '70s color, light leak',
    pack: {
      moodNotes: 'nostalgic, playful, analog warmth',
      lightingNotes: 'warm practicals, mild light leak, soft flash fill',
      locationNotes: 'diner booth, vintage car, sunroom party',
      styleNotes: '35mm stills, light grain, slight fade',
      paletteNotes: 'mustard, avocado, faded rose, cream',
      vibePrompt: 'a nostalgic day shot on warm analog film',
      instruction: 'period color, soft grain, candid film framing',
    },
    tiles: [
      { role: 'mood', label: 'Retro', notes: 'nostalgic, playful, analog' },
      { role: 'lighting', label: 'Warm practicals', notes: 'light leak, soft flash' },
      { role: 'location', label: 'Period set', notes: 'diner, vintage car, sunroom' },
      { role: 'palette', label: '70s', notes: 'mustard, avocado, faded rose' },
    ],
  },
];

export function lookPresetById(id: string | null | undefined): LookPreset | null {
  return LOOK_PRESETS.find(entry => entry.id === id) ?? null;
}

export function tilesFromLookPreset(preset: LookPreset): MoodboardTile[] {
  return preset.tiles.map(tile => ({
    id: newMoodboardTileId(),
    role: tile.role,
    label: tile.label,
    notes: tile.notes,
  }));
}

export function lookPackFromPreset(preset: LookPreset, characterId?: string): LookPack {
  return {
    version: 1,
    source: 'moodboard',
    characterId: characterId?.trim() || undefined,
    ...preset.pack,
    savedAt: Date.now(),
  };
}
