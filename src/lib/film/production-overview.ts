/**
 * Film Director's overview (M5 W1, ROADMAP §8.1): a Cast's production as it stands — its Scenes
 * and takes, the script's coverage, the jobs, the open findings, the Cut — counted from the
 * records the tools keep (no status of its own). Pure; the page reads the records and links
 * every count to the tool that owns it.
 */
import {
  findingsForGalleryEntry,
  isFindingDismissed,
  type FindingsEntry,
} from '../checks/findings';
import type { FindingDecision } from '../checks/finding-decisions';
import { galleryJobOutcome } from '../gallery/stalled-recovery';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import { parseScript } from '../script/parse';
import { keptTakeOf, sceneCutUse, type SavedScene } from '../day/scenes';
import type { SavedScript } from '../day/scene-scripts';
import { coverageFindings, sceneCoverage, unsetPlaceShots } from '../day/script-coverage';
import { shotsForScene } from '../day/script-shots';

export type OverviewEntry = FindingsEntry &
  Pick<
    ComfyGalleryEntry,
    'status' | 'statusMessage' | 'characterId' | 'queuedAt' | 'completedAt' | 'derivedKind'
  > & { id?: string; prompt?: string };

export type SceneState = 'planned' | 'rendering' | 'to-review' | 'kept';

export type OverviewScene = {
  id: string;
  name: string;
  state: SceneState;
  takes: number;
  /** Its kept take was marked "Looks wrong". */
  keptLooksWrong: boolean;
  inCut: boolean;
};

export type ProductionOverview = {
  castId: string;
  scenes: {
    total: number;
    planned: number;
    rendering: number;
    toReview: number;
    kept: number;
    keptLooksWrong: number;
    inCut: number;
    items: OverviewScene[];
  };
  script: {
    scripts: number;
    scenes: number;
    planned: number;
    shots: number;
    made: number;
    kept: number;
    openFindings: number;
    /** Script scenes with shots planned and not one made. */
    uncovered: Array<{ scriptId: string; scriptName: string; sceneId: string; heading: string }>;
  };
  jobs: {
    waiting: number;
    running: number;
    failed: number;
    lost: number;
    /** Failed, lost or timed out in the window, newest first. */
    problems: Array<{ promptId: string; outcome: string; message: string; at: number }>;
  };
  continuity: {
    open: number;
    accepted: number;
    /** The kept takes they are on (Scene ids). */
    sceneIds: string[];
  };
  cut: { versions: number; films: number; lastFilmAt?: number };
};

/** How far back jobs are looked at (the Queue's own recovery window, R8). */
export const OVERVIEW_JOB_WINDOW_MS = 48 * 60 * 60 * 1000;

export function productionOverview(input: {
  castId: string;
  scenes: readonly SavedScene[];
  /** The Scene open on the Scene page and its card's state (a take rendering there). */
  activeSceneId?: string;
  activeStillStatus?: string;
  scripts: readonly SavedScript[];
  gallery: readonly OverviewEntry[];
  decisions: ReadonlyMap<string, FindingDecision>;
  cut: { versions?: readonly unknown[] } & Parameters<typeof sceneCutUse>[0];
  /** Location records (a script place that is one isn't a recurring unset place, M8 T4). */
  locations?: Parameters<typeof unsetPlaceShots>[0]['locations'];
  now?: number;
}): ProductionOverview {
  const now = input.now ?? Date.now();
  const byPrompt = new Map(
    input.gallery.filter(entry => entry.promptId).map(entry => [entry.promptId!, entry])
  );
  const scenes = input.scenes.filter(scene => scene.castId === input.castId);

  // Scenes and takes.
  const items: OverviewScene[] = scenes.map(scene => {
    const kept = keptTakeOf(scene);
    const keptEntry = kept?.promptId ? byPrompt.get(kept.promptId) : undefined;
    const busy =
      Boolean(scene.checkingTakeIds?.length) ||
      (scene.id === input.activeSceneId &&
        (input.activeStillStatus === 'queued' || input.activeStillStatus === 'running'));
    const state: SceneState = busy
      ? 'rendering'
      : kept
        ? 'kept'
        : scene.takes.length
          ? 'to-review'
          : 'planned';
    return {
      id: scene.id,
      name: scene.name,
      state,
      takes: scene.takes.length,
      keptLooksWrong: keptEntry?.playerVerdict?.verdict === 'looks-wrong',
      inCut: sceneCutUse(input.cut, scene) !== 'none',
    };
  });
  const count = (state: SceneState) => items.filter(item => item.state === state).length;

  // The script's coverage (S5), decisions applied.
  const scripts = input.scripts.filter(script => script.castId === input.castId);
  const script: ProductionOverview['script'] = {
    scripts: scripts.length,
    scenes: 0,
    planned: 0,
    shots: 0,
    made: 0,
    kept: 0,
    openFindings: 0,
    uncovered: [],
  };
  for (const saved of scripts) {
    const parsed = parseScript(saved.source);
    const unsetPlaces = unsetPlaceShots({
      scenes: parsed.scenes,
      shots: saved.shots ?? [],
      placeMap: saved.placeMap,
      locations: input.locations,
    });
    for (const scene of parsed.scenes) {
      script.scenes += 1;
      const shots = shotsForScene(saved.shots, scene.id);
      const coverage = sceneCoverage(shots, scenes, input.cut);
      if (shots.length) script.planned += 1;
      script.shots += coverage.planned;
      script.made += coverage.made;
      script.kept += coverage.kept;
      script.openFindings += coverageFindings({
        scriptId: saved.id,
        scene,
        shots,
        coverage,
        unsetPlaces,
      }).filter(finding => !input.decisions.has(finding.id)).length;
      if (shots.length && coverage.made === 0) {
        script.uncovered.push({
          scriptId: saved.id,
          scriptName: saved.name,
          sceneId: scene.id,
          heading: scene.heading || scene.place || scene.id,
        });
      }
    }
  }

  // Jobs for this Cast in the window (R8's outcomes).
  const recent = input.gallery.filter(
    entry =>
      entry.characterId === input.castId &&
      entry.derivedKind !== 'film' &&
      now - (entry.queuedAt ?? 0) <= OVERVIEW_JOB_WINDOW_MS
  );
  const jobs: ProductionOverview['jobs'] = {
    waiting: 0,
    running: 0,
    failed: 0,
    lost: 0,
    problems: [],
  };
  for (const entry of recent) {
    const outcome = galleryJobOutcome(entry);
    if (outcome === 'pending') jobs.waiting += 1;
    else if (outcome === 'running') jobs.running += 1;
    else if (outcome === 'failed') jobs.failed += 1;
    else if (outcome === 'lost' || outcome === 'timed-out') jobs.lost += 1;
    if ((outcome === 'failed' || outcome === 'lost' || outcome === 'timed-out') && entry.promptId) {
      jobs.problems.push({
        promptId: entry.promptId,
        outcome,
        message: entry.statusMessage?.trim() || outcome,
        at: entry.queuedAt ?? 0,
      });
    }
  }
  jobs.problems.sort((a, b) => b.at - a.at);

  // Continuity on the kept takes (C1), as decided (C2).
  const continuity: ProductionOverview['continuity'] = { open: 0, accepted: 0, sceneIds: [] };
  for (const scene of scenes) {
    const kept = keptTakeOf(scene);
    const entry = kept?.promptId ? byPrompt.get(kept.promptId) : undefined;
    if (!entry) continue;
    let flagged = false;
    for (const finding of findingsForGalleryEntry(entry)) {
      if (isFindingDismissed(input.decisions, finding.subject, finding.rule)) continue;
      if (input.decisions.get(finding.id)?.decision === 'accepted') continuity.accepted += 1;
      else continuity.open += 1;
      flagged = true;
    }
    if (flagged) continuity.sceneIds.push(scene.id);
  }

  // The Cut.
  const films = input.gallery.filter(
    entry => entry.characterId === input.castId && entry.derivedKind === 'film'
  );
  const lastFilmAt = films.reduce<number | undefined>((latest, entry) => {
    const at = entry.completedAt ?? entry.queuedAt;
    return at && (!latest || at > latest) ? at : latest;
  }, undefined);

  return {
    castId: input.castId,
    scenes: {
      total: items.length,
      planned: count('planned'),
      rendering: count('rendering'),
      toReview: count('to-review'),
      kept: count('kept'),
      keptLooksWrong: items.filter(item => item.keptLooksWrong).length,
      inCut: items.filter(item => item.inCut).length,
      items,
    },
    script,
    jobs,
    continuity,
    cut: {
      versions: input.cut?.versions?.length ?? 0,
      films: films.length,
      ...(lastFilmAt ? { lastFilmAt } : {}),
    },
  };
}
