/**
 * A short as a package (FINISHING_PLAN Phase 2, 2026-11-13): one script with what makes it a
 * film here — its Scenes and their takes, its Short board, the Cast it uses — carried in a Cut
 * package (cut-package.ts, format 2) beside the cut, so the short opens on another install as it
 * was: Cut plays it, Scene shows its takes, Script its text and shots.
 *
 * On import it is added beside what is there, never over it: each script, Scene and Cast keeps
 * its id when that id is free here and gets a new one when not, and every reference to a changed
 * id — the Scenes' links to their script, Cut's shot keys (`scenes:<id>~n`), the board's link — is
 * rewritten to match (remapPackageIds). Pure.
 */
import type { DayToolCache } from '../play/settings';
import type { CastFile } from '../cast/transfer';
import { normalizeSavedScript, type SavedScript } from '../day/scene-scripts';
import { normalizeSavedScenes, type SavedScene } from '../day/scenes';

/** The Short board's fields that travel: the board, not this install's page state. */
export type ShortPackageBoard = Pick<
  DayToolCache,
  | 'slots'
  | 'slotOrder'
  | 'dayLength'
  | 'stills'
  | 'dayMood'
  | 'dayWeather'
  | 'allowCompanions'
  | 'stillsCharacterId'
  | 'shortLink'
>;

const BOARD_FIELDS = [
  'slots',
  'slotOrder',
  'dayLength',
  'stills',
  'dayMood',
  'dayWeather',
  'allowCompanions',
  'stillsCharacterId',
  'shortLink',
] as const satisfies ReadonlyArray<keyof ShortPackageBoard>;

export type ShortPackage = {
  script: SavedScript;
  /** Its Scenes (made from its shots, its cards'), with their takes. */
  scenes: SavedScene[];
  /** The Short board linked to it, whole (read through its short), when there is one. */
  board?: ShortPackageBoard;
  /** The Cast it uses — its lead first — as Cast files without their own Scenes or Story. */
  cast: CastFile[];
};

/** The Cast ids a short uses: its lead, Who's who, the Scenes' leads and partners. */
export function shortCastIds(script: SavedScript, scenes: readonly SavedScene[]): string[] {
  const ids = [
    script.castId,
    ...Object.values(script.castMap ?? {}),
    ...scenes.flatMap(scene => [scene.castId, scene.partnerCharacterId ?? '']),
  ]
    .map(id => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean);
  return [...new Set(ids)];
}

/** The short's content for a package: the script's Scenes and its own board only. */
export function shortPackageContent(input: {
  script: SavedScript;
  scenes: readonly SavedScene[];
  board?: Partial<DayToolCache> | null;
  cast: readonly CastFile[];
}): ShortPackage {
  const { script } = input;
  const scenes = input.scenes.filter(scene => scene.fromScript?.scriptId === script.id);
  const board = input.board;
  const linked = board?.shortLink?.scriptId === script.id;
  return {
    script,
    scenes,
    ...(linked
      ? {
          board: Object.fromEntries(
            BOARD_FIELDS.filter(field => board![field] !== undefined).map(field => [
              field,
              board![field],
            ])
          ) as ShortPackageBoard,
        }
      : {}),
    // The short brings its own Scenes; a Cast's other Scenes, Story and Short plan stay home.
    cast: input.cast.map(file => {
      const { scenes: _scenes, day: _day, ...rest } = file;
      return { ...rest, stories: [] };
    }),
  };
}

/** Read the short in an untrusted package; null when it has no readable script. */
export function parseShortPackage(
  raw: unknown,
  parseCast: (value: unknown) => CastFile | null,
  now = Date.now()
): ShortPackage | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const script = normalizeSavedScript(value.script, now);
  if (!script) return null;
  const scenes = normalizeSavedScenes(value.scenes, now).filter(
    scene => scene.fromScript?.scriptId === script.id
  );
  const board =
    value.board && typeof value.board === 'object' && !Array.isArray(value.board)
      ? (value.board as ShortPackageBoard)
      : undefined;
  const cast = (Array.isArray(value.cast) ? value.cast : [])
    .map(entry => parseCast(entry))
    .filter((entry): entry is CastFile => Boolean(entry));
  return { script, scenes, ...(board ? { board } : {}), cast };
}

/**
 * Ids this long are also replaced inside longer strings (Cut's `scenes:<id>~2` keys), as whole
 * tokens; shorter ones only where a whole string is the id, so a word in a line is never one.
 */
const TOKEN_ID_MIN = 10;
const TOKEN = /[A-Za-z0-9_-]+/g;

function remapString(value: string, map: ReadonlyMap<string, string>): string {
  const whole = map.get(value);
  if (whole !== undefined) return whole;
  return value.replace(TOKEN, token =>
    token.length >= TOKEN_ID_MIN ? (map.get(token) ?? token) : token
  );
}

/** `value` with every id in `map` (old → new) replaced, in strings and in object keys. */
export function remapPackageIds<T>(value: T, map: ReadonlyMap<string, string>): T {
  if (!map.size) return value;
  const walk = (entry: unknown): unknown => {
    if (typeof entry === 'string') return remapString(entry, map);
    if (Array.isArray(entry)) return entry.map(walk);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry).map(([key, field]) => [remapString(key, map), walk(field)])
      );
    }
    return entry;
  };
  return walk(value) as T;
}

/**
 * The short as it lands here: the script and each Scene with its own id when free, else a new
 * one; Cast ids as the Cast import placed them (`castIds`: package id → id here). Returns the id
 * map too, for the cut that came with it.
 */
export function placeShortPackage(
  short: ShortPackage,
  options: {
    castIds: ReadonlyMap<string, string>;
    scriptIdTaken: (id: string) => boolean;
    sceneIdTaken: (id: string) => boolean;
    newScriptId: () => string;
    newSceneId: () => string;
    now?: number;
  }
): {
  script: SavedScript;
  scenes: SavedScene[];
  board?: ShortPackageBoard;
  ids: Map<string, string>;
} {
  const now = options.now ?? Date.now();
  const ids = new Map<string, string>();
  for (const [from, to] of options.castIds) if (from !== to) ids.set(from, to);
  if (options.scriptIdTaken(short.script.id)) ids.set(short.script.id, options.newScriptId());
  const placed = new Set<string>();
  for (const scene of short.scenes) {
    if (options.sceneIdTaken(scene.id) || placed.has(scene.id)) {
      // A new id is random: checked against this import's own, a few tries at most.
      let next = options.newSceneId();
      for (let tries = 0; placed.has(next) && tries < 8; tries += 1) next = options.newSceneId();
      ids.set(scene.id, next);
      placed.add(next);
    } else placed.add(scene.id);
  }
  const script = remapPackageIds(short.script, ids);
  return {
    // Changed now: newer than any deletion of it here, so the store and other devices keep it.
    script: { ...script, updatedAt: Math.max(now, script.updatedAt + 1) },
    scenes: remapPackageIds(short.scenes, ids).map(scene => ({
      ...scene,
      updatedAt: Math.max(now, (scene.updatedAt ?? 0) + 1),
    })),
    ...(short.board ? { board: remapPackageIds(short.board, ids) } : {}),
    ids,
  };
}
