'use client';

import { useEffect, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
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
  const [seasons, setSeasons] = useState<PlaySeries[]>([]);
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
