import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ImagePromptTool = dynamic(() => import('@/components/ImagePromptTool'), {
  loading: () => <ToolPageSkeleton label="Loading image prompt" />,
});

export default function ImagePromptPage() {
  return (
    <PageCanvas accent="fuchsia">
      <ImagePromptTool />
    </PageCanvas>
  );
}
