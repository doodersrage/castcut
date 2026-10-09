import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const TopicTool = dynamic(() => import('@/components/TopicTool'), {
  loading: () => <ToolPageSkeleton label="Loading topics" />,
});

export default function TopicsPage() {
  return (
    <PageCanvas accent="brand">
      <TopicTool />
    </PageCanvas>
  );
}
