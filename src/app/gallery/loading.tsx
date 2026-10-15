import PageCanvas from '@/components/ui/PageCanvas';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import { ToolLayout } from '@/components/ui/ToolPageShell';

export default function GalleryLoading() {
  return (
    <PageCanvas accent="neutral">
      <ToolLayout
        accent="neutral"
        width="wide"
        title="Gallery"
        description="Browse outputs, review and compare variants, run experiments, and queue follow-up work from one place."
      >
        <GalleryPanelSkeleton showFilters />
      </ToolLayout>
    </PageCanvas>
  );
}
