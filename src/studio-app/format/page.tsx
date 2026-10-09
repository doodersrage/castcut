import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const PromptFormatter = dynamic(() => import('@/components/PromptFormatter'), {
  loading: () => <ToolPageSkeleton label="Loading format" />,
});

export default function FormatPage() {
  return (
    <PageCanvas accent="emerald">
      <PromptFormatter />
    </PageCanvas>
  );
}
