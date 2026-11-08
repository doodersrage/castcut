'use client';

import { useRouter } from 'next/navigation';
import { CastMoodBoardMenu } from '@/components/character/CastMoodBoard';
import DaySetupChip from '@/components/day-planner/DaySetupChip';
import { SceneScriptPart } from '@/components/day-planner/SceneScriptAndRun';
import { SCENE_ACCENT, useSceneToolViews } from '@/components/day-planner/useSceneToolViews';
import { ButtonLink } from '@/components/ui/Button';
import { ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { useScenePage } from '@/hooks/day-planner/useScenePage';
import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';

/**
 * The Script page on desk (/script): the Cast's scripts — write or import one, plan its shots,
 * see the storyboard, cast its parts — and its locations. It shares Scene's records (the `scene`
 * settings, day/scenes.ts) but not its runner: a run started here is saved and opened on Scene
 * (?start=<run id>), where its takes render. The phone keeps scripts on its Scene (/m/scene).
 */
export default function ScriptTool() {
  const vm = useDayPlannerToolOrchestration('scene');
  const page = useScenePage(vm);
  const views = useSceneToolViews(vm, page);
  const router = useRouter();
  if (!vm.mounted) return <ToolPageSkeleton label="Loading script" />;
  const { character, hasPlate } = vm;
  const sceneHref = (query: string) =>
    `/scene?${character ? `character=${encodeURIComponent(character.id)}&` : ''}${query}`;
  const run = page.run;
  return (
    <>
      <ToolLayout
        width="full"
        accent={SCENE_ACCENT}
        title="Script"
        description="Write it, then render it — a script's scenes become shots, and a run renders them all."
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <DaySetupChip
              character={character}
              hasPlate={hasPlate}
              onClick={() => views.setSetupOpen(true)}
            />
            <CastMoodBoardMenu character={character} testId="script-mood-board" />
          </div>
        }
      >
        {run ? (
          <ToolSection data-testid="script-run-link" className="!py-3 sm:!py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-caption text-[var(--text-muted)]">
                {run.state === 'running'
                  ? 'A run is rendering on Scene.'
                  : run.state === 'done'
                    ? 'The last run is done — its takes are on Scene.'
                    : 'A run is ready on Scene.'}
              </p>
              <ButtonLink
                href={sceneHref('')}
                size="sm"
                variant="secondary"
                data-testid="script-open-run"
              >
                Open the run →
              </ButtonLink>
            </div>
          </ToolSection>
        ) : null}
        <SceneScriptPart
          vm={vm}
          page={page}
          // A made Scene opened: it's worked on in Scene.
          openScene={sceneId => router.push(sceneHref(`scene=${encodeURIComponent(sceneId)}`))}
          onStartRun={(next, options) => {
            // An episode is cut wide: its stills are shot 16:9 (the autopilot's choice).
            if (options?.wideStills) vm.updateToolSettings({ wideStills: true });
            page.updateRun(next);
            // Saved, then started where the runner is.
            router.push(sceneHref(`start=${encodeURIComponent(next.id)}`));
          }}
        />
      </ToolLayout>
      {views.sheets}
    </>
  );
}
