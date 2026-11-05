/**
 * What the Film page shows of a Cast's film (2026-11-05): its films newest first, its latest
 * stills, and how much there is. Pure — the page reads the Gallery (usePlayFilmHome).
 */

export type FilmHomeEntry = {
  id: string;
  status?: string;
  derivedKind?: string;
  queuedAt: number;
  completedAt?: number;
};

export type FilmHomeSummary<T extends FilmHomeEntry> = {
  /** Assembled films, newest first. */
  films: T[];
  /** The latest finished stills (not clips, not films), newest first. */
  stills: T[];
  stillCount: number;
  clipCount: number;
};

const when = (entry: FilmHomeEntry) => entry.completedAt ?? entry.queuedAt ?? 0;

export function filmHomeSummary<T extends FilmHomeEntry>(
  entries: readonly T[],
  isClip: (entry: T) => boolean,
  most = 6
): FilmHomeSummary<T> {
  const done = entries
    .filter(entry => entry.status === 'completed')
    .sort((a, b) => when(b) - when(a));
  const films = done.filter(entry => entry.derivedKind === 'film');
  const clips = done.filter(entry => entry.derivedKind !== 'film' && isClip(entry));
  const stills = done.filter(entry => entry.derivedKind !== 'film' && !isClip(entry));
  return {
    films,
    stills: stills.slice(0, most),
    stillCount: stills.length,
    clipCount: clips.length,
  };
}

/** "4 stills · 2 clips · 1 film" — what's made so far (empty parts left out). */
export function filmHomeProgress(summary: {
  stillCount: number;
  clipCount: number;
  films: readonly unknown[];
}): string {
  const part = (count: number, one: string) =>
    count ? `${count} ${one}${count === 1 ? '' : 's'}` : '';
  return (
    [
      part(summary.stillCount, 'still'),
      part(summary.clipCount, 'clip'),
      part(summary.films.length, 'film'),
    ]
      .filter(Boolean)
      .join(' · ') || 'Nothing made yet'
  );
}
