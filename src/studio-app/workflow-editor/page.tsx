import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const WorkflowEditorTool = dynamic(() => import('@/components/WorkflowEditorTool'), {
  loading: () => <ToolPageSkeleton label="Loading workflow editor" />,
});

export default function WorkflowEditorPage() {
  return (
    <PageCanvas accent="brand">
      <WorkflowEditorTool />
    </PageCanvas>
  );
}
