'use client';

import { useEffect } from 'react';
import SceneRunControls from '@/components/day-planner/SceneRunControls';
import { useSceneRunStart } from '@/components/day-planner/SceneScriptAndRun';
import { useScenePage } from '@/hooks/day-planner/useScenePage';
import { useSceneRun } from '@/hooks/day-planner/useSceneRun';
import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';

/**
 * A short's run, rendered on Short (step 2 of Short as Script's front door, 2026-11-08): the
 * Scene page's records and runner, mounted here without its page — the runner needs the Scenes,
 * the open one's take and the queue, not the Scene screen. Started by ?start=<run id> as on Scene
 * (Make the short sets it), resumed after a reload like any run that resumes by itself; its
 * kept takes reach the board through the short's sync (useDayShortSync). Shows the run's controls.
 * Mounted only while the short's run is listed, going or paused.
 */
export default function ShortRun({
  scriptId,
  onLooping,
}: {
  scriptId: string;
  /** Whether it is rendering now (Short holds its own Queue meanwhile). */
  onLooping?: (looping: boolean) => void;
}) {
  const vm = useDayPlannerToolOrchestration('scene');
  const page = useScenePage(vm);
  const runner = useSceneRun(vm, page);
  useSceneRunStart(vm, page, runner);
  const { looping } = runner;
  useEffect(() => {
    onLooping?.(looping);
  }, [looping, onLooping]);
  useEffect(() => () => onLooping?.(false), [onLooping]);
  const run = page.run;
  if (!vm.mounted || !run || run.scriptId !== scriptId) return null;
  return (
    <div data-testid="day-short-run-here">
      <SceneRunControls
        run={run}
        scenes={page.castScenes}
        looping={runner.looping}
        stopping={runner.stopping}
        disabled={page.inFlight && !runner.looping}
        onStart={runner.start}
        onStop={runner.stop}
      />
      {/* What the run's Scene says (why a take wasn't queued): on Scene it is under the card. */}
      {page.note || vm.error ? (
        <p
          className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
          role="status"
          data-testid="day-short-run-note"
        >
          {page.note || vm.error}
        </p>
      ) : null}
    </div>
  );
}
