'use client';

import dynamic from 'next/dynamic';
import GalleryImportSection from '@/components/GalleryImportSection';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { useHubPageDescription } from '@/hooks/useToolPageDescription';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';

const ComfyUiGalleryPanel = dynamic(() => import('@/components/ComfyUiGalleryPanel'), {
  ssr: false,
  loading: () => <GalleryPanelSkeleton showFilters />,
});

const ACCENT = 'neutral' as const;

export default function GalleryTool() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const description = useHubPageDescription('gallery');

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Library</ToolBadge>}
      title="Gallery"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.gallery} />
      <ComfyUiGalleryPanel showFilters />
      {!isSimple ? <GalleryImportSection /> : null}
    </ToolLayout>
  );
}
