'use client';

import { useRouter } from 'next/navigation';
import ActionMenu from '@/components/ui/ActionMenu';
import {
  GalleryEditSection,
  GalleryClipSection,
  GalleryStillSection,
  GalleryEnhanceSection,
  GalleryExportSection,
  GalleryLineageSection,
  GalleryManageSection,
  GalleryQueueSection,
  type GalleryCardMenuProps,
} from '@/components/gallery/GalleryCardMenuSections';
import { GalleryQuickSection } from '@/components/gallery/GalleryCardMenuQuickSection';
export { GalleryMenuGroup, GalleryMenuButton } from '@/components/gallery/GalleryMenuPrimitives';
export type { GalleryCardMenuProps } from '@/components/gallery/GalleryCardMenuSections';

export default function GalleryCardMenu({
  entry,
  layout,
  previewUrl,
  primaryMediaKind,
  isVideoHero,
  comfyHostLabel,
  menuOpen,
  setMenuOpen,
  onDownloadError,
  onRequeue,
  onCancel,
  onUpscale,
  onRefine,
  onSoftSecondPass,
  onSkinRefine,
  onFaceDetail,
  onAnatomyRepair,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showSoftSecondPassAction = true,
  showSkinRefineAction = true,
  showFaceDetailAction = false,
  showAnatomyRepairAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  onShowDerivatives,
  hasDerivatives,
  onViewWorkflow,
  onRestoreExactGraph,
  onRemove,
}: GalleryCardMenuProps) {
  const router = useRouter();
  const sectionProps = {
    entry,
    layout,
    previewUrl,
    primaryMediaKind,
    isVideoHero,
    comfyHostLabel,
    onDownloadError,
    onRequeue,
    onCancel,
    onUpscale,
    onRefine,
    onSoftSecondPass,
    onSkinRefine,
    onFaceDetail,
    onAnatomyRepair,
    onMoireClean,
    showUpscaleActions,
    showUpscaleFinal,
    showUpscaleMax,
    showForceUpscaleMax,
    showRefineAction,
    showSoftSecondPassAction,
    showSkinRefineAction,
    showFaceDetailAction,
    showAnatomyRepairAction,
    showMoireCleanActions,
    showMoireCleanFinal,
    showMoireCleanMax,
    showForceMoireCleanMax,
    onShowDerivatives,
    hasDerivatives,
    onViewWorkflow,
    onRestoreExactGraph,
    onRemove,
    router,
    setMenuOpen,
  };

  return (
    <div className="ml-auto">
      {/* The shared menu's portal mode: the grid's cards clip and virtualize, so the panel sits
          on the body at a fixed position (flips near edges, scrolls past its max height). */}
      <ActionMenu
        portal
        open={menuOpen}
        onOpenChange={setMenuOpen}
        label="More"
        caret={false}
        summaryAriaLabel="More actions"
        triggerTestId="gallery-card-menu"
        summaryClassName="ui-btn-ghost ui-btn-sm text-xs"
      >
        <GalleryQuickSection {...sectionProps} />
        <GalleryEnhanceSection {...sectionProps} />
        <GalleryClipSection {...sectionProps} />
        <GalleryStillSection {...sectionProps} />
        <GalleryEditSection {...sectionProps} />
        <GalleryQueueSection {...sectionProps} />
        <GalleryExportSection {...sectionProps} />
        <GalleryLineageSection {...sectionProps} />
        <GalleryManageSection {...sectionProps} />
      </ActionMenu>
    </div>
  );
}
