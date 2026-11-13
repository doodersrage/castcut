import PageCanvas from '@/components/ui/PageCanvas';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import { ToolLayout } from '@/components/ui/ToolPageShell';

export default function GalleryLoading() {
  return (
    <PageCanvas accent="neutral">
      <ToolLayout
        accent="neutral"
        width="full"
        title="Gallery"
        description="Every still, clip and film you’ve made — review them, compare takes, and send the best on."
      >
        <GalleryPanelSkeleton showFilters />
      </ToolLayout>
    </PageCanvas>
  );
}
