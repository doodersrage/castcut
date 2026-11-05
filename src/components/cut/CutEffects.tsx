'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { OptionSlider } from '@/components/cut/CutOptionParts';
import { formatCutTime } from '@/hooks/useCutPreview';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film/audio-bed';
import { makeSoundEffectForCut } from '@/lib/clip/sound-effect-client';
import { SOUND_EFFECT_DEFAULT_SEC } from '@/lib/clip/sound-effect';
import {
  normalizeEffectAt,
  normalizeEffectLevel,
  type CutEffect,
  type CutSoundOptions,
} from '@/lib/video/cut-sound';

const FIELD =
  'w-20 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

/**
 * The effects track (M10 T4): sounds placed at a time in the film — a door slam, a phone buzz —
 * each with its level and mute, played in the monitor and mixed by the encode. **+ Sound here**
 * places a file at the playhead; **Make a sound** writes one from words on LTX-2.5 (sound-effect.ts).
 */
export default function CutEffects({
  sound,
  time,
  disabled,
  onChange,
  onSeek,
}: {
  sound: CutSoundOptions | null | undefined;
  /** The playhead (film seconds): where a new sound goes. */
  time: number;
  disabled?: boolean;
  onChange: (id: string, patch: Partial<CutEffect> | null, step?: boolean) => void;
  onSeek: (t: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const [seconds, setSeconds] = useState(SOUND_EFFECT_DEFAULT_SEC);
  const [making, setMaking] = useState<string | null>(null);
  const effects = sound?.effects ?? [];
  const newId = () => `fx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const makeSound = () => {
    const said = words.trim();
    if (!said) return;
    const at = normalizeEffectAt(time);
    setMaking('Starting…');
    setError(null);
    void makeSoundEffectForCut({ words: said, seconds, onProgress: setMaking })
      .then(made => {
        onChange(newId(), { url: made.url, name: made.label, atSec: at }, true);
        setWords('');
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not make that sound.'))
      .finally(() => setMaking(null));
  };
  return (
    <div className="space-y-1.5" data-testid="cut-effects">
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-caption font-medium">Effects</span>
        <span className="type-caption flex-1 text-[var(--text-muted)]">
          {effects.length
            ? `${effects.length} sound${effects.length === 1 ? '' : 's'} placed`
            : 'A door slam, a phone buzz — placed where the playhead is.'}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          data-testid="cut-effect-add"
          title={`Place a sound file at ${formatCutTime(time)}`}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Adding…' : `+ Sound at ${formatCutTime(time)}`}
        </Button>
      </div>
      {/* A sound from words, placed at the playhead when it's made (about a minute). */}
      <div className="flex flex-wrap items-center gap-2" data-testid="cut-effect-make">
        <input
          type="text"
          value={words}
          maxLength={200}
          placeholder="Make a sound: a door slams, rain on a window…"
          aria-label="The sound to make"
          className="min-w-[14rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-sm"
          disabled={disabled || making !== null}
          onChange={event => setWords(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') makeSound();
          }}
          data-testid="cut-effect-make-words"
        />
        <select
          value={seconds}
          aria-label="How long the sound is"
          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 text-sm"
          disabled={disabled || making !== null}
          onChange={event => setSeconds(Number(event.target.value))}
          data-testid="cut-effect-make-seconds"
        >
          {[1, 2, 4, 6, 8].map(value => (
            <option key={value} value={value}>
              {value} s
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || making !== null || !words.trim()}
          title={`Make it on LTX-2.5 (about a minute) and place it at ${formatCutTime(time)}`}
          onClick={makeSound}
          data-testid="cut-effect-make-go"
        >
          {making ? 'Making…' : 'Make it'}
        </Button>
        {making ? (
          <span className="type-caption text-[var(--text-muted)]" role="status">
            {making}
          </span>
        ) : null}
      </div>
      {effects.length ? (
        <ul className="space-y-1">
          {effects.map(effect => (
            <li
              key={effect.id}
              className={`flex flex-wrap items-center gap-2 text-sm ${effect.muted ? 'text-[var(--text-muted)]' : ''}`}
              data-testid={`cut-effect-${effect.id}`}
            >
              <Button
                variant="quiet"
                type="button"
                className="w-36 truncate text-left text-sm font-medium hover:underline"
                title="Go to it"
                onClick={() => onSeek(effect.atSec)}
              >
                {effect.name || 'A sound'}
              </Button>
              <label className="type-caption flex items-center gap-1">
                at
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  aria-label={`Where ${effect.name || 'the sound'} starts (seconds into the film)`}
                  className={FIELD}
                  defaultValue={effect.atSec}
                  key={`${effect.id}-${effect.atSec}`}
                  disabled={disabled}
                  data-testid={`cut-effect-at-${effect.id}`}
                  onBlur={event => {
                    const raw = event.target.value.trim();
                    if (!raw || !Number.isFinite(Number(raw))) return;
                    const next = normalizeEffectAt(Number(raw));
                    if (next !== effect.atSec) onChange(effect.id, { atSec: next }, true);
                  }}
                />
                s
              </label>
              <OptionSlider
                label={`${effect.name || 'Sound'} level`}
                value={normalizeEffectLevel(effect.level)}
                min={0}
                max={2}
                step={0.05}
                disabled={disabled}
                onChange={next => onChange(effect.id, { level: next })}
                testId={`cut-effect-level-${effect.id}`}
              />
              <Button
                size="sm"
                variant={effect.muted ? 'secondary' : 'ghost'}
                aria-pressed={Boolean(effect.muted)}
                disabled={disabled}
                title={
                  effect.muted
                    ? 'Unmute: back in the monitor and the cut'
                    : 'Mute: silent here and left out of the cut'
                }
                data-testid={`cut-effect-mute-${effect.id}`}
                onClick={() => onChange(effect.id, { muted: !effect.muted }, true)}
              >
                M
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Remove ${effect.name || 'the sound'}`}
                title="Remove it (Ctrl+Z puts it back)"
                data-testid={`cut-effect-remove-${effect.id}`}
                onClick={() => onChange(effect.id, null, true)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept={FILM_AUDIO_BED_ACCEPT}
        className="hidden"
        data-testid="cut-effect-file"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const at = normalizeEffectAt(time);
          setBusy(true);
          setError(null);
          void resolveFilmAudioBedFromFile(file)
            .then(resolved =>
              onChange(newId(), { url: resolved.url, name: resolved.label, atSec: at }, true)
            )
            .catch(err =>
              setError(err instanceof Error ? err.message : 'Could not use that audio file.')
            )
            .finally(() => setBusy(false));
        }}
      />
      {error ? (
        <p className="type-caption text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
