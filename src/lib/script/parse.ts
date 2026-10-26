/**
 * A screenplay read whole (M3 S1, ROADMAP §6.1): Fountain — the plain-text screenplay format — or
 * an outline (no scene headings). Every element is kept with the source lines it came from, so
 * nothing the writer wrote is lost; what isn't understood is listed, not dropped. Scene ids are
 * stable: from the scene number when there is one (`#12#`), else the heading and how many times
 * that heading came before — editing another scene never changes them (S6 matches on them).
 *
 * Day's own import (day/script-import.ts) keeps its smaller reading for now. Pure.
 */

export type ScriptElementKind =
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'lyric'
  | 'note'
  | 'section'
  | 'synopsis'
  | 'page-break';

export type ScriptElement = {
  kind: ScriptElementKind;
  /** As written (markup like *italics* kept), joined lines for a multi-line element. */
  text: string;
  /** Source lines, 1-based, inclusive. */
  from: number;
  to: number;
  /** Dialogue, parentheticals and cues: who speaks (the cue without its extension). */
  speaker?: string;
  /** A cue's extension: "V.O.", "O.S.", "CONT'D". */
  extension?: string;
  /** Dual dialogue (a cue ending in ^). */
  dual?: boolean;
  /** Sections: their depth (# = 1). */
  depth?: number;
};

export type ScriptDayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export type ScriptScene = {
  id: string;
  /** The heading as written ("INT. KITCHEN - MORNING"); an outline's paragraph has none. */
  heading: string;
  /** `#12#` on the heading. */
  number?: string;
  setting?: 'INT' | 'EXT' | 'INT/EXT';
  /** "KITCHEN" from "INT. KITCHEN - MORNING". */
  place: string;
  /** "MORNING" as written. */
  time?: string;
  dayPart?: ScriptDayPart;
  elements: ScriptElement[];
  /** Who speaks in it, in order of first line. */
  speakers: string[];
  from: number;
  to: number;
};

export type ScriptIssue = { line: number; text: string; reason: string };

export type ParsedScript = {
  format: 'fountain' | 'outline';
  /** Title page ("Title: …", "Author: …"), keys lower-cased. */
  title: Record<string, string>;
  /** What comes before the first scene heading (a cold open's action, sections). */
  preamble: ScriptElement[];
  scenes: ScriptScene[];
  /** What wasn't understood, with where. */
  issues: ScriptIssue[];
};

const HEADING_RE = /^(?:\.(?!\.)|(?:int|ext|est|int\.?\/ext|i\/e)[.\s])/i;
const SCENE_NUMBER_RE = /\s*#([\w.-]+)#\s*$/;
/** "CUT TO:", and the fades writers use as transitions (the spec only names "… TO:"). */
const TRANSITION_RE = /^(?:[A-Z0-9 .'-]+TO:|FADE (?:IN|OUT)[:.]?|(?:FADE|CUT) TO BLACK\.?)$/;
/** A cue: an all-caps line (it may hold digits, punctuation and an extension in parentheses). */
const CUE_RE = /^(?:@[^\s].*|[^a-z]*[A-Z][^a-z]*)$/;

const DAY_PART_WORDS: Array<[RegExp, ScriptDayPart]> = [
  [/\b(?:morning|dawn|sunrise|breakfast)\b/i, 'morning'],
  [/\b(?:day|afternoon|noon|midday|lunch)\b/i, 'afternoon'],
  [/\b(?:evening|dusk|sunset|twilight|dinner)\b/i, 'evening'],
  [/\b(?:night|midnight|late)\b/i, 'night'],
];

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 60) || 'scene'
  );
}

function readHeading(
  raw: string
): Pick<ScriptScene, 'heading' | 'number' | 'setting' | 'place' | 'time' | 'dayPart'> {
  let heading = raw.replace(/^\.(?!\.)/, '').trim();
  const numbered = heading.match(SCENE_NUMBER_RE);
  const number = numbered?.[1];
  if (numbered) heading = heading.replace(SCENE_NUMBER_RE, '').trim();
  const prefix = heading.match(/^(int\.?\/ext|i\/e|int|ext|est)[.\s]\s*/i);
  const settingWord = prefix?.[1]?.toUpperCase();
  const setting =
    settingWord === 'INT'
      ? 'INT'
      : settingWord === 'EXT' || settingWord === 'EST'
        ? 'EXT'
        : settingWord
          ? 'INT/EXT'
          : undefined;
  const rest = prefix ? heading.slice(prefix[0].length) : heading;
  const dash = rest.search(/\s+[-–—]\s+/);
  const place = (dash >= 0 ? rest.slice(0, dash) : rest).trim();
  const time =
    dash >= 0
      ? rest
          .slice(dash)
          .replace(/^\s+[-–—]\s+/, '')
          .trim()
      : undefined;
  const dayPart = time ? DAY_PART_WORDS.find(([re]) => re.test(time))?.[1] : undefined;
  return {
    heading,
    ...(number ? { number } : {}),
    ...(setting ? { setting } : {}),
    place,
    ...(time ? { time } : {}),
    ...(dayPart ? { dayPart } : {}),
  };
}

type Line = { n: number; text: string };

/** Lines with notes ([[ ]]) and boneyard (/* *\/) taken out; what they held, and unclosed ones. */
function stripNotes(lines: string[], issues: ScriptIssue[]) {
  const notes: ScriptElement[] = [];
  const out: Line[] = [];
  let inBoneyard: number | null = null;
  let note: { from: number; parts: string[] } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    const n = index + 1;
    let line = raw;
    let kept = '';
    while (line.length) {
      if (inBoneyard !== null) {
        const end = line.indexOf('*/');
        if (end < 0) {
          line = '';
          break;
        }
        line = line.slice(end + 2);
        inBoneyard = null;
        continue;
      }
      if (note) {
        const end = line.indexOf(']]');
        if (end < 0) {
          note.parts.push(line);
          line = '';
          break;
        }
        note.parts.push(line.slice(0, end));
        notes.push({ kind: 'note', text: note.parts.join(' ').trim(), from: note.from, to: n });
        note = null;
        line = line.slice(end + 2);
        continue;
      }
      const bone = line.indexOf('/*');
      const open = line.indexOf('[[');
      if (bone < 0 && open < 0) {
        kept += line;
        break;
      }
      if (bone >= 0 && (open < 0 || bone < open)) {
        kept += line.slice(0, bone);
        line = line.slice(bone + 2);
        inBoneyard = n;
        continue;
      }
      kept += line.slice(0, open);
      line = line.slice(open + 2);
      note = { from: n, parts: [] };
    }
    out.push({ n, text: kept });
  }
  if (inBoneyard !== null) {
    issues.push({
      line: inBoneyard,
      text: '/*',
      reason: 'A comment (/* … */) is never closed; the rest of the script is inside it.',
    });
  }
  if (note) {
    issues.push({ line: note.from, text: '[[', reason: 'A note ([[ … ]]) is never closed.' });
  }
  return { lines: out, notes };
}

/** Text that isn't a screenplay at all (another app's file format). */
function foreignFormat(text: string): string | null {
  const head = text.trimStart().slice(0, 200);
  if (/^<\?xml|^<FinalDraft/i.test(head))
    return 'This looks like a Final Draft (.fdx) or other XML file — export it as Fountain or plain text.';
  if (/^\{\\rtf/.test(head))
    return 'This looks like an RTF file — save it as plain text or Fountain.';
  if (/^%PDF/.test(head))
    return 'This looks like a PDF — copy the text out, or export it as Fountain.';
  return null;
}

export function parseScript(raw: string): ParsedScript {
  const issues: ScriptIssue[] = [];
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const foreign = foreignFormat(text);
  if (foreign) {
    return {
      format: 'fountain',
      title: {},
      preamble: [],
      scenes: [],
      issues: [{ line: 1, text: text.split('\n')[0]!.slice(0, 80), reason: foreign }],
    };
  }
  const rawLines = text.split('\n');

  // Title page: "Key: value" lines (values may go on, indented) before the first blank line.
  const title: Record<string, string> = {};
  let start = 0;
  if (/^[A-Za-z][A-Za-z ]*:/.test(rawLines[0] ?? '')) {
    let key = '';
    while (start < rawLines.length && rawLines[start]!.trim()) {
      const line = rawLines[start]!;
      const pair = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
      if (pair && !/^\s/.test(line)) {
        key = pair[1]!.trim().toLowerCase();
        title[key] = pair[2]!.trim();
      } else if (key) {
        title[key] = `${title[key]} ${line.trim()}`.trim();
      }
      start += 1;
    }
  }

  const { lines: allLines, notes } = stripNotes(rawLines, issues);
  const lines = allLines.slice(start);
  const hasHeadings = lines.some(line => HEADING_RE.test(line.text.trim()));

  if (!hasHeadings) {
    return { format: 'outline', title, preamble: [], scenes: outlineScenes(lines), issues };
  }

  // Paragraphs: runs of non-blank lines.
  const blocks: Line[][] = [];
  let block: Line[] = [];
  for (const line of lines) {
    if (line.text.trim()) block.push({ n: line.n, text: line.text.trimEnd() });
    else if (block.length) {
      blocks.push(block);
      block = [];
    }
  }
  if (block.length) blocks.push(block);

  const preamble: ScriptElement[] = [];
  const scenes: ScriptScene[] = [];
  const headingCounts = new Map<string, number>();
  let current: ScriptScene | null = null;
  const into = () => (current ? current.elements : preamble);
  const push = (element: ScriptElement) => into().push(element);

  for (const paragraph of blocks) {
    let rest = paragraph;
    const first = rest[0]!;
    const firstText = first.text.trim();
    if (HEADING_RE.test(firstText) && !firstText.startsWith('..')) {
      const read = readHeading(firstText);
      const key = read.number ? `scene-${slug(read.number)}` : slug(read.heading);
      const seen = headingCounts.get(key) ?? 0;
      headingCounts.set(key, seen + 1);
      current = {
        id: seen ? `${key}-${seen + 1}` : key,
        ...read,
        elements: [],
        speakers: [],
        from: first.n,
        to: first.n,
      };
      scenes.push(current);
      rest = rest.slice(1);
      if (!rest.length) continue;
    }
    readParagraph(rest, push);
  }

  // Notes go to the scene their first line is in.
  for (const note of notes) {
    const scene = [...scenes].reverse().find(entry => entry.from <= note.from);
    (scene ? scene.elements : preamble).push(note);
  }
  for (const scene of scenes) {
    scene.elements.sort((a, b) => a.from - b.from);
    scene.to = Math.max(scene.from, scene.elements.at(-1)?.to ?? scene.from);
    const speakers: string[] = [];
    for (const element of scene.elements) {
      if (element.kind === 'character' && element.speaker && !speakers.includes(element.speaker)) {
        speakers.push(element.speaker);
      }
    }
    scene.speakers = speakers;
  }
  preamble.sort((a, b) => a.from - b.from);
  return { format: 'fountain', title, preamble, scenes, issues };
}

function readParagraph(paragraph: Line[], push: (element: ScriptElement) => void): void {
  const first = paragraph[0]!;
  const head = first.text.trim();
  const last = paragraph.at(-1)!;
  const joined = () => paragraph.map(line => line.text.trim()).join('\n');

  if (/^={3,}\s*$/.test(head) && paragraph.length === 1) {
    push({ kind: 'page-break', text: head, from: first.n, to: first.n });
    return;
  }
  const section = head.match(/^(#+)\s*(.*)$/);
  if (section) {
    push({
      kind: 'section',
      text: section[2]!.trim(),
      depth: section[1]!.length,
      from: first.n,
      to: first.n,
    });
    if (paragraph.length > 1) readParagraph(paragraph.slice(1), push);
    return;
  }
  if (/^=(?!=)/.test(head)) {
    push({ kind: 'synopsis', text: head.replace(/^=\s*/, ''), from: first.n, to: first.n });
    if (paragraph.length > 1) readParagraph(paragraph.slice(1), push);
    return;
  }
  if (/^>.*<$/.test(head)) {
    push({ kind: 'centered', text: head.replace(/^>\s*|\s*<$/g, ''), from: first.n, to: first.n });
    if (paragraph.length > 1) readParagraph(paragraph.slice(1), push);
    return;
  }
  if (paragraph.length === 1 && (/^>(?!.*<$)/.test(head) || TRANSITION_RE.test(head))) {
    push({ kind: 'transition', text: head.replace(/^>\s*/, ''), from: first.n, to: first.n });
    return;
  }
  if (paragraph.every(line => /^~/.test(line.text.trim()))) {
    push({
      kind: 'lyric',
      text: paragraph.map(line => line.text.trim().replace(/^~\s*/, '')).join('\n'),
      from: first.n,
      to: last.n,
    });
    return;
  }
  // A cue and its dialogue: an all-caps line (or @Name) with lines under it.
  const forcedAction = head.startsWith('!');
  if (!forcedAction && paragraph.length > 1 && CUE_RE.test(head) && /[A-Za-z]/.test(head)) {
    const cue = head.replace(/^@/, '');
    const dual = /\^\s*$/.test(cue);
    const bare = cue.replace(/\s*\^\s*$/, '');
    const extension = bare.match(/\(([^)]*)\)\s*$/)?.[1]?.trim();
    const speaker = bare.replace(/\s*\([^)]*\)\s*$/, '').trim();
    push({
      kind: 'character',
      text: head,
      speaker,
      ...(extension ? { extension } : {}),
      ...(dual ? { dual } : {}),
      from: first.n,
      to: first.n,
    });
    let spoken: Line[] = [];
    const flush = () => {
      if (!spoken.length) return;
      push({
        kind: 'dialogue',
        text: spoken.map(line => line.text.trim()).join('\n'),
        speaker,
        from: spoken[0]!.n,
        to: spoken.at(-1)!.n,
      });
      spoken = [];
    };
    for (const line of paragraph.slice(1)) {
      const body = line.text.trim();
      if (/^\(.*\)$/.test(body)) {
        flush();
        push({ kind: 'parenthetical', text: body, speaker, from: line.n, to: line.n });
      } else spoken.push(line);
    }
    flush();
    return;
  }
  push({
    kind: 'action',
    text: forcedAction ? joined().replace(/^!/, '') : joined(),
    from: first.n,
    to: last.n,
  });
}

/** No scene headings: each paragraph or list item is a scene of one action. */
function outlineScenes(lines: Line[]): ScriptScene[] {
  const scenes: ScriptScene[] = [];
  let block: Line[] = [];
  const flush = () => {
    const text = block
      .map(line => line.text.trim())
      .join(' ')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .trim();
    if (text) {
      const index = scenes.length + 1;
      scenes.push({
        id: `outline-${index}`,
        heading: '',
        place: '',
        elements: [{ kind: 'action', text, from: block[0]!.n, to: block.at(-1)!.n }],
        speakers: [],
        from: block[0]!.n,
        to: block.at(-1)!.n,
      });
    }
    block = [];
  };
  for (const line of lines) {
    const body = line.text.trim();
    if (!body) flush();
    else {
      if (/^(?:[-*•]|\d+[.)])\s/.test(body) && block.length) flush();
      block.push(line);
    }
  }
  flush();
  return scenes;
}
