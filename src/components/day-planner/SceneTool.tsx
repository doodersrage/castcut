'use client';

import SceneToolSections from '@/components/day-planner/SceneToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { useScenePage } from '@/hooks/day-planner/useScenePage';
import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';

/**
 * The Scene page (/scene, /m/scene): Day's engine on one shot (the `scene` settings,
 * day/scenes.ts) and the Cast's saved scenes on top.
 */
export default function SceneTool({ compact = false }: { compact?: boolean }) {
  const vm = useDayPlannerToolOrchestration('scene');
  const page = useScenePage(vm);
  if (!vm.mounted) return <ToolPageSkeleton label="Loading scene" />;
  return <SceneToolSections vm={vm} page={page} compact={compact} />;
}
