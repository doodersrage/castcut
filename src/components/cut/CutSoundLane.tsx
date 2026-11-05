'use client';

/**
 * Cut's sound lanes, under the shots — one per track, in CUT_TRACKS' order, as an editor's
 * timeline has them (2026-11-04; before, one lane held the music and the lines together): where
 * lines are spoken (the clips' sound), where narration plays, the music's waveform over the cut
 * (where it runs out, or runs on past the end), the ambience under it all, and each effect where
 * it starts. A lane you can't hear (muted, or another soloed) is dimmed.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { audioPeaks } from '@/lib/audio/peaks-client';
import CutMusicLevelLine from '@/components/cut/CutMusicLevelLine';
import {
  CUT_TRACKS,
  type CutLevelKey,
  type CutSoundOptions,
  type CutTrack,
} from '@/lib/video/cut-sound';

/** Where the lanes start under the shots, and each lane's height (px). */
export const CUT_LANES_TOP = 118;
export const CUT_LANE_HEIGHT = 28;
export const CUT_LANES_HEIGHT = CUT_LANE_HEIGHT * CUT_TRACKS.length;

const laneTop = (track: CutTrack) => CUT_TRACKS.indexOf(track) * CUT_LANE_HEIGHT;

/**
 * One shot's sound as a waveform, the part of the file that plays (from `fromSec`, `speed` file
 * seconds per cut second) — a clip's own sound on the clip lane, a voice-over on the narration
 * lane — so where a word starts can be seen. Nothing until it is read, or when it has no sound.
 */
function ShotWaveform({
  url,
  fromSec,
  durSec,
  speed,
  widthPx,
  colour,
}: {
  url: string;
  fromSec: number;
  durSec: number;
  speed: number;
  widthPx: number;
  colour: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [data, setData] = useState<{ url: string; peaks: Float32Array; seconds: number } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    void audioPeaks(url, 2400).then(read => {
      if (!cancelled && read) setData({ url, ...read });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const width = Math.max(1, Math.round(widthPx));
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!data || data.url !== url || !data.seconds) return;
    const mid = canvas.height / 2;
    context.fillStyle = colour;
    for (let x = 0; x < width; x += 2) {
      const fileSec = fromSec + (x / width) * durSec * speed;
      if (fileSec > data.seconds) break;
      const at = Math.floor((fileSec / data.seconds) * data.peaks.length);
      const peak = data.peaks[Math.min(data.peaks.length - 1, at)] ?? 0;
      const h = Math.max(1, peak * (canvas.height - 2));
      context.fillRect(x, mid - h / 2, 1.5, h);
    }
  }, [colour, data, durSec, fromSec, speed, url, width]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={20}
      className="pointer-events-none absolute inset-0 h-full"
      style={{ width }}
      aria-hidden
      data-testid="cut-lane-waveform"
    />
  );
}

export default function CutSoundLane({
  loaded,
  pps,
  width,
  bedUrl,
  bedLabel,
  sound,
  audible,
  disabled,
  onMusicKeys,
  clipKeys,
  onClipKeys,
}: {
  loaded: CutPreviewLoaded | null;
  /** Pixels per second (the timeline's scale). */
  pps: number;
  width: number;
  bedUrl?: string;
  bedLabel?: string;
  /** The ambience and the effects (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** Whether each track is heard (mute and solo); unset tracks are. */
  audible?: Partial<Record<CutTrack, boolean>>;
  disabled?: boolean;
  /** The music's level points changed (the line on the music lane); unset: not editable. */
  onMusicKeys?: (keys: CutLevelKey[]) => void;
  /** A clip's own level points (shot seconds), by its key; and their change. */
  clipKeys?: (key: string) => CutLevelKey[] | undefined;
  onClipKeys?: (key: string, keys: CutLevelKey[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The waveform of the track it was read from (a changed track shows nothing until read).
  const [read, setRead] = useState<{
    url: string;
    data: { peaks: Float32Array; seconds: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!bedUrl) return;
    let cancelled = false;
    void audioPeaks(bedUrl).then(data => {
      if (!cancelled) setRead({ url: bedUrl, data });
    });
    return () => {
      cancelled = true;
    };
  }, [bedUrl]);
  const bed = bedUrl && read?.url === bedUrl ? read.data : null;

  const total = loaded?.timeline.totalSec ?? 0;
  // Draw the waveform: the part that plays in the cut bright, the rest faint.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!bed) return;
    const drawn = Math.min(canvas.width, Math.round(bed.seconds * pps));
    const mid = canvas.height / 2;
    for (let x = 0; x < drawn; x += 2) {
      const at = Math.floor((x / pps / bed.seconds) * bed.peaks.length);
      const peak = bed.peaks[Math.min(bed.peaks.length - 1, at)] ?? 0;
      const h = Math.max(1, peak * (canvas.height - 4));
      context.fillStyle = x / pps <= total ? 'rgba(124,92,255,0.75)' : 'rgba(124,92,255,0.25)';
      context.fillRect(x, mid - h / 2, 1.5, h);
    }
  }, [bed, pps, total]);

  const items = loaded?.timeline.items ?? [];
  const lines = items.filter(item => item.shot >= 0 && loaded?.shots[item.shot]?.spoken?.trim());
  // Every clip's own sound (not only the ones with a line), muted ones included (dimmed).
  const clipSound = items.filter(
    item => item.shot >= 0 && item.kind === 'clip' && loaded?.shots[item.shot]?.url
  );
  const narrated = items.filter(
    item => item.shot >= 0 && loaded?.shots[item.shot]?.narrationText?.trim()
  );
  const note = bed
    ? bed.seconds + 0.5 < total
      ? `${bedLabel ? `${bedLabel} — ` : ''}the music ends ${Math.round(total - bed.seconds)} s before the cut`
      : bed.seconds > total + 1
        ? `${bedLabel ? `${bedLabel} — ` : ''}fades out at the cut's end (${Math.round(bed.seconds - total)} s left over)`
        : bedLabel || 'Music'
    : bedUrl
      ? 'Reading the music…'
      : 'No music — add a track or Score this film in Options';
  const lane = (track: CutTrack, children: ReactNode) => (
    <div
      key={track}
      className={`absolute inset-x-0 border-t border-[var(--border-subtle)] ${audible?.[track] === false ? 'opacity-35' : ''}`}
      style={{ top: laneTop(track), height: CUT_LANE_HEIGHT }}
      data-testid={`cut-lane-${track}`}
    >
      {children}
    </div>
  );
  const ambience = sound?.ambienceUrl?.trim() ? sound.ambienceName?.trim() || 'Ambience' : '';
  const effects = sound?.effects ?? [];
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: CUT_LANES_TOP, height: CUT_LANES_HEIGHT }}
      data-testid="cut-sound-lane"
    >
      {lane(
        'clips',
        <>
          {clipSound.map(item => (
            <span
              key={`w${item.shot}`}
              className={`absolute top-1 h-5 overflow-hidden ${loaded?.shots[item.shot]?.volume === 0 ? 'opacity-30' : ''}`}
              style={{ left: item.startSec * pps, width: Math.max(4, item.durSec * pps - 2) }}
            >
              <ShotWaveform
                url={loaded!.shots[item.shot]!.url}
                fromSec={item.fromSec}
                durSec={item.durSec}
                speed={item.speed ?? 1}
                widthPx={Math.max(4, item.durSec * pps - 2)}
                colour="rgba(69,104,168,0.55)"
              />
            </span>
          ))}
          {onClipKeys
            ? clipSound.map(item => {
                const key = loaded?.keys[item.shot];
                if (!key) return null;
                return (
                  <span
                    key={`k${item.shot}`}
                    className="absolute top-0 z-[1]"
                    style={{ left: item.startSec * pps, width: Math.max(4, item.durSec * pps - 2) }}
                  >
                    <CutMusicLevelLine
                      keys={clipKeys?.(key)}
                      pps={pps}
                      totalSec={item.durSec}
                      height={CUT_LANE_HEIGHT}
                      disabled={disabled}
                      what={loaded?.shots[item.shot]?.title || 'Clip'}
                      testId={`cut-clip-keys-${key}`}
                      onChange={keys => onClipKeys(key, keys)}
                    />
                  </span>
                );
              })
            : null}
          {lines.map(item => (
            <span
              key={`l${item.shot}`}
              className="absolute top-1 h-5 truncate rounded-sm border border-[var(--accent)] bg-[var(--accent)]/10 px-1 text-4xs leading-5 text-[var(--text-secondary)]"
              style={{ left: item.startSec * pps, width: Math.max(4, item.durSec * pps - 2) }}
              title={`Line: “${loaded?.shots[item.shot]?.spoken}”`}
            >
              {loaded?.shots[item.shot]?.spoken}
            </span>
          ))}
        </>
      )}
      {lane(
        'narration',
        narrated.map(item => (
          <span
            key={`n${item.shot}`}
            className="absolute top-1 h-5 truncate rounded-sm bg-amber-400/45 px-1 text-4xs leading-5 text-black"
            style={{ left: item.startSec * pps, width: Math.max(24, item.durSec * pps - 2) }}
            title={`Narration: ${loaded?.shots[item.shot]?.narrationText}`}
          >
            {loaded?.shots[item.shot]?.narrationUrl ? (
              <ShotWaveform
                url={loaded.shots[item.shot]!.narrationUrl!}
                fromSec={0}
                durSec={item.durSec}
                speed={1}
                widthPx={Math.max(24, item.durSec * pps - 2)}
                colour="rgba(0,0,0,0.35)"
              />
            ) : null}
            <span className="relative">{loaded?.shots[item.shot]?.narrationText}</span>
          </span>
        ))
      )}
      {lane(
        'music',
        <>
          <canvas
            ref={canvasRef}
            width={Math.max(1, Math.round(width))}
            height={24}
            className="absolute left-0 top-0.5 h-[24px]"
            style={{ width: Math.round(width) }}
            aria-hidden
          />
          <span
            className="absolute left-1 top-0.5 max-w-full truncate rounded-sm bg-[var(--bg-surface)]/80 px-1 text-3xs leading-4 text-[var(--text-muted)]"
            data-testid="cut-sound-note"
          >
            ♪ {note}
            {lines.length ? ` · ${lines.length} line${lines.length === 1 ? '' : 's'}` : ''}
            {narrated.length ? ` · ${narrated.length} narrated` : ''}
          </span>
          {bedUrl && onMusicKeys ? (
            <CutMusicLevelLine
              keys={sound?.musicKeys}
              pps={pps}
              totalSec={total}
              height={CUT_LANE_HEIGHT}
              disabled={disabled}
              onChange={onMusicKeys}
            />
          ) : null}
        </>
      )}
      {lane(
        'ambience',
        ambience ? (
          <span
            className="absolute top-1 h-5 truncate rounded-sm bg-emerald-500/25 px-1 text-4xs leading-5 text-[var(--text-secondary)]"
            style={{ left: 0, width: Math.max(24, total * pps) }}
            title={`Ambience under the whole film: ${ambience}`}
          >
            {ambience}
          </span>
        ) : null
      )}
      {lane(
        'effects',
        effects.map(effect => (
          <span
            key={effect.id}
            className={`absolute top-1 h-5 max-w-40 truncate rounded-sm border-l-2 border-sky-500 bg-sky-500/20 px-1 text-4xs leading-5 text-[var(--text-secondary)] ${effect.muted ? 'opacity-40' : ''}`}
            style={{ left: effect.atSec * pps }}
            title={`${effect.name || 'Sound'} at ${effect.atSec.toFixed(1)} s`}
          >
            {effect.name || 'Sound'}
          </span>
        ))
      )}
    </div>
  );
}
