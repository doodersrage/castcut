'use client';

import { useRouter } from 'next/navigation';
import ModalPortal from '@/components/ui/ModalPortal';
import {
  GalleryEditSection,
  GalleryEnhanceSection,
  GalleryExportSection,
  GalleryLineageSection,
  GalleryManageSection,
  GalleryQueueSection,
  type GalleryCardMenuProps,
} from '@/components/gallery/GalleryCardMenuSections';
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
  menuPosition,
  menuButtonRef,
  menuPanelRef,
  setMenuOpen,
  setMenuPosition,
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
    <div className="relative ml-auto">
      <button
        ref={menuButtonRef}
        type="button"
        data-testid="gallery-card-menu"
        aria-label="More actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => {
          if (menuOpen) {
            setMenuOpen(false);
            setMenuPosition(null);
            return;
          }
          setMenuOpen(true);
        }}
        className="ui-btn-ghost ui-btn-sm text-xs"
      >
        More
      </button>
      {menuOpen && menuPosition ? (
        <ModalPortal>
          <div
            ref={menuPanelRef}
            role="menu"
            className="fixed z-[200] min-w-[12.5rem] overflow-y-auto rounded-xl border border-[var(--border-default)]/80 bg-[var(--bg-base)] p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/5"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              maxHeight: menuPosition.maxHeight,
            }}
          >
            <GalleryExportSection {...sectionProps} />
            <GalleryEditSection {...sectionProps} />
            <GalleryQueueSection {...sectionProps} />
            <GalleryEnhanceSection {...sectionProps} />
            <GalleryLineageSection {...sectionProps} />
            <GalleryManageSection {...sectionProps} />
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
