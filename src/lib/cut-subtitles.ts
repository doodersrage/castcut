/**
 * Timed subtitles for a cut: each spoken line or narration split into short phrases (one or two
 * lines on screen, at most ~42 characters), shown one after another across the stretch of the
 * shot where someone is actually speaking (found with ffmpeg silencedetect), and the same cues
 * as an .srt file. Pure.
 */

export type SubtitleCue = { text: string; from: number; to: number };

/** Characters a phrase may have (two short lines on a phone). */
export const SUBTITLE_MAX_CHARS = 42;
/** Shortest time a phrase stays up. */
const MIN_CUE_SEC = 0.9;

/** Short phrases from a line: sentences first, then commas, then whole words to fit. */
export function subtitleChunks(text: string, maxChars = SUBTITLE_MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) ?? [clean];
  const out: string[] = [];
  for (const sentence of sentences.map(part => part.trim()).filter(Boolean)) {
    if (sentence.length <= maxChars) {
      out.push(sentence);
      continue;
    }
    // Long sentence: break at commas, then pack words.
    const clauses = sentence.split(/(?<=[,;:—])\s+/);
    let current = '';
    for (const clause of clauses) {
      for (const word of clause.split(' ')) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
          out.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (/[,;:—]$/.test(current) && current.length > maxChars * 0.45) {
        out.push(current);
        current = '';
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/**
 * The line's phrases spread over the speech (`from`–`to`, shot seconds), each for a time in
 * proportion to its length; when the speech is too short for every phrase to stay up
 * MIN_CUE_SEC, neighbours are joined.
 */
export function subtitleCues(text: string, speech: { from: number; to: number }): SubtitleCue[] {
  let chunks = subtitleChunks(text);
  const span = Math.max(0, speech.to - speech.from);
  if (chunks.length === 0 || span <= 0) return [];
  while (chunks.length > 1 && span / chunks.length < MIN_CUE_SEC) {
    const joined: string[] = [];
    for (let i = 0; i < chunks.length; i += 2) {
      joined.push(chunks.slice(i, i + 2).join(' '));
    }
    chunks = joined;
  }
  const weights = chunks.map(chunk => chunk.length + 8);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const cues: SubtitleCue[] = [];
  let at = speech.from;
  chunks.forEach((chunk, i) => {
    const to = i === chunks.length - 1 ? speech.to : at + (span * weights[i]!) / total;
    cues.push({ text: chunk, from: round(at), to: round(to) });
    at = to;
  });
  return cues;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Where the speech is in an ffmpeg silencedetect log over `totalSec` of audio: from the end of
 * the first silence that starts at 0 to the start of the last silence that runs to the end. Null
 * when it is all silence.
 */
export function speechSpanFromSilence(
  log: string,
  totalSec: number
): { from: number; to: number } | null {
  const starts = [...log.matchAll(/silence_start:\s*(-?[0-9.]+)/g)].map(m => Number(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  const silences = starts.map((start, i) => ({
    start: Math.max(0, start),
    end: ends[i] ?? totalSec,
  }));
  let from = 0;
  let to = totalSec;
  const lead = silences.find(s => s.start <= 0.05);
  if (lead) from = lead.end;
  const tail = [...silences].reverse().find(s => s.end >= totalSec - 0.05 && s !== lead);
  if (tail) to = tail.start;
  if (lead && lead.end >= totalSec - 0.05) return null;
  return to - from > 0.2 ? { from: round(from), to: round(to) } : null;
}

const srtTime = (sec: number) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
};

/** An .srt file from film-time cues (in order). */
export function cuesToSrt(cues: ReadonlyArray<SubtitleCue>): string {
  return cues
    .filter(cue => cue.text.trim() && cue.to > cue.from)
    .map((cue, i) => `${i + 1}\n${srtTime(cue.from)} --> ${srtTime(cue.to)}\n${cue.text.trim()}\n`)
    .join('\n');
}
