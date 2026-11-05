/**
 * How burned-in subtitles look (2026-11-05): the plain band, or the short-video looks — big
 * outlined words, yellow, or a few words at a time as they are said. Pure: the server encode
 * draws them (server-encode.ts), the monitor shows the same look (CutMonitor).
 */

export const SUBTITLE_STYLES = [
  { id: 'classic', label: 'Classic', hint: 'White on a dark band at the bottom' },
  { id: 'bold', label: 'Bold', hint: 'Big white words with a black outline, no band' },
  { id: 'pop', label: 'Pop', hint: 'Big yellow words with a black outline' },
  { id: 'words', label: 'Word by word', hint: 'A few big words at a time, as they are said' },
] as const;

export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number]['id'];

export function normalizeSubtitleStyle(value: unknown): SubtitleStyle {
  return SUBTITLE_STYLES.some(style => style.id === value) ? (value as SubtitleStyle) : 'classic';
}

/**
 * The look's ffmpeg drawtext settings (after textfile=), for a picture this size. The outlined
 * looks also give `lineAt`: each line is drawn on its own, centred (drawtext lines a block's
 * lines up on the left, and its text_align needs ffmpeg 6.1+).
 */
export function subtitleDrawSettings(
  style: SubtitleStyle,
  width: number,
  height: number,
  margin: number
): {
  size: number;
  draw: string;
  /** Outlined looks: line `index` of `count` — its settings, with x and y. */
  lineAt?: (index: number, count: number) => string;
} {
  const short = Math.min(width, height);
  if (style === 'classic') {
    const size = Math.round(short * 0.05);
    return {
      size,
      draw:
        `fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.25)}` +
        `:x=(w-tw)/2:y=h-th-${margin}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(size * 0.4)}`,
    };
  }
  const size = Math.round(short * (style === 'words' ? 0.09 : 0.068));
  const colour = style === 'pop' ? '0xFFE14D' : 'white';
  const look =
    `fontcolor=${colour}:fontsize=${size}:borderw=${Math.max(2, Math.round(size * 0.09))}` +
    `:bordercolor=black:shadowx=0:shadowy=${Math.max(1, Math.round(size * 0.05))}:shadowcolor=black@0.5`;
  const lineHeight = Math.round(size * 1.25);
  // Above the bottom sixth, where a phone's own buttons and captions sit on Shorts and Reels;
  // word by word a little higher, centred on 72 % of the height.
  const bottom = height - Math.round(Math.max(margin, height * 0.16));
  const top = (count: number) =>
    style === 'words'
      ? Math.round(height * 0.72 - (count * lineHeight) / 2)
      : bottom - count * lineHeight;
  return {
    size,
    draw: `${look}:line_spacing=${Math.round(size * 0.25)}:x=(w-tw)/2:y=${top(1)}`,
    lineAt: (index, count) => `${look}:x=(w-tw)/2:y=${top(count) + index * lineHeight}`,
  };
}

export type TimedText = { text: string; from: number; to: number };

/**
 * Word by word: each cue as chunks of up to `most` words, timed across the cue by their length
 * (a long word holds longer). Cues without words are dropped.
 */
export function wordChunks(cues: readonly TimedText[], most = 3): TimedText[] {
  const out: TimedText[] = [];
  for (const cue of cues) {
    const words = cue.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!words.length || cue.to <= cue.from) continue;
    const chunks: string[] = [];
    for (let at = 0; at < words.length; at += most) {
      chunks.push(words.slice(at, at + most).join(' '));
    }
    const weights = chunks.map(chunk => chunk.length + 2);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let from = cue.from;
    for (const [index, chunk] of chunks.entries()) {
      const to =
        index === chunks.length - 1
          ? cue.to
          : from + ((cue.to - cue.from) * weights[index]!) / total;
      out.push({
        text: chunk,
        from: Math.round(from * 1000) / 1000,
        to: Math.round(to * 1000) / 1000,
      });
      from = to;
    }
  }
  return out;
}
