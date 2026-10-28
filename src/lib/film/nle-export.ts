/**
 * A cut handed to an editing app (roadmap review 2026-10-13: don't rebuild an editor — export
 * cleanly). From the film's shots, already fetched and measured, it writes an FCPXML 1.9 timeline
 * (DaVinci Resolve, Premiere Pro and Final Cut import it), a CMX 3600 EDL for anything else, and
 * the captions as SRT. Media is referenced by relative path (`media/…`), next to the timeline in
 * the export's folder. Crossfades and the title card stay Castcut's: editors handle dissolves
 * their own way, so the README says how to add them. Client-safe: no Node imports.
 */

export const NLE_FPS = 24;

export type NleShot = {
  /** File name inside the export's media folder ("03-park-bench.mp4"). */
  file: string;
  name: string;
  kind: 'still' | 'clip';
  /** Seconds this shot runs in the cut. */
  durationSec: number;
  /** A clip: where in the source file it starts (trim) and the source's whole length. */
  sourceStartSec?: number;
  sourceDurationSec?: number;
  caption?: string;
};

export type NleTimelineInput = {
  name: string;
  width: number;
  height: number;
  shots: NleShot[];
  music?: { file: string; durationSec: number };
  /** Kept for the README (not placed on the timeline). */
  crossfadeSec?: number;
};

/** Whole frames at 24 fps. */
export function nleFrames(seconds: number): number {
  return Math.max(0, Math.round(seconds * NLE_FPS));
}

/** FCPXML rational time: "0s", or frames × 100/2400s. */
export function fcpTime(frames: number): string {
  return frames <= 0 ? '0s' : `${frames * 100}/2400s`;
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Each shot's place on the timeline, in frames. */
export function nleLayout(
  shots: NleShot[]
): Array<{ shot: NleShot; offset: number; frames: number }> {
  let offset = 0;
  return shots.map(shot => {
    const frames = Math.max(1, nleFrames(shot.durationSec));
    const placed = { shot, offset, frames };
    offset += frames;
    return placed;
  });
}

export function buildFcpxml(input: NleTimelineInput): string {
  const layout = nleLayout(input.shots);
  const total = layout.reduce((sum, item) => sum + item.frames, 0);
  const assets = layout.map(({ shot }, index) => {
    const id = `a${index + 1}`;
    const duration =
      shot.kind === 'clip' ? fcpTime(nleFrames(shot.sourceDurationSec ?? shot.durationSec)) : '0s';
    return (
      `    <asset id="${id}" name="${xmlText(shot.name)}" start="0s" duration="${duration}" ` +
      `hasVideo="1" hasAudio="${shot.kind === 'clip' ? 1 : 0}" format="r1"` +
      `${shot.kind === 'clip' ? ' audioSources="1" audioChannels="2" audioRate="48000"' : ''}>\n` +
      `      <media-rep kind="original-media" src="${xmlText(shot.file)}"/>\n` +
      `    </asset>`
    );
  });
  const musicId = `a${layout.length + 1}`;
  if (input.music) {
    assets.push(
      `    <asset id="${musicId}" name="Music" start="0s" duration="${fcpTime(nleFrames(input.music.durationSec))}" ` +
        `hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000">\n` +
        `      <media-rep kind="original-media" src="${xmlText(input.music.file)}"/>\n` +
        `    </asset>`
    );
  }
  const musicFrames = input.music ? Math.min(total, nleFrames(input.music.durationSec)) : 0;
  const spine = layout.map(({ shot, offset, frames }, index) => {
    const ref = `a${index + 1}`;
    const start = shot.kind === 'clip' ? fcpTime(nleFrames(shot.sourceStartSec ?? 0)) : '0s';
    // The music rides under the whole cut, connected to the first shot (lane -1). A connected
    // clip's offset is in its parent's own time, which begins at the parent's `start` — a trimmed
    // first clip's trim, not 0 (M6 D20: at 0 the music sat that far before the cut began).
    const music =
      index === 0 && input.music && musicFrames > 0
        ? `\n          <asset-clip ref="${musicId}" lane="-1" offset="${start}" name="Music" duration="${fcpTime(musicFrames)}"/>\n        `
        : '';
    if (shot.kind === 'clip') {
      return `        <asset-clip ref="${ref}" offset="${fcpTime(offset)}" name="${xmlText(shot.name)}" start="${start}" duration="${fcpTime(frames)}">${music}</asset-clip>`;
    }
    return `        <video ref="${ref}" offset="${fcpTime(offset)}" name="${xmlText(shot.name)}" start="0s" duration="${fcpTime(frames)}">${music}</video>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.9">',
    '  <resources>',
    `    <format id="r1" name="FFVideoFormatRateUndefined" frameDuration="100/2400s" width="${input.width}" height="${input.height}"/>`,
    ...assets,
    '  </resources>',
    '  <library>',
    '    <event name="Castcut">',
    `      <project name="${xmlText(input.name)}">`,
    `        <sequence format="r1" duration="${fcpTime(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    '      <spine>',
    ...spine,
    '      </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  ].join('\n');
}

/** HH:MM:SS:FF at 24 fps. */
export function edlTimecode(frames: number): string {
  const f = frames % NLE_FPS;
  const total = Math.floor(frames / NLE_FPS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(f)}`;
}

/** CMX 3600: one video event per shot; the clip name comment lets an editor relink by file. */
export function buildEdl(input: NleTimelineInput): string {
  const lines = [
    `TITLE: ${input.name.replace(/[\r\n]+/g, ' ').slice(0, 70)}`,
    'FCM: NON-DROP FRAME',
    '',
  ];
  for (const [index, { shot, offset, frames }] of nleLayout(input.shots).entries()) {
    const sourceIn = shot.kind === 'clip' ? nleFrames(shot.sourceStartSec ?? 0) : 0;
    const reel = `AX`;
    lines.push(
      `${String(index + 1).padStart(3, '0')}  ${reel.padEnd(8)} V     C        ` +
        `${edlTimecode(sourceIn)} ${edlTimecode(sourceIn + frames)} ${edlTimecode(offset)} ${edlTimecode(offset + frames)}`
    );
    lines.push(`* FROM CLIP NAME: ${shot.file}`);
    lines.push('');
  }
  return lines.join('\n');
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** Captions as subtitles, timed to the shots they belong to. Empty when there are none. */
export function buildSrt(shots: NleShot[]): string {
  const cues: string[] = [];
  for (const { shot, offset, frames } of nleLayout(shots)) {
    const text = shot.caption?.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cues.push(
      `${cues.length + 1}\n${srtTime(offset / NLE_FPS)} --> ${srtTime((offset + frames) / NLE_FPS)}\n${text}\n`
    );
  }
  return cues.join('\n');
}

export function nleReadme(input: NleTimelineInput & { droppedShots?: number }): string {
  const seconds = nleLayout(input.shots).reduce((sum, item) => sum + item.frames, 0) / NLE_FPS;
  return [
    `${input.name} — exported from Castcut for an editing app`,
    '',
    `${input.shots.length} shots, ${seconds.toFixed(1)} s at ${NLE_FPS} fps, ${input.width}×${input.height}.`,
    '',
    'Files:',
    '  timeline.fcpxml  DaVinci Resolve (File → Import → Timeline), Premiere Pro (File → Import), Final Cut Pro',
    '  timeline.edl     a plain CMX 3600 edit list for anything else (relink by clip name)',
    '  captions.srt     the captions as subtitles (import onto a subtitle track)',
    '  media/           every shot, numbered in cut order' +
      (input.music ? ', plus the music' : ''),
    '',
    'Keep the media folder next to the timeline. If your editor shows clips offline, relink them to',
    'this media folder (Resolve: right-click the clips → Relink Selected Clips).',
    '',
    'Not on the timeline:',
    input.crossfadeSec && input.crossfadeSec > 0
      ? `  crossfades (${input.crossfadeSec} s in Castcut) — select all edits and add a cross dissolve (Resolve: Ctrl+T)`
      : '  (no crossfades in this cut)',
    '  the title card, still motion (slow zoom) and framing crops — Castcut drew those while encoding',
    ...(input.droppedShots
      ? [
          `  ${input.droppedShots} shot(s) Castcut could not fetch (held only in the browser it was cut in)`,
        ]
      : []),
    '',
  ].join('\n');
}
