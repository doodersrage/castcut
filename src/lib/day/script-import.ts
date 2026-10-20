/**
 * A script or outline in, Day cards out (roadmap review 2026-10-13: script-to-storyboard, scoped
 * to Day). Fountain — the plain-text screenplay format — gives one card per scene: the heading's
 * place ("INT. KITCHEN - MORNING" → "kitchen", morning), the scene's first action as the beat, and
 * the lead's first line of dialogue as the card's line. Text with no scene headings is an outline:
 * each paragraph (or list item) is a card's beat. No LLM: the player sees the cards before
 * anything renders, and edits them like any typed beat. Client-safe.
 */
import { DAY_LENGTHS, daySlotsForLength, type DayLength, type DaySlot } from './planner';

export const DAY_SCRIPT_MAX_CARDS = 8;

export type DayScriptScene = {
  /** "kitchen" from "INT. KITCHEN - MORNING"; empty for an outline line. */
  place: string;
  /** "morning" | "afternoon" | "evening" | "night" from the heading, when it says. */
  time?: 'morning' | 'afternoon' | 'evening' | 'night';
  beat: string;
  /** The lead's first line in the scene (or the first line spoken, when no name matched). */
  line?: string;
};

export type DayScript = { format: 'fountain' | 'outline'; scenes: DayScriptScene[] };

const HEADING_RE = /^(?:\.(?!\.)|(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s])/i;
const TIME_WORDS: Array<[RegExp, DayScriptScene['time']]> = [
  [/\b(?:morning|dawn|sunrise)\b/i, 'morning'],
  [/\b(?:afternoon|noon|day|midday)\b/i, 'afternoon'],
  [/\b(?:evening|dusk|sunset)\b/i, 'evening'],
  [/\b(?:night|midnight|late)\b/i, 'night'],
];
/** A character cue: a line in capitals (letters, spaces, ' . -), extensions like (V.O.) allowed. */
const CUE_RE = /^(?:@)?[A-Z][A-Z0-9 .'\-]{1,40}(?:\s*\([^)]*\))?\s*\^?$/;

function cleanText(text: string, max: number): string {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '') // notes
    .replace(/\/\*[\s\S]*?\*\//g, '') // boneyard
    .replace(/[*_]+/g, '') // emphasis marks
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseHeading(line: string): { place: string; time?: DayScriptScene['time'] } {
  let text = line.replace(/^\./, '').trim();
  text = text.replace(/^(?:INT\.?\/EXT|I\/E|INT|EXT|EST)[.\s]+/i, '');
  const parts = text.split(/\s+[-–—]\s+/);
  const timeText = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const time = TIME_WORDS.find(([re]) => re.test(timeText))?.[1];
  return { place: cleanText(parts[0] ?? '', 120).toLowerCase(), ...(time ? { time } : {}) };
}

/** Read a Fountain screenplay or a plain outline. */
export function parseDayScript(raw: string): DayScript {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const lines = text.split('\n');
  // Title page: "Key: value" lines before the first blank line.
  let start = 0;
  if (/^[A-Za-z ]+:\s*\S/.test(lines[0] ?? '')) {
    while (start < lines.length && lines[start]!.trim()) start += 1;
  }
  const body = lines.slice(start);
  const hasHeadings = body.some(line => HEADING_RE.test(line.trim()));
  if (!hasHeadings) {
    const scenes = text
      .split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/)
      .map(block => cleanText(block.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''), 320))
      .filter(Boolean)
      .map(beat => ({ place: '', beat }));
    return { format: 'outline', scenes };
  }

  const scenes: Array<DayScriptScene & { dialogue: Array<{ who: string; line: string }> }> = [];
  let current: (typeof scenes)[number] | null = null;
  const blocks: string[][] = [];
  let block: string[] = [];
  for (const line of body) {
    if (line.trim()) block.push(line.trim());
    else if (block.length) {
      blocks.push(block);
      block = [];
    }
  }
  if (block.length) blocks.push(block);

  for (const lines of blocks) {
    const first = lines[0]!;
    if (HEADING_RE.test(first)) {
      current = { ...parseHeading(first), beat: '', dialogue: [] };
      scenes.push(current);
      lines.shift();
      if (!lines.length) continue;
    }
    if (!current) continue;
    const head = lines[0]!;
    if (lines.length > 1 && CUE_RE.test(head) && head !== head.toLowerCase()) {
      const who = head
        .replace(/^@/, '')
        .replace(/\s*\(.*$/, '')
        .replace(/\^$/, '')
        .trim();
      const spoken = lines
        .slice(1)
        .filter(line => !/^\(.*\)$/.test(line)) // parentheticals
        .join(' ');
      const line = cleanText(spoken, 200);
      if (line) current.dialogue.push({ who, line });
      continue;
    }
    if (/^(?:>|=|#|~)/.test(head) || /\bTO:$/.test(head)) continue; // transitions, sections, lyrics
    if (!current.beat) current.beat = cleanText(lines.join(' ').replace(/^!/, ''), 320);
  }
  return {
    format: 'fountain',
    scenes: scenes
      .filter(scene => scene.beat || scene.dialogue.length)
      .map(({ dialogue, ...scene }) => ({
        ...scene,
        ...(dialogue[0] ? { line: dialogue[0].line } : {}),
        ...(dialogue.length ? { dialogue } : {}),
      }))
      .map(scene => scene as DayScriptScene & { dialogue?: Array<{ who: string; line: string }> }),
  };
}

/** The lead's own words, or the first spoken line when the script names nobody we know. */
function leadLine(
  scene: DayScriptScene & { dialogue?: Array<{ who: string; line: string }> },
  leadName: string
): string | undefined {
  const name = leadName.trim().toUpperCase();
  const own = name ? scene.dialogue?.find(entry => entry.who.toUpperCase() === name) : undefined;
  return (own ?? scene.dialogue?.[0])?.line ?? scene.line;
}

/** Day's beats name nobody: the lead's name becomes she / he (case-insensitive, whole word). */
export function withoutLeadName(text: string, leadName: string, noun: 'woman' | 'man'): string {
  const name = leadName.trim();
  if (!name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pronoun = noun === 'man' ? 'he' : 'she';
  const possessive = noun === 'man' ? 'his' : 'her';
  return text
    .replace(new RegExp(`\\b${escaped}'s\\b`, 'gi'), possessive)
    .replace(new RegExp(`\\b${escaped}\\b`, 'gi'), pronoun)
    .replace(
      /(^|[.!?]\s+)(she|he|her|his)\b/g,
      (_m, lead: string, word: string) => `${lead}${word[0]!.toUpperCase()}${word.slice(1)}`
    );
}

/** The Day length that holds this many cards (2, 3, 4, 6 or 8). */
export function dayLengthForCards(count: number): DayLength {
  const wanted = Math.min(DAY_SCRIPT_MAX_CARDS, Math.max(1, count));
  return DAY_LENGTHS.find(length => length >= wanted) ?? 8;
}

/**
 * The Day's cards from a script, in script order: place, beat (typed, so used as written) and the
 * lead's line. Cards past the script's scenes are left empty for Suggest day.
 */
export function dayScriptSlots(
  script: DayScript,
  options: { leadName: string; leadNoun: 'woman' | 'man' }
): { length: DayLength; slots: DaySlot[]; used: number; dropped: number } {
  const scenes = script.scenes.slice(0, DAY_SCRIPT_MAX_CARDS);
  const length = dayLengthForCards(scenes.length);
  const slots = daySlotsForLength(length).map((slot, index) => {
    const scene = scenes[index];
    if (!scene) return slot;
    const beat = withoutLeadName(scene.beat, options.leadName, options.leadNoun);
    const line = leadLine(scene, options.leadName);
    return {
      ...slot,
      ...(scene.place ? { location: scene.place } : {}),
      ...(beat ? { sceneHints: beat, sceneHintsTyped: beat } : {}),
      ...(line ? { line } : {}),
    };
  });
  return {
    length,
    slots,
    used: scenes.length,
    dropped: Math.max(0, script.scenes.length - scenes.length),
  };
}
