/**
 * A Cast's mood board: reference pictures pinned from their Gallery — the light, the places, the
 * colours their films aim for — each with an optional note, shown beside Day, Scene and Story while
 * planning. Kept on the Cast record as Gallery links (nothing uploaded, nothing copied). Reference
 * only: it does not change a render. Pure.
 */

export type MoodBoardPin = { id: string; url: string; note?: string };

export const MOOD_BOARD_MAX = 24;
const NOTE_MAX = 120;

/** Pins from untrusted input: each with a url, one per url, at most MOOD_BOARD_MAX. */
export function normalizeMoodBoard(value: unknown): MoodBoardPin[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: MoodBoardPin[] = [];
  for (const raw of value) {
    const pin = raw as Partial<MoodBoardPin> | null;
    const url = typeof pin?.url === 'string' ? pin.url.trim() : '';
    const id = typeof pin?.id === 'string' ? pin.id.trim().slice(0, 80) : '';
    // Gallery and app links only (a data: picture would bloat the Cast record).
    if (!url || !id || seen.has(url) || /^data:/i.test(url) || url.length > 2000) continue;
    seen.add(url);
    const note =
      typeof pin?.note === 'string' ? pin.note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '';
    out.push({ id, url, ...(note ? { note } : {}) });
  }
  return out.slice(0, MOOD_BOARD_MAX);
}

/** Pin a picture (already pinned: as it was; full: the oldest goes). */
export function pinToMoodBoard(board: unknown, pin: MoodBoardPin): MoodBoardPin[] {
  const list = normalizeMoodBoard(board);
  if (list.some(entry => entry.url === pin.url.trim())) return list;
  return normalizeMoodBoard([...list, pin].slice(-MOOD_BOARD_MAX));
}

export function unpinFromMoodBoard(board: unknown, id: string): MoodBoardPin[] {
  return normalizeMoodBoard(board).filter(entry => entry.id !== id);
}

export function noteMoodBoardPin(board: unknown, id: string, note: string): MoodBoardPin[] {
  return normalizeMoodBoard(
    normalizeMoodBoard(board).map(entry => (entry.id === id ? { ...entry, note } : entry))
  );
}
