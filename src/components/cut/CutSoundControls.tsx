'use client';

/**
 * Cut's music shaping and ambience (cut-sound.ts): where the music starts and how it fades, and a
 * room tone / ambience track looped under the whole film at its own level.
 */

import { useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { Button } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import {
  normalizeAmbienceLevel,
  normalizeMusicFadeInSec,
  normalizeMusicFadeOutSec,
  normalizeMusicStartSec,
  type CutSoundOptions,
} from '@/lib/cut-sound';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film-audio-bed';

const inputClass =
  'w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]';

export default function CutSoundControls({
  value,
  onChange,
  disabled,
  hasBed,
  testIdPrefix,
}: {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  hasBed: boolean;
  testIdPrefix: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = value.sound ?? {};
  const patch = (next: Partial<CutSoundOptions>) =>
    onChange({ ...value, sound: { ...sound, ...next } });
  const seconds = (
    label: string,
    title: string,
    field: 'musicStartSec' | 'musicFadeInSec' | 'musicFadeOutSec',
    current: number,
    max: number,
    normalize: (v: unknown) => number
  ) => (
    <label
      className="flex items-center gap-1.5 type-caption text-[var(--text-muted)]"
      title={title}
    >
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={0.5}
        disabled={disabled}
        className={inputClass}
        value={current}
        onChange={event => patch({ [field]: normalize(Number(event.target.value) || 0) })}
        data-testid={`${testIdPrefix}-${field}`}
      />
      <span>s</span>
    </label>
  );
  const ambience = sound.ambienceUrl?.trim() ?? '';
  return (
    <div className="space-y-1.5">
      {hasBed ? (
        <ToolActionRow>
          {seconds(
            'Music from',
            'Start the music this far in (skip its intro)',
            'musicStartSec',
            normalizeMusicStartSec(sound.musicStartSec),
            600,
            normalizeMusicStartSec
          )}
          {seconds(
            'Fade in',
            'Bring the music up over the opening seconds',
            'musicFadeInSec',
            normalizeMusicFadeInSec(sound.musicFadeInSec),
            8,
            normalizeMusicFadeInSec
          )}
          {seconds(
            'Fade out',
            'Take the sound down over the last seconds (0 = stop on the last frame)',
            'musicFadeOutSec',
            normalizeMusicFadeOutSec(sound.musicFadeOutSec),
            8,
            normalizeMusicFadeOutSec
          )}
        </ToolActionRow>
      ) : null}
      <ToolActionRow>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          loading={busy}
          loadingLabel="Uploading"
          title="Room tone, rain, a café, the sea — looped quietly under the whole film"
          onClick={() => fileRef.current?.click()}
          data-testid={`${testIdPrefix}-ambience-upload`}
        >
          {ambience ? 'Change ambience' : 'Add ambience'}
        </Button>
        {ambience ? (
          <>
            <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
              <span>{sound.ambienceName ? `Ambience: ${sound.ambienceName}` : 'Ambience'}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                aria-label="Ambience level"
                value={Math.round(normalizeAmbienceLevel(sound.ambienceLevel) * 100)}
                onChange={event => patch({ ambienceLevel: Number(event.target.value) / 100 })}
                data-testid={`${testIdPrefix}-ambience-level`}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || busy}
              onClick={() => patch({ ambienceUrl: undefined, ambienceName: undefined })}
              data-testid={`${testIdPrefix}-ambience-clear`}
            >
              Clear
            </Button>
          </>
        ) : null}
      </ToolActionRow>
      <input
        ref={fileRef}
        type="file"
        accept={FILM_AUDIO_BED_ACCEPT}
        className="hidden"
        data-testid={`${testIdPrefix}-ambience-file`}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          void resolveFilmAudioBedFromFile(file)
            .then(resolved => patch({ ambienceUrl: resolved.url, ambienceName: resolved.label }))
            .catch(err =>
              setError(err instanceof Error ? err.message : 'Could not use that audio file.')
            )
            .finally(() => setBusy(false));
        }}
      />
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
