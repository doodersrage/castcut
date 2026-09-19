import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import type { RefObject } from 'react';

export type GalleryCardMenuProps = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  previewUrl: string | null;
  primaryMediaKind: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryPrimaryMediaKind>;
  isVideoHero: boolean;
  comfyHostLabel: string | null;
  menuOpen: boolean;
  menuPosition: { top: number; left: number; maxHeight: number } | null;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  menuPanelRef: RefObject<HTMLDivElement | null>;
  setMenuOpen: (open: boolean) => void;
  setMenuPosition: (position: { top: number; left: number; maxHeight: number } | null) => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onCancel: () => void;
  onUpscale: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  onRefine: () => void;
  onSoftSecondPass?: () => void;
  onSkinRefine?: () => void;
  onFaceDetail?: () => void;
  onAnatomyRepair?: () => void;
  onMoireClean?: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  showUpscaleActions?: boolean;
  showUpscaleFinal?: boolean;
  showUpscaleMax?: boolean;
  showForceUpscaleMax?: boolean;
  showRefineAction?: boolean;
  showSoftSecondPassAction?: boolean;
  showSkinRefineAction?: boolean;
  showFaceDetailAction?: boolean;
  showAnatomyRepairAction?: boolean;
  showMoireCleanActions?: boolean;
  showMoireCleanFinal?: boolean;
  showMoireCleanMax?: boolean;
  showForceMoireCleanMax?: boolean;
  onShowDerivatives?: () => void;
  hasDerivatives?: boolean;
  onViewWorkflow?: () => void;
  onRestoreExactGraph?: () => void;
  onRemove: () => void;
};

export type GalleryCardMenuSectionProps = Pick<
  GalleryCardMenuProps,
  | 'entry'
  | 'layout'
  | 'previewUrl'
  | 'primaryMediaKind'
  | 'isVideoHero'
  | 'comfyHostLabel'
  | 'onDownloadError'
  | 'onRequeue'
  | 'onCancel'
  | 'onUpscale'
  | 'onRefine'
  | 'onSoftSecondPass'
  | 'onSkinRefine'
  | 'onFaceDetail'
  | 'onAnatomyRepair'
  | 'onMoireClean'
  | 'showUpscaleActions'
  | 'showUpscaleFinal'
  | 'showUpscaleMax'
  | 'showForceUpscaleMax'
  | 'showRefineAction'
  | 'showSoftSecondPassAction'
  | 'showSkinRefineAction'
  | 'showFaceDetailAction'
  | 'showAnatomyRepairAction'
  | 'showMoireCleanActions'
  | 'showMoireCleanFinal'
  | 'showMoireCleanMax'
  | 'showForceMoireCleanMax'
  | 'onShowDerivatives'
  | 'hasDerivatives'
  | 'onViewWorkflow'
  | 'onRestoreExactGraph'
  | 'onRemove'
> & {
  router: AppRouterInstance;
  setMenuOpen: (open: boolean) => void;
};
