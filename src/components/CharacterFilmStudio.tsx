'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError, FieldLabel } from '@/components/ui/Field';
import { ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import {
  addStillToFilmCut,
  clampStillHoldSec,
  defaultFilmCut,
  filmShotKind,
  isAssembledFilmEntry,
  isFilmSourceStill,
  moveFilmCutItem,
  normalizeFilmCut,
  resolveFilmPlaylist,
  setFilmCutHoldSec,
  setFilmCutIncluded,
  type CharacterFilmCut,
  type FilmMediaRef,
} from '@/lib/character-film';
import { assembleAndStampFilm, downloadFilmBlob } from '@/lib/character-film-assemble';
import { saveCharacterFilmCut } from '@/lib/character-os';
import type { FilmResolutionPreset } from '@/lib/film-server-encode';
import { remixDayFilmHref } from '@/lib/play-starter';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';

function toMediaRef(entry: ComfyGalleryEntry): FilmMediaRef {
  return {
    id: entry.id,
    status: entry.status,
    derivedKind: entry.derivedKind,
    tool: entry.tool,
    queuedAt: entry.queuedAt,
    completedAt: entry.completedAt,
    prompt: entry.prompt,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
    viewUrl: galleryEntryPrimaryViewUrl(entry),
    sourceImageUrl: entry.sourceImageUrl,
    images: entry.images,
  };
}

export default function CharacterFilmStudio({
  characterId,
  characterName,
  lookId,
  filmCut,
  entries,
}: {
  characterId: string;
  characterName: string;
  lookId?: string;
  filmCut?: CharacterFilmCut;
  entries: ComfyGalleryEntry[];
}) {
  const refs = useMemo(() => entries.map(toMediaRef), [entries]);
  const byId = useMemo(() => new Map(refs.map(entry => [entry.id, entry])), [refs]);
  const cut = useMemo(() => normalizeFilmCut(filmCut, refs), [filmCut, refs]);
  const playlist = useMemo(() => resolveFilmPlaylist(cut, refs), [cut, refs]);
  const films = useMemo(
    () => entries.filter(entry => entry.status === 'completed' && isAssembledFilmEntry(entry)),
    [entries]
  );
  useEffect(() => {
    if (films.length === 0) {
      return;
    }
    void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
      markOnboardingWatchFirstFilm();
    });
  }, [films.length]);
  const unusedStills = useMemo(
    () =>
      refs.filter(
        entry => isFilmSourceStill(entry) && !cut.items.some(item => item.entryId === entry.id)
      ),
    [cut.items, refs]
  );
  const [stillPick, setStillPick] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [resolution, setResolution] = useState<FilmResolutionPreset>('720p');
  const [crossfadeSec, setCrossfadeSec] = useState(0);
  const [audioBedUrl, setAudioBedUrl] = useState('');

  const persistCut = (next: CharacterFilmCut) => {
    saveCharacterFilmCut(characterId, normalizeFilmCut(next, refs));
  };

  const latestFilm = films[0];
  const latestFilmUrl = latestFilm ? galleryEntryPrimaryViewUrl(latestFilm) : null;
  const emptyCut = cut.items.length === 0 && playlist.length === 0;

  return (
    <ToolSection
      id="character-film-studio"
      title="Film"
      description="Watch the reel in order, cut keepers, then assemble one movie stamped on this character."
      data-testid="character-film-studio"
    >
      <FilmWatchPlayer
        shots={playlist}
        emptyLabel="Queue clips or add stills to the cut, then watch them in order."
      />

      {emptyCut && films.length === 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-3"
          data-testid="character-film-studio-empty"
        >
          <p className="type-caption text-[var(--text-muted)]">
            No film cut yet. Queue Day slots or Story beats, or open Day / Story and Cut film.
          </p>
          <ToolActionRow>
            <ButtonLink
              href={remixDayFilmHref(characterId)}
              size="sm"
              variant="primary"
              data-testid="character-film-empty-remix"
            >
              Same look, new Day
            </ButtonLink>
            <ButtonLink
              href={`/day?character=${encodeURIComponent(characterId)}`}
              size="sm"
              variant="secondary"
            >
              Open Day
            </ButtonLink>
            <ButtonLink
              href={`/roleplay?character=${encodeURIComponent(characterId)}`}
              size="sm"
              variant="ghost"
            >
              Open Story
            </ButtonLink>
          </ToolActionRow>
        </div>
      ) : null}

      {films.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">
            {films.length} assembled film{films.length === 1 ? '' : 's'} on this character.
          </p>
          <ToolActionRow>
            {latestFilmUrl ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const url = latestFilmUrl;
                  const name = latestFilm.images[0]?.filename || 'film.webm';
                  void fetch(url)
                    .then(response => {
                      if (!response.ok) {
                        throw new Error('Could not download that film.');
                      }
                      return response.blob();
                    })
                    .then(blob => downloadFilmBlob(blob, name))
                    .catch(err => {
                      setError(
                        err instanceof Error ? err.message : 'Could not download that film.'
                      );
                    });
                }}
              >
                Download film
              </Button>
            ) : null}
            <ButtonLink
              href={`/gallery?character=${encodeURIComponent(characterId)}&derivedKind=film`}
              size="sm"
              variant="ghost"
              data-testid="character-film-gallery-link"
            >
              Open films in Gallery
            </ButtonLink>
            <ButtonLink
              href={remixDayFilmHref(characterId)}
              size="sm"
              variant="secondary"
              data-testid="character-film-cut-another"
            >
              Same look, new Day
            </ButtonLink>
            <ButtonLink
              href="/play"
              size="sm"
              variant="ghost"
              data-testid="character-film-new-campaign"
            >
              New film
            </ButtonLink>
          </ToolActionRow>
        </div>
      ) : null}

      <div className="space-y-2">
        <FieldLabel>Still hold (seconds)</FieldLabel>
        <input
          type="number"
          min={0.5}
          max={12}
          step={0.5}
          value={cut.stillHoldSec}
          aria-label="Default still hold in seconds"
          className="ui-input w-28 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          onChange={event => {
            persistCut({
              ...cut,
              stillHoldSec: clampStillHoldSec(event.target.value),
              updatedAt: Date.now(),
            });
          }}
        />
      </div>

      {cut.items.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          No shots in the cut yet. Animate stills in Story or Video, or add a still as a title card.
        </p>
      ) : (
        <ol className="ui-list">
          {cut.items.map((item, index) => {
            const entry = byId.get(item.entryId);
            const gallery = entries.find(candidate => candidate.id === item.entryId);
            const kind = entry ? filmShotKind(entry) : 'still';
            return (
              <li key={item.entryId} className="ui-list-row items-center gap-3">
                {gallery && galleryEntryHeroPreviewUrl(gallery) ? (
                  <GalleryEntryPreview
                    entry={gallery}
                    className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-muted)] type-caption">
                    {index + 1}
                  </div>
                )}
                <div className="ui-list-primary min-w-0">
                  <p className="type-heading truncate">
                    {index + 1}. {kind === 'clip' ? 'Clip' : 'Still'}
                    {item.included ? '' : ' · skipped'}
                  </p>
                  <p className="type-caption truncate text-[var(--text-muted)]">
                    {entry?.prompt?.trim() || item.entryId}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {kind === 'still' ? (
                    <input
                      type="number"
                      min={0.5}
                      max={12}
                      step={0.5}
                      value={item.holdSec ?? cut.stillHoldSec}
                      aria-label={`Hold for shot ${index + 1}`}
                      className="ui-input w-16 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-caption"
                      onChange={event => {
                        persistCut(
                          setFilmCutHoldSec(cut, item.entryId, Number(event.target.value))
                        );
                      }}
                    />
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      persistCut(setFilmCutIncluded(cut, item.entryId, !item.included))
                    }
                  >
                    {item.included ? 'Skip' : 'Keep'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => persistCut(moveFilmCutItem(cut, item.entryId, -1))}
                  >
                    Up
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === cut.items.length - 1}
                    onClick={() => persistCut(moveFilmCutItem(cut, item.entryId, 1))}
                  >
                    Down
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {unusedStills.length > 0 ? (
          <>
            <select
              className="ui-input min-w-[10rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              value={stillPick}
              aria-label="Still to add as a title card"
              onChange={event => setStillPick(event.target.value)}
            >
              <option value="">Add a still as a hold…</option>
              {unusedStills.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.prompt?.trim().slice(0, 60) || entry.id}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!stillPick}
              onClick={() => {
                const entry = unusedStills.find(candidate => candidate.id === stillPick);
                if (!entry) {
                  return;
                }
                persistCut(addStillToFilmCut(cut, entry));
                setStillPick('');
              }}
            >
              Add still
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => persistCut(defaultFilmCut(refs))}>
          Reset to clips
        </Button>
      </div>

      <ToolActionRow>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Encode</span>
          <select
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={resolution}
            onChange={event => setResolution(event.target.value === '1080p' ? '1080p' : '720p')}
            data-testid="character-film-resolution"
          >
            <option value="720p">720p MP4</option>
            <option value="1080p">1080p MP4</option>
          </select>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Crossfade</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            className="w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={crossfadeSec}
            onChange={event => setCrossfadeSec(Number(event.target.value) || 0)}
            data-testid="character-film-crossfade"
          />
          <span>s</span>
        </label>
      </ToolActionRow>
      <label className="mt-2 flex flex-col gap-1 type-caption text-[var(--text-muted)]">
        <span>Audio bed URL (optional)</span>
        <input
          type="url"
          placeholder="https://… or /api/gallery/media/…"
          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[var(--text-primary)]"
          value={audioBedUrl}
          onChange={event => setAudioBedUrl(event.target.value)}
          data-testid="character-film-audio-bed"
        />
      </label>

      <ToolActionRow>
        <Button
          size="sm"
          variant="primary"
          loading={assembling}
          loadingLabel="Assembling"
          disabled={playlist.length === 0 || assembling}
          data-testid="character-film-assemble"
          onClick={() => {
            setAssembling(true);
            setError(null);
            setStatus('Encoding the cut…');
            void assembleAndStampFilm({
              shots: playlist,
              characterId,
              characterName,
              lookId,
              resolution,
              crossfadeSec,
              audioBedUrl: audioBedUrl.trim() || undefined,
              onProgress: progress => setStatus(progress.label),
            })
              .then(result => {
                downloadFilmBlob(result.blob, result.filename);
                setStatus(
                  result.persisted
                    ? `Saved ${result.filename} to this character (${result.encodePath} encode) and started the download.`
                    : `Downloaded ${result.filename} (${result.encodePath} encode). Studio storage could not keep a copy.`
                );
              })
              .catch(err => {
                setStatus(null);
                setError(err instanceof Error ? err.message : 'Could not assemble the film.');
              })
              .finally(() => setAssembling(false));
          }}
        >
          Assemble film
        </Button>
      </ToolActionRow>
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="character-film-status">
          {status}
        </p>
      ) : null}
      {error ? (
        <div data-testid="character-film-error">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </ToolSection>
  );
}
