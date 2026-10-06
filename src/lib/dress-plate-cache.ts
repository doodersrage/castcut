/**
 * Dressed-plate cache entries and list helpers. Kept free of prompt / planner imports: the
 * shared store (dress-plate-store.ts) is in the app shell's sync path.
 */

export type DayDressPlateEntry = {
  /** What it was made from (dayDressPlateKey). */
  key: string;
  /** ComfyUI input filename of the dressed plate. */
  filename: string;
  imageUrl?: string;
  at: number;
  /**
   * The shoe check rules (FOOTWEAR_CHECK_VERSION) that last looked at this plate, the feet pass
   * fixing it when it could. A plate with shoes picked and an older mark (or none) is checked once
   * when next used. Stored as `true` before versions: that is 1.
   */
  shoesChecked?: number;
};

/** Shared by Day, Story and Outfit; outfit arcs use two kits a day — keep a dozen. */
export const DAY_DRESS_PLATE_CACHE_LIMIT = 12;

export function findDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  key: string
): DayDressPlateEntry | null {
  return cache?.find(entry => entry.key === key && entry.filename?.trim()) ?? null;
}

/** Newest first, one entry per key, capped. */
export function rememberDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  entry: DayDressPlateEntry
): DayDressPlateEntry[] {
  return [entry, ...(cache ?? []).filter(item => item.key !== entry.key)].slice(
    0,
    DAY_DRESS_PLATE_CACHE_LIMIT
  );
}

/** Drop one key (its file is gone from ComfyUI's input folder). */
export function forgetDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  key: string
): DayDressPlateEntry[] {
  return (cache ?? []).filter(item => item.key !== key);
}
