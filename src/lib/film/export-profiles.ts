/**
 * Export profiles, the preflight and the finished film's check (M4 F6, ROADMAP §7.5 / §7.6).
 * A profile sets what matters for where the film goes — shape, size, burned-in subtitles, the
 * loudness target — without codec knowledge. The preflight says, before an encode, what is
 * checked now and what can only be checked as it cuts; the check reads the finished file back
 * (video/output-probe.ts) against the profile. Pure.
 */
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import type { FilmOutputProbe } from '../video/output-probe';
import { FILM_PRESET_SIZE, filmResolutionForCutOptions, type FilmShape } from '../video/resolution';
import { heardEffects } from '../video/cut-sound';
import { LOUDNESS_TARGETS, loudnessNotes, loudnessSummary, type LoudnessTarget } from './loudness';

export type ExportProfileId = 'review' | 'master' | 'vertical' | 'square';

export type ExportProfile = {
  id: ExportProfileId;
  label: string;
  hint: string;
  /** Unset: the shape the cut has. */
  shape?: FilmShape;
  quality: '720p' | '1080p';
  subtitles: boolean;
  loudness: LoudnessTarget['id'];
};

export const EXPORT_PROFILES: readonly ExportProfile[] = [
  {
    id: 'review',
    label: 'Review copy',
    hint: '720p with subtitles burned in — quick to send round',
    quality: '720p',
    subtitles: true,
    loudness: 'web',
  },
  {
    id: 'master',
    label: 'Widescreen master',
    hint: '1080p 16:9, clean picture — the .srt goes beside it',
    shape: 'wide',
    quality: '1080p',
    subtitles: false,
    loudness: 'web',
  },
  {
    id: 'vertical',
    label: 'Vertical social',
    hint: '1080×1920 for Shorts, Reels and Stories, subtitles on',
    shape: 'vertical',
    quality: '1080p',
    subtitles: true,
    loudness: 'web',
  },
  {
    id: 'square',
    label: 'Square social',
    hint: '1080×1080 for feed posts, subtitles on',
    shape: 'square',
    quality: '1080p',
    subtitles: true,
    loudness: 'web',
  },
];

export function exportProfileById(id: unknown): ExportProfile | null {
  return EXPORT_PROFILES.find(profile => profile.id === id) ?? null;
}

/** The cut's options with a profile's settings (and the profile noted). */
export function applyExportProfile(
  options: FilmCutOptionsValue,
  id: ExportProfileId
): FilmCutOptionsValue {
  const profile = exportProfileById(id);
  if (!profile) return options;
  const shape = profile.shape ?? options.shape ?? (options.vertical ? 'vertical' : 'wide');
  return {
    ...options,
    exportProfile: profile.id,
    shape,
    vertical: shape === 'vertical',
    quality: profile.quality,
    subtitles: profile.subtitles,
    ...(shape !== 'wide' ? { followFaces: true } : {}),
  };
}

/** The loudness target the cut is checked against: its profile's, else the web's. */
export function cutLoudnessTarget(
  options: Pick<FilmCutOptionsValue, 'exportProfile'>
): LoudnessTarget {
  const id = exportProfileById(options.exportProfile)?.loudness ?? 'web';
  return LOUDNESS_TARGETS.find(target => target.id === id) ?? LOUDNESS_TARGETS[0]!;
}

export type CheckStatus = 'ok' | 'warn' | 'fail';
export type ExportCheck = { id: string; label: string; status: CheckStatus; detail: string };

/** About how many bytes a second of film takes at a size (encode plus its work files, ×3). */
const BYTES_PER_SEC: Record<'720p' | '1080p', number> = { '720p': 400_000, '1080p': 900_000 };
const WORK_FACTOR = 3;

const megabytes = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/**
 * Before an encode: what is checked now. `remains` says what can only be checked as it cuts
 * (the delivery check's file probes) or after (the finished file).
 */
export function cutPreflight(input: {
  options: FilmCutOptionsValue;
  shotCount: number;
  durationSec: number;
  missing: ReadonlyArray<{ blocks: boolean }>;
  subtitleIssueCount: number;
  subtitleCount: number;
  /** Anything to hear after mutes: music, ambience, clip sound, narration. */
  hasSound: boolean;
  server: { available: boolean; freeBytes: number | null } | null;
}): { checks: ExportCheck[]; remains: string[]; blocks: boolean } {
  const checks: ExportCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });
  add(
    'shots',
    'Shots',
    input.shotCount > 0 ? 'ok' : 'fail',
    input.shotCount > 0
      ? `${input.shotCount} shot${input.shotCount === 1 ? '' : 's'}, about ${Math.round(input.durationSec)} s`
      : 'Every shot is left out.'
  );
  const blocking = input.missing.filter(item => item.blocks).length;
  add(
    'media',
    'Media',
    blocking ? 'fail' : input.missing.length ? 'warn' : 'ok',
    blocking
      ? `${blocking} shot${blocking === 1 ? '' : 's'} can’t play — relink in Missing media.`
      : input.missing.length
        ? `${input.missing.length} to look at in Missing media.`
        : 'Every file answers.'
  );
  // The browser encode (no ffmpeg on the server, or no answer) draws no subtitles (M6 D5).
  const inBrowser = !input.server?.available;
  if (input.options.subtitles !== false) {
    add(
      'subtitles',
      'Subtitles',
      inBrowser || !input.subtitleCount || input.subtitleIssueCount ? 'warn' : 'ok',
      inBrowser
        ? 'The browser encode can’t burn subtitles in: this film will have none. Encode on a server with ffmpeg to keep them.'
        : !input.subtitleCount
          ? 'Subtitles are on, but no shot has any.'
          : input.subtitleIssueCount
            ? `${input.subtitleIssueCount} to look at in Subtitles.`
            : `${input.subtitleCount} subtitle${input.subtitleCount === 1 ? '' : 's'}, all readable.`
    );
  }
  add(
    'sound',
    'Sound',
    input.hasSound ? 'ok' : 'warn',
    input.hasSound
      ? 'Something to hear.'
      : 'The film will be silent (nothing to hear, or all muted).'
  );
  const resolution = filmResolutionForCutOptions(input.options);
  const size = FILM_PRESET_SIZE[resolution];
  add('size', 'Picture', 'ok', `${size.width}×${size.height}`);
  if (!input.server) {
    add(
      'encoder',
      'Encoder',
      'warn',
      'Couldn’t ask the server — the encode may run in the browser.'
    );
  } else if (!input.server.available) {
    add(
      'encoder',
      'Encoder',
      'warn',
      'No ffmpeg on the server: the browser encodes it (slower, and without subtitles).'
    );
  } else {
    const quality = input.options.quality === '1080p' ? '1080p' : '720p';
    const needed = Math.max(50e6, input.durationSec * BYTES_PER_SEC[quality] * WORK_FACTOR);
    const free = input.server.freeBytes;
    add(
      'space',
      'Disk space',
      free === null ? 'warn' : free < needed ? 'fail' : 'ok',
      free === null
        ? 'Couldn’t read the free space on the server.'
        : free < needed
          ? `${megabytes(free)} free; the encode needs about ${megabytes(needed)}.`
          : `${megabytes(free)} free.`
    );
  }
  return {
    checks,
    remains: [
      'black frames, silent talking clips and look-alike shots — checked as it cuts',
      'the finished file’s size, length, sound and loudness — checked when it’s done',
    ],
    blocks: checks.some(check => check.status === 'fail'),
  };
}

/** Anything to hear in a cut, after mutes: music, ambience, effects, narration or a clip's sound. */
export function cutHasSound(
  options: FilmCutOptionsValue,
  shots: ReadonlyArray<{ kind: string; volume?: number }>
): boolean {
  const muted = new Set(options.sound?.mutedTracks ?? []);
  if (options.audioBedUrl.trim() && !muted.has('music') && (options.musicLevel ?? 1) > 0)
    return true;
  if (options.sound?.ambienceUrl?.trim() && !muted.has('ambience')) return true;
  if (!muted.has('effects') && heardEffects(options.sound).length) return true;
  if (options.narrate && !muted.has('narration')) return true;
  return !muted.has('clips') && shots.some(shot => shot.kind === 'clip' && shot.volume !== 0);
}

/** The finished film read back, against what the cut asked for. */
export function verifyFilmOutput(input: {
  probe: FilmOutputProbe | null | undefined;
  options: FilmCutOptionsValue;
  /** Something to hear was in the cut. */
  wantsSound: boolean;
}): ExportCheck[] {
  const { probe } = input;
  if (!probe) {
    return [
      {
        id: 'probe',
        label: 'Finished file',
        status: 'warn',
        detail: 'Not read back (a browser encode) — watch it through once.',
      },
      ...(input.options.subtitles !== false
        ? [
            {
              id: 'subtitles',
              label: 'Subtitles',
              status: 'warn' as const,
              detail: 'Not burned in — the browser encode can’t draw them.',
            },
          ]
        : []),
    ];
  }
  const checks: ExportCheck[] = [];
  const size = FILM_PRESET_SIZE[filmResolutionForCutOptions(input.options)];
  const sized = probe.width === size.width && probe.height === size.height;
  checks.push({
    id: 'size',
    label: 'Picture',
    status: sized ? 'ok' : 'fail',
    detail: sized
      ? `${probe.width}×${probe.height}`
      : `${probe.width ?? '?'}×${probe.height ?? '?'} — asked for ${size.width}×${size.height}`,
  });
  checks.push({
    id: 'length',
    label: 'Length',
    status: probe.durationSec && probe.durationSec > 0.5 ? 'ok' : 'fail',
    detail: probe.durationSec
      ? `${probe.durationSec.toFixed(1)} s`
      : 'No length — the file may be broken.',
  });
  if (probe.fps !== undefined) {
    checks.push({
      id: 'fps',
      label: 'Frame rate',
      status: probe.fps >= 23 ? 'ok' : 'warn',
      detail: `${probe.fps} fps${probe.fps >= 23 ? '' : ' — low for playback'}`,
    });
  }
  checks.push({
    id: 'sound',
    label: 'Sound',
    status: probe.hasAudio || !input.wantsSound ? 'ok' : 'fail',
    detail: probe.hasAudio
      ? 'Has a sound track.'
      : input.wantsSound
        ? 'No sound track, though the cut had sound.'
        : 'Silent, as cut.',
  });
  if (probe.loudness) {
    const target = cutLoudnessTarget(input.options);
    const notes = loudnessNotes(probe.loudness, target);
    checks.push({
      id: 'loudness',
      label: 'Loudness',
      status: notes.length ? 'warn' : 'ok',
      detail: `${loudnessSummary(probe.loudness)}${notes.length ? ` — ${notes.join('; ')}` : ` — right for ${target.label.split(' (')[0]!.toLowerCase()}`}`,
    });
  }
  return checks;
}
