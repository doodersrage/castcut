/**
 * Persisted settings that no code reads any more, and the clean-up that drops them.
 *
 * Every entry here was checked against the code: nothing reads it, nothing builds its name at
 * runtime. Only these exact names are dropped — an unknown key is always kept (a newer build on
 * another device may have written it), so the clean-up can never remove something still in use.
 *
 * Where it runs (this module is pure; the callers write):
 * - Tool settings: loadSettingsCache drops the fields (migrateLegacyToolSettings) and saves the
 *   cleaned copy once, like the legacy duo / compose merge, and saveSettingsCache never stores
 *   them (a fresh profile saves the pulled server copy as is). Only after hydrate; the server copy
 *   follows with the next push, which stays gated on the startup pull (auto-storage-sync), and
 *   the push reads the cache at flush time — never a pre-pull snapshot.
 * - Fold states: read (collapsible-persist), pull-apply and push (studio-extras) skip them, and
 *   once storage is ready the stored map is cleaned as a background write (no push, not an edit,
 *   so it can never win over a server pull).
 * A copy coming back from an older device or the server is cleaned the same way.
 */

/**
 * Remembered open / closed state (`comfy-collapsible-open-v1`) of sections that no longer exist:
 * the Day / phone Day collapsibles folded into the board, sheets and drawer by the Day redesign,
 * Story / Outfit / Moodboard sections that became sheets or chips, and older removed panels.
 */
export const DEAD_COLLAPSIBLE_IDS: ReadonlySet<string> = new Set([
  'day-advanced',
  'day-after-cut',
  'day-animate',
  'day-character-lean',
  'day-clothing',
  'day-engine-lean',
  'day-kit-filters',
  'day-notes',
  'day-setting-presets',
  'day-setup-lean',
  'day-slots-lean',
  'day-wardrobe-list-picker',
  'mobile-day-advanced',
  'mobile-day-after-cut',
  'mobile-day-animate',
  'mobile-day-character-lean',
  'mobile-day-clothing',
  'mobile-day-kit-filters',
  'mobile-day-setting-presets',
  'mobile-day-setup-lean',
  'mobile-day-slots-lean',
  'mobile-day-wardrobe-list-picker',
  'fitting-compare',
  'fitting-engine-lean',
  'moodboard-engine-lean',
  'generate-browse-presets',
  'generate-negative-mode',
  'roleplay-library',
  'roleplay-wardrobe',
  'shared-advanced-simple',
  'story-kit-filters',
]);

/**
 * Tool settings fields nothing reads any more, per tool:
 * - day.dressPlates — dress plates moved to their own synced store (dress-plate-store); the old
 *   per-Day list was never read again (a plate is re-made with "Dress her again").
 * - studio.compareVisualSeed / studio.catalogTab — Studio's removed visual-compare seed and
 *   catalog tab.
 */
export const DEAD_TOOL_SETTINGS_FIELDS: Readonly<Record<string, readonly string[]>> = {
  day: ['dressPlates'],
  studio: ['compareVisualSeed', 'catalogTab'],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The map without dead section ids. Returns the same object when there is nothing to drop. */
export function pruneDeadCollapsibleIds<T>(map: Record<string, T>): {
  map: Record<string, T>;
  dropped: string[];
} {
  const dropped = Object.keys(map).filter(id => DEAD_COLLAPSIBLE_IDS.has(id.trim()));
  if (dropped.length === 0) {
    return { map, dropped };
  }
  const next: Record<string, T> = {};
  for (const [id, value] of Object.entries(map)) {
    if (!DEAD_COLLAPSIBLE_IDS.has(id.trim())) {
      next[id] = value;
    }
  }
  return { map: next, dropped };
}

/**
 * Tool settings without dead fields. Every other tool and field is kept as it is (same object
 * references); returns the input itself when there is nothing to drop.
 */
export function dropDeadToolSettingsFields<T extends object>(
  tools: T
): { tools: T; dropped: string[] } {
  if (!isPlainObject(tools)) {
    return { tools, dropped: [] };
  }
  const dropped: string[] = [];
  let next: Record<string, unknown> | null = null;
  for (const [tool, fields] of Object.entries(DEAD_TOOL_SETTINGS_FIELDS)) {
    const cache = tools[tool];
    if (!isPlainObject(cache)) continue;
    const present = fields.filter(field => Object.prototype.hasOwnProperty.call(cache, field));
    if (present.length === 0) continue;
    const kept: Record<string, unknown> = { ...cache };
    for (const field of present) {
      delete kept[field];
      dropped.push(`${tool}.${field}`);
    }
    next ??= { ...tools };
    next[tool] = kept;
  }
  return { tools: (next ?? tools) as T, dropped };
}
