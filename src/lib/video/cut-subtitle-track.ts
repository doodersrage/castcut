/**
 * The cut's subtitle track (M4 F5, ROADMAP §7.4): each shot's subtitle — its line or narration,
 * or text you set, shown from / to where you set it — as film-time cues; an .srt read back in
 * and matched to the shots by time; and the checks a subtitle file should pass (overlaps, cues
 * too short or too long to read, more than two rows, characters an .srt can't carry). Pure.
 *
 * A shot's subtitle can also be your own timed cues (M10 T3): split from its text, each with its
 * text and times, over the text and window — the monitor, the .srt and the burn-in all use them.
 */
import type { ShotSubtitleCue } from '../media/kind';
import { SUBTITLE_MAX_CHARS, subtitleCues, type SubtitleCue } from './cut-subtitles';

export type SubtitleShotSpan = { key: string; startSec: number; durSec: number };

export type ShotSubtitle = SubtitleShotSpan & {
  text: string;
  /** Shot seconds; unset: from just after the shot starts to just before it ends. */
  fromSec?: number;
  toSec?: number;
  /** Timed cues you set (shot seconds): used instead of the text and window. */
  cues?: readonly ShotSubtitleCue[];
};

export const SUBTITLE_CUES_MAX = 40;

/** Stored cues, tidied: text, times in order inside 0–600 s, in time order; junk dropped. */
export function cleanSubtitleCues(raw: unknown): ShotSubtitleCue[] {
  if (!Array.isArray(raw)) return [];
  const out: ShotSubtitleCue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const cue = entry as Record<string, unknown>;
    const text =
      typeof cue.text === 'string'
        ? cue.text
            .replace(/[ \t]+/g, ' ')
            .trim()
            .slice(0, 300)
        : '';
    const from =
      typeof cue.fromSec === 'number' && Number.isFinite(cue.fromSec) ? cue.fromSec : NaN;
    const to = typeof cue.toSec === 'number' && Number.isFinite(cue.toSec) ? cue.toSec : NaN;
    if (!text || !(from >= 0) || !(to > from)) continue;
    out.push({ text, fromSec: round(Math.min(600, from)), toSec: round(Math.min(600, to)) });
  }
  return out.sort((a, b) => a.fromSec - b.fromSec).slice(0, SUBTITLE_CUES_MAX);
}

/**
 * A shot's subtitle as timed cues to edit (M10 T3): the phrases it shows now (sentences first),
 * at their times; one phrase is split at the word nearest its middle. Fewer than two: none.
 */
export function splitShotSubtitle(shot: ShotSubtitle): ShotSubtitleCue[] {
  const text = shot.text.trim();
  if (!text) return [];
  const window = shotSubtitleWindow(shot);
  let phrases = subtitleCues(text, window);
  if (phrases.length === 1) {
    const words = text.split(' ');
    if (words.length < 2) return [];
    const middle = text.length / 2;
    let at = 1;
    let best = Infinity;
    let length = 0;
    words.forEach((word, i) => {
      length += word.length + 1;
      if (i < words.length - 1 && Math.abs(length - middle) < best) {
        best = Math.abs(length - middle);
        at = i + 1;
      }
    });
    const first = words.slice(0, at).join(' ');
    const share = (window.to - window.from) * (first.length / text.length);
    phrases = [
      { text: first, from: window.from, to: round(window.from + share) },
      { text: words.slice(at).join(' '), from: round(window.from + share), to: window.to },
    ];
  }
  return phrases.map(cue => ({ text: cue.text, fromSec: cue.from, toSec: cue.to }));
}

/** One cue split in two at its sentence break (else its middle word), its time shared by length. */
export function splitSubtitleCue(
  cues: readonly ShotSubtitleCue[],
  index: number
): ShotSubtitleCue[] {
  const cue = cues[index];
  if (!cue) return [...cues];
  const parts = splitShotSubtitle({
    key: '',
    startSec: 0,
    durSec: cue.toSec,
    text: cue.text,
    fromSec: cue.fromSec,
    toSec: cue.toSec,
  });
  if (parts.length < 2) return [...cues];
  return [...cues.slice(0, index), ...parts, ...cues.slice(index + 1)];
}

/** A cue joined to the next: one cue, their text, from the first's start to the second's end. */
export function joinSubtitleCues(
  cues: readonly ShotSubtitleCue[],
  index: number
): ShotSubtitleCue[] {
  const cue = cues[index];
  const next = cues[index + 1];
  if (!cue || !next) return [...cues];
  return [
    ...cues.slice(0, index),
    { text: `${cue.text} ${next.text}`, fromSec: cue.fromSec, toSec: next.toSec },
    ...cues.slice(index + 2),
  ];
}

/** Below this a cue can't be read; above it, it overstays. */
export const SUBTITLE_MIN_SEC = 0.8;
export const SUBTITLE_MAX_SEC = 7;
export const SUBTITLE_MAX_ROWS = 2;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The shot's subtitle window inside it: as set, else 0.2 s in from each end. */
export function shotSubtitleWindow(shot: Pick<ShotSubtitle, 'durSec' | 'fromSec' | 'toSec'>): {
  from: number;
  to: number;
} {
  const end = Math.max(0, shot.durSec);
  const from = Math.min(end, Math.max(0, shot.fromSec ?? Math.min(0.2, end / 4)));
  const to = Math.min(end, Math.max(from, shot.toSec ?? end - Math.min(0.2, end / 4)));
  return { from, to };
}

/** The film's cues: each shot's text split into phrases across its window, at film time. */
export function filmSubtitleCues(
  shots: readonly ShotSubtitle[]
): Array<SubtitleCue & { key: string }> {
  return shots.flatMap(shot => {
    const text = shot.text.trim();
    if (!text) return [];
    if (shot.cues?.length) {
      // Your cues, kept inside the shot.
      return shot.cues.flatMap(cue => {
        const from = Math.min(shot.durSec, cue.fromSec);
        const to = Math.min(shot.durSec, cue.toSec);
        return to > from
          ? [
              {
                key: shot.key,
                text: cue.text,
                from: round(shot.startSec + from),
                to: round(shot.startSec + to),
              },
            ]
          : [];
      });
    }
    return subtitleCues(text, shotSubtitleWindow(shot)).map(cue => ({
      key: shot.key,
      text: cue.text,
      from: round(shot.startSec + cue.from),
      to: round(shot.startSec + cue.to),
    }));
  });
}

const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const seconds = (match: RegExpMatchArray) =>
  Number(match[1]) * 3600 +
  Number(match[2]) * 60 +
  Number(match[3]) +
  Number(match[4]!.padEnd(3, '0')) / 1000;

/** An .srt read: its cues in time order, and the blocks it couldn't read. */
export function parseSrt(raw: string): { cues: SubtitleCue[]; unread: number } {
  const blocks = raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);
  const cues: SubtitleCue[] = [];
  let unread = 0;
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex(line => line.includes('-->'));
    const [left, right] = timing >= 0 ? lines[timing]!.split('-->') : [];
    const from = left?.match(SRT_TIME);
    const to = right?.match(SRT_TIME);
    const text = lines
      .slice(timing + 1)
      .join('\n')
      // Formatting tags (<i>, {\an8}) aren't kept.
      .replace(/<[^>]+>|\{\\[^}]*\}/g, '')
      .trim();
    if (!from || !to || !text) {
      unread += 1;
      continue;
    }
    cues.push({ text, from: round(seconds(from)), to: round(seconds(to)) });
  }
  cues.sort((a, b) => a.from - b.from);
  return { cues, unread };
}

export type SrtShotMatch = {
  key: string;
  text: string;
  fromSec: number;
  toSec: number;
  /** The file's cues on the shot when it has more than one (shot seconds, M10 T3). */
  cues?: ShotSubtitleCue[];
};

/**
 * An .srt's cues on the cut's shots: each cue goes to the shot its middle falls in; a shot's
 * cues become its subtitle, from the first's start to the last's end (shot seconds). Cues that
 * fall outside every shot are counted.
 */
export function matchSrtToShots(
  cues: readonly SubtitleCue[],
  shots: readonly SubtitleShotSpan[]
): { matches: SrtShotMatch[]; outside: number } {
  const byKey = new Map<string, SubtitleCue[]>();
  let outside = 0;
  for (const cue of cues) {
    const middle = (cue.from + cue.to) / 2;
    const shot = shots.find(
      span => middle >= span.startSec && middle < span.startSec + span.durSec
    );
    if (!shot) {
      outside += 1;
      continue;
    }
    byKey.set(shot.key, [...(byKey.get(shot.key) ?? []), cue]);
  }
  const matches: SrtShotMatch[] = [];
  for (const shot of shots) {
    const mine = byKey.get(shot.key);
    if (!mine?.length) continue;
    matches.push({
      key: shot.key,
      text: mine.map(cue => cue.text.replace(/\s*\n\s*/g, ' ')).join(' '),
      fromSec: round(Math.max(0, mine[0]!.from - shot.startSec)),
      toSec: round(Math.min(shot.durSec, mine[mine.length - 1]!.to - shot.startSec)),
      ...(mine.length > 1
        ? {
            cues: cleanSubtitleCues(
              mine.map(cue => ({
                text: cue.text,
                fromSec: Math.max(0, cue.from - shot.startSec),
                toSec: Math.min(shot.durSec, cue.to - shot.startSec),
              }))
            ),
          }
        : {}),
    });
  }
  return { matches, outside };
}

export type SubtitleIssueKind = 'overlap' | 'too-short' | 'too-long' | 'rows' | 'characters';

export type SubtitleIssue = { index: number; kind: SubtitleIssueKind; message: string };

/** Rows a cue takes on screen at ~42 characters a row. */
function rowsOf(text: string): number {
  return text
    .split('\n')
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / SUBTITLE_MAX_CHARS)),
      0
    );
}

/** Control characters, or a lone half of a surrogate pair — an .srt can't carry them. */
const BAD_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const clock = (sec: number) => {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, '0')}`;
};

/** What's wrong with a cue list (in time order), cue by cue. */
export function subtitleIssues(cues: readonly SubtitleCue[]): SubtitleIssue[] {
  const issues: SubtitleIssue[] = [];
  cues.forEach((cue, index) => {
    const at = clock(cue.from);
    const length = cue.to - cue.from;
    const next = cues[index + 1];
    if (next && next.from < cue.to - 0.001) {
      issues.push({ index, kind: 'overlap', message: `${at}: runs into the next subtitle` });
    }
    if (length < SUBTITLE_MIN_SEC) {
      issues.push({
        index,
        kind: 'too-short',
        message: `${at}: on screen ${length.toFixed(1)} s — too short to read`,
      });
    } else if (length > SUBTITLE_MAX_SEC) {
      issues.push({
        index,
        kind: 'too-long',
        message: `${at}: on screen ${length.toFixed(1)} s — split it`,
      });
    }
    if (rowsOf(cue.text) > SUBTITLE_MAX_ROWS) {
      issues.push({ index, kind: 'rows', message: `${at}: more than two rows on screen` });
    }
    if (BAD_CHARACTERS.test(cue.text)) {
      issues.push({
        index,
        kind: 'characters',
        message: `${at}: has characters a subtitle file can’t carry`,
      });
    }
  });
  return issues;
}
