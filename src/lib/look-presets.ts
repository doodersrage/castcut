/**
 * One-tap look presets for Moodboard — skip blank-tile friction.
 */

import type { LookPack } from './look-pack';
import type { MoodboardTile } from './moodboard-scene';
import { newMoodboardTileId } from './moodboard-scene';

export type LookPresetId = 'cozy' | 'noir' | 'golden' | 'street';

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
