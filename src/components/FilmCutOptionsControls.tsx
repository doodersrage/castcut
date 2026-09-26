'use client';

import FilmCutShotList from '@/components/FilmCutShotList';
import {
  normalizeFilmCutLength,
  type CutShotEdits,
  type FilmCutLength,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import { useRef, useState } from 'react';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film-audio-bed';

export type FilmCutOptionsValue = {
  crossfadeSec: number;
  audioBedUrl: string;
  /** Export a 9:16 vertical cut (Shorts / Reels / Stories) instead of landscape. */
  vertical?: boolean;
  /** Display name after a local upload (optional). */
  audioBedName?: string;
  /** Slow push-in / pull-out on stills (default on — a static hold reads as a slideshow). */
  stillMotion?: boolean;
  /** Opening title card plus a short caption per shot. */
  titles?: boolean;
  /** How long the cut runs: as the shots hold, fit to the music, or 15 / 30 / 60 s. */
  length?: FilmCutLength;
  /** Land still cuts on the music's beat (needs an audio bed). */
  beatSnap?: boolean;
  /** Day / Story shot list: order, leave-outs, captions, holds. */
  shotEdits?: CutShotEdits;
};

/** Cut option defaults shared by Day, Story and Cast film. */
export const DEFAULT_FILM_CUT_OPTIONS: FilmCutOptionsValue = {
  crossfadeSec: 0,
  audioBedUrl: '',
  stillMotion: true,
  titles: false,
};

type FilmCutOptionsControlsProps = {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  testIdPrefix?: string;
  /** Shots this cut would use (Day / Story) — shows the shot list when given. */
  shots?: KeyedShot[];
};

/** Crossfade, vertical export, and audio bed for Day/Story/Cast Cut (upload or URL). */
export default function FilmCutOptionsControls({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'film-cut',
  shots,
}: FilmCutOptionsControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bedLabel = value.audioBedName?.trim() || '';
  const hasBed = Boolean(value.audioBedUrl.trim());

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-options`}>
      <ToolActionRow>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Crossfade</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            disabled={disabled}
            className="w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={value.crossfadeSec}
            onChange={event =>
              onChange({
                ...value,
                crossfadeSec: Math.min(2, Math.max(0, Number(event.target.value) || 0)),
              })
            }
            data-testid={`${testIdPrefix}-crossfade`}
          />
          <span>s</span>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.vertical === true}
            onChange={event => onChange({ ...value, vertical: event.target.checked })}
            data-testid={`${testIdPrefix}-vertical`}
          />
          <span>Vertical 9:16</span>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.stillMotion !== false}
            onChange={event => onChange({ ...value, stillMotion: event.target.checked })}
            data-testid={`${testIdPrefix}-still-motion`}
          />
          <span>Slow zoom on stills</span>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.titles === true}
            onChange={event => onChange({ ...value, titles: event.target.checked })}
            data-testid={`${testIdPrefix}-titles`}
          />
          <span>Title & captions</span>
        </label>
      </ToolActionRow>

      <ToolActionRow>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Length</span>
          <select
            disabled={disabled}
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={String(value.length ?? 'shots')}
            onChange={event =>
              onChange({
                ...value,
                length: normalizeFilmCutLength(
                  event.target.value === 'shots' || event.target.value === 'music'
                    ? event.target.value
                    : Number(event.target.value)
                ),
              })
            }
            data-testid={`${testIdPrefix}-length`}
          >
            <option value="shots">As the shots hold</option>
            <option value="music" disabled={!value.audioBedUrl.trim()}>
              Fit to the music
            </option>
            <option value="15">15 s</option>
            <option value="30">30 s</option>
            <option value="60">60 s</option>
          </select>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <input
            type="checkbox"
            disabled={disabled || !value.audioBedUrl.trim()}
            checked={value.beatSnap === true}
            onChange={event => onChange({ ...value, beatSnap: event.target.checked })}
            data-testid={`${testIdPrefix}-beat-snap`}
          />
          <span>Cut on the beat</span>
        </label>
      </ToolActionRow>
      {!value.audioBedUrl.trim() && (value.length === 'music' || value.beatSnap) ? (
        <p className="type-caption text-[var(--text-muted)]">
          Add a music track below to fit the cut to it or cut on its beat.
        </p>
      ) : null}

      {shots && shots.length > 0 ? (
        <FilmCutShotList
          shots={shots}
          edits={value.shotEdits}
          captions={value.titles === true}
          holdsLocked={(value.length ?? 'shots') !== 'shots'}
          disabled={disabled}
          testIdPrefix={testIdPrefix}
          onChange={shotEdits => onChange({ ...value, shotEdits })}
        />
      ) : null}

      <div className="space-y-1.5">
        <FieldLabel>Audio bed (optional)</FieldLabel>
        <ToolActionRow>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || uploadBusy}
            loading={uploadBusy}
            loadingLabel="Uploading"
            onClick={() => fileRef.current?.click()}
            data-testid={`${testIdPrefix}-audio-bed-upload`}
          >
            Upload audio
          </Button>
          {hasBed ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || uploadBusy}
              onClick={() => {
                setUploadError(null);
                onChange({ ...value, audioBedUrl: '', audioBedName: undefined });
              }}
              data-testid={`${testIdPrefix}-audio-bed-clear`}
            >
              Clear
            </Button>
          ) : null}
        </ToolActionRow>
        <input
          ref={fileRef}
          type="file"
          accept={FILM_AUDIO_BED_ACCEPT}
          className="hidden"
          data-testid={`${testIdPrefix}-audio-bed-file`}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            setUploadBusy(true);
            setUploadError(null);
            void resolveFilmAudioBedFromFile(file)
              .then(resolved => {
                onChange({
                  ...value,
                  audioBedUrl: resolved.url,
                  audioBedName: resolved.label,
                });
              })
              .catch(err => {
                setUploadError(
                  err instanceof Error ? err.message : 'Could not use that audio file.'
                );
              })
              .finally(() => setUploadBusy(false));
          }}
        />
        {hasBed ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-audio-bed-status`}
          >
            {bedLabel
              ? `Using ${bedLabel}`
              : value.audioBedUrl.startsWith('data:')
                ? 'Using uploaded audio'
                : 'Using audio URL'}
          </p>
        ) : null}
        {uploadError ? (
          <p
            className="type-caption text-[var(--danger)]"
            data-testid={`${testIdPrefix}-audio-bed-error`}
          >
            {uploadError}
          </p>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="type-caption text-[var(--text-muted)]">Or paste a URL</span>
          <input
            type="url"
            disabled={disabled || uploadBusy}
            placeholder="https://… or /api/gallery/media/…"
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 type-body text-[var(--text-primary)]"
            value={value.audioBedUrl.startsWith('data:') ? '' : value.audioBedUrl}
            onChange={event =>
              onChange({
                ...value,
                audioBedUrl: event.target.value,
                audioBedName: undefined,
              })
            }
            data-testid={`${testIdPrefix}-audio-bed`}
          />
        </label>
      </div>
    </div>
  );
}

/** One-line summary of the non-default cut options, e.g. "slow zoom · crossfade 0.5s · titles". */
export function filmCutOptionsSummary(value: FilmCutOptionsValue): string {
  const parts = [
    value.vertical ? 'vertical 9:16' : '',
    value.crossfadeSec > 0 ? `crossfade ${value.crossfadeSec}s` : '',
    value.stillMotion !== false ? 'slow zoom' : 'no zoom',
    value.titles ? 'titles' : '',
    value.audioBedUrl.trim() ? 'audio bed' : '',
    value.length === 'music'
      ? 'fit to music'
      : typeof value.length === 'number'
        ? `${value.length}s`
        : '',
    value.beatSnap && value.audioBedUrl.trim() ? 'on the beat' : '',
    Object.values(value.shotEdits?.shots ?? {}).some(edit => edit.include === false)
      ? 'shots left out'
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Cut options folded behind a one-line summary — they're set-once, and the full form made the
 * Cut banners (sticky on Day) several times taller than the Cut button they sit next to.
 */
export function FilmCutOptionsDisclosure({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'film-cut',
  shots,
}: FilmCutOptionsControlsProps) {
  return (
    <details
      className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5"
      data-testid={`${testIdPrefix}-options-disclosure`}
    >
      <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
        Cut options · {filmCutOptionsSummary(value)}
      </summary>
      <div className="mt-2 pb-1">
        <FilmCutOptionsControls
          value={value}
          onChange={onChange}
          disabled={disabled}
          testIdPrefix={testIdPrefix}
          shots={shots}
        />
      </div>
    </details>
  );
}
