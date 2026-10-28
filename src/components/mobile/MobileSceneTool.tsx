'use client';

import { useEffect } from 'react';
import MobileSceneToolSections from '@/components/mobile/MobileSceneToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { useScenePage } from '@/hooks/day-planner/useScenePage';
import { useSceneRun } from '@/hooks/day-planner/useSceneRun';
import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';

/** Phone Scene (/m/scene): Day's engine on one shot, laid out for a phone. */
export default function MobileSceneTool() {
  const vm = useDayPlannerToolOrchestration('scene');
  const page = useScenePage(vm);
  // The run (M10 T5): prepared from a script, started and paused here as on the desk.
  const runner = useSceneRun(vm, page);
  // 44 px tap targets for every control on the page and in its sheets (globals.css): Day's
  // shared editors are compact on desk.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phoneTargets = 'scene';
    return () => {
      delete root.dataset.phoneTargets;
    };
  }, []);
  if (!vm.mounted) return <ToolPageSkeleton label="Loading scene" />;
  return <MobileSceneToolSections vm={vm} page={page} runner={runner} />;
}
