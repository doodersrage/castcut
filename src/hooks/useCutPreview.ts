'use client';

/**
 * The cut, played in the browser before anything is encoded: the shots as the encode puts them
 * together — order, holds (fitted to the music / length), clip trims, framing, slow zoom,
 * crossfades, captions and the title card, in the cut's shape — with the music, the lines and
 * the narration at their levels (the music ducks under both). The same timing and drawing as the
 * encodes (film-cut-preview.ts, cut-canvas-draw.ts).
 *
 * `live`: the cut is rebuilt a moment after it changes (the Cut page's monitor), keeping the
 * playhead; pictures and clips are kept by URL between builds, so a rebuild is quick.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { normalizeMusicLevel, normalizeVoiceLevel } from '@/lib/audio-mix-levels';
import { drawCaption, drawContain, drawCover, drawTitleCard } from '@/lib/cut-canvas-draw';
import { frameCutStills, prepareCutShots } from '@/lib/film-cut-media';
import { applyCutShotEdits, type KeyedShot } from '@/lib/film-cut-plan';
import { previewFrameAt, previewTimeline, type PreviewTimeline } from '@/lib/film-cut-preview';
import type { FilmPlaylistShot } from '@/lib/media-kind';
import { captionOpacity, stillMotionZoom, type FilmTitleCard } from '@/lib/video-polish';
import { filmShapeOf } from '@/lib/video-resolution';

/** Canvas size per shape — small, the preview is for judging the edit, not the pixels. */
export const CUT_PREVIEW_CANVAS = {
  wide: { width: 640, height: 360 },
  vertical: { width: 360, height: 640 },
  square: { width: 480, height: 480 },
} as const;

/** The music under a line, like the encode's ducking (film-mix-preview PREVIEW_DUCK). */
const DUCK = 0.35;

/** How long the monitor waits after an edit before rebuilding the cut. */
const LIVE_REBUILD_MS = 450;

export type CutPreviewLoaded = {
  timeline: PreviewTimeline;
  shots: FilmPlaylistShot[];
  /** The shot list key of each prepared shot (timeline item `shot` → key). */
  keys: Array<string | null>;
  /** Each clip's full length (null for stills / unknown) — the trim handles' limit. */
  clipSecs: Array<number | null>;
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

/** What a build depends on — a change rebuilds the live preview. */
function buildSignature(shots: KeyedShot[], value: FilmCutOptionsValue, titles: boolean): string {
  return JSON.stringify({
    shots: shots.map(shot => [
      shot.key,
      shot.url,
      shot.kind,
      shot.holdSec,
      shot.caption,
      shot.narrationUrl,
    ]),
    edits: value.shotEdits,
    length: value.length,
    beatSnap: value.beatSnap,
    bed: value.audioBedUrl,
    crossfade: value.crossfadeSec,
    titles,
  });
}

export function useCutPreview(input: {
  shots: KeyedShot[];
  value: FilmCutOptionsValue;
  titleCard?: FilmTitleCard | null;
  /** Rebuild after edits (the Cut page's monitor); otherwise built once. */
  live?: boolean;
}) {
  const { shots, value, titleCard, live = false } = input;
  const shape = filmShapeOf(value);
  const size = CUT_PREVIEW_CANVAS[shape];
  const titles = value.titles === true;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState<CutPreviewLoaded | null>(null);
  const [building, setBuilding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const clock = useRef<{ startedAt: number; from: number } | null>(null);
  const timeRef = useRef(0);
  const mediaRef = useRef<Media>({
    images: new Map(),
    videos: new Map(),
    voices: new Map(),
    bed: null,
  });
  // Kept by URL between builds: a rebuild after an edit reuses what is loaded.
  const imageCache = useRef(new Map<string, Promise<HTMLImageElement>>());
  const videoCache = useRef(new Map<string, Promise<HTMLVideoElement>>());
  const audioCache = useRef(new Map<string, Promise<HTMLAudioElement | null>>());
  const bedRef = useRef<{ url: string; audio: HTMLAudioElement } | null>(null);

  const signature = useMemo(() => buildSignature(shots, value, titles), [shots, value, titles]);
  const builtOnce = useRef(false);

  useEffect(() => {
    if (!live && builtOnce.current) return;
    builtOnce.current = true;
    let cancelled = false;
    setBuilding(true);
    const run = async () => {
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
            if (shot.kind === 'clip') {
              let pending = videoCache.current.get(shot.url);
              if (!pending) {
                pending = loadVideo(shot.url);
                videoCache.current.set(shot.url, pending);
                pending.catch(() => videoCache.current.delete(shot.url));
              }
              videos.set(index, await pending);
            } else {
              let pending = imageCache.current.get(shot.url);
              if (!pending) {
                pending = loadImage(shot.url);
                imageCache.current.set(shot.url, pending);
                pending.catch(() => imageCache.current.delete(shot.url));
              }
              images.set(index, await pending);
            }
          })
        );
        // A line that will not load is left out, as the encode leaves it out.
        const voices = new Map<number, HTMLAudioElement>();
        await Promise.all(
          framed.shots.map(async (shot, index) => {
            const url = shot.narrationUrl?.trim();
            if (!url) return;
            let pending = audioCache.current.get(url);
            if (!pending) {
              pending = loadAudio(url).catch(() => null);
              audioCache.current.set(url, pending);
            }
            const audio = await pending;
            if (audio) voices.set(index, audio);
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
        const bedUrl = value.audioBedUrl.trim();
        if (bedRef.current?.url !== bedUrl) {
          bedRef.current?.audio.pause();
          bedRef.current = bedUrl ? { url: bedUrl, audio: new Audio(bedUrl) } : null;
        }
        if (cancelled) return;
        // Whatever a shot no longer uses stops (a clip moved out of the cut).
        for (const [, video] of mediaRef.current.videos) video.pause();
        for (const [, voice] of mediaRef.current.voices) voice.pause();
        mediaRef.current = { images, videos, voices, bed: bedRef.current?.audio ?? null };
        setError(null);
        setLoaded({
          timeline,
          shots: framed.shots,
          keys: framed.shots.map(shot => (shot as KeyedShot).key ?? null),
          clipSecs,
          notes: [...prepared.notes, ...framed.notes],
        });
        // Keep the playhead where it was (inside the new length).
        const t = Math.min(timeRef.current, timeline.totalSec);
        timeRef.current = t;
        setTime(t);
        if (clock.current) clock.current = { startedAt: performance.now(), from: t };
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not load the preview.');
      } finally {
        if (!cancelled) setBuilding(false);
      }
    };
    const timer = window.setTimeout(
      () => void run(),
      builtOnce.current && loaded ? LIVE_REBUILD_MS : 0
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Rebuilt when what the cut depends on changes (signature), live only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live ? signature : '']);

  // Release the media when the preview goes away.
  useEffect(() => {
    const videos = videoCache;
    const media = mediaRef;
    const bed = bedRef;
    return () => {
      for (const pending of videos.current.values()) {
        void pending
          .then(video => {
            video.pause();
            video.removeAttribute('src');
            video.load();
          })
          .catch(() => undefined);
      }
      for (const voice of media.current.voices.values()) voice.pause();
      bed.current?.audio.pause();
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
        clock.current = null;
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

  // The frame under the playhead once (re)built, and when the look changes.
  useEffect(() => {
    if (loaded && !playing) {
      draw(timeRef.current);
      // A clip's frame paints once it has seeked there.
      const timer = window.setTimeout(() => draw(timeRef.current), 150);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [draw, loaded, playing]);

  const play = useCallback(() => {
    if (!loaded) return;
    const from = timeRef.current >= loaded.timeline.totalSec ? 0 : timeRef.current;
    clock.current = { startedAt: performance.now(), from };
    setPlaying(true);
  }, [loaded]);
  const pause = useCallback(() => {
    setPlaying(false);
    clock.current = null;
    syncMedia(timeRef.current, false);
  }, [syncMedia]);
  const seek = useCallback(
    (t: number) => {
      const total = loaded?.timeline.totalSec ?? 0;
      const at = Math.max(0, Math.min(total, t));
      timeRef.current = at;
      setTime(at);
      if (clock.current) clock.current = { startedAt: performance.now(), from: at };
      syncMedia(at, Boolean(clock.current));
      draw(at);
      // A seeked clip paints once its frame is there.
      window.setTimeout(() => draw(at), 120);
    },
    [draw, loaded, syncMedia]
  );
  /** Jump to a shot's start (by its shot list key). */
  const seekToKey = useCallback(
    (key: string) => {
      if (!loaded) return;
      const index = loaded.keys.indexOf(key);
      const item = loaded.timeline.items.find(entry => entry.shot === index);
      if (item) seek(item.startSec + 0.01);
    },
    [loaded, seek]
  );
  /** The shot list key under the playhead. */
  const keyAt = useCallback(
    (t: number): string | null => {
      if (!loaded) return null;
      const on = previewFrameAt(loaded.timeline, t);
      const item = on[on.length - 1]?.item;
      return item && item.shot >= 0 ? (loaded.keys[item.shot] ?? null) : null;
    },
    [loaded]
  );

  return {
    canvasRef,
    size,
    shape,
    loaded,
    building,
    error,
    playing,
    time,
    total: loaded?.timeline.totalSec ?? 0,
    play,
    pause,
    seek,
    seekToKey,
    keyAt,
  };
}

export function formatCutTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
