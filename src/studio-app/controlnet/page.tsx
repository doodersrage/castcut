import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ControlNetTool = dynamic(() => import('@/components/ControlNetTool'), {
  loading: () => <ToolPageSkeleton label="Loading ControlNet" />,
});

export default function ControlNetPage() {
  return (
    <PageCanvas accent="cyan">
      <ControlNetTool />
    </PageCanvas>
  );
}
