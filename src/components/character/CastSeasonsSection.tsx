'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { episodeDayRows, reopenEpisodeDayPatch, type EpisodeDay } from '@/lib/day-episode-snapshot';
import { DEFAULT_DAY_TOOL_CACHE } from '@/lib/play-settings';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from '@/lib/settings-cache';
import {
  loadPlaySeriesStore,
  PLAY_SERIES_UPDATED_EVENT,
  seasonPlaces,
  seriesForCast,
  type PlaySeries,
} from '@/lib/play-series';

function readSeasons(characterId: string): PlaySeries[] {
  // Oldest season first, as a run reads.
  return [...seriesForCast(loadPlaySeriesStore(), characterId)].sort(
    (a, b) => a.createdAt - b.createdAt
  );
}

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * The Cast's run of Days: each season's episodes in order (Tomorrow → makes the next one), with
 * the still each opened on and the places it went. Films play from the Films tab below.
 */
export default function CastSeasonsSection({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<PlaySeries[]>([]);
  /** Open an episode's Day again; the Day it replaces is set aside (Day offers it back). */
  const reopen = (snapshot: EpisodeDay, label: string) => {
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    saveToolSettings('day', {
      ...day,
      ...reopenEpisodeDayPatch({
        day,
        castId: characterId,
        activeCastId: loadSettingsCache().shared.activeCharacterId,
        snapshot,
        label,
      }),
    });
    router.push(`/day?character=${encodeURIComponent(characterId)}`);
  };
  useEffect(() => {
    const refresh = () => setSeasons(readSeasons(characterId));
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(PLAY_SERIES_UPDATED_EVENT, refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PLAY_SERIES_UPDATED_EVENT, refresh);
    };
  }, [characterId]);

  const withEpisodes = seasons.filter(season => season.episodes.length > 0);
  if (withEpisodes.length === 0) return null;

  return (
    <ToolSection
      title="Seasons"
      description="Every cut Day is an episode — Tomorrow → after a cut makes the next one."
      data-testid="cast-seasons"
    >
      {withEpisodes.map(season => {
        const places = seasonPlaces(season);
        return (
          <div key={season.id} className="space-y-2" data-testid="cast-season">
            <p className="type-heading">
              {season.title}
              <span className="type-caption ml-2 text-[var(--text-muted)]">
                {season.episodes.length} {season.episodes.length === 1 ? 'episode' : 'episodes'}
                {places.length > 0
                  ? ` · ${places.length} ${places.length === 1 ? 'place' : 'places'}`
                  : ''}
                {season.closedAt ? ' · ended' : ''}
              </span>
            </p>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {season.episodes.map((episode, index) => (
                <li
                  key={episode.id}
                  className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40"
                  data-testid="cast-season-episode"
                >
                  {episode.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ComfyUI / gallery URLs
                    <img
                      src={episode.posterUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-[3/4] w-full bg-[var(--bg-hover)]" aria-hidden />
                  )}
                  <div className="space-y-1 p-2">
                    <p className="type-caption font-medium text-[var(--text-primary)]">
                      Episode {index + 1}
                      <span className="ml-1 font-normal text-[var(--text-muted)]">
                        · {DATE.format(episode.cutAt)}
                        {episode.theme ? ` · ${episode.theme}` : ''}
                      </span>
                    </p>
                    {episode.places?.length ? (
                      <p className="type-caption line-clamp-2 text-[var(--text-muted)]">
                        {episode.places.join(' · ')}
                      </p>
                    ) : null}
                    {episode.day ? (
                      <EpisodeDayDetails
                        snapshot={episode.day}
                        onReopen={() =>
                          reopen(episode.day!, `${season.title}, episode ${index + 1}`)
                        }
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </ToolSection>
  );
}

/** What went into an episode (each slot: its still or clip, place, beat, line) and a way back to it. */
function EpisodeDayDetails({ snapshot, onReopen }: { snapshot: EpisodeDay; onReopen: () => void }) {
  const rows = episodeDayRows(snapshot);
  return (
    <details className="pt-1" data-testid="cast-season-episode-day">
      <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
        What went into it
      </summary>
      <ol className="mt-1.5 space-y-1.5">
        {rows.map(row => (
          <li
            key={row.slotId}
            className="flex gap-2"
            data-testid={`cast-episode-slot-${row.slotId}`}
          >
            {row.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- ComfyUI / gallery URLs
              <img
                src={row.thumb}
                alt=""
                loading="lazy"
                className="h-12 w-9 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-12 w-9 shrink-0 rounded bg-[var(--bg-hover)]" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="type-caption font-medium text-[var(--text-primary)]">
                {row.label}
                <span className="ml-1 font-normal text-[var(--text-muted)]">
                  · {row.kind === 'clip' ? 'clip' : row.kind === 'still' ? 'still' : 'not rendered'}
                </span>
              </p>
              <p className="type-caption line-clamp-2 text-[var(--text-muted)]">
                {[row.place, row.beat].filter(Boolean).join(' · ')}
                {row.line ? ` · “${row.line}”` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        title="Puts this Day back on the Day board; the Day there now is kept and can come back"
        data-testid="cast-episode-reopen"
        onClick={onReopen}
      >
        Open this Day again
      </Button>
    </details>
  );
}
