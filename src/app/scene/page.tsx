import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const SceneTool = dynamic(() => import('@/components/day-planner/SceneTool'), {
  loading: () => <ToolPageSkeleton label="Loading scene" />,
});

/** Scene — one shot, exactly as you want it (optional; Day's engine on one slot). */
export default function ScenePage() {
  return (
    <PageCanvas accent="teal">
      <SceneTool />
    </PageCanvas>
  );
}
