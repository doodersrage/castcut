'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SceneScriptsSection } from '@/components/day-planner/SceneScripts';
import SceneRunControls from '@/components/day-planner/SceneRunControls';
import SceneRunPanel from '@/components/day-planner/SceneRunPanel';
import LocationsSection from '@/components/location/LocationsSection';
import { emptyPlacePhoto } from '@/lib/location/empty-photo-client';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useSceneRun } from '@/hooks/day-planner/useSceneRun';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { loadCharacters } from '@/lib/character/os';
import type { ScriptsCache } from '@/lib/day/scene-scripts';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';

/**
 * The Cast's scripts, the locations and a prepared run with its controls — the same on the desk
 * and the phone (M10 T5).
 */
export default function SceneScriptAndRun({
  vm,
  page,
  runner,
}: {
  vm: ReturnType<typeof useDayPlannerToolOrchestration>;
  page: ReturnType<typeof useScenePage>;
  runner: ReturnType<typeof useSceneRun>;
}) {
  const character = vm.character;
  const router = useRouter();
  // The episode autopilot's run: saved with its settings, then started once the runner has it
  // (its ref follows the page a commit later, so the start waits for the next tick).
  // Or Short's Make the short (?start=<run id>): the run it saved, started when the page opens.
  const startRunId = useRef<string | null>(
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('start')?.trim() || null
  );
  const { run } = page;
  const { start } = runner;
  useEffect(() => {
    const want = startRunId.current;
    if (!want || run?.id !== want) return;
    if (run.state !== 'prepared') {
      // Started (or changed by hand): done asking.
      startRunId.current = null;
      return;
    }
    // Off the URL: a reload resumes the run (Resume), it doesn't start it again.
    const url = new URL(window.location.href);
    if (url.searchParams.has('start')) {
      url.searchParams.delete('start');
      window.history.replaceState(window.history.state, '', url);
    }
    // Asked again until it runs: the runner reads the run a commit later, and the run record
    // changing meanwhile re-runs this (and clears a single timer before it fired).
    start();
    const timer = window.setInterval(start, 500);
    return () => window.clearInterval(timer);
  }, [run, start]);
  // Done, with the cut asked for: Cut opens on the Scenes and cuts the episode (useCutAutopilot).
  const { updateRun } = page;
  const castId = character?.id;
  useEffect(() => {
    if (!run || run.state !== 'done' || !run.auto?.cutWhenDone || !castId) return;
    updateRun({ ...run, auto: { ...run.auto, cutWhenDone: false } });
    // Its own Scenes only, in the script's order (not the Cast's others).
    const only = run.scriptId ? `&script=${encodeURIComponent(run.scriptId)}` : '';
    router.push(`/cut?from=scenes&character=${encodeURIComponent(castId)}${only}&autocut=1`);
  }, [castId, router, run, updateRun]);
  return (
    <>
      {character ? (
        <SceneScriptsSection
          castId={character.id}
          castName={character.name}
          cast={loadCharacters().map(member => ({
            id: member.id,
            name: member.name,
            ...(member.traits?.sex ? { sex: member.traits.sex } : {}),
          }))}
          // Scripts keep their own store (M6 V6); any still in the settings move there.
          sceneTool={{
            mounted: vm.mounted,
            toolSettings: vm.toolSettings as ScriptsCache,
            updateToolSettings: vm.updateToolSettings as (patch: ScriptsCache) => void,
          }}
          scenes={page.castScenes}
          makeScene={page.makeSceneFrom}
          openScene={page.openScene}
          prepareRun={page.prepareRun}
          llmBody={sharedLlmRequestBody(vm.shared)}
          sendComfyUi={vm.actions.sendComfyUi}
          onStartRun={next => {
            startRunId.current = next.id;
            page.updateRun(next);
          }}
        />
      ) : null}
      <LocationsSection scenes={page.scenes} emptyPhoto={emptyPlacePhoto} />
      {page.run ? (
        <SceneRunPanel
          run={page.run}
          scenes={page.castScenes}
          disabled={page.inFlight || runner.looping}
          onChange={page.updateRun}
          onOpenScene={sceneId => page.openScene(sceneId)}
        >
          <SceneRunControls
            run={page.run}
            scenes={page.castScenes}
            looping={runner.looping}
            stopping={runner.stopping}
            disabled={page.inFlight && !runner.looping}
            onStart={runner.start}
            onQueueAll={runner.queueAll}
            onStop={runner.stop}
          />
        </SceneRunPanel>
      ) : null}
    </>
  );
}
