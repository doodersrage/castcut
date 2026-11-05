'use client';

/**
 * Cut's music shaping and ambience (cut-sound.ts): where the music starts and how it fades, and a
 * room tone / ambience track looped under the whole film at its own level.
 */

import { useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { Button } from '@/components/ui/Button';
import {
  OptionRow,
  OptionSlider,
  OptionSwitch,
  optionSelectClass,
} from '@/components/cut/CutOptionParts';
import {
  normalizeAmbienceLevel,
  normalizeMusicFadeInSec,
  normalizeMusicFadeOutSec,
  normalizeMusicStartSec,
  type CutSoundOptions,
} from '@/lib/video/cut-sound';
import { cutLoudnessTarget } from '@/lib/film/export-profiles';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film/audio-bed';

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
  const [shapeOpen, setShapeOpen] = useState(
    () =>
      (sound.musicStartSec ?? 0) > 0 ||
      (sound.musicFadeInSec ?? 0) > 0 ||
      (sound.musicFadeOutSec ?? 1) !== 1 ||
      Boolean(sound.musicKeys?.length)
  );
  const seconds = (
    label: string,
    title: string,
    field: 'musicStartSec' | 'musicFadeInSec' | 'musicFadeOutSec',
    current: number,
    max: number,
    normalize: (v: unknown) => number
  ) => (
    <OptionRow label={label} hint={title}>
      <input
        type="number"
        min={0}
        max={max}
        step={0.5}
        disabled={disabled}
        aria-label={label}
        className={`${optionSelectClass} !w-20`}
        value={current}
        onChange={event => patch({ [field]: normalize(Number(event.target.value) || 0) })}
        data-testid={`${testIdPrefix}-${field}`}
      />
      <span className="type-caption text-[var(--text-muted)]">s</span>
    </OptionRow>
  );
  const ambience = sound.ambienceUrl?.trim() ?? '';
  return (
    <div className="grid gap-2">
      {hasBed ? (
        <>
          <Button
            variant="quiet"
            type="button"
            className="justify-self-start type-caption hover:underline"
            aria-expanded={shapeOpen}
            onClick={() => setShapeOpen(open => !open)}
            data-testid={`${testIdPrefix}-music-shape-toggle`}
          >
            {shapeOpen ? '▾' : '▸'} Music start, fades &amp; level
          </Button>
          {shapeOpen ? (
            <div className="grid gap-2">
              {seconds(
                'Starts at',
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
              <OptionRow
                label="Level points"
                hint="Double-click the music lane on the timeline to add a point; drag it up or down — the music follows the line"
              >
                <span className="min-w-0 flex-1 type-caption text-[var(--text-muted)]">
                  {sound.musicKeys?.length
                    ? `${sound.musicKeys.length} point${sound.musicKeys.length === 1 ? '' : 's'}`
                    : 'None — double-click the music lane'}
                </span>
                {sound.musicKeys?.length ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => patch({ musicKeys: undefined })}
                    data-testid={`${testIdPrefix}-music-keys-clear`}
                  >
                    Clear
                  </Button>
                ) : null}
              </OptionRow>
            </div>
          ) : null}
        </>
      ) : null}
      <OptionSwitch
        label="Hit the loudness target"
        note={cutLoudnessTarget(value).label}
        hint="The finished film is measured and brought to its profile's loudness (Made for), peaks kept under the limit — one gain for the whole film, so quiet and loud moments keep their balance"
        checked={value.normalizeLoudness !== false}
        disabled={disabled}
        onChange={next => onChange({ ...value, normalizeLoudness: next ? undefined : false })}
        testId={`${testIdPrefix}-normalize-loudness`}
      />
      <OptionSwitch
        label="Stems too"
        hint="With the film, a .zip of the mix's parts as WAVs — dialogue, music, ambience, effects — lined up with it and at its level, for a sound mixer"
        checked={value.stems === true}
        disabled={disabled}
        onChange={next => onChange({ ...value, stems: next || undefined })}
        testId={`${testIdPrefix}-stems`}
      />
      <OptionSwitch
        label="Even out voices"
        hint="A gentle compressor on the dialogue — clips' lines and narration — so quiet and loud lines sit closer together, in the film (not the monitor)"
        checked={sound.evenVoices === true}
        disabled={disabled}
        onChange={next => patch({ evenVoices: next || undefined })}
        testId={`${testIdPrefix}-even-voices`}
      />
      <OptionSwitch
        label="Clean up voices"
        hint="On the clips' sound and the narration: a low cut under the voice, noise reduction and a gentle de-esser — in the film, not the monitor"
        checked={sound.voiceCleanup === true}
        disabled={disabled}
        onChange={next => patch({ voiceCleanup: next || undefined })}
        testId={`${testIdPrefix}-voice-cleanup`}
      />
      <OptionRow
        label="Ambience"
        hint="Room tone, rain, a café, the sea — looped quietly under the whole film"
      >
        <span className="min-w-0 flex-1 truncate type-caption text-[var(--text-primary)]">
          {ambience ? sound.ambienceName || 'A track' : 'None'}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          loading={busy}
          loadingLabel="Uploading"
          onClick={() => fileRef.current?.click()}
          data-testid={`${testIdPrefix}-ambience-upload`}
        >
          {ambience ? 'Change' : 'Add'}
        </Button>
        {ambience ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => patch({ ambienceUrl: undefined, ambienceName: undefined })}
            data-testid={`${testIdPrefix}-ambience-clear`}
          >
            Remove
          </Button>
        ) : null}
      </OptionRow>
      {ambience ? (
        <OptionRow label="Ambience level">
          <OptionSlider
            label="Ambience level"
            value={normalizeAmbienceLevel(sound.ambienceLevel)}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            onChange={next => patch({ ambienceLevel: next })}
            testId={`${testIdPrefix}-ambience-level`}
          />
        </OptionRow>
      ) : null}
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
