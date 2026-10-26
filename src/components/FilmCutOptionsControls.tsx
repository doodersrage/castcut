'use client';

import { CutLogoControl } from '@/components/cut/CutOverlayControls';
import CutSoundControls from '@/components/cut/CutSoundControls';
import type { CutSoundOptions } from '@/lib/video/cut-sound';
import {
  FILM_LOOKS,
  normalizeFilmLook,
  normalizeLookStrength,
  type FilmLook,
} from '@/lib/video/cut-look';
import FilmCutShotList from '@/components/FilmCutShotList';
import FilmCutPreviewPlayer from '@/components/FilmCutPreviewPlayer';
import type { FilmTitleCard } from '@/lib/video/polish';
import {
  applyCutShotEdits,
  normalizeFilmCutLength,
  type CutShotEdits,
  type FilmCutLength,
  type KeyedShot,
} from '@/lib/film/cut-plan';
import { useEffect, useRef, useState } from 'react';
import type { MixPreview } from '@/lib/film/mix-preview';
import {
  OptionGroup,
  OptionRow,
  OptionSegments,
  OptionSlider,
  OptionSwitch,
  optionSelectClass,
} from '@/components/cut/CutOptionParts';
import { Button } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { FILM_AUDIO_BED_ACCEPT, resolveFilmAudioBedFromFile } from '@/lib/film/audio-bed';
import { estimateCutSeconds, requestFilmScore, type FilmScoreBrief } from '@/lib/film/score';
import type { IdentityMark } from '@/lib/character/identity-mark';
import {
  mixLevelsSummary,
  MUSIC_LEVEL_RANGE,
  normalizeMusicLevel,
  normalizeVoiceLevel,
  VOICE_LEVEL_RANGE,
} from '@/lib/audio/mix-levels';
import { FILM_SHAPES, filmShapeOf, type FilmShape } from '@/lib/video/resolution';

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
  /** What is said in each clip (else its narration) burned in at the bottom — default on. */
  subtitles?: boolean;
  /** How long the cut runs: as the shots hold, fit to the music, or 15 / 30 / 60 s. */
  length?: FilmCutLength;
  /** Land still cuts on the music's beat (needs an audio bed). */
  beatSnap?: boolean;
  /** Day episodes: open with a few shots of the last episode (default on when there is one). */
  previouslyOn?: boolean;
  /** Story: each scene's first sentence read as a voice-over over its shot (story-film.ts). */
  narrate?: boolean;
  /** Story: stills widened to 16:9 for a widescreen cut (film-widen-client.ts). */
  widen?: boolean;
  /** Day / Story shot list: order, leave-outs, captions, holds. */
  shotEdits?: CutShotEdits;
  /** Music bed gain, 0–1.5 (1 = as recorded). */
  musicLevel?: number;
  /** Talking clips' lines gain, 0.5–2 (1 = as recorded). */
  voiceLevel?: number;
  /** The film's colour look (cut-look.ts); unset = as shot. */
  look?: FilmLook;
  /** How strong the look is, 0–1 (default 1). */
  lookStrength?: number;
  /** Match each shot's colour to the film's — default on (unset = on). */
  matchShots?: boolean;
  /** Vertical / square: the crop follows the face — default on (unset = on). */
  followFaces?: boolean;
  /** Clips under 25 fps get RIFE in-between frames (slower cut); a light sharpen. */
  smoothMotion?: boolean;
  sharpen?: boolean;
  /** A logo / watermark over the whole film (cut-overlay.ts). */
  logoUrl?: string;
  logoName?: string;
  logoCorner?: 'tl' | 'tr' | 'bl' | 'br';
  /** Music start / fades and the ambience track (cut-sound.ts). */
  sound?: CutSoundOptions;
  /** The export profile last applied (film/export-profiles.ts, M4 F6). */
  exportProfile?: 'review' | 'master' | 'vertical' | 'square';
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
  /** The season has an earlier episode — offer "Previously on". */
  previouslyAvailable?: boolean;
  /** Story: offer "Narrate the story" and "Widen stills to 16:9". */
  storyExtras?: boolean;
  /** Face match mark per shot in the shot list (identity-mark.ts). */
  identityFor?: (shot: KeyedShot) => IdentityMark | null;
  /** The title card the cut opens on (shown in Preview the cut). */
  previewTitleCard?: FilmTitleCard | null;
  /**
   * Narration lines the cut has but the preview can't play yet (not recorded): offer to record
   * them, so the preview plays the whole mix. Cut film reuses the recordings.
   */
  narrationToRecord?: { lines: number; record: () => Promise<void> };
  /**
   * false: options only — the page shows the preview and the shot list itself (Cut). The shots
   * still feed Score this film and the mix preview.
   */
  withShotPanels?: boolean;
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
  previewTitleCard,
  previouslyAvailable = false,
  storyExtras = false,
  narrationToRecord,
  withShotPanels = true,
}: FilmCutOptionsControlsProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [recording, setRecording] = useState(false);
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
  const [linkOpen, setLinkOpen] = useState(
    () =>
      Boolean(value.audioBedUrl.trim()) &&
      !value.audioBedUrl.startsWith('data:') &&
      !value.audioBedName
  );
  const hasBed = Boolean(value.audioBedUrl.trim());

  const shape = filmShapeOf(value);
  const look = normalizeFilmLook(value.look);
  const lookLabel = FILM_LOOKS.find(entry => entry.id === look)?.label ?? 'As shot';
  const lengthLabel =
    value.length === 'music'
      ? 'fit to music'
      : typeof value.length === 'number'
        ? `${value.length} s`
        : 'as the shots hold';
  const groupKey = (name: string) => `cut-options:${testIdPrefix}:${name}`;
  const join = (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' · ');
  const crossfades = [0, 0.3, 0.6, 1];
  const crossfadeOptions = [
    ...crossfades.map(sec => ({
      id: String(sec),
      label: sec === 0 ? 'Cut' : `${sec} s`,
      hint: sec === 0 ? 'Hard cuts between shots' : `Shots fade into each other over ${sec} s`,
    })),
    ...(crossfades.includes(value.crossfadeSec)
      ? []
      : [{ id: String(value.crossfadeSec), label: `${value.crossfadeSec} s` }]),
  ];
  const hasClips = Boolean(shots?.some(shot => shot.kind === 'clip'));

  return (
    <div className="cut-opt-panel" data-testid={`${testIdPrefix}-options`}>
      <OptionGroup
        title="Format"
        summary={join(
          FILM_SHAPE_SHORT[shape],
          value.quality === '1080p' ? '1080p' : '720p',
          lengthLabel
        )}
        defaultOpen
        persistKey={groupKey('format')}
        testId={`${testIdPrefix}-options-format`}
      >
        <OptionRow label="Shape">
          <OptionSegments
            label="Shape"
            options={FILM_SHAPES.map(entry => ({
              id: entry.id,
              label: FILM_SHAPE_NAME[entry.id],
              hint: `${entry.label} · ${entry.hint}`,
            }))}
            value={shape}
            disabled={disabled}
            onChange={next => onChange({ ...value, shape: next, vertical: next === 'vertical' })}
            testId={`${testIdPrefix}-shape`}
          />
        </OptionRow>
        <OptionRow label="Size">
          <OptionSegments
            label="Size"
            options={[
              { id: '720p', label: '720p', hint: 'Smaller file' },
              { id: '1080p', label: '1080p', hint: 'Sharper, larger file' },
            ]}
            value={value.quality === '1080p' ? '1080p' : '720p'}
            disabled={disabled}
            onChange={next => onChange({ ...value, quality: next })}
            testId={`${testIdPrefix}-quality`}
          />
        </OptionRow>
        <OptionRow label="Length" htmlFor={`${testIdPrefix}-length`}>
          <select
            id={`${testIdPrefix}-length`}
            disabled={disabled}
            className={optionSelectClass}
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
            <option value="music" disabled={!hasBed}>
              Fit to the music{hasBed ? '' : ' (add music)'}
            </option>
            <option value="15">15 s</option>
            <option value="30">30 s</option>
            <option value="60">60 s</option>
          </select>
        </OptionRow>
        {shape !== 'wide' ? (
          <OptionSwitch
            label="Follow faces"
            note="Crop around the face, not the centre"
            checked={value.followFaces !== false}
            disabled={disabled}
            onChange={next => onChange({ ...value, followFaces: next })}
            testId={`${testIdPrefix}-follow-faces`}
          />
        ) : null}
      </OptionGroup>

      <OptionGroup
        title="Picture"
        summary={join(
          look === 'none' ? 'as shot' : `${lookLabel.toLowerCase()} look`,
          value.matchShots !== false && 'matched',
          value.stillMotion !== false && 'slow zoom',
          value.smoothMotion && 'smooth',
          value.sharpen && 'sharpened'
        )}
        persistKey={groupKey('picture')}
        testId={`${testIdPrefix}-options-picture`}
      >
        <OptionRow label="Look" htmlFor={`${testIdPrefix}-look`}>
          <select
            id={`${testIdPrefix}-look`}
            disabled={disabled}
            className={optionSelectClass}
            value={look}
            onChange={event => onChange({ ...value, look: normalizeFilmLook(event.target.value) })}
            data-testid={`${testIdPrefix}-look`}
          >
            {FILM_LOOKS.map(entry => (
              <option key={entry.id} value={entry.id} title={entry.hint}>
                {entry.label}
              </option>
            ))}
          </select>
        </OptionRow>
        {look !== 'none' ? (
          <OptionRow label="Strength">
            <OptionSlider
              label="Look strength"
              value={normalizeLookStrength(value.lookStrength)}
              min={0}
              max={1}
              step={0.05}
              disabled={disabled}
              onChange={next => onChange({ ...value, lookStrength: next })}
              testId={`${testIdPrefix}-look-strength`}
            />
          </OptionRow>
        ) : null}
        <OptionSwitch
          label="Match shots"
          note="Even out colour and light between shots"
          hint="Each shot's colour and exposure moved toward the film's own, so shots made separately cut together as one film (a night shot stays night)"
          checked={value.matchShots !== false}
          disabled={disabled}
          onChange={next => onChange({ ...value, matchShots: next })}
          testId={`${testIdPrefix}-match-shots`}
        />
        <OptionSwitch
          label="Slow zoom on stills"
          checked={value.stillMotion !== false}
          disabled={disabled}
          onChange={next => onChange({ ...value, stillMotion: next })}
          testId={`${testIdPrefix}-still-motion`}
        />
        <OptionSwitch
          label="Smooth motion"
          note="Draws in-between frames · ~10 s a clip"
          hint="Clips made at 16 or 24 fps get the frames in between drawn (RIFE in ComfyUI), so motion is smooth instead of stepping"
          checked={value.smoothMotion === true}
          disabled={disabled}
          onChange={next => onChange({ ...value, smoothMotion: next })}
          testId={`${testIdPrefix}-smooth-motion`}
        />
        <OptionSwitch
          label="Sharpen"
          hint="A light sharpen over the finished film — crisper on a phone, nothing invented"
          checked={value.sharpen === true}
          disabled={disabled}
          onChange={next => onChange({ ...value, sharpen: next })}
          testId={`${testIdPrefix}-sharpen`}
        />
      </OptionGroup>

      <OptionGroup
        title="Timing"
        summary={join(
          value.crossfadeSec > 0 ? `${value.crossfadeSec} s crossfades` : 'hard cuts',
          value.beatSnap && hasBed && 'on the beat',
          previouslyAvailable && value.previouslyOn !== false && 'previously on'
        )}
        persistKey={groupKey('timing')}
        testId={`${testIdPrefix}-options-timing`}
      >
        <OptionRow label="Crossfade">
          <OptionSegments
            label="Crossfade"
            options={crossfadeOptions}
            value={String(value.crossfadeSec)}
            disabled={disabled}
            onChange={next =>
              onChange({ ...value, crossfadeSec: Math.min(2, Math.max(0, Number(next) || 0)) })
            }
            testId={`${testIdPrefix}-crossfade`}
          />
        </OptionRow>
        <OptionSwitch
          label="Cut on the beat"
          note={hasBed ? undefined : 'Add music under Sound first'}
          checked={value.beatSnap === true && hasBed}
          disabled={disabled || !hasBed}
          onChange={next => onChange({ ...value, beatSnap: next })}
          testId={`${testIdPrefix}-beat-snap`}
        />
        {previouslyAvailable ? (
          <OptionSwitch
            label="Previously on"
            note="Open with three shots of the last episode"
            checked={value.previouslyOn !== false}
            disabled={disabled}
            onChange={next => onChange({ ...value, previouslyOn: next })}
            testId={`${testIdPrefix}-previously-on`}
          />
        ) : null}
      </OptionGroup>

      <OptionGroup
        title="Sound"
        summary={join(
          hasBed ? `music: ${bedLabel || 'a track'}` : 'no music',
          value.sound?.ambienceUrl?.trim() && 'ambience'
        )}
        defaultOpen
        persistKey={groupKey('sound')}
        testId={`${testIdPrefix}-options-sound`}
      >
        <OptionRow label="Music">
          <span
            className="min-w-0 flex-1 truncate type-caption text-[var(--text-primary)]"
            data-testid={hasBed ? `${testIdPrefix}-audio-bed-status` : undefined}
            title={bedLabel || undefined}
          >
            {hasBed
              ? bedLabel ||
                (value.audioBedUrl.startsWith('data:') ? 'Uploaded audio' : 'From a link')
              : 'None'}
          </span>
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
              Remove
            </Button>
          ) : null}
        </OptionRow>
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
            {hasBed ? 'Change music' : 'Upload music'}
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
          <Button
            variant="quiet"
            type="button"
            className="type-caption hover:underline"
            onClick={() => setLinkOpen(open => !open)}
            data-testid={`${testIdPrefix}-audio-bed-link`}
          >
            {linkOpen ? 'Hide link' : 'Use a link'}
          </Button>
        </ToolActionRow>
        {linkOpen ? (
          <input
            type="url"
            disabled={disabled || uploadBusy}
            placeholder="https://… or /api/gallery/media/…"
            aria-label="Music link"
            className={optionSelectClass}
            value={value.audioBedUrl.startsWith('data:') ? '' : value.audioBedUrl}
            onChange={event =>
              onChange({ ...value, audioBedUrl: event.target.value, audioBedName: undefined })
            }
            data-testid={`${testIdPrefix}-audio-bed`}
          />
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept={FILM_AUDIO_BED_ACCEPT}
          className="hidden"
          data-testid={`${testIdPrefix}-audio-bed-file`}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setUploadBusy(true);
            setUploadError(null);
            void resolveFilmAudioBedFromFile(file)
              .then(resolved => {
                onChange({ ...value, audioBedUrl: resolved.url, audioBedName: resolved.label });
              })
              .catch(err => {
                setUploadError(
                  err instanceof Error ? err.message : 'Could not use that audio file.'
                );
              })
              .finally(() => setUploadBusy(false));
          }}
        />
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
          hasLines={hasClips}
          testIdPrefix={testIdPrefix}
          shots={shots}
        />
        <CutSoundControls
          value={value}
          onChange={onChange}
          disabled={disabled || uploadBusy}
          hasBed={hasBed}
          testIdPrefix={testIdPrefix}
        />
      </OptionGroup>

      <OptionGroup
        title="Text & logo"
        summary={
          join(
            value.subtitles !== false && 'subtitles',
            value.titles && 'title & captions',
            value.logoUrl?.trim() && 'logo'
          ) || 'none'
        }
        persistKey={groupKey('text')}
        testId={`${testIdPrefix}-options-text`}
      >
        <OptionSwitch
          label="Subtitles"
          note="What is said, timed to the speech"
          hint="What is said in each clip, else its narration, at the bottom of the picture — for viewers watching with the sound off"
          checked={value.subtitles !== false}
          disabled={disabled}
          onChange={next => onChange({ ...value, subtitles: next })}
          testId={`${testIdPrefix}-subtitles`}
        />
        <OptionSwitch
          label="Title & captions"
          note="A title card and a caption per shot"
          checked={value.titles === true}
          disabled={disabled}
          onChange={next => onChange({ ...value, titles: next })}
          testId={`${testIdPrefix}-titles`}
        />
        <CutLogoControl
          value={value}
          onChange={onChange}
          disabled={disabled}
          testIdPrefix={testIdPrefix}
        />
      </OptionGroup>

      {storyExtras ? (
        <OptionGroup
          title="Story"
          summary={
            join(value.narrate && 'narrated', value.widen && shape === 'wide' && 'widened') || 'off'
          }
          persistKey={groupKey('story')}
          testId={`${testIdPrefix}-options-story`}
        >
          <OptionSwitch
            label="Narrate the story"
            note="Each scene's first line, read over it"
            checked={value.narrate === true}
            disabled={disabled}
            onChange={next => onChange({ ...value, narrate: next })}
            testId={`${testIdPrefix}-narrate`}
          />
          {shape === 'wide' ? (
            <OptionSwitch
              label="Widen stills to 16:9"
              note="Portrait stills continued to the sides"
              checked={value.widen === true}
              disabled={disabled}
              onChange={next => onChange({ ...value, widen: next })}
              testId={`${testIdPrefix}-widen`}
            />
          ) : null}
        </OptionGroup>
      ) : null}

      {withShotPanels && shots && shots.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {previewOpen ? (
            <FilmCutPreviewPlayer
              shots={shots}
              value={value}
              titleCard={previewTitleCard}
              testIdPrefix={testIdPrefix}
              onClose={() => setPreviewOpen(false)}
            />
          ) : (
            <ToolActionRow>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || recording}
                title="Play the cut as it will come out — holds, trims, framing, crossfades, captions, music, lines and narration"
                onClick={() => setPreviewOpen(true)}
                data-testid={`${testIdPrefix}-preview-open`}
              >
                ▶ Preview the cut
              </Button>
              {narrationToRecord && narrationToRecord.lines > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || recording}
                  title="Record the voice-over lines now, so the preview plays them (Cut film uses the same recordings)"
                  onClick={() => {
                    setRecording(true);
                    void narrationToRecord.record().finally(() => setRecording(false));
                  }}
                  data-testid={`${testIdPrefix}-preview-record-narration`}
                >
                  {recording
                    ? 'Recording narration…'
                    : `Record narration to hear it (${narrationToRecord.lines} line${narrationToRecord.lines === 1 ? '' : 's'})`}
                </Button>
              ) : null}
            </ToolActionRow>
          )}
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
        </div>
      ) : null}
    </div>
  );
}

/** Shape names for the segmented control (the ratio is in its tooltip and the summary). */
const FILM_SHAPE_NAME: Record<FilmShape, string> = {
  wide: 'Wide',
  vertical: 'Vertical',
  square: 'Square',
};

/** Short shape names for the summaries. */
const FILM_SHAPE_SHORT: Record<FilmShape, string> = {
  wide: 'Wide 16:9',
  vertical: 'Vertical 9:16',
  square: 'Square 1:1',
};

/** One-line summary of the non-default cut options, e.g. "slow zoom · crossfade 0.5s · titles". */
export function filmCutOptionsSummary(value: FilmCutOptionsValue): string {
  const parts = [
    filmShapeOf(value) === 'vertical' ? 'vertical 9:16' : '',
    filmShapeOf(value) === 'square' ? 'square 1:1' : '',
    value.quality === '1080p' ? '1080p' : '',
    value.crossfadeSec > 0 ? `crossfade ${value.crossfadeSec}s` : '',
    value.stillMotion !== false ? 'slow zoom' : 'no zoom',
    normalizeFilmLook(value.look) !== 'none'
      ? `${FILM_LOOKS.find(look => look.id === normalizeFilmLook(value.look))?.label.toLowerCase()} look`
      : '',
    value.matchShots === false ? 'shots unmatched' : '',
    filmShapeOf(value) !== 'wide' && value.followFaces === false ? 'centre crop' : '',
    value.titles ? 'titles' : '',
    value.subtitles === false ? 'no subtitles' : '',
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
  previewTitleCard,
  previouslyAvailable = false,
  storyExtras = false,
  narrationToRecord,
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
          previewTitleCard={previewTitleCard}
          previouslyAvailable={previouslyAvailable}
          storyExtras={storyExtras}
          narrationToRecord={narrationToRecord}
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
      const { playMixPreview } = await import('@/lib/film/mix-preview');
      const preview = await playMixPreview({
        shots: applyCutShotEdits(shots ?? [], value.shotEdits),
        audioBedUrl: value.audioBedUrl,
        crossfadeSec: value.crossfadeSec,
        titleCard: value.titles === true,
        musicLevel: value.musicLevel,
        voiceLevel: value.voiceLevel,
        muteMusic: value.sound?.mutedTracks?.includes('music'),
        muteLines: value.sound?.mutedTracks?.includes('clips'),
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
  return (
    <div className="grid gap-2" data-testid={`${testIdPrefix}-mix`}>
      {hasBed ? (
        <OptionRow label="Music level">
          <OptionSlider
            label="Music level"
            value={music}
            min={MUSIC_LEVEL_RANGE.min}
            max={MUSIC_LEVEL_RANGE.max}
            step={0.05}
            disabled={disabled}
            onChange={next => onChange({ ...value, musicLevel: next })}
            testId={`${testIdPrefix}-music-level`}
          />
        </OptionRow>
      ) : null}
      {hasLines ? (
        <OptionRow
          label="Lines level"
          hint="How loud what is said in the clips sits; the music ducks under it"
        >
          <OptionSlider
            label="Lines level"
            value={voice}
            min={VOICE_LEVEL_RANGE.min}
            max={VOICE_LEVEL_RANGE.max}
            step={0.05}
            disabled={disabled}
            onChange={next => onChange({ ...value, voiceLevel: next })}
            testId={`${testIdPrefix}-voice-level`}
          />
        </OptionRow>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          variant="outline"
          type="button"
          className="type-caption rounded-[var(--radius-sm)] border-[var(--border-subtle)] px-2 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          disabled={disabled || previewState === 'loading'}
          onClick={() => void togglePreview()}
          data-testid={`${testIdPrefix}-mix-preview`}
        >
          {previewState === 'playing'
            ? '■ Stop'
            : previewState === 'loading'
              ? 'Loading the mix…'
              : '▶ Preview the mix'}
        </Button>
        {previewNote ? (
          <span
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-mix-preview-note`}
          >
            {previewNote}
          </span>
        ) : null}
        {music !== 1 || voice !== 1 ? (
          <Button
            variant="underline"
            type="button"
            className="type-caption text-[var(--text-muted)]"
            disabled={disabled}
            onClick={() => onChange({ ...value, musicLevel: undefined, voiceLevel: undefined })}
            data-testid={`${testIdPrefix}-mix-reset`}
          >
            Reset levels
          </Button>
        ) : null}
      </div>
    </div>
  );
}
