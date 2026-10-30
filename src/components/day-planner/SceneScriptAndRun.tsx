'use client';

import { SceneScriptsSection } from '@/components/day-planner/SceneScripts';
import SceneRunControls from '@/components/day-planner/SceneRunControls';
import SceneRunPanel from '@/components/day-planner/SceneRunPanel';
import LocationsSection from '@/components/location/LocationsSection';
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
  return (
    <>
      {character ? (
        <SceneScriptsSection
          castId={character.id}
          castName={character.name}
          cast={loadCharacters().map(member => ({ id: member.id, name: member.name }))}
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
        />
      ) : null}
      <LocationsSection scenes={page.scenes} />
      {page.run ? (
        <SceneRunPanel
          run={page.run}
          scenes={page.castScenes}
          disabled={page.inFlight || runner.looping}
          onChange={page.updateRun}
        >
          <SceneRunControls
            run={page.run}
            scenes={page.castScenes}
            looping={runner.looping}
            stopping={runner.stopping}
            disabled={page.inFlight && !runner.looping}
            onStart={runner.start}
            onStop={runner.stop}
          />
        </SceneRunPanel>
      ) : null}
    </>
  );
}
