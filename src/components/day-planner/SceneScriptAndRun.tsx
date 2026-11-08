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

type Vm = ReturnType<typeof useDayPlannerToolOrchestration>;
type Page = ReturnType<typeof useScenePage>;
type Runner = ReturnType<typeof useSceneRun>;
type StartRun = NonNullable<Parameters<typeof SceneScriptsSection>[0]['onStartRun']>;

/**
 * A run's start and its end, where the runner is: a run saved with ?start=<id> (the episode
 * autopilot, Short's Make the short, the Script page's Start) starts once the runner has it, and
 * a done run with the cut asked for opens Cut. Returns the ref a same-page Start sets.
 */
function useSceneRunStart(vm: Vm, page: Page, runner: Runner) {
  const router = useRouter();
  const castId = vm.character?.id;
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
    // Off the URL: a reload resumes the run (Resume), it doesn't start it again. Asked again a
    // beat later too — arriving by router.push, Next writes the URL after this has run.
    const unstart = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('start')) return;
      url.searchParams.delete('start');
      window.history.replaceState(window.history.state, '', url);
    };
    if (run.state !== 'prepared') {
      // Started (or changed by hand): done asking.
      startRunId.current = null;
      unstart();
      // Not cleared with the effect: the run's record changes all the time now.
      window.setTimeout(unstart, 500);
      window.setTimeout(unstart, 2000);
      return;
    }
    unstart();
    // Asked again until it runs: the runner reads the run a commit later, and the run record
    // changing meanwhile re-runs this (and clears a single timer before it fired).
    start();
    const timer = window.setInterval(() => {
      unstart();
      start();
    }, 500);
    return () => window.clearInterval(timer);
  }, [run, start]);
  // Done, with the cut asked for: Cut opens on the Scenes and cuts the episode (useCutAutopilot).
  const { updateRun } = page;
  useEffect(() => {
    if (!run || run.state !== 'done' || !run.auto?.cutWhenDone || !castId) return;
    updateRun({ ...run, auto: { ...run.auto, cutWhenDone: false } });
    // Its own Scenes only, in the script's order (not the Cast's others).
    const only = run.scriptId ? `&script=${encodeURIComponent(run.scriptId)}` : '';
    router.push(`/cut?from=scenes&character=${encodeURIComponent(castId)}${only}&autocut=1`);
  }, [castId, router, run, updateRun]);
  return startRunId;
}

/** The Cast's scripts and the locations (the Script page; the phone's Scene). */
export function SceneScriptPart({
  vm,
  page,
  onStartRun,
  openScene,
}: {
  vm: Vm;
  page: Page;
  onStartRun: StartRun;
  /** Opening a Scene from a script: on the Script page, that's going to Scene. */
  openScene?: (sceneId: string) => void;
}) {
  const { makeSceneFrom } = page;
  const character = vm.character;
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
          // A shot made a Scene opens it (on Scene, it is the one the editor shows).
          makeScene={(...args: Parameters<typeof makeSceneFrom>) => {
            const id = makeSceneFrom(...args);
            if (id && openScene) openScene(id);
            return id;
          }}
          openScene={openScene ?? page.openScene}
          prepareRun={page.prepareRun}
          llmBody={sharedLlmRequestBody(vm.shared)}
          sendComfyUi={vm.actions.sendComfyUi}
          onStartRun={onStartRun}
        />
      ) : null}
      <LocationsSection scenes={page.scenes} emptyPhoto={emptyPlacePhoto} />
    </>
  );
}

/** The Cast's run and its controls, where it renders (Scene). */
export function SceneRunPart({ vm, page, runner }: { vm: Vm; page: Page; runner: Runner }) {
  useSceneRunStart(vm, page, runner);
  return <SceneRunPanelOf page={page} runner={runner} />;
}

function SceneRunPanelOf({ page, runner }: { page: Page; runner: Runner }) {
  return (
    <>
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

/**
 * The Cast's scripts, the locations and a prepared run with its controls, together — the phone's
 * Scene (M10 T5). On the desk, scripts have their own page (/script) and the run stays on Scene.
 */
export default function SceneScriptAndRun({
  vm,
  page,
  runner,
}: {
  vm: Vm;
  page: Page;
  runner: Runner;
}) {
  const startRunIdRef = useSceneRunStart(vm, page, runner);
  return (
    <>
      <SceneScriptPart
        vm={vm}
        page={page}
        onStartRun={(next, options) => {
          // An episode is cut wide: its stills are shot 16:9 (the autopilot's choice).
          if (options?.wideStills) vm.updateToolSettings({ wideStills: true });
          startRunIdRef.current = next.id;
          page.updateRun(next);
        }}
      />
      <SceneRunPanelOf page={page} runner={runner} />
    </>
  );
}
