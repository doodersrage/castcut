'use client';

import FilmCutShotList from '@/components/FilmCutShotList';
import {
  applyCutShotEdits,
  normalizeFilmCutLength,
  type CutShotEdits,
  type FilmCutLength,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import { useEffect, useRef, useState } from 'react';
import type { MixPreview } from '@/lib/film-mix-preview';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film-audio-bed';
import { estimateCutSeconds, requestFilmScore, type FilmScoreBrief } from '@/lib/film-score';
import type { IdentityMark } from '@/lib/identity-mark';
import {
  mixLevelsSummary,
  MUSIC_LEVEL_RANGE,
  normalizeMusicLevel,
  normalizeVoiceLevel,
  VOICE_LEVEL_RANGE,
} from '@/lib/audio-mix-levels';
import {
  FILM_SHAPES,
  filmShapeOf,
  normalizeFilmShape,
  type FilmShape,
} from '@/lib/video-resolution';

export type FilmCutOptionsValue = {
  crossfadeSec: number;
  audioBedUrl: string;
  /** Older toggle: a 9:16 vertical cut. Read when no `shape` was picked (filmShapeOf). */
  vertical?: boolean;
  /** Frame shape: widescreen 16:9, vertical 9:16 or square 1:1. */
  shape?: FilmShape;
  /** Output size: 720p (default) or 1080p. */
  quality?: '720p' | '1080p';
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
  /** Music bed gain, 0–1.5 (1 = as recorded). */
  musicLevel?: number;
  /** Talking clips' lines gain, 0.5–2 (1 = as recorded). */
  voiceLevel?: number;
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
  /** Day mood / theme or Story tone — offers "Score this film" (an original track, ACE-Step). */
  scoreBrief?: FilmScoreBrief;
  /** Face match mark per shot in the shot list (identity-mark.ts). */
  identityFor?: (shot: KeyedShot) => IdentityMark | null;
};

/** Crossfade, shape and size, and audio bed for Day/Story/Cast Cut (upload or URL). */
export default function FilmCutOptionsControls({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'film-cut',
  shots,
  scoreBrief,
  identityFor,
}: FilmCutOptionsControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scoring, setScoring] = useState(false);
  const score = async () => {
    if (!scoreBrief) return;
    setScoring(true);
    setUploadError(null);
    try {
      const kept = (shots ?? []).filter(
        shot => value.shotEdits?.shots?.[shot.key]?.include !== false
      );
      const track = await requestFilmScore({
        brief: scoreBrief,
        cutSeconds: estimateCutSeconds(kept, {
          crossfadeSec: value.crossfadeSec,
          length: value.length,
        }),
      });
      onChange({ ...value, audioBedUrl: track.url, audioBedName: track.label });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not score the film.');
    } finally {
      setScoring(false);
    }
  };
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
          <span>Shape</span>
          <select
            disabled={disabled}
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={filmShapeOf(value)}
            onChange={event => {
              const shape = normalizeFilmShape(event.target.value);
              onChange({ ...value, shape, vertical: shape === 'vertical' });
            }}
            data-testid={`${testIdPrefix}-shape`}
          >
            {FILM_SHAPES.map(shape => (
              <option key={shape.id} value={shape.id}>
                {shape.label} · {shape.hint}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Size</span>
          <select
            disabled={disabled}
            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={value.quality === '1080p' ? '1080p' : '720p'}
            onChange={event =>
              onChange({ ...value, quality: event.target.value === '1080p' ? '1080p' : '720p' })
            }
            data-testid={`${testIdPrefix}-quality`}
          >
            <option value="720p">720p · smaller file</option>
            <option value="1080p">1080p · sharper</option>
          </select>
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
          identityFor={identityFor}
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
          {scoreBrief ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled || uploadBusy || scoring}
              loading={scoring}
              loadingLabel="Scoring"
              title="An original instrumental in the film's mood, sized to the cut (ACE-Step 1.5 in ComfyUI)"
              onClick={() => void score()}
              data-testid={`${testIdPrefix}-score`}
            >
              {hasBed ? 'Score it again' : 'Score this film'}
            </Button>
          ) : null}
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
        <SoundMixControls
          value={value}
          onChange={onChange}
          disabled={disabled || uploadBusy}
          hasBed={hasBed}
          hasLines={Boolean(shots?.some(shot => shot.kind === 'clip'))}
          testIdPrefix={testIdPrefix}
          shots={shots}
        />
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
    filmShapeOf(value) === 'vertical' ? 'vertical 9:16' : '',
    filmShapeOf(value) === 'square' ? 'square 1:1' : '',
    value.quality === '1080p' ? '1080p' : '',
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
    Object.values(value.shotEdits?.shots ?? {}).some(
      edit => (edit.trimStartSec ?? 0) > 0 || (edit.trimEndSec ?? 0) > 0
    )
      ? 'clips trimmed'
      : '',
    value.shotEdits?.poster ? 'poster picked' : '',
    Object.values(value.shotEdits?.shots ?? {}).some(
      edit => edit.framing === 'medium' || edit.framing === 'close'
    )
      ? 'stills framed'
      : '',
    mixLevelsSummary(value.musicLevel, value.voiceLevel),
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
  scoreBrief,
  identityFor,
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
          scoreBrief={scoreBrief}
          identityFor={identityFor}
        />
      </div>
    </details>
  );
}

/**
 * Sound mix: how loud the music bed and the talking clips' lines sit (the music still ducks
 * under every line). The server encode mixes sound; the browser fallback cuts picture only.
 */
function SoundMixControls({
  value,
  onChange,
  disabled,
  hasBed,
  hasLines,
  testIdPrefix,
  shots,
}: {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled: boolean;
  hasBed: boolean;
  hasLines: boolean;
  testIdPrefix: string;
  /** The cut's shots (before edits) — Preview the mix plays their lines with the music. */
  shots?: KeyedShot[];
}) {
  const previewRef = useRef<MixPreview | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  useEffect(() => () => previewRef.current?.stop(), []);
  if (!hasBed && !hasLines) return null;
  const togglePreview = async () => {
    if (previewRef.current) {
      previewRef.current.stop();
      previewRef.current = null;
      setPreviewState('idle');
      return;
    }
    setPreviewState('loading');
    setPreviewNote(null);
    try {
      const { playMixPreview } = await import('@/lib/film-mix-preview');
      const preview = await playMixPreview({
        shots: applyCutShotEdits(shots ?? [], value.shotEdits),
        audioBedUrl: value.audioBedUrl,
        crossfadeSec: value.crossfadeSec,
        titleCard: value.titles === true,
        musicLevel: value.musicLevel,
        voiceLevel: value.voiceLevel,
        onEnded: () => {
          previewRef.current = null;
          setPreviewState('idle');
        },
      });
      previewRef.current = preview;
      setPreviewState('playing');
      setPreviewNote(
        `${Math.round(preview.totalSec)} s · ${preview.lines} line${preview.lines === 1 ? '' : 's'}`
      );
    } catch (error) {
      setPreviewState('idle');
      setPreviewNote(error instanceof Error ? error.message : 'Could not play the mix.');
    }
  };
  const music = normalizeMusicLevel(value.musicLevel);
  const voice = normalizeVoiceLevel(value.voiceLevel);
  const slider =
    'h-2 w-32 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1"
      data-testid={`${testIdPrefix}-mix`}
    >
      {hasBed ? (
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Music</span>
          <input
            type="range"
            min={MUSIC_LEVEL_RANGE.min}
            max={MUSIC_LEVEL_RANGE.max}
            step={0.05}
            disabled={disabled}
            className={slider}
            value={music}
            aria-valuetext={`${Math.round(music * 100)}%`}
            onChange={event => onChange({ ...value, musicLevel: Number(event.target.value) })}
            data-testid={`${testIdPrefix}-music-level`}
          />
          <span className="w-10 tabular-nums">{Math.round(music * 100)}%</span>
        </label>
      ) : null}
      {hasLines ? (
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Lines</span>
          <input
            type="range"
            min={VOICE_LEVEL_RANGE.min}
            max={VOICE_LEVEL_RANGE.max}
            step={0.05}
            disabled={disabled}
            className={slider}
            value={voice}
            aria-valuetext={`${Math.round(voice * 100)}%`}
            onChange={event => onChange({ ...value, voiceLevel: Number(event.target.value) })}
            data-testid={`${testIdPrefix}-voice-level`}
          />
          <span className="w-10 tabular-nums">{Math.round(voice * 100)}%</span>
        </label>
      ) : null}
      <button
        type="button"
        className="type-caption rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        disabled={disabled || previewState === 'loading'}
        onClick={() => void togglePreview()}
        data-testid={`${testIdPrefix}-mix-preview`}
      >
        {previewState === 'playing'
          ? '■ Stop'
          : previewState === 'loading'
            ? 'Loading the mix…'
            : '▶ Preview the mix'}
      </button>
      {previewNote ? (
        <span
          className="type-caption text-[var(--text-muted)]"
          data-testid={`${testIdPrefix}-mix-preview-note`}
        >
          {previewNote}
        </span>
      ) : null}
      {music !== 1 || voice !== 1 ? (
        <button
          type="button"
          className="type-caption text-[var(--text-muted)] underline-offset-2 hover:underline"
          disabled={disabled}
          onClick={() => onChange({ ...value, musicLevel: undefined, voiceLevel: undefined })}
          data-testid={`${testIdPrefix}-mix-reset`}
        >
          Reset levels
        </button>
      ) : null}
    </div>
  );
}
