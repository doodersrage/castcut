import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ScriptTool = dynamic(() => import('@/components/day-planner/ScriptTool'), {
  loading: () => <ToolPageSkeleton label="Loading script" />,
});

/** Script — write it, plan its shots, then render it as a run on Scene. */
export default function ScriptPage() {
  return (
    <PageCanvas accent="teal">
      <ScriptTool />
    </PageCanvas>
  );
}
