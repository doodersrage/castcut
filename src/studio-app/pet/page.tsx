import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const PetTool = dynamic(() => import('@/components/PetTool'), {
  loading: () => <ToolPageSkeleton label="Loading pet" />,
});

export default function PetPage() {
  return (
    <PageCanvas accent="rose">
      <PetTool />
    </PageCanvas>
  );
}
