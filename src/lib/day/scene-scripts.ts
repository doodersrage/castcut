/**
 * A Cast's screenplays (M3 S2): the script as written, kept with the Scene page's settings
 * (`tools.scene.scripts`) so it syncs like the scenes and merges per script across devices
 * (storage/tool-record-merge.ts). Only the text is kept; its reading (script/parse.ts) is made
 * again when shown — nothing is stored twice. Planned shots (S4) will hang off a script's
 * scene ids. Pure.
 */
import { parseScript, type ParsedScript } from '../script/parse';
import {
  normalizeScriptCastMap,
  normalizeScriptPlaceMap,
  placeKey,
  speakerKey,
  type ScriptCastMap,
  type ScriptPlaceChoice,
  type ScriptPlaceMap,
} from './script-cast';
import { normalizePlannedShots, type PlannedShot } from './script-shots';

export type SavedScript = {
  id: string;
  /** The Cast lead it is for. */
  castId: string;
  name: string;
  /** The script as written (Fountain or plain text). */
  source: string;
  /** Speaking parts you matched to Cast members (null: not in the Cast) — script-cast.ts. */
  castMap?: ScriptCastMap;
  /** Places you set to her home, her workplace, or somewhere else. */
  placeMap?: ScriptPlaceMap;
  /** The shot lists of its scenes (script-shots.ts), in script order. */
  shots?: PlannedShot[];
  /**
   * The mood its Scenes are made in (a Day mood or theme: a short from Short — Sport, Vacation…).
   * Unset: the Scene page's own mood, as before.
   */
  mood?: string;
  /**
   * What the episode made true, as its writer noted it scene by scene (2026-11-08) — the next
   * one in a series is written knowing it. Written episodes only.
   */
  summary?: string;
  /** The script this one follows on from (Write the next one): a series, read back for its summary. */
  follows?: string;
  createdAt: number;
  updatedAt: number;
};

/** The longest script kept (about a 100-page feature in Fountain). */
export const SCRIPT_SOURCE_MAX = 200_000;
export const SCRIPTS_PER_CAST = 12;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const time = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export function normalizeSavedScript(raw: unknown, now = Date.now()): SavedScript | null {
  if (!raw || typeof raw !== 'object') return null;
  const script = raw as Partial<SavedScript>;
  const id = text(script.id, 80);
  const castId = text(script.castId, 120);
  const source = typeof script.source === 'string' ? script.source.slice(0, SCRIPT_SOURCE_MAX) : '';
  if (!id || !castId || !source.trim()) return null;
  const createdAt = time(script.createdAt, now);
  const castMap = normalizeScriptCastMap(script.castMap);
  const placeMap = normalizeScriptPlaceMap(script.placeMap);
  const shots = normalizePlannedShots(script.shots);
  const mood = text(script.mood, 40);
  const summary = text(script.summary, 1600);
  const follows = text(script.follows, 80);
  return {
    id,
    castId,
    name: text(script.name, 80) || 'Script',
    source,
    ...(castMap ? { castMap } : {}),
    ...(placeMap ? { placeMap } : {}),
    ...(shots ? { shots } : {}),
    ...(mood ? { mood } : {}),
    ...(summary ? { summary } : {}),
    ...(follows ? { follows } : {}),
    createdAt,
    updatedAt: time(script.updatedAt, createdAt),
  };
}

/**
 * The script one more for this Cast would drop (scripts keep the newest {@link SCRIPTS_PER_CAST}
 * per Cast, by when they last changed), or null while there is room — asked before keeping one.
 */
export function scriptDroppedByAdding(
  scripts: readonly SavedScript[] | undefined,
  castId: string
): SavedScript | null {
  const mine = scriptsForCast(scripts, castId);
  if (mine.length < SCRIPTS_PER_CAST) return null;
  return [...mine].sort((a, b) => a.updatedAt - b.updatedAt)[0] ?? null;
}

/**
 * Every stored script, cleaned: one per id, the newest {@link SCRIPTS_PER_CAST} per Cast. Scripts
 * in `known` are already clean and kept as they are (M6 V7: a feature script's 360 shots cleaned
 * again on every save of any script was the slowest part of a save).
 */
export function normalizeSavedScripts(
  input: unknown,
  now = Date.now(),
  known?: ReadonlySet<unknown>
): SavedScript[] {
  const byId = new Map<string, SavedScript>();
  for (const raw of Array.isArray(input) ? input : []) {
    const script = known?.has(raw) ? (raw as SavedScript) : normalizeSavedScript(raw, now);
    if (script) byId.set(script.id, script);
  }
  const perCast = new Map<string, SavedScript[]>();
  for (const script of byId.values()) {
    perCast.set(script.castId, [...(perCast.get(script.castId) ?? []), script]);
  }
  return [...perCast.values()].flatMap(list =>
    list
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, SCRIPTS_PER_CAST)
      .sort((a, b) => a.createdAt - b.createdAt)
  );
}

export function scriptsForCast(
  scripts: readonly SavedScript[] | undefined,
  castId: string
): SavedScript[] {
  const id = castId.trim();
  return id ? (scripts ?? []).filter(script => script.castId === id) : [];
}

/** A name from the script itself: its title page's title, else its first scene's heading. */
export function scriptNameOf(parsed: ParsedScript, fallback = 'Script'): string {
  const title = parsed.title.title?.replace(/[_*]/g, '').trim();
  return (title || parsed.scenes[0]?.heading || fallback).slice(0, 80);
}

function newScriptId(now: number): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `script-${now.toString(36)}-${random}`;
}

/** A new script for a Cast; too long a text is refused (null), never cut silently. */
export function createScript(input: {
  castId: string;
  source: string;
  name?: string;
  now?: number;
  id?: string;
  /** The mood its Scenes are made in (unset: the Scene page's). */
  mood?: string | null;
  /** A written episode's summary (its story notes) and the script it follows on from. */
  summary?: string | null;
  follows?: string | null;
}): SavedScript | null {
  const now = input.now ?? Date.now();
  const mood = input.mood?.trim().slice(0, 40);
  const summary = input.summary?.trim().slice(0, 1600);
  const follows = input.follows?.trim().slice(0, 80);
  const source = input.source.replace(/\r\n?/g, '\n');
  if (!input.castId.trim() || !source.trim() || source.length > SCRIPT_SOURCE_MAX) return null;
  return {
    id: input.id ?? newScriptId(now),
    castId: input.castId.trim(),
    name: (input.name?.trim() || scriptNameOf(parseScript(source))).slice(0, 80),
    source,
    ...(mood ? { mood } : {}),
    ...(summary ? { summary } : {}),
    ...(follows ? { follows } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A series so far (2026-11-08): the summaries of the episodes `script` follows on from, oldest
 * first, then its own — up to `depth` back. Episodes with no summary (imported, from Short) are
 * named with nothing more. Pure.
 */
export function seriesSoFar(
  script: Pick<SavedScript, 'name' | 'summary' | 'follows'>,
  scripts: readonly Pick<SavedScript, 'id' | 'name' | 'summary' | 'follows'>[],
  depth = 3
): string {
  const chain: Array<Pick<SavedScript, 'name' | 'summary'>> = [script];
  const seen = new Set<string>();
  let at = script.follows;
  while (at && chain.length <= depth && !seen.has(at)) {
    seen.add(at);
    const earlier = scripts.find(entry => entry.id === at);
    if (!earlier) break;
    chain.unshift(earlier);
    at = earlier.follows;
  }
  return chain
    .map(
      entry => `“${entry.name.trim()}”${entry.summary?.trim() ? `: ${entry.summary.trim()}` : ''}`
    )
    .join('\n')
    .slice(-2400);
}

export type ScriptsCache = {
  scripts?: SavedScript[];
  /** When scripts were deleted, by id: another device's copy doesn't bring one back. */
  removedScriptAt?: Record<string, number>;
};

export function addScriptPatch(
  cache: ScriptsCache,
  script: SavedScript
): Required<Pick<ScriptsCache, 'scripts'>> {
  return { scripts: normalizeSavedScripts([...(cache.scripts ?? []), script]) };
}

export function renameScriptPatch(
  cache: ScriptsCache,
  id: string,
  name: string,
  now = Date.now()
): Pick<ScriptsCache, 'scripts'> | null {
  const clean = name.trim().slice(0, 80);
  const scripts = cache.scripts ?? [];
  const target = scripts.find(script => script.id === id);
  if (!target || !clean || clean === target.name) return null;
  return {
    scripts: scripts.map(script =>
      script.id === id ? { ...script, name: clean, updatedAt: now } : script
    ),
  };
}

function patchScript(
  cache: ScriptsCache,
  id: string,
  change: (script: SavedScript) => SavedScript
): Pick<ScriptsCache, 'scripts'> | null {
  const scripts = cache.scripts ?? [];
  if (!scripts.some(script => script.id === id)) return null;
  return { scripts: scripts.map(script => (script.id === id ? change(script) : script)) };
}

/** A speaking part is this Cast member (an id), not in the Cast (null), or open again (undefined). */
export function setScriptCastPatch(
  cache: ScriptsCache,
  id: string,
  speaker: string,
  castId: string | null | undefined,
  now = Date.now()
): Pick<ScriptsCache, 'scripts'> | null {
  const key = speakerKey(speaker);
  if (!key) return null;
  return patchScript(cache, id, script => {
    const { [key]: _was, ...rest } = script.castMap ?? {};
    const castMap: ScriptCastMap = castId === undefined ? rest : { ...rest, [key]: castId };
    const { castMap: _old, ...base } = script;
    return { ...base, ...(Object.keys(castMap).length ? { castMap } : {}), updatedAt: now };
  });
}

/** A place is her home, her workplace, or somewhere else (undefined: as Castcut reads it). */
export function setScriptPlacePatch(
  cache: ScriptsCache,
  id: string,
  place: string,
  choice: ScriptPlaceChoice | undefined,
  now = Date.now()
): Pick<ScriptsCache, 'scripts'> | null {
  const key = placeKey(place);
  if (!key) return null;
  return patchScript(cache, id, script => {
    const { [key]: _was, ...rest } = script.placeMap ?? {};
    const placeMap: ScriptPlaceMap = choice ? { ...rest, [key]: choice } : rest;
    const { placeMap: _old, ...base } = script;
    return { ...base, ...(Object.keys(placeMap).length ? { placeMap } : {}), updatedAt: now };
  });
}

/** The script's shot lists replaced (an empty list clears them). */
export function setScriptShotsPatch(
  cache: ScriptsCache,
  id: string,
  shots: readonly PlannedShot[],
  now = Date.now()
): Pick<ScriptsCache, 'scripts'> | null {
  return patchScript(cache, id, script => {
    const { shots: _old, ...base } = script;
    const next = normalizePlannedShots(shots);
    return { ...base, ...(next ? { shots: next } : {}), updatedAt: now };
  });
}

export function removeScriptPatch(
  cache: ScriptsCache,
  id: string,
  now = Date.now()
): Required<ScriptsCache> {
  return {
    scripts: (cache.scripts ?? []).filter(script => script.id !== id),
    removedScriptAt: { ...(cache.removedScriptAt ?? {}), [id]: now },
  };
}

/** What a script holds, in a line: "12 scenes · 4 speaking parts · 2 not understood". */
export function scriptSummary(parsed: ParsedScript): string {
  const speakers = new Set(parsed.scenes.flatMap(scene => scene.speakers));
  return [
    `${parsed.scenes.length} ${parsed.format === 'outline' ? 'beat' : 'scene'}${parsed.scenes.length === 1 ? '' : 's'}`,
    speakers.size ? `${speakers.size} speaking part${speakers.size === 1 ? '' : 's'}` : '',
    parsed.issues.length ? `${parsed.issues.length} not understood` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A script as a file (2026-11-06: a Cast keeps 12 scripts — shorts use them up): the whole
 * record — text, shots, Who's who, places, mood — so it comes back as it was, its Scenes linked
 * to it again by its id. Archive saves it and frees its place; Import a script reads it back.
 */
export const SCRIPT_ARCHIVE_KIND = 'castcut-script';

export function scriptArchiveText(script: SavedScript): string {
  return JSON.stringify({ kind: SCRIPT_ARCHIVE_KIND, version: 1, script }, null, 1);
}

/** The filename an archive is saved as. */
export function scriptArchiveFilename(script: Pick<SavedScript, 'name'>): string {
  const base = script.name
    .trim()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${base || 'script'}.castcut-script.json`;
}

/**
 * The script in an archive's text, for this Cast — or null when it isn't one. Brought back as
 * changed now: newer than its deletion, so the store (and another device) keep it.
 */
export function readScriptArchive(
  text: string,
  castId: string,
  now = Date.now()
): SavedScript | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const archive = value as { kind?: unknown; script?: unknown } | null;
  if (!archive || archive.kind !== SCRIPT_ARCHIVE_KIND) return null;
  const script = normalizeSavedScript(archive.script, now);
  if (!script || !castId.trim()) return null;
  // A script archived from another Cast comes back as this one's (its Scenes stay theirs).
  return { ...script, castId: castId.trim(), updatedAt: Math.max(now, script.updatedAt + 1) };
}
