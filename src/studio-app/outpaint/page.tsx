import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const OutpaintTool = dynamic(() => import('@/components/OutpaintTool'), {
  loading: () => <ToolPageSkeleton label="Loading outpaint" />,
});

export default function OutpaintPage() {
  return (
    <PageCanvas accent="amber">
      <OutpaintTool />
    </PageCanvas>
  );
}
