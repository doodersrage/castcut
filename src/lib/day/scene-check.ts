/**
 * A written scene looked over before it is kept (2026-11-10, "more training for the writer"): the
 * script notes found by rule (script-notes.ts) and, when asked, the editor's read (an LLM's notes,
 * episodeCritiqueMessages) go to one revision of the scene. The revision is kept only when it is
 * no worse by rule and still the scene: it keeps a heading and at least half of its lines. Used by
 * Write an episode and by Short's dialogue, so both write the same way.
 */
import { parseScript, type ScriptScene } from '../script/parse';
import { scriptNotes } from './script-notes';

/** A step of /api/script-episode, with what every step sends (lead, cast, tone, the LLM). */
export type SceneCheckPost = <T>(body: Record<string, unknown>) => Promise<T>;

export type SceneCheckStage = 'checking' | 'editing';

/**
 * Whether the editor's read is on unless asked (2026-11-10): measured on an 8B model it added
 * ~29 s a 4-scene short (~40%) for no gain the script notes could see — off, a toggle in Write an
 * episode. Worth turning on with a larger writer model.
 */
export const SCENE_EDITOR_DEFAULT = false;

export type CheckedScene = {
  text: string;
  /** Whether the revision was kept. */
  revised: boolean;
  /** What it was revised for (the rule's notes, then the editor's). */
  notes: string[];
};

function readScene(fountain: string, earlier: readonly ScriptScene[]) {
  const scene = parseScript(fountain).scenes[0];
  if (!scene) return null;
  const lines = scene.elements.filter(element => element.kind === 'dialogue').length;
  const notes = scriptNotes({ scriptId: 'draft', scene, earlier });
  return { lines, notes };
}

export async function checkWrittenScene(input: {
  text: string;
  post: SceneCheckPost;
  /** The script notes found by rule. */
  check: boolean;
  /** The editor's read too (one more LLM call; a revision when it has notes). */
  edit: boolean;
  /** The scenes written before it (a line said there again is noted). */
  earlier?: readonly string[];
  /** What the outline asks of the scene, for the editor. */
  summary?: string;
  onStage?: (stage: SceneCheckStage) => void;
}): Promise<CheckedScene> {
  const { text, post } = input;
  const earlier = (input.earlier ?? []).flatMap(scene => parseScript(scene).scenes);
  const read = readScene(text, earlier);
  if (!read || (!input.check && !input.edit)) return { text, revised: false, notes: [] };
  const ruled = input.check ? read.notes.map(note => `${note.evidence} — ${note.suggestion}`) : [];
  let edited: string[] = [];
  if (input.edit) {
    input.onStage?.('editing');
    edited = await post<{ notes?: unknown }>({
      step: 'critique',
      scene: text,
      ...(input.summary ? { summary: input.summary } : {}),
    })
      .then(data =>
        Array.isArray(data.notes)
          ? data.notes.filter((note): note is string => typeof note === 'string')
          : []
      )
      .catch(() => []);
  }
  const notes = [...ruled, ...edited].slice(0, 6);
  if (!notes.length) return { text, revised: false, notes: [] };
  input.onStage?.('checking');
  const revision = await post<{ text?: unknown }>({ step: 'revise', scene: text, notes })
    .then(data => (typeof data.text === 'string' ? data.text : null))
    .catch(() => null);
  const after = revision ? readScene(revision, earlier) : null;
  const before = input.check ? read.notes.length : 0;
  const ruledAfter = after && input.check ? after.notes.length : 0;
  const kept =
    after !== null &&
    after.lines >= Math.ceil(read.lines / 2) &&
    // The rule's notes fewer; or, with the editor's notes, no more than before.
    (edited.length ? ruledAfter <= before : ruledAfter < before);
  return kept ? { text: revision!, revised: true, notes } : { text, revised: false, notes };
}

/**
 * Best of two (2026-11-10): the draft of a scene to keep when it was written more than once —
 * the fewest script notes, then the one nearest a page (ten to fourteen beats), then the first.
 */
export function betterScene(drafts: readonly string[], earlier: readonly string[] = []): string {
  const before = earlier.flatMap(scene => parseScript(scene).scenes);
  let best: { text: string; notes: number; off: number } | null = null;
  for (const text of drafts) {
    const scene = parseScript(text).scenes[0];
    if (!scene) continue;
    const beats = scene.elements.filter(
      element => element.kind === 'action' || (element.kind === 'dialogue' && element.speaker)
    ).length;
    const notes = scriptNotes({ scriptId: 'draft', scene, earlier: before }).length;
    const off = beats < 10 ? 10 - beats : beats > 14 ? beats - 14 : 0;
    if (!best || notes < best.notes || (notes === best.notes && off < best.off))
      best = { text, notes, off };
  }
  return best?.text ?? drafts[0] ?? '';
}
