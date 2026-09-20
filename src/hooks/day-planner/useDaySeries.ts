'use client';

import { useCallback, useEffect, useState } from 'react';
import { stitchSelectedGalleryVideos } from '@/lib/character-film-assemble';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import {
  activeSeriesForCast,
  closeActiveSeries,
  loadPlaySeriesStore,
  PLAY_SERIES_UPDATED_EVENT,
  recordSeriesStitch,
  savePlaySeriesStore,
  seriesStitchEntryIds,
  type PlaySeries,
  type PlaySeriesStore,
} from '@/lib/play-series';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

/** Season (series) state for the active Cast on Day: current season, stitch, and close. */
export function useDaySeries(characterId: string | undefined) {
  const [store, setStore] = useState<PlaySeriesStore>({ version: 1, series: [] });
  const [stitching, setStitching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => setStore(loadPlaySeriesStore()));
    };
    refresh();
    window.addEventListener(PLAY_SERIES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PLAY_SERIES_UPDATED_EVENT, refresh);
  }, []);

  const season: PlaySeries | null = characterId ? activeSeriesForCast(store, characterId) : null;

  const stitchSeason = useCallback(async () => {
    const current = loadPlaySeriesStore();
    const active = characterId ? activeSeriesForCast(current, characterId) : null;
    if (!active) {
      return;
    }
    const wanted = new Set(seriesStitchEntryIds(active));
    const entries = loadComfyGallery().filter(entry => wanted.has(entry.id));
    if (entries.length < 2) {
      setStatus('Need at least two season films still in Gallery to stitch.');
      return;
    }
    setStitching(true);
    setStatus(`Stitching ${entries.length} episodes…`);
    try {
      const result = await stitchSelectedGalleryVideos({
        entries,
        title: active.title,
        onProgress: progress => setStatus(progress.label),
      });
      if (result.entryId) {
        savePlaySeriesStore(
          recordSeriesStitch(loadPlaySeriesStore(), active.id, result.entryId, Date.now())
        );
      }
      setStatus(
        result.persisted
          ? `Stitched ${result.clipCount} episodes into ${result.filename} and saved it to Gallery.`
          : `Stitched ${result.clipCount} episodes into ${result.filename} (download only).`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not stitch the season.');
    } finally {
      setStitching(false);
    }
  }, [characterId]);

  const startNewSeason = useCallback(() => {
    if (!characterId) {
      return;
    }
    savePlaySeriesStore(closeActiveSeries(loadPlaySeriesStore(), characterId, Date.now()));
    setStatus('Season closed — your next Day film starts a new one.');
  }, [characterId]);

  return {
    season,
    seasonStitching: stitching,
    seasonStatus: status,
    stitchSeason,
    startNewSeason,
  };
}
