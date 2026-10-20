/**
 * Export a cut for another editor (Final Cut / Resolve / Premiere): the timeline as FCPXML 1.9 and
 * as a CMX 3600 EDL, both pointing at the media files packed beside them (media/…). Shots butt
 * together (transitions become cuts — the editor adds its own); the music is a connected clip
 * under the whole film. Pure: the packing is cut-project-export-server.ts.
 */

export type ProjectClip = {
  /** File name inside media/ (e.g. "03-morning.mp4"). */
  file: string;
  name: string;
  kind: 'still' | 'clip';
  /** Where the shot starts in its file (clips), seconds. */
  fromSec: number;
  /** How long it plays in the cut, seconds. */
  durSec: number;
  /** The file's own length (clips), seconds. */
  fileSec?: number | null;
  /** The file has sound (clips; unknown = yes). */
  hasAudio?: boolean;
};

export type ProjectInput = {
  name: string;
  fps: number;
  width: number;
  height: number;
  clips: ReadonlyArray<ProjectClip>;
  /** The music, from its start point (media/ file name), under the whole film. */
  music?: { file: string; fromSec: number; fileSec?: number | null } | null;
};

const frames = (sec: number, fps: number) => Math.max(0, Math.round(sec * fps));
/** A rational FCPXML time in frames. */
const t = (sec: number, fps: number) => `${frames(sec, fps)}/${fps}s`;

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Where each clip starts in the cut (hard cuts end to end). */
export function projectOffsets(clips: ReadonlyArray<ProjectClip>, fps: number): number[] {
  let at = 0;
  return clips.map(clip => {
    const start = at;
    at += frames(clip.durSec, fps);
    return start;
  });
}

export function buildFcpxml(input: ProjectInput): string {
  const { fps } = input;
  const offsets = projectOffsets(input.clips, fps);
  const total = offsets.length
    ? offsets[offsets.length - 1]! + frames(input.clips[input.clips.length - 1]!.durSec, fps)
    : 0;
  const assets = input.clips.map((clip, i) => {
    const length =
      clip.kind === 'clip'
        ? Math.max(clip.fileSec ?? 0, clip.fromSec + clip.durSec)
        : Math.max(clip.durSec, 10);
    return (
      `    <asset id="a${i + 1}" name="${xml(clip.name)}" src="media/${xml(clip.file)}" start="0s" ` +
      `duration="${t(length, fps)}" hasVideo="1"${clip.kind === 'clip' && clip.hasAudio !== false ? ' hasAudio="1"' : ''} format="r1"/>`
    );
  });
  const music = input.music
    ? `    <asset id="m1" name="Music" src="media/${xml(input.music.file)}" start="0s" duration="${t(
        Math.max(input.music.fileSec ?? 0, input.music.fromSec + total / fps),
        fps
      )}" hasAudio="1"/>`
    : '';
  const spine = input.clips.map((clip, i) => {
    const attrs =
      `ref="a${i + 1}" name="${xml(clip.name)}" offset="${offsets[i]}/${fps}s" ` +
      `start="${clip.kind === 'clip' ? t(clip.fromSec, fps) : '0s'}" duration="${t(clip.durSec, fps)}"`;
    if (i === 0 && input.music) {
      return (
        `            <asset-clip ${attrs}>\n` +
        `              <asset-clip ref="m1" lane="-1" name="Music" offset="${t(clip.kind === 'clip' ? clip.fromSec : 0, fps)}" start="${t(input.music.fromSec, fps)}" duration="${total}/${fps}s"/>\n` +
        `            </asset-clip>`
      );
    }
    return `            <asset-clip ${attrs}/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.9">',
    '  <resources>',
    `    <format id="r1" name="Castcut ${input.width}x${input.height} ${fps}p" frameDuration="1/${fps}s" width="${input.width}" height="${input.height}"/>`,
    ...assets,
    ...(music ? [music] : []),
    '  </resources>',
    '  <library>',
    `    <event name="${xml(input.name)}">`,
    `      <project name="${xml(input.name)}">`,
    `        <sequence format="r1" duration="${total}/${fps}s" tcStart="0s" tcFormat="NDF">`,
    '          <spine>',
    ...spine,
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  ].join('\n');
}

/** HH:MM:SS:FF at `fps` (non-drop). */
export function timecode(frameCount: number, fps: number): string {
  const f = Math.max(0, Math.round(frameCount));
  const pad = (n: number) => String(n).padStart(2, '0');
  const ff = f % fps;
  const total = Math.floor(f / fps);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(ff)}`;
}

/** A CMX 3600 EDL: one video event per shot (reel = AX, clip name in a comment). */
export function buildEdl(input: ProjectInput): string {
  const { fps } = input;
  const offsets = projectOffsets(input.clips, fps);
  const lines = [
    `TITLE: ${input.name.replace(/[^\x20-\x7e]/g, '').slice(0, 60) || 'Castcut'}`,
    'FCM: NON-DROP FRAME',
    '',
  ];
  input.clips.forEach((clip, i) => {
    const sourceIn = clip.kind === 'clip' ? frames(clip.fromSec, fps) : 0;
    const length = frames(clip.durSec, fps);
    const event = String(i + 1).padStart(3, '0');
    lines.push(
      `${event}  AX       V     C        ${timecode(sourceIn, fps)} ${timecode(sourceIn + length, fps)} ${timecode(offsets[i]!, fps)} ${timecode(offsets[i]! + length, fps)}`,
      `* FROM CLIP NAME: ${clip.file}`,
      ''
    );
  });
  return lines.join('\n');
}

/** A safe media file name: order number, a slug of the title, the extension. */
export function projectMediaName(index: number, title: string, extension: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'shot';
  return `${String(index + 1).padStart(2, '0')}-${slug}.${extension}`;
}
