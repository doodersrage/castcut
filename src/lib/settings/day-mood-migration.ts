/**
 * Day's Raunchy mood became Intimate's Playful toggle (day/mood-flavor.ts). This is the stored
 * side of that move, kept out of the Day modules so the settings loader (classic core) can migrate
 * saved Days without reaching Play.
 */

/** The stored Day fields the migration looks at. */
type StoredDayMoodFields = { dayMood?: string | null; intimatePlayful?: boolean | null };

/**
 * Day fields (stored settings, or a settings patch) in stored form: `dayMood: 'raunchy'` — a Day
 * saved before the merge, or the planner's flavor id written back — becomes Intimate with Playful
 * on. Any other mood leaves Playful as it was, so picking Intimate again remembers it. Returns the
 * same object when there is nothing to change.
 */
export function migrateDayMoodFields<T extends StoredDayMoodFields>(fields: T): T {
  if (typeof fields.dayMood !== 'string' || fields.dayMood.trim().toLowerCase() !== 'raunchy') {
    return fields;
  }
  return { ...fields, dayMood: 'intimate', intimatePlayful: true };
}

/**
 * The stored Day tool (tools.day) migrated: the live Day and the Days parked under other Casts.
 * Loosely typed — the Day tool's settings type lives in Play. Same object when nothing changed.
 */
export function migrateStoredDayMood(day: unknown): unknown {
  if (!day || typeof day !== 'object') return day;
  let next = migrateDayMoodFields(day as StoredDayMoodFields);
  const parked = (day as { parkedDays?: unknown }).parkedDays;
  if (parked && typeof parked === 'object') {
    let parkedChanged = false;
    const migrated = Object.fromEntries(
      Object.entries(parked as Record<string, unknown>).map(([castId, entry]) => {
        const moved =
          entry && typeof entry === 'object'
            ? migrateDayMoodFields(entry as StoredDayMoodFields)
            : entry;
        if (moved !== entry) parkedChanged = true;
        return [castId, moved];
      })
    );
    if (parkedChanged) next = { ...next, parkedDays: migrated } as StoredDayMoodFields;
  }
  return next;
}
