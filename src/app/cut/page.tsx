import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const CutRoom = dynamic(() => import('@/components/cut/CutRoom'), {
  loading: () => <ToolPageSkeleton label="Loading Cut" />,
});

export default function CutPage() {
  return (
    <PageCanvas accent="fuchsia">
      <CutRoom />
    </PageCanvas>
  );
}
