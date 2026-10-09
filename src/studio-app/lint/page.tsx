import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const LintTool = dynamic(() => import('@/components/LintTool'), {
  loading: () => <ToolPageSkeleton label="Loading lint" />,
});

export default function LintPage() {
  return (
    <PageCanvas accent="neutral">
      <LintTool />
    </PageCanvas>
  );
}
