/**
 * A new version of a script (M3 S6, ROADMAP §6.2): matched to the stored one scene by scene — by
 * scene id (script/parse.ts keeps ids stable through edits elsewhere), else by how alike the
 * headings are — and shown as same / changed / new / removed before anything is replaced. A
 * matched scene keeps its shot list (moved to the new id). A removed scene's shots that became
 * Scenes are never dropped: they stay, listed as "no longer in the script", with their Scenes;
 * only shots that are still just planned can go, and only when you say so. Pure.
 */
import type { ParsedScript, ScriptScene } from '../script/parse';
import type { SavedScript } from './scene-scripts';
import type { PlannedShot } from './script-shots';

export type ReimportStatus = 'same' | 'changed' | 'new' | 'removed';

export type ReimportRow = {
  status: ReimportStatus;
  /** The stored scene (unset: new). */
  oldId?: string;
  /** The scene in the new version (unset: removed). */
  newId?: string;
  heading: string;
  /** Matched by heading, not id: the heading changed. */
  byHeading?: boolean;
  /** Its planned shots, and how many of them became Scenes. */
  shots: number;
  made: number;
};

const words = (scene: ScriptScene) =>
  new Set(
    (scene.heading || scene.elements[0]?.text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !['int', 'ext', 'the', 'and'].includes(word))
  );

/** How alike two headings are (shared words over all words), 0–1. */
export function headingSimilarity(a: ScriptScene, b: ScriptScene): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** What a scene says, for telling a changed one from the same. */
const body = (scene: ScriptScene) =>
  [scene.heading, ...scene.elements.map(element => `${element.kind}:${element.text}`)].join('\n');

export const HEADING_MATCH_MIN = 0.5;

/** Old scene id → new scene id, for every scene of the old version that is still there. */
export function matchScenes(before: ParsedScript, after: ParsedScript): Map<string, string> {
  const map = new Map<string, string>();
  const newIds = new Set(after.scenes.map(scene => scene.id));
  const taken = new Set<string>();
  for (const scene of before.scenes) {
    if (newIds.has(scene.id)) {
      map.set(scene.id, scene.id);
      taken.add(scene.id);
    }
  }
  // The rest by heading, best pair first, each new scene used once.
  const pairs: Array<[number, string, string]> = [];
  for (const old of before.scenes) {
    if (map.has(old.id)) continue;
    for (const next of after.scenes) {
      if (taken.has(next.id)) continue;
      const score = headingSimilarity(old, next);
      if (score >= HEADING_MATCH_MIN) pairs.push([score, old.id, next.id]);
    }
  }
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, oldId, newId] of pairs) {
    if (map.has(oldId) || taken.has(newId)) continue;
    map.set(oldId, newId);
    taken.add(newId);
  }
  return map;
}

/** The scenes of both versions, side by side, in the new version's order (removed ones last). */
export function reconcileScript(
  before: ParsedScript,
  after: ParsedScript,
  shots: readonly PlannedShot[] | undefined,
  madeSceneIds: ReadonlySet<string>
): ReimportRow[] {
  const map = matchScenes(before, after);
  const oldOf = new Map([...map].map(([oldId, newId]) => [newId, oldId]));
  const oldById = new Map(before.scenes.map(scene => [scene.id, scene]));
  const count = (sceneId: string | undefined) => {
    const list = sceneId ? (shots ?? []).filter(shot => shot.sceneId === sceneId) : [];
    return {
      shots: list.length,
      made: list.filter(shot => shot.madeSceneId && madeSceneIds.has(shot.madeSceneId)).length,
    };
  };
  const rows: ReimportRow[] = after.scenes.map(scene => {
    const oldId = oldOf.get(scene.id);
    const old = oldId ? oldById.get(oldId) : undefined;
    if (!old) return { status: 'new', newId: scene.id, heading: scene.heading, shots: 0, made: 0 };
    return {
      status: body(old) === body(scene) ? 'same' : 'changed',
      oldId: old.id,
      newId: scene.id,
      heading: scene.heading,
      ...(old.id !== scene.id ? { byHeading: true } : {}),
      ...count(old.id),
    };
  });
  for (const old of before.scenes) {
    if (!map.has(old.id)) {
      rows.push({ status: 'removed', oldId: old.id, heading: old.heading, ...count(old.id) });
    }
  }
  return rows;
}

/**
 * The script with its new text: matched scenes' shots moved to their new ids; a removed scene's
 * shots kept (as no longer in the script) — except its still-planned ones when `dropPlanned`
 * names it. A shot that became a Scene is always kept.
 */
export function applyReimport(
  script: SavedScript,
  source: string,
  rows: readonly ReimportRow[],
  options: { dropPlanned?: ReadonlySet<string>; madeSceneIds: ReadonlySet<string>; now?: number }
): SavedScript {
  const moved = new Map(
    rows.filter(row => row.oldId && row.newId).map(row => [row.oldId!, row.newId!])
  );
  const shots = (script.shots ?? []).flatMap(shot => {
    const newId = moved.get(shot.sceneId);
    if (newId) return [newId === shot.sceneId ? shot : { ...shot, sceneId: newId }];
    const made = Boolean(shot.madeSceneId && options.madeSceneIds.has(shot.madeSceneId));
    return !made && options.dropPlanned?.has(shot.sceneId) ? [] : [shot];
  });
  const { shots: _old, ...base } = script;
  return {
    ...base,
    source,
    ...(shots.length ? { shots } : {}),
    updatedAt: options.now ?? Date.now(),
  };
}

/** Shots kept from scenes no longer in the script (a removed scene's, or a reimport's). */
export function orphanedShots(
  shots: readonly PlannedShot[] | undefined,
  parsed: ParsedScript
): PlannedShot[] {
  const ids = new Set(parsed.scenes.map(scene => scene.id));
  return (shots ?? []).filter(shot => !ids.has(shot.sceneId));
}
