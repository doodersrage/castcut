/**
 * Scene's list of the Cast's Scenes, kept to a size you can work in. An episode makes a few
 * hundred Scenes; shown as one strip of tiles, the shot you're on was lost among them. So the
 * list shows one source at a time — a script, or the Scenes made by hand — and a script's Scenes
 * by its scenes, one row each with how far it has got, only the open row showing its shots. A
 * filter keeps to the ones still to do. Pure.
 */

/** What the list needs of a Scene (day/scenes.ts SavedScene). */
export type SceneListItem = {
  id: string;
  name: string;
  keptTakeId?: string;
  fromScript?: { scriptId: string; sceneId: string };
};

/** The scripts the Cast's Scenes came from, with their scenes as written (script/parse.ts). */
export type SceneListScript = {
  id: string;
  name: string;
  scenes: ReadonlyArray<{ id: string; heading: string; place: string }>;
};

export type SceneListFilter = 'all' | 'unkept' | 'flagged';

/** The Scenes made by hand (and any whose script is gone). */
export const LOOSE_SOURCE = 'loose';

export type SceneListSource = { id: string; label: string; count: number };

export type SceneListGroup<T extends SceneListItem = SceneListItem> = {
  /** The script scene's id ('' for the loose source's one group). */
  key: string;
  /** "12. INT. CAFÉ - NIGHT" (its place when it has no heading). */
  label: string;
  /** Its Scenes that pass the filter, in the list's order. */
  scenes: T[];
  /** All its Scenes, the filter aside. */
  total: number;
  kept: number;
  flagged: number;
};

/** Which source a Scene is listed under: its script's id, else the loose source. */
export function sceneListSourceOf(
  scene: SceneListItem,
  scripts: readonly SceneListScript[]
): string {
  const id = scene.fromScript?.scriptId;
  return id && scripts.some(script => script.id === id) ? id : LOOSE_SOURCE;
}

/** The sources there are Scenes for, scripts first (in the scripts' order), then by hand. */
export function sceneListSources(
  scenes: readonly SceneListItem[],
  scripts: readonly SceneListScript[]
): SceneListSource[] {
  const counts = new Map<string, number>();
  for (const scene of scenes) {
    const source = sceneListSourceOf(scene, scripts);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const listed: SceneListSource[] = scripts
    .filter(script => counts.has(script.id))
    .map(script => ({
      id: script.id,
      label: script.name.trim() || 'Untitled script',
      count: counts.get(script.id)!,
    }));
  if (counts.has(LOOSE_SOURCE)) {
    listed.push({ id: LOOSE_SOURCE, label: 'Made by hand', count: counts.get(LOOSE_SOURCE)! });
  }
  return listed;
}

function passes(
  scene: SceneListItem,
  filter: SceneListFilter,
  flagged: ReadonlySet<string>
): boolean {
  if (filter === 'unkept') return !scene.keptTakeId;
  if (filter === 'flagged') return flagged.has(scene.id);
  return true;
}

/**
 * One source's Scenes as rows: a script's by its scenes (in the script's order; a scene no
 * longer in it after them), the loose source as one row. Rows the filter empties are left out.
 */
export function sceneListGroups<T extends SceneListItem>(input: {
  scenes: readonly T[];
  scripts: readonly SceneListScript[];
  source: string;
  filter: SceneListFilter;
  /** The Scenes a run flagged for a look. */
  flagged: ReadonlySet<string>;
}): SceneListGroup<T>[] {
  const { scripts, source, filter, flagged } = input;
  const mine = input.scenes.filter(scene => sceneListSourceOf(scene, scripts) === source);
  const group = (key: string, label: string, members: T[]): SceneListGroup<T> => ({
    key,
    label,
    scenes: members.filter(scene => passes(scene, filter, flagged)),
    total: members.length,
    kept: members.filter(scene => scene.keptTakeId).length,
    flagged: members.filter(scene => flagged.has(scene.id)).length,
  });
  const script = scripts.find(entry => entry.id === source);
  if (!script) {
    const loose = group('', 'Made by hand', mine);
    return loose.scenes.length ? [loose] : [];
  }
  const bySceneId = new Map<string, T[]>();
  for (const scene of mine) {
    const key = scene.fromScript!.sceneId;
    bySceneId.set(key, [...(bySceneId.get(key) ?? []), scene]);
  }
  const rows: SceneListGroup<T>[] = [];
  script.scenes.forEach((written, index) => {
    const members = bySceneId.get(written.id);
    if (!members) return;
    bySceneId.delete(written.id);
    rows.push(
      group(
        written.id,
        `${index + 1}. ${written.heading.trim() || written.place.trim() || 'Untitled scene'}`,
        members
      )
    );
  });
  // Scenes whose script scene was taken out (a re-import kept them).
  for (const [key, members] of bySceneId) rows.push(group(key, 'No longer in the script', members));
  return rows.filter(row => row.scenes.length > 0);
}

/** "6 of 8 kept · 1 to look at". */
export function sceneListGroupSummary(group: Omit<SceneListGroup, 'scenes'>): string {
  return [
    `${group.kept} of ${group.total} kept`,
    group.flagged ? `${group.flagged} to look at` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
