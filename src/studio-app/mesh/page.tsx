import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MeshPromptTool = dynamic(() => import('@/components/MeshPromptTool'), {
  loading: () => <ToolPageSkeleton label="Loading mesh" />,
});

export default function MeshPage() {
  return (
    <PageCanvas accent="emerald">
      <MeshPromptTool />
    </PageCanvas>
  );
}
