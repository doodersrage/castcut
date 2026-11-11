/**
 * The writer learns from your edits (2026-11-10, "more training for the writer"): a scene the
 * writer wrote and you changed before keeping the script is kept as it was written and as you
 * rewrote it — the newest few, in Scene's settings (`tools.scene.writerEdits`, optional; a
 * release before ignores it). The scene writer is shown the newest one (the one in its tone
 * first) as how the person it writes for rewrites. Only text: no ids, nothing tied to a Cast.
 */
import { parseScript } from '../script/parse';

export type WriterEdit = {
  /** The scene as the writer wrote it. */
  written: string;
  /** As you kept it. */
  kept: string;
  /** The tone it was written in (Write an episode's, a mood's). */
  tone?: string;
  at: number;
};

/** Edits kept (the newest). */
export const WRITER_EDITS_MAX = 4;
/** A scene's text kept, each side. */
export const WRITER_EDIT_CHARS = 1500;
/** Words changed (added or taken out) before a scene counts as rewritten, not a typo fixed. */
export const WRITER_EDIT_WORDS_MIN = 3;

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';

export function normalizeWriterEdits(value: unknown): WriterEdit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(raw => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}))
    .map(raw => ({
      written: clean(raw.written, WRITER_EDIT_CHARS),
      kept: clean(raw.kept, WRITER_EDIT_CHARS),
      tone: clean(raw.tone, 60),
      at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0,
    }))
    .filter(edit => edit.written && edit.kept && edit.written !== edit.kept)
    .map(({ tone, ...edit }) => (tone ? { ...edit, tone } : edit))
    .sort((a, b) => b.at - a.at)
    .slice(0, WRITER_EDITS_MAX);
}

/** Each scene of a script as its own text (its heading to the next one's). */
function sceneTexts(fountain: string): { heading: string; text: string }[] {
  const lines = fountain.replace(/\r\n?/g, '\n').split('\n');
  return parseScript(fountain).scenes.map(scene => ({
    heading: scene.heading.trim().toUpperCase(),
    text: lines
      .slice(scene.from - 1, scene.to)
      .join('\n')
      .trim(),
  }));
}

/** Words added plus words taken out (as multisets, case and punctuation aside). */
function wordsChanged(a: string, b: string): number {
  const count = (text: string) => {
    const map = new Map<string, number>();
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? [])
      map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  };
  const left = count(a);
  const right = count(b);
  let changed = 0;
  for (const word of new Set([...left.keys(), ...right.keys()]))
    changed += Math.abs((left.get(word) ?? 0) - (right.get(word) ?? 0));
  return changed;
}

/**
 * The scenes you rewrote between what the writer wrote and what you kept: paired by heading (else
 * by place in the script when both have as many scenes); a scene dropped or added isn't an edit.
 */
export function writerEditsBetween(input: {
  written: string;
  kept: string;
  tone?: string;
  now?: number;
}): WriterEdit[] {
  const written = sceneTexts(input.written);
  const kept = sceneTexts(input.kept);
  const byIndex = written.length === kept.length;
  const now = input.now ?? Date.now();
  const tone = input.tone?.trim().slice(0, 60);
  const out: WriterEdit[] = [];
  written.forEach((scene, index) => {
    const mine =
      kept.find(entry => entry.heading === scene.heading) ?? (byIndex ? kept[index] : undefined);
    if (!mine || wordsChanged(scene.text, mine.text) < WRITER_EDIT_WORDS_MIN) return;
    out.push({
      written: scene.text.slice(0, WRITER_EDIT_CHARS),
      kept: mine.text.slice(0, WRITER_EDIT_CHARS),
      ...(tone ? { tone } : {}),
      at: now,
    });
  });
  return out;
}

/** The kept edits with these added (newest first, at most {@link WRITER_EDITS_MAX}). */
export function withWriterEdits(list: unknown, added: readonly WriterEdit[]): WriterEdit[] {
  return normalizeWriterEdits([...added, ...normalizeWriterEdits(list)]);
}

/** The edit the writer is shown: the newest in its tone, else the newest. */
export function writerEditFor(list: unknown, tone?: string): WriterEdit | undefined {
  const edits = normalizeWriterEdits(list);
  const want = tone?.trim().toLowerCase();
  return (want && edits.find(edit => edit.tone?.toLowerCase() === want)) || edits[0];
}
