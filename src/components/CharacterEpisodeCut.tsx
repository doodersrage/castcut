'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import FilmCutOptionsControls, {
  type FilmCutOptionsValue,
  DEFAULT_FILM_CUT_OPTIONS,
} from '@/components/FilmCutOptionsControls';
import { assembleAndStampFilm, downloadFilmBlob } from '@/lib/character-film-assemble-lazy';
import { filmResolutionForCutOptions } from '@/lib/film-resolution';
import {
  castEpisodeSources,
  episodeCutShots,
  episodePartCounts,
  episodePlaylist,
  episodeTitleCard,
  type CastEpisodeSources,
} from '@/lib/play-episode';
import {
  loadRoleplayLibrary,
  roleplayLibraryIdForCharacter,
  ROLEPLAY_LIBRARY_UPDATED_EVENT,
} from '@/lib/roleplay-library';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
} from '@/lib/settings-cache';

function readSources(characterId: string): CastEpisodeSources {
  return castEpisodeSources({
    characterId,
    activeCharacterId: loadSettingsCache().shared.activeCharacterId,
    day: loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE),
    roleplay: loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE),
    storySessionId: roleplayLibraryIdForCharacter(characterId),
    library: loadRoleplayLibrary(),
  });
}

/**
 * Episode: the Cast's Day (slot order) then its Story (reel order) cut as one film, with the
 * same shot list and encoder as Day / Story Cut film. Saved to Gallery on this Cast.
 */
export default function CharacterEpisodeCut({
  characterId,
  characterName,
  lookId,
}: {
  characterId: string;
  characterName: string;
  lookId?: string;
}) {
  const [sources, setSources] = useState<CastEpisodeSources>(() => readSources(characterId));
  useEffect(() => {
    const refresh = () => setSources(readSources(characterId));
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    window.addEventListener(ROLEPLAY_LIBRARY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
      window.removeEventListener(ROLEPLAY_LIBRARY_UPDATED_EVENT, refresh);
    };
  }, [characterId]);

  const [options, setOptions] = useState<FilmCutOptionsValue>(DEFAULT_FILM_CUT_OPTIONS);
  const [assembling, setAssembling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shots = useMemo(() => episodePlaylist(sources), [sources]);
  const cutShots = useMemo(
    () => episodeCutShots(shots, options.shotEdits),
    [options.shotEdits, shots]
  );
  const counts = episodePartCounts(cutShots);

  const cutEpisode = async () => {
    if (cutShots.length === 0) {
      setError('Keep at least one Day still or Story beat in the episode.');
      return;
    }
    setAssembling(true);
    setError(null);
    setStatus('Encoding the episode…');
    try {
      const result = await assembleAndStampFilm({
        shots: cutShots,
        characterId,
        characterName,
        lookId,
        resolution: filmResolutionForCutOptions({ vertical: options.vertical }),
        crossfadeSec: options.crossfadeSec,
        audioBedUrl: options.audioBedUrl.trim() || undefined,
        stillMotion: options.stillMotion !== false,
        captions: options.titles === true,
        titleCard: options.titles ? episodeTitleCard(characterName) : null,
        length: options.length,
        beatSnap: options.beatSnap,
        onProgress: progress => setStatus(progress.label),
      });
      downloadFilmBlob(result.blob, result.filename);
      setStatus(
        result.persisted
          ? `Saved ${result.filename} to this character (${result.encodePath} encode) and started the download.`
          : `Downloaded ${result.filename} (${result.encodePath} encode). Studio storage could not keep a copy.`
      );
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Could not cut the episode.');
    } finally {
      setAssembling(false);
    }
  };

  return (
    <section
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-3"
      data-testid="character-episode"
      aria-labelledby="character-episode-title"
    >
      <div>
        <h3 id="character-episode-title" className="type-heading">
          Episode
        </h3>
        <p className="type-caption text-[var(--text-muted)]">
          The Day, then the Story, as one film.
        </p>
      </div>
      {shots.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="character-episode-empty">
          Queue Day stills or Story beats for this character — the episode cuts them together.
        </p>
      ) : (
        <>
          <FilmWatchPlayer compact shots={cutShots} emptyLabel="Every shot is left out." />
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="character-episode-summary"
          >
            {cutShots.length} shot{cutShots.length === 1 ? '' : 's'} · {counts.day} from the Day,{' '}
            {counts.story} from the Story
          </p>
          <details
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
            data-testid="character-episode-options"
          >
            <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
              Shots and cut options
            </summary>
            <div className="mt-3">
              <FilmCutOptionsControls
                value={options}
                onChange={setOptions}
                disabled={assembling}
                testIdPrefix="character-episode"
                shots={shots}
              />
            </div>
          </details>
          <ToolActionRow>
            <Button
              size="sm"
              variant="primary"
              loading={assembling}
              loadingLabel="Cutting"
              disabled={cutShots.length === 0 || assembling}
              data-testid="character-episode-cut"
              onClick={() => void cutEpisode()}
            >
              Cut episode · {cutShots.length} shot{cutShots.length === 1 ? '' : 's'}
            </Button>
          </ToolActionRow>
        </>
      )}
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="character-episode-status">
          {status}
        </p>
      ) : null}
      {error ? (
        <div data-testid="character-episode-error">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </section>
  );
}
