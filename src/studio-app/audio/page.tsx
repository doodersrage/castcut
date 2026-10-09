import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const AudioPromptTool = dynamic(() => import('@/components/AudioPromptTool'), {
  loading: () => <ToolPageSkeleton label="Loading audio" />,
});

export default function AudioPage() {
  return (
    <PageCanvas accent="sky">
      <AudioPromptTool />
    </PageCanvas>
  );
}
