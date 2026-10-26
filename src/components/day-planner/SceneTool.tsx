'use client';

import SceneToolSections from '@/components/day-planner/SceneToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { useScenePage } from '@/hooks/day-planner/useScenePage';
import { useSceneRun } from '@/hooks/day-planner/useSceneRun';
import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';

/**
 * The Scene page on desk (/scene): Day's engine on one shot (the `scene` settings,
 * day/scenes.ts) and the Cast's saved scenes on top. The phone has its own layout
 * (MobileSceneTool).
 */
export default function SceneTool() {
  const vm = useDayPlannerToolOrchestration('scene');
  const page = useScenePage(vm);
  const runner = useSceneRun(vm, page);
  if (!vm.mounted) return <ToolPageSkeleton label="Loading scene" />;
  return <SceneToolSections vm={vm} page={page} runner={runner} />;
}
