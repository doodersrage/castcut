/**
 * Script coverage (M3 S5, ROADMAP §6.2): for each script scene, how far its shots have got —
 * planned, made into Scenes, with takes, with a kept take, in the Cut — and what looks missing,
 * as findings in C1's shape (checks/findings.ts) so they are reviewed the same way: It's fine
 * dismisses one, It's real keeps it marked. Suggestions only; nothing is blocked. Pure.
 */
import type { ContinuityFinding, ContinuityRule } from '../checks/findings';
import type { ScriptScene } from '../script/parse';
import { sceneCutUse, type SavedScene } from './scenes';
import type { PlannedShot } from './script-shots';
import { speakerKey } from './script-cast';

export type SceneCoverage = {
  planned: number;
  /** Shots whose Scene still exists. */
  made: number;
  withTakes: number;
  kept: number;
  /** Shots whose Scene plays in Cut's current edit. */
  inCut: number;
};

type CutEdit = Parameters<typeof sceneCutUse>[0];

export function sceneCoverage(
  shots: readonly PlannedShot[],
  scenes: readonly SavedScene[],
  cut: CutEdit
): SceneCoverage {
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const out: SceneCoverage = { planned: shots.length, made: 0, withTakes: 0, kept: 0, inCut: 0 };
  for (const shot of shots) {
    const scene = shot.madeSceneId ? byId.get(shot.madeSceneId) : undefined;
    if (!scene) continue;
    out.made += 1;
    if (scene.takes.length) out.withTakes += 1;
    if (scene.keptTakeId) out.kept += 1;
    if (sceneCutUse(cut, scene) !== 'none') out.inCut += 1;
  }
  return out;
}

/** "5 planned · 3 made · 1 kept · 1 in the Cut" (empty when nothing is planned). */
export function coverageSummary(coverage: SceneCoverage): string {
  if (!coverage.planned) return '';
  return [
    `${coverage.planned} planned`,
    `${coverage.made} made`,
    coverage.withTakes > coverage.kept ? `${coverage.withTakes} with takes` : '',
    `${coverage.kept} kept`,
    `${coverage.inCut} in the Cut`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A script scene as a finding's subject: `script:<script id>:<scene id>`. */
export function coverageSubject(scriptId: string, sceneId: string): string {
  return `script:${scriptId}:${sceneId}`;
}

/** Two speakers answer each other somewhere in the scene. */
function hasExchange(scene: ScriptScene): boolean {
  let previous: string | null = null;
  for (const element of scene.elements) {
    if (element.kind !== 'dialogue' || !element.speaker) continue;
    const speaker = speakerKey(element.speaker);
    if (previous && previous !== speaker) return true;
    previous = speaker;
  }
  return false;
}

/**
 * What looks missing from a planned scene's coverage. Only a scene with shots planned is looked
 * at (an unplanned one is simply not planned yet).
 */
export function coverageFindings(input: {
  scriptId: string;
  scene: ScriptScene;
  shots: readonly PlannedShot[];
  coverage: SceneCoverage;
}): ContinuityFinding[] {
  const { scene, shots, coverage } = input;
  if (!shots.length) return [];
  const subject = coverageSubject(input.scriptId, scene.id);
  const out: ContinuityFinding[] = [];
  const add = (rule: ContinuityRule, evidence: string, suggestion: string) =>
    out.push({
      id: `${subject}:${rule}`,
      rule,
      subject,
      severity: 'warns',
      source: 'Coverage',
      evidence,
      suggestion,
    });
  if (!shots.some(shot => shot.purpose === 'establishing')) {
    add(
      'coverage-establishing',
      'No establishing shot',
      'Add a wide that shows where the scene is, or say it is fine (a scene that opens close).'
    );
  }
  if (hasExchange(scene) && !shots.some(shot => shot.purpose === 'reaction')) {
    add(
      'coverage-reaction',
      'A dialogue exchange with no reaction shot',
      'Add a reaction (the listener, close) to cut away to, or say it is fine.'
    );
  }
  if (coverage.made > 0 && coverage.kept === 0) {
    add(
      'coverage-kept',
      `${coverage.made} shot${coverage.made === 1 ? '' : 's'} made, none kept`,
      'Keep a take in one of its Scenes — Cut uses the kept take.'
    );
  }
  return out;
}
