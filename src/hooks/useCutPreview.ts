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

import { FULL_BOX, containBox, framingPoint, moveAt } from '@/lib/video/cut-move';
import { LOGO_WIDTH, PIP_WIDTH, lowerThirdAlpha } from '@/lib/video/cut-overlay';
import { reframeXAt, type ReframePoint } from '@/lib/video/cut-reframe';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { normalizeMusicLevel, normalizeVoiceLevel } from '@/lib/audio/mix-levels';
import {
  drawCaption,
  drawContain,
  drawCornerPicture,
  drawCover,
  drawLowerThird,
  drawCredits,
  drawTitleCard,
} from '@/lib/video/cut-canvas-draw';
import {
  colourMatrixSvgValues,
  colourStatsFromPixels,
  isIdentityMatrix,
  normalizeFilmLook,
  normalizeLookStrength,
  shotGradeMatrices,
  type ShotGrade,
  type ShotColourStats,
} from '@/lib/video/cut-look';
import {
  cutTrackGain,
  levelKeyGainAt,
  musicFadeGainAt,
  normalizeCutLevelKeys,
  normalizeAmbienceLevel,
  normalizeEffectLevel,
  normalizeMusicStartSec,
  soundOverlap,
  type CutTrack,
} from '@/lib/video/cut-sound';
import { frameCutStills, prepareCutShots } from '@/lib/film/cut-media';
import { applyCutShotEdits, type KeyedShot } from '@/lib/film/cut-plan';
import {
  CREDITS_SHOT,
  previewFrameAt,
  previewTimeline,
  type PreviewTimeline,
} from '@/lib/film/cut-preview';
import type { FilmPlaylistShot } from '@/lib/media/kind';
import { playMetered, resumeCutMeter } from '@/lib/film/cut-meter';
import { loadStoredLut, lutFitMatrix } from '@/lib/video/cut-lut';
import {
  captionOpacity,
  clipMoveZoom,
  creditsDurationSec,
  normalizeFilmCredits,
  stillMotionZoom,
  type FilmTitleCard,
} from '@/lib/video/polish';
import { FILM_PRESET_SIZE, filmResolutionForCutOptions, filmShapeOf } from '@/lib/video/resolution';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';

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
  /** Each prepared shot's colour (cut-look.ts) — the look and the shot match read it. */
  stats: Array<ShotColourStats | null>;
  notes: string[];
};

const STATS_SIZE = 48;

/** A drawn picture's colour (cut-look.ts) from a small copy; null when it cannot be read. */
function sampleColourStats(
  source: CanvasImageSource,
  width: number,
  height: number
): ShotColourStats | null {
  if (!width || !height) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = STATS_SIZE;
    canvas.height = STATS_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(source, 0, 0, STATS_SIZE, STATS_SIZE);
    return colourStatsFromPixels(
      context.getImageData(0, 0, STATS_SIZE, STATS_SIZE).data,
      STATS_SIZE,
      STATS_SIZE
    );
  } catch {
    // A picture from another origin taints the canvas — that shot is left ungraded by the match.
    return null;
  }
}

/** Each of the monitor's media at a playback speed. */
function setMediaRate(
  media: {
    videos: Map<number, HTMLVideoElement>;
    voices: Map<number, HTMLAudioElement>;
    bed: HTMLAudioElement | null;
  },
  value: number
) {
  for (const [, video] of media.videos)
    if (video.playbackRate !== value) video.playbackRate = value;
  for (const [, voice] of media.voices)
    if (voice.playbackRate !== value) voice.playbackRate = value;
  if (media.bed && media.bed.playbackRate !== value) media.bed.playbackRate = value;
}

/** A looped track at a volume, playing or paused with the monitor. */
function syncLoopedAudio(audio: HTMLAudioElement, volume: number, play: boolean) {
  audio.volume = volume;
  if (play && audio.paused) void playMetered(audio).catch(() => undefined);
  if (!play && !audio.paused) audio.pause();
}

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
    // A shot's colour is drawn live from the edits (handGrades) — dragging it rebuilds nothing.
    edits: value.shotEdits
      ? {
          ...value.shotEdits,
          shots: Object.fromEntries(
            Object.entries(value.shotEdits.shots ?? {}).map(([key, edit]) => [
              key,
              { ...edit, grade: undefined, volumeKeys: undefined },
            ])
          ),
        }
      : value.shotEdits,
    length: value.length,
    beatSnap: value.beatSnap,
    bed: value.audioBedUrl,
    crossfade: value.crossfadeSec,
    credits: value.credits,
    titles,
  });
}

export function useCutPreview(input: {
  shots: KeyedShot[];
  value: FilmCutOptionsValue;
  titleCard?: FilmTitleCard | null;
  /** Rebuild after edits (the Cut page's monitor); otherwise built once. */
  live?: boolean;
  /** Hear only this track (M4 F4, cut-sound.ts); muted tracks are silent either way. */
  solo?: CutTrack | null;
}) {
  const { shots, value, titleCard, live = false, solo = null } = input;
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
  // Playback speed (0.5×, 1×, 2×) and a loop range (a shot, or between markers) for the monitor.
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  const loopRef = useRef<{ from: number; to: number } | null>(null);
  const [loop, setLoopState] = useState<{ from: number; to: number } | null>(null);
  // Skimming: the frame under the pointer, the playhead kept where it was.
  const skimRef = useRef<number | null>(null);
  // Moving cutaways' players (one per clip url), muted — the shot's own sound plays on.
  const cutawayVideos = useRef(new Map<string, HTMLVideoElement>());
  const mediaRef = useRef<Media>({
    images: new Map(),
    videos: new Map(),
    voices: new Map(),
    bed: null,
  });
  // Kept by URL between builds: a rebuild after an edit reuses what is loaded.
  const imageCache = useRef(new Map<string, Promise<HTMLImageElement>>());
  const filterPrefix = `cut-grade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const videoCache = useRef(new Map<string, Promise<HTMLVideoElement>>());
  const audioCache = useRef(new Map<string, Promise<HTMLAudioElement | null>>());
  const bedRef = useRef<{ url: string; audio: HTMLAudioElement } | null>(null);
  /** The ambience track (cut-sound.ts), looped under everything. */
  const ambienceRef = useRef<{ url: string; audio: HTMLAudioElement } | null>(null);
  /** The effects track (M10 T4): a player per placed sound, by id. */
  const effectsRef = useRef(new Map<string, HTMLAudioElement>());

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
          creditsSec: creditsDurationSec(normalizeFilmCredits(value.credits)),
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
        // Each shot's colour, for the look and the shot match (as the encode measures it).
        const stats = framed.shots.map((_, index) => {
          const image = images.get(index);
          if (image) return sampleColourStats(image, image.naturalWidth, image.naturalHeight);
          const video = videos.get(index);
          return video && video.readyState >= 2
            ? sampleColourStats(video, video.videoWidth, video.videoHeight)
            : null;
        });
        setError(null);
        setLoaded({
          timeline,
          shots: framed.shots,
          keys: framed.shots.map(shot => (shot as KeyedShot).key ?? null),
          clipSecs,
          stats,
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
    const ambience = ambienceRef;
    const overlaps = overlapAudio;
    const effects = effectsRef;
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
      ambience.current?.audio.pause();
      for (const audio of overlaps.current.values()) audio.pause();
      for (const audio of effects.current.values()) audio.pause();
    };
  }, []);

  // The look and shot match as one SVG colour matrix per shot — the canvas draws each shot
  // through its own (the encode applies the same matrices with ffmpeg).
  // Follow faces (cut-reframe.ts): each shot's crop path, as the render places it.
  const followFaces = shape !== 'wide' && value.followFaces !== false;
  const outputPreset = filmResolutionForCutOptions(value);
  const [reframeState, setReframeState] = useState<{
    for: CutPreviewLoaded | null;
    preset: string;
    paths: ReadonlyMap<number, ReframePoint[]>;
  }>({ for: null, preset: '', paths: new Map() });
  const reframes = useMemo<ReadonlyMap<number, ReframePoint[]>>(
    () =>
      followFaces && reframeState.for === loaded && reframeState.preset === outputPreset
        ? reframeState.paths
        : new Map(),
    [followFaces, loaded, outputPreset, reframeState]
  );
  const reframeCache = useRef(new Map<string, Promise<ReframePoint[] | null>>());
  useEffect(() => {
    if (!loaded || !followFaces) return;
    let cancelled = false;
    const output = FILM_PRESET_SIZE[outputPreset];
    const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
    void (async () => {
      const next = new Map<number, ReframePoint[]>();
      for (const item of loaded.timeline.items) {
        if (item.kind !== 'clip' && item.kind !== 'still') continue;
        const shot = loaded.shots[item.shot];
        if (!shot?.url) continue;
        const body = {
          url: shot.url,
          kind: item.kind,
          trimStartSec: item.kind === 'clip' ? item.fromSec : 0,
          playSec: item.kind === 'clip' ? item.durSec * (item.speed ?? 1) : 0,
          reverse: shot.reverse === true,
          width: output.width,
          height: output.height,
          comfyUrl,
        };
        const key = JSON.stringify(body);
        let pending = reframeCache.current.get(key);
        if (!pending) {
          pending = fetch('/api/cut/reframe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          })
            .then(async response =>
              response.ok
                ? (((await response.json()) as { path?: ReframePoint[] | null }).path ?? null)
                : null
            )
            .catch(() => null);
          reframeCache.current.set(key, pending);
        }
        const path = await pending;
        if (cancelled) return;
        if (path) {
          next.set(item.shot, path);
          setReframeState({ for: loaded, preset: outputPreset, paths: new Map(next) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [followFaces, loaded, outputPreset]);
  // Overlay pictures (cut-overlay.ts): each shot's corner picture and the logo, by URL.
  const overlayUrls = useMemo(
    () =>
      [
        ...new Set(
          [...shots.map(shot => value.shotEdits?.shots?.[shot.key]?.pipUrl), value.logoUrl]
            .map(url => url?.trim())
            .filter((url): url is string => Boolean(url))
        ),
      ].sort(),
    [shots, value.logoUrl, value.shotEdits]
  );
  const [overlayImages, setOverlayImages] = useState<ReadonlyMap<string, HTMLImageElement>>(
    new Map()
  );
  const overlayKey = overlayUrls.join('|');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      overlayUrls.map(url =>
        loadImage(url)
          .then(image => [url, image] as const)
          .catch(() => null)
      )
    ).then(found => {
      if (!cancelled) {
        setOverlayImages(
          new Map(
            found.filter((entry): entry is readonly [string, HTMLImageElement] => entry !== null)
          )
        );
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);
  const look = normalizeFilmLook(value.look);
  const lookStrength = normalizeLookStrength(value.lookStrength);
  const matchShots = value.matchShots !== false;
  // Each shot's own colour, from the edits as they are now (not the last rebuild).
  const handGradesKey = JSON.stringify(
    loaded?.keys.map(key => (key ? (value.shotEdits?.shots?.[key]?.grade ?? null) : null)) ?? []
  );
  const handGrades = useMemo(
    () => JSON.parse(handGradesKey) as Array<ShotGrade | null>,
    [handGradesKey]
  );
  // The film's LUT as the matrix closest to it (cut-lut.ts) — the render applies the cube itself.
  const lutKey = value.lut?.data ?? '';
  const lutMatrix = useMemo(() => {
    const lut = lutKey ? loadStoredLut(value.lut) : null;
    return lut ? lutFitMatrix(lut) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lutKey]);
  // "Match the others to this shot": its place among the loaded shots.
  const matchToIndex = value.matchToKey && loaded ? loaded.keys.indexOf(value.matchToKey) : -1;
  const gradeIds = useMemo(() => {
    if (!loaded || (look === 'none' && !matchShots && !handGrades.some(Boolean) && !lutMatrix)) {
      return [] as Array<string | null>;
    }
    const matrices = shotGradeMatrices({
      stats: loaded.stats,
      look,
      lookStrength,
      matchShots,
      grades: handGrades,
      lut: lutMatrix,
      matchTo: matchToIndex,
    });
    return matrices.map((matrix, index) =>
      isIdentityMatrix(matrix) ? null : `${filterPrefix}-${index}`
    );
  }, [filterPrefix, handGrades, loaded, look, lookStrength, lutMatrix, matchShots, matchToIndex]);
  useEffect(() => {
    if (!loaded || gradeIds.every(id => id === null)) return;
    const matrices = shotGradeMatrices({
      stats: loaded.stats,
      look,
      lookStrength,
      matchShots,
      grades: handGrades,
      lut: lutMatrix,
      matchTo: matchToIndex,
    });
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    for (const [index, id] of gradeIds.entries()) {
      if (!id) continue;
      const filter = document.createElementNS(svgNs, 'filter');
      filter.setAttribute('id', id);
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const matrix = document.createElementNS(svgNs, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', colourMatrixSvgValues(matrices[index]!));
      filter.appendChild(matrix);
      svg.appendChild(filter);
    }
    document.body.appendChild(svg);
    return () => svg.remove();
  }, [gradeIds, handGrades, loaded, look, lookStrength, lutMatrix, matchShots, matchToIndex]);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !loaded) return;
      context.globalAlpha = 1;
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const fit = shape === 'wide' ? drawContain : drawCover;
      // Fade through black / flash of white: the old shot dips to the colour, then the new one
      // comes up out of it — drawn as a veil over the frame.
      let veil: { color: string; alpha: number } | null = null;
      for (const { item, local, alpha, progress } of previewFrameAt(loaded.timeline, t)) {
        const dip =
          progress !== undefined && (item.transition === 'black' || item.transition === 'white');
        if (dip) {
          veil = {
            color: item.transition === 'black' ? '#000' : '#fff',
            alpha: progress! < 0.5 ? progress! * 2 : (1 - progress!) * 2,
          };
          // First half: still the old shot under the veil.
          if (progress! < 0.5) continue;
        }
        context.save();
        context.globalAlpha = alpha;
        if (progress !== undefined && item.transition === 'slide') {
          context.translate(Math.round((1 - progress) * canvas.width), 0);
        }
        if (item.kind === 'title' && item.shot === CREDITS_SHOT) {
          drawCredits(
            context,
            normalizeFilmCredits(value.credits),
            local,
            item.durSec,
            canvas.width,
            canvas.height
          );
        } else if (item.kind === 'title') {
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
            const stillShot = loaded.shots[item.shot];
            const motion = stillShot?.motion;
            // A hand-set move (cut-move.ts): zoom about the moving centre, as zoompan does.
            context.save();
            if (motion === 'custom') {
              const at = moveAt(
                framingPoint(stillShot?.moveFrom),
                framingPoint(stillShot?.moveTo),
                local / Math.max(0.001, item.durSec),
                fit === drawContain
                  ? containBox(
                      { width: image.naturalWidth, height: image.naturalHeight },
                      { width: canvas.width, height: canvas.height }
                    )
                  : FULL_BOX
              );
              context.translate(canvas.width / 2, canvas.height / 2);
              context.scale(at.zoom, at.zoom);
              context.translate(-at.x * canvas.width, -at.y * canvas.height);
            }
            const zoom =
              value.stillMotion !== false && motion !== 'none' && motion !== 'custom'
                ? stillMotionZoom(
                    motion === 'in' ? 0 : motion === 'out' ? 1 : item.stillIndex,
                    local / item.durSec
                  )
                : 1;
            const grade = gradeIds[item.shot];
            if (grade) context.filter = `url(#${grade})`;
            const path = fit === drawCover ? reframes.get(item.shot) : undefined;
            fit(
              context,
              image,
              image.naturalWidth,
              image.naturalHeight,
              canvas.width,
              canvas.height,
              zoom,
              path ? reframeXAt(path, 0) : null
            );
            context.filter = 'none';
            context.restore();
          }
        } else {
          const video = mediaRef.current.videos.get(item.shot);
          if (video && video.readyState >= 2) {
            const grade = gradeIds[item.shot];
            if (grade) context.filter = `url(#${grade})`;
            const path = fit === drawCover ? reframes.get(item.shot) : undefined;
            fit(
              context,
              video,
              video.videoWidth,
              video.videoHeight,
              canvas.width,
              canvas.height,
              // A clip's punch-in / pull-back, as the encode scales it.
              clipMoveZoom(loaded.shots[item.shot]?.clipMove, local, item.durSec),
              path ? reframeXAt(path, local * (item.speed ?? 1)) : null
            );
            context.filter = 'none';
          }
        }
        const overlayShot = item.kind === 'title' ? undefined : loaded.shots[item.shot];
        if (overlayShot?.lowerThird) {
          drawLowerThird(
            context,
            overlayShot.lowerThird,
            overlayShot.lowerThirdSub,
            lowerThirdAlpha(local, item.durSec),
            canvas.width,
            canvas.height
          );
        }
        const pip = overlayShot?.pipUrl ? overlayImages.get(overlayShot.pipUrl) : undefined;
        if (overlayShot?.pipFull && overlayShot.pipKind === 'clip' && overlayShot.pipUrl) {
          // A moving cutaway: its own muted player, kept at the window's time.
          const from = overlayShot.pipFromSec ?? 0;
          const to = overlayShot.pipToSec ?? 0;
          let cutaway = cutawayVideos.current.get(overlayShot.pipUrl);
          if (!cutaway) {
            cutaway = document.createElement('video');
            cutaway.crossOrigin = 'anonymous';
            cutaway.muted = true;
            cutaway.playsInline = true;
            cutaway.preload = 'auto';
            cutaway.src = overlayShot.pipUrl;
            cutawayVideos.current.set(overlayShot.pipUrl, cutaway);
          }
          if (local >= from && local <= to) {
            const target = local - from;
            if (clock.current) {
              if (cutaway.paused) {
                cutaway.currentTime = target;
                void cutaway.play().catch(() => undefined);
              } else if (Math.abs(cutaway.currentTime - target) > 0.3) {
                cutaway.currentTime = target;
              }
            } else {
              if (!cutaway.paused) cutaway.pause();
              if (Math.abs(cutaway.currentTime - target) > 0.05) cutaway.currentTime = target;
            }
            if (cutaway.readyState >= 2) {
              context.save();
              context.globalAlpha = alpha;
              drawCover(
                context,
                cutaway,
                cutaway.videoWidth,
                cutaway.videoHeight,
                canvas.width,
                canvas.height
              );
              context.restore();
            }
          } else if (!cutaway.paused) {
            cutaway.pause();
          }
        } else if (pip && overlayShot?.pipFull) {
          // A cutaway: full frame over its window of the shot (the shot's sound goes on).
          const from = overlayShot.pipFromSec ?? 0;
          const to = overlayShot.pipToSec ?? 0;
          if (local >= from && local <= to) {
            context.save();
            context.globalAlpha = alpha;
            drawCover(
              context,
              pip,
              pip.naturalWidth,
              pip.naturalHeight,
              canvas.width,
              canvas.height
            );
            context.restore();
          }
        } else if (pip) {
          drawCornerPicture(
            context,
            pip,
            overlayShot!.pipCorner ?? 'tr',
            PIP_WIDTH,
            canvas.width,
            canvas.height,
            { frame: true }
          );
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
      const logo = value.logoUrl?.trim() ? overlayImages.get(value.logoUrl.trim()) : undefined;
      if (logo) {
        drawCornerPicture(
          context,
          logo,
          value.logoCorner ?? 'br',
          LOGO_WIDTH,
          canvas.width,
          canvas.height,
          { opacity: 0.85 }
        );
      }
      if (veil && veil.alpha > 0) {
        context.save();
        context.globalAlpha = Math.min(1, veil.alpha);
        context.fillStyle = veil.color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }
    },
    [
      gradeIds,
      value.credits,
      loaded,
      overlayImages,
      reframes,
      shape,
      titleCard,
      value.logoCorner,
      value.logoUrl,
      value.stillMotion,
    ]
  );

  /** J / L clip players, by shot. */
  const overlapAudio = useRef(new Map<number, HTMLAudioElement>());
  /** A clip's J / L cut, clamped to the sound its file has (as the render clamps it). */
  const overlapOf = useCallback(
    (item: { shot: number; fromSec: number; durSec: number; speed?: number }) => {
      const shot = loaded?.shots[item.shot];
      if (!shot || !((shot.soundLeadSec ?? 0) > 0 || (shot.soundTailSec ?? 0) > 0)) return null;
      const overlap = soundOverlap({
        fromSec: item.fromSec,
        holdSec: item.durSec,
        fullSec: loaded?.clipSecs[item.shot] ?? null,
        speed: item.speed,
        reverse: shot.reverse === true,
        leadSec: shot.soundLeadSec,
        tailSec: shot.soundTailSec,
      });
      return overlap.leadSec > 0 || overlap.tailSec > 0 ? overlap : null;
    },
    [loaded]
  );
  /** Keep the clips and the music where the clock is (play / pause / seek). */
  const syncMedia = useCallback(
    (t: number, running: boolean) => {
      if (!loaded) return;
      // Mute / solo (M4 F4): each track's gain, 0 or 1.
      const gain = {
        clips: cutTrackGain(value.sound, 'clips', solo),
        narration: cutTrackGain(value.sound, 'narration', solo),
        music: cutTrackGain(value.sound, 'music', solo),
        ambience: cutTrackGain(value.sound, 'ambience', solo),
        effects: cutTrackGain(value.sound, 'effects', solo),
      };
      const on = previewFrameAt(loaded.timeline, t);
      const playingClips = new Set<number>();
      for (const { item, local } of on) {
        if (item.kind !== 'clip') continue;
        const video = mediaRef.current.videos.get(item.shot);
        if (!video) continue;
        playingClips.add(item.shot);
        // A sped-up / slowed clip: the file moves `speed` seconds per cut second.
        const speed = item.speed ?? 1;
        const target = item.fromSec + local * speed;
        if (video.playbackRate !== speed) video.playbackRate = speed;
        // The clip's own level (Cut's shot list) on top of the Lines level; 0 = muted.
        const own = loaded.shots[item.shot]?.volume ?? 1;
        // Its level points, from the edits as they are now (dragging one rebuilds nothing).
        const shotKey = loaded.keys[item.shot];
        const keyed = levelKeyGainAt(
          normalizeCutLevelKeys(
            shotKey ? value.shotEdits?.shots?.[shotKey]?.volumeKeys : undefined
          ),
          local
        );
        // A J / L clip's sound comes from its own player (below), so the picture plays silent.
        video.volume = overlapOf(item)
          ? 0
          : Math.min(
              1,
              Math.max(0, normalizeVoiceLevel(value.voiceLevel) * own * keyed * gain.clips)
            );
        if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = target;
        if (running && video.paused && t < loaded.timeline.totalSec)
          void playMetered(video).catch(() => undefined);
        if (!running && !video.paused) video.pause();
      }
      for (const [index, video] of mediaRef.current.videos) {
        if (!playingClips.has(index) && !video.paused) video.pause();
      }
      // J / L cuts (cut-sound.ts): the clip's sound from before its picture to after it, on a
      // player of its own over the shots around it.
      let overlapping = false;
      for (const item of loaded.timeline.items) {
        const overlap = item.kind === 'clip' ? overlapOf(item) : null;
        const shot = loaded.shots[item.shot];
        if (!overlap || !shot?.url) continue;
        let audio = overlapAudio.current.get(item.shot);
        if (!audio || audio.dataset.url !== shot.url) {
          audio?.pause();
          audio = new Audio(shot.url);
          audio.dataset.url = shot.url;
          overlapAudio.current.set(item.shot, audio);
        }
        const from = item.startSec - overlap.leadSec;
        const to = item.startSec + item.durSec + overlap.tailSec;
        if (t >= from && t < to) {
          overlapping = true;
          const own = shot.volume ?? 1;
          audio.volume = Math.min(
            1,
            Math.max(0, normalizeVoiceLevel(value.voiceLevel) * own * gain.clips)
          );
          const target = item.fromSec + (t - item.startSec);
          if (Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
          if (running && audio.paused) void playMetered(audio).catch(() => undefined);
          if (!running && !audio.paused) audio.pause();
        } else if (!audio.paused) {
          audio.pause();
        }
      }
      // Narration: from its shot's start to the line's end (it may run on past the shot).
      let narrating = false;
      for (const shot of mediaRef.current.voices.keys()) {
        const voice = mediaRef.current.voices.get(shot);
        if (!voice) continue;
        const start = loaded.timeline.items.find(item => item.shot === shot)?.startSec;
        const local = start === undefined ? -1 : t - start;
        const length = Number.isFinite(voice.duration) ? voice.duration : 0;
        if (local >= 0 && local < length) {
          narrating = true;
          voice.volume = Math.min(1, normalizeVoiceLevel(value.voiceLevel)) * gain.narration;
          if (Math.abs(voice.currentTime - local) > 0.3) voice.currentTime = local;
          if (running && voice.paused) void playMetered(voice).catch(() => undefined);
          if (!running && !voice.paused) voice.pause();
        } else if (!voice.paused) {
          voice.pause();
        }
      }
      const fade = musicFadeGainAt(t, loaded.timeline.totalSec, value.sound);
      const bed = mediaRef.current.bed;
      if (bed) {
        // The music's level points follow the same line as the encode's (cut-sound.ts).
        const keyed = levelKeyGainAt(normalizeCutLevelKeys(value.sound?.musicKeys), t);
        const music = Math.min(
          1,
          Math.min(1, normalizeMusicLevel(value.musicLevel)) * fade * gain.music * keyed
        );
        // The music ducks under what is heard: a muted clip or voice doesn't duck it.
        const ducked =
          (gain.clips > 0 && (playingClips.size > 0 || overlapping)) ||
          (gain.narration > 0 && narrating);
        bed.volume = ducked ? music * DUCK : music;
        // From the music's start point (cut-sound.ts), as the encode trims it.
        const at = t + normalizeMusicStartSec(value.sound?.musicStartSec);
        if (Number.isFinite(bed.duration) && at >= bed.duration) {
          bed.pause();
        } else {
          if (Math.abs(bed.currentTime - at) > 0.4) bed.currentTime = at;
          if (running && bed.paused) void playMetered(bed).catch(() => undefined);
          if (!running && !bed.paused) bed.pause();
        }
      }
      // The ambience: looped, at its level, faded out with the rest.
      const ambienceUrl = value.sound?.ambienceUrl?.trim() ?? '';
      if (ambienceRef.current?.url !== ambienceUrl) {
        ambienceRef.current?.audio.pause();
        ambienceRef.current = null;
        if (ambienceUrl) {
          const audio = new Audio(ambienceUrl);
          audio.loop = true;
          ambienceRef.current = { url: ambienceUrl, audio };
        }
      }
      const ambience = ambienceRef.current?.audio;
      if (ambience) {
        const fadeOut = musicFadeGainAt(t, loaded.timeline.totalSec, {
          musicFadeOutSec: value.sound?.musicFadeOutSec,
        });
        syncLoopedAudio(
          ambience,
          Math.min(1, normalizeAmbienceLevel(value.sound?.ambienceLevel) * fadeOut) * gain.ambience,
          running && t < loaded.timeline.totalSec
        );
      }
      // Effects (M10 T4): each from its time to its end, at its level; muted ones stay silent.
      const effects = value.sound?.effects ?? [];
      const players = effectsRef.current;
      for (const [id, audio] of players) {
        if (!effects.some(effect => effect.id === id && effect.url === audio.dataset.url)) {
          audio.pause();
          players.delete(id);
        }
      }
      for (const effect of effects) {
        let audio = players.get(effect.id);
        if (!audio) {
          audio = new Audio(effect.url);
          audio.dataset.url = effect.url;
          players.set(effect.id, audio);
        }
        const local = t - effect.atSec;
        // Its length once known; until then, a few seconds.
        const fileLength = Number.isFinite(audio.duration) ? audio.duration : 5;
        // A set length (a temp-music cue) stops it there, faded over its last second.
        const length = effect.lengthSec ? Math.min(fileLength, effect.lengthSec) : fileLength;
        const tailFade = effect.lengthSec ? Math.min(1, Math.max(0, length - local)) : 1;
        if (!effect.muted && local >= 0 && local < length && t < loaded.timeline.totalSec) {
          audio.volume = Math.min(1, normalizeEffectLevel(effect.level)) * gain.effects * tailFade;
          if (Math.abs(audio.currentTime - local) > 0.3) audio.currentTime = local;
          if (running && audio.paused) void playMetered(audio).catch(() => undefined);
          if (!running && !audio.paused) audio.pause();
        } else if (!audio.paused) {
          audio.pause();
        }
      }
    },
    [loaded, overlapOf, value.musicLevel, value.voiceLevel, value.sound, value.shotEdits, solo]
  );

  /** Every playing medium at the monitor's speed (pitch kept). */
  const applyRate = useCallback((value: number) => setMediaRate(mediaRef.current, value), []);
  // The clock: draw every frame while playing.
  useEffect(() => {
    if (!loaded || !playing) return;
    let frame = 0;
    const tick = () => {
      const started = clock.current;
      if (!started) return;
      let t = started.from + ((performance.now() - started.startedAt) / 1000) * rateRef.current;
      const range = loopRef.current;
      if (range && t >= range.to) {
        t = range.from;
        clock.current = { startedAt: performance.now(), from: t };
        syncMedia(t, false);
      }
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
      applyRate(rateRef.current);
      draw(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [applyRate, draw, loaded, playing, syncMedia]);

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

  const setRate = useCallback(
    (value: number) => {
      const next = Math.max(0.25, Math.min(4, value));
      // The clock restarts from where it is, at the new speed.
      if (clock.current) clock.current = { startedAt: performance.now(), from: timeRef.current };
      rateRef.current = next;
      setRateState(next);
      applyRate(next);
    },
    [applyRate]
  );
  /** Loop between two times (null: no loop). Playing outside it jumps to its start. */
  const setLoop = useCallback((range: { from: number; to: number } | null) => {
    const next = range && range.to - range.from > 0.2 ? range : null;
    loopRef.current = next;
    setLoopState(next);
  }, []);
  const play = useCallback(() => {
    if (!loaded) return;
    const range = loopRef.current;
    const from =
      range && (timeRef.current < range.from || timeRef.current >= range.to)
        ? range.from
        : timeRef.current >= loaded.timeline.totalSec
          ? 0
          : timeRef.current;
    clock.current = { startedAt: performance.now(), from };
    // The live meters' audio bus starts on this click (browsers wait for a gesture).
    resumeCutMeter();
    setPlaying(true);
  }, [loaded]);
  const pause = useCallback(() => {
    setPlaying(false);
    clock.current = null;
    syncMedia(timeRef.current, false);
  }, [syncMedia]);
  // A seek before the preview has loaded (a review comment's time clicked right after opening
  // Cut) is kept and made once it has — it was clamped to 0 and lost.
  const pendingSeekRef = useRef<number | null>(null);
  const seek = useCallback(
    (t: number) => {
      if (!loaded) {
        pendingSeekRef.current = t;
        return;
      }
      const total = loaded.timeline.totalSec ?? 0;
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
  useEffect(() => {
    if (!loaded || pendingSeekRef.current == null) return;
    const at = pendingSeekRef.current;
    pendingSeekRef.current = null;
    seek(at);
  }, [loaded, seek]);
  /**
   * Show the frame at `t` without moving the playhead (skimming over the timeline); null puts the
   * playhead's frame back. Ignored while playing.
   */
  const skim = useCallback(
    (t: number | null) => {
      if (!loaded || clock.current) return;
      if (t == null) {
        if (skimRef.current == null) return;
        skimRef.current = null;
        syncMedia(timeRef.current, false);
        draw(timeRef.current);
        window.setTimeout(() => skimRef.current == null && draw(timeRef.current), 120);
        return;
      }
      const at = Math.max(0, Math.min(loaded.timeline.totalSec, t));
      skimRef.current = at;
      syncMedia(at, false);
      draw(at);
      window.setTimeout(() => skimRef.current === at && draw(at), 120);
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

  /**
   * Each shot's colour as the film shows it (its measured average through its grade): the colour
   * script. Null where a shot couldn't be read.
   */
  const shotColours = useMemo(() => {
    if (!loaded) return [] as Array<[number, number, number] | null>;
    const matrices = shotGradeMatrices({
      stats: loaded.stats,
      look,
      lookStrength,
      matchShots,
      grades: handGrades,
      lut: lutMatrix,
      matchTo: matchToIndex,
    });
    return loaded.stats.map((stats, index) => {
      if (!stats) return null;
      const m = matrices[index]!;
      const [r, g, b] = stats.mean;
      const channel = (row: number) =>
        Math.round(
          Math.min(
            1,
            Math.max(
              0,
              m[row * 4]! * r + m[row * 4 + 1]! * g + m[row * 4 + 2]! * b + m[row * 4 + 3]!
            )
          ) * 255
        );
      return [channel(0), channel(1), channel(2)] as [number, number, number];
    });
  }, [handGrades, loaded, look, lookStrength, lutMatrix, matchShots, matchToIndex]);

  /**
   * The frame at the playhead as a PNG, at its source picture's own size (in the film's shape),
   * graded as the monitor shows it — no text over it. Null on a title card or before it loads.
   */
  const exportFrame = useCallback(async (): Promise<Blob | null> => {
    if (!loaded) return null;
    const on = previewFrameAt(loaded.timeline, timeRef.current);
    const top = on[on.length - 1];
    if (!top || top.item.kind === 'title') return null;
    const image =
      top.item.kind === 'still' ? mediaRef.current.images.get(top.item.shot) : undefined;
    const video = top.item.kind === 'clip' ? mediaRef.current.videos.get(top.item.shot) : undefined;
    const source = image ?? video;
    const sourceW = image?.naturalWidth ?? video?.videoWidth ?? 0;
    const sourceH = image?.naturalHeight ?? video?.videoHeight ?? 0;
    if (!source || !sourceW || !sourceH) return null;
    // The film's shape at the source's height (no taller than 4K).
    const height = Math.min(2160, sourceH);
    const width = Math.round((height * size.width) / size.height / 2) * 2;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const context = out.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const grade = gradeIds[top.item.shot];
    if (grade) context.filter = `url(#${grade})`;
    (shape === 'wide' ? drawContain : drawCover)(context, source, sourceW, sourceH, width, height);
    context.filter = 'none';
    return new Promise(resolve => out.toBlob(blob => resolve(blob), 'image/png'));
  }, [gradeIds, loaded, shape, size.height, size.width]);

  return {
    exportFrame,
    shotColours,
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
    rate,
    setRate,
    loop,
    setLoop,
    skim,
  };
}

export { formatCutTimecode } from '@/lib/film/cut-preview';

export function formatCutTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
