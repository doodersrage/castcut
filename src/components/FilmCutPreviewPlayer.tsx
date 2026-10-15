'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { drawCaption, drawContain, drawCover, drawTitleCard } from '@/lib/cut-canvas-draw';
import { applyCutShotEdits, type KeyedShot } from '@/lib/film-cut-plan';
import { frameCutStills, prepareCutShots } from '@/lib/film-cut-media';
import { previewFrameAt, previewTimeline, type PreviewTimeline } from '@/lib/film-cut-preview';
import { normalizeMusicLevel, normalizeVoiceLevel } from '@/lib/audio-mix-levels';
import type { FilmPlaylistShot } from '@/lib/media-kind';
import { captionOpacity, stillMotionZoom, type FilmTitleCard } from '@/lib/video-polish';
import { filmShapeOf } from '@/lib/video-resolution';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';

/** Canvas size per shape — small, the preview is for judging the edit, not the pixels. */
const CANVAS = {
  wide: { width: 640, height: 360 },
  vertical: { width: 360, height: 640 },
  square: { width: 480, height: 480 },
} as const;

/** The music under a line, like the encode's ducking (film-mix-preview PREVIEW_DUCK). */
const DUCK = 0.35;

type Loaded = {
  timeline: PreviewTimeline;
  shots: FilmPlaylistShot[];
  notes: string[];
};

/** The loaded pictures, clips, narration and music (mutable media — kept in a ref, not state). */
type Media = {
  images: Map<number, HTMLImageElement>;
  videos: Map<number, HTMLVideoElement>;
  /** Narration by shot: a voice-over from its shot's start, as the encode mixes it. */
  voices: Map<number, HTMLAudioElement>;
  bed: HTMLAudioElement | null;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load a still.'));
    image.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Could not load a clip.'));
    video.src = url;
  });
}

function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.onloadedmetadata = () => resolve(audio);
    audio.onerror = () => reject(new Error('Could not load a narration line.'));
    audio.src = url;
  });
}

function format(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Preview the cut: the shots as the encode will put them together — order, holds (fitted to the
 * music / length), clip trims, waist-up / chest-up framing, slow zoom, crossfades, captions and
 * the title card, in the cut's shape — with the music, the lines and the narration at their
 * levels (the music ducks under both). Built from
 * the same timing and drawing as the encodes (film-cut-preview.ts, cut-canvas-draw.ts).
 */
export default function FilmCutPreviewPlayer({
  shots,
  value,
  titleCard,
  testIdPrefix,
  onClose,
}: {
  shots: KeyedShot[];
  value: FilmCutOptionsValue;
  titleCard?: FilmTitleCard | null;
  testIdPrefix: string;
  onClose: () => void;
}) {
  const shape = filmShapeOf(value);
  const size = CANVAS[shape];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const mediaRef = useRef<Media>({
    images: new Map(),
    videos: new Map(),
    voices: new Map(),
    bed: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const clock = useRef<{ startedAt: number; from: number } | null>(null);
  const timeRef = useRef(0);

  // Load everything the cut needs (the same preparation the encode does).
  useEffect(() => {
    let cancelled = false;
    const titles = value.titles === true;
    void (async () => {
      try {
        const edited = applyCutShotEdits(shots, value.shotEdits);
        if (edited.length === 0) throw new Error('No shots in the cut.');
        const prepared = await prepareCutShots(edited, {
          length: value.length,
          beatSnap: value.beatSnap,
          audioBedUrl: value.audioBedUrl,
          crossfadeSec: value.crossfadeSec,
          titleCard: titles,
          captions: titles,
        });
        const framed = await frameCutStills(prepared.shots);
        const images = new Map<number, HTMLImageElement>();
        const videos = new Map<number, HTMLVideoElement>();
        await Promise.all(
          framed.shots.map(async (shot, index) => {
            if (shot.kind === 'clip') videos.set(index, await loadVideo(shot.url));
            else images.set(index, await loadImage(shot.url));
          })
        );
        // A line that will not load is left out, as the encode leaves it out.
        const voices = new Map<number, HTMLAudioElement>();
        await Promise.all(
          framed.shots.map(async (shot, index) => {
            const url = shot.narrationUrl?.trim();
            if (url) {
              const audio = await loadAudio(url).catch(() => null);
              if (audio) voices.set(index, audio);
            }
          })
        );
        const clipSecs = framed.shots.map((shot, index) => {
          const duration = videos.get(index)?.duration;
          return shot.kind === 'clip' && duration && Number.isFinite(duration) ? duration : null;
        });
        const timeline = previewTimeline({
          shots: framed.shots,
          clipSecs,
          crossfadeSec: value.crossfadeSec,
          titleCard: titles,
          captions: titles,
        });
        const bed = value.audioBedUrl.trim() ? new Audio(value.audioBedUrl) : null;
        if (cancelled) return;
        mediaRef.current = { images, videos, voices, bed };
        setLoaded({ timeline, shots: framed.shots, notes: [...prepared.notes, ...framed.notes] });
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not load the preview.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The preview is built once per opening; reopen it to pick up changed options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the media when the player closes.
  useEffect(() => {
    const media = mediaRef;
    return () => {
      for (const video of media.current.videos.values()) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      for (const voice of media.current.voices.values()) voice.pause();
      media.current.bed?.pause();
    };
  }, []);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !loaded) return;
      context.globalAlpha = 1;
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const fit = shape === 'wide' ? drawContain : drawCover;
      for (const { item, local, alpha } of previewFrameAt(loaded.timeline, t)) {
        context.save();
        context.globalAlpha = alpha;
        if (item.kind === 'title') {
          drawTitleCard(
            context,
            titleCard?.title?.trim() ? titleCard : { title: 'Your film' },
            local,
            canvas.width,
            canvas.height
          );
        } else if (item.kind === 'still') {
          const image = mediaRef.current.images.get(item.shot);
          if (image) {
            const zoom =
              value.stillMotion !== false
                ? stillMotionZoom(item.stillIndex, local / item.durSec)
                : 1;
            fit(
              context,
              image,
              image.naturalWidth,
              image.naturalHeight,
              canvas.width,
              canvas.height,
              zoom
            );
          }
        } else {
          const video = mediaRef.current.videos.get(item.shot);
          if (video && video.readyState >= 2) {
            fit(context, video, video.videoWidth, video.videoHeight, canvas.width, canvas.height);
          }
        }
        if (item.caption) {
          drawCaption(
            context,
            item.caption,
            captionOpacity(local, item.durSec) * alpha,
            canvas.width,
            canvas.height
          );
        }
        context.restore();
      }
    },
    [loaded, shape, titleCard, value.stillMotion]
  );

  /** Keep the clips and the music where the clock is (play / pause / seek). */
  const syncMedia = useCallback(
    (t: number, running: boolean) => {
      if (!loaded) return;
      const on = previewFrameAt(loaded.timeline, t);
      const playingClips = new Set<number>();
      for (const { item, local } of on) {
        if (item.kind !== 'clip') continue;
        const video = mediaRef.current.videos.get(item.shot);
        if (!video) continue;
        playingClips.add(item.shot);
        const target = item.fromSec + local;
        video.volume = Math.min(1, normalizeVoiceLevel(value.voiceLevel));
        if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = target;
        if (running && video.paused && t < loaded.timeline.totalSec)
          void video.play().catch(() => undefined);
        if (!running && !video.paused) video.pause();
      }
      for (const [index, video] of mediaRef.current.videos) {
        if (!playingClips.has(index) && !video.paused) video.pause();
      }
      // Narration: from its shot's start to the line's end (it may run on past the shot).
      let speaking = false;
      for (const shot of mediaRef.current.voices.keys()) {
        const voice = mediaRef.current.voices.get(shot);
        if (!voice) continue;
        const start = loaded.timeline.items.find(item => item.shot === shot)?.startSec;
        const local = start === undefined ? -1 : t - start;
        const length = Number.isFinite(voice.duration) ? voice.duration : 0;
        if (local >= 0 && local < length) {
          speaking = true;
          voice.volume = Math.min(1, normalizeVoiceLevel(value.voiceLevel));
          if (Math.abs(voice.currentTime - local) > 0.3) voice.currentTime = local;
          if (running && voice.paused) void voice.play().catch(() => undefined);
          if (!running && !voice.paused) voice.pause();
        } else if (!voice.paused) {
          voice.pause();
        }
      }
      const bed = mediaRef.current.bed;
      if (bed) {
        const music = Math.min(1, normalizeMusicLevel(value.musicLevel));
        bed.volume = playingClips.size > 0 || speaking ? music * DUCK : music;
        if (Number.isFinite(bed.duration) && t >= bed.duration) {
          bed.pause();
        } else {
          if (Math.abs(bed.currentTime - t) > 0.4) bed.currentTime = t;
          if (running && bed.paused) void bed.play().catch(() => undefined);
          if (!running && !bed.paused) bed.pause();
        }
      }
    },
    [loaded, value.musicLevel, value.voiceLevel]
  );

  // The clock: draw every frame while playing.
  useEffect(() => {
    if (!loaded || !playing) return;
    let frame = 0;
    const tick = () => {
      const started = clock.current;
      if (!started) return;
      const t = started.from + (performance.now() - started.startedAt) / 1000;
      if (t >= loaded.timeline.totalSec) {
        timeRef.current = loaded.timeline.totalSec;
        setTime(loaded.timeline.totalSec);
        setPlaying(false);
        syncMedia(loaded.timeline.totalSec, false);
        draw(loaded.timeline.totalSec);
        return;
      }
      timeRef.current = t;
      setTime(t);
      syncMedia(t, true);
      draw(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, loaded, playing, syncMedia]);

  // First frame once loaded.
  useEffect(() => {
    if (loaded) draw(0);
  }, [draw, loaded]);

  const play = () => {
    if (!loaded) return;
    const from = timeRef.current >= loaded.timeline.totalSec ? 0 : timeRef.current;
    clock.current = { startedAt: performance.now(), from };
    setPlaying(true);
  };
  const pause = () => {
    setPlaying(false);
    syncMedia(timeRef.current, false);
  };
  const seek = (t: number) => {
    timeRef.current = t;
    setTime(t);
    if (playing) clock.current = { startedAt: performance.now(), from: t };
    syncMedia(t, playing);
    // A seeked clip paints once its frame is there.
    window.setTimeout(() => draw(t), 120);
    draw(t);
  };

  const total = loaded?.timeline.totalSec ?? 0;
  const over100 =
    normalizeMusicLevel(value.musicLevel) > 1 || normalizeVoiceLevel(value.voiceLevel) > 1;
  return (
    <div
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2"
      data-testid={`${testIdPrefix}-preview`}
    >
      <div className="flex justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="h-auto max-h-[60vh] w-auto max-w-full"
          aria-label="Preview of the cut"
          data-testid={`${testIdPrefix}-preview-canvas`}
          data-shape={shape}
        />
      </div>
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : !loaded ? (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          Building the preview…
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid={`${testIdPrefix}-preview-play`}
              onClick={playing ? pause : play}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <input
              type="range"
              min={0}
              max={total}
              step={0.05}
              value={Math.min(time, total)}
              aria-label="Preview position"
              aria-valuetext={`${format(time)} of ${format(total)}`}
              className="flex-1 accent-[var(--accent)]"
              data-testid={`${testIdPrefix}-preview-scrub`}
              onChange={event => seek(Number(event.target.value))}
            />
            <span
              className="type-caption tabular-nums text-[var(--text-muted)]"
              data-testid={`${testIdPrefix}-preview-time`}
            >
              {format(time)} / {format(total)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              data-testid={`${testIdPrefix}-preview-close`}
            >
              Close
            </Button>
          </div>
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-preview-notes`}
          >
            {loaded.timeline.items.filter(item => item.kind !== 'title').length} shots ·{' '}
            {format(total)}
            {loaded.notes.length ? ` · ${loaded.notes.join(' · ')}` : ''}
            {over100 ? ' · levels above 100% play at 100% here' : ''}
          </p>
        </>
      )}
    </div>
  );
}
