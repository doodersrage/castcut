'use client';

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
};

type FilmCutOptionsControlsProps = {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  testIdPrefix?: string;
};

/** Crossfade, vertical export, and audio bed for Day/Story/Cast Cut (upload or URL). */
export default function FilmCutOptionsControls({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'film-cut',
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
      </ToolActionRow>

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
