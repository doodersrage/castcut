/**
 * Look tile role suggestion (pure). A dropped reference image defaults to "Other", which tells
 * Extract look nothing about what to take from it. A vision model names the one thing the
 * image mostly contributes — its lighting, its place, its style or its colours.
 */

import type { MoodboardTileRole } from '@/lib/moodboard-scene';

/** Roles the model may pick (Other is the fallback, never a suggestion). */
export const SUGGESTABLE_TILE_ROLES = ['mood', 'lighting', 'location', 'style', 'palette'] as const;

export function buildTileRolePrompt(): { system: string; user: string } {
  return {
    system: `You sort reference images for a film look board. Answer with exactly one word from this list and nothing else:
mood — an overall feeling or atmosphere
lighting — how the light falls: time of day, neon, candle, harsh flash, soft window light
location — a place or setting the scene should happen in
style — a visual or fashion style, film stock, era, or art direction
palette — mainly a set of colours`,
    user: 'Which one word best describes what this reference contributes?',
  };
}

/** Pull the role word out of a reply; null when the model didn't name one of the roles. */
export function parseTileRoleReply(text: string): MoodboardTileRole | null {
  const lowered = text.toLowerCase();
  let best: { role: MoodboardTileRole; index: number } | null = null;
  for (const role of SUGGESTABLE_TILE_ROLES) {
    const index = lowered.search(new RegExp(`\\b${role}\\b`));
    if (index >= 0 && (!best || index < best.index)) {
      best = { role, index };
    }
  }
  return best?.role ?? null;
}
