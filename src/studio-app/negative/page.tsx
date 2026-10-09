import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const NegativeTool = dynamic(() => import('@/components/NegativeTool'), {
  loading: () => <ToolPageSkeleton label="Loading negative" />,
});

export default function NegativePage() {
  return (
    <PageCanvas accent="rose">
      <NegativeTool />
    </PageCanvas>
  );
}
