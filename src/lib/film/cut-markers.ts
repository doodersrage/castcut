/**
 * Your own marks on the Cut's timeline (2026-11-05): M at the playhead, as an editor's markers —
 * "fix this", "music hits here" — kept with the cut (its options, so Undo and a reload keep them).
 * Shown beside the review comments (review-notes.ts) in the Notes tab.
 */

export type CutMarker = {
  id: string;
  timeSec: number;
  note: string;
  /** A chapter: written into the film as a chapter mark, its note the title (film-finish.ts). */
  chapter?: boolean;
};

export const CUT_MARKERS_MAX = 100;
const NOTE_MAX = 200;

export function normalizeCutMarkers(value: unknown): CutMarker[] {
  if (!Array.isArray(value)) return [];
  const out: CutMarker[] = [];
  for (const raw of value) {
    const item = raw as Partial<CutMarker> | null;
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
    if (typeof item.timeSec !== 'number' || !Number.isFinite(item.timeSec) || item.timeSec < 0)
      continue;
    out.push({
      id: item.id.trim().slice(0, 40),
      timeSec: Math.round(item.timeSec * 100) / 100,
      note: typeof item.note === 'string' ? item.note.slice(0, NOTE_MAX) : '',
      ...(item.chapter === true ? { chapter: true } : {}),
    });
  }
  return out.sort((a, b) => a.timeSec - b.timeSec).slice(0, CUT_MARKERS_MAX);
}

/** A marker at `timeSec` — none added when one is already within a quarter second. */
export function addCutMarker(markers: unknown, timeSec: number, id: string): CutMarker[] {
  const list = normalizeCutMarkers(markers);
  if (list.some(marker => Math.abs(marker.timeSec - timeSec) < 0.25)) return list;
  return normalizeCutMarkers([...list, { id, timeSec, note: '' }]);
}

export function editCutMarker(markers: unknown, id: string, note: string): CutMarker[] {
  return normalizeCutMarkers(
    normalizeCutMarkers(markers).map(marker => (marker.id === id ? { ...marker, note } : marker))
  );
}

/** Make a marker a chapter, or not. */
export function setCutMarkerChapter(markers: unknown, id: string, chapter: boolean): CutMarker[] {
  return normalizeCutMarkers(
    normalizeCutMarkers(markers).map(marker =>
      marker.id === id ? { ...marker, chapter: chapter || undefined } : marker
    )
  );
}

/** The chapter markers as the film's chapters (monitor seconds): a marker without a note is "Chapter n". */
export function cutMarkerChapters(markers: unknown): Array<{ atSec: number; title: string }> {
  return normalizeCutMarkers(markers)
    .filter(marker => marker.chapter)
    .map((marker, index) => ({
      atSec: marker.timeSec,
      title: marker.note.trim() || `Chapter ${index + 1}`,
    }));
}

export function removeCutMarker(markers: unknown, id: string): CutMarker[] {
  return normalizeCutMarkers(markers).filter(marker => marker.id !== id);
}

/** The target nearest `wanted` within `tolerance` seconds (an edge snapping), else null. */
export function nearestSnap(
  wanted: number,
  targets: readonly number[],
  tolerance: number
): number | null {
  let best: number | null = null;
  for (const t of targets) {
    if (Math.abs(t - wanted) > tolerance) continue;
    if (best == null || Math.abs(t - wanted) < Math.abs(best - wanted)) best = t;
  }
  return best;
}
