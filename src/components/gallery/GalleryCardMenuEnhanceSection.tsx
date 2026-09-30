import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';

export function GalleryEnhanceSection({
  onUpscale,
  onRefine,
  onSoftSecondPass,
  onSkinRefine,
  onFaceDetail,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showSoftSecondPassAction = true,
  showSkinRefineAction = true,
  showFaceDetailAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const canUpscaleFinal = showUpscaleFinal ?? showUpscaleActions;
  const canUpscaleMax = showUpscaleMax ?? showUpscaleActions;
  const canMoireFinal = showMoireCleanFinal ?? showMoireCleanActions;
  const canMoireMax = showMoireCleanMax ?? showMoireCleanActions;

  const shouldShowUpscaleFinal = canUpscaleFinal;
  const shouldShowUpscaleMax = canUpscaleMax;
  const shouldShowForceUpscaleMax = showForceUpscaleMax;
  const shouldShowSoftSecondPass = onSoftSecondPass && showSoftSecondPassAction;
  const shouldShowSkinRefine = onSkinRefine && showSkinRefineAction;
  const shouldShowRefine = showRefineAction;
  const shouldShowFaceDetail = onFaceDetail && showFaceDetailAction;
  const shouldShowMoireFinal = onMoireClean && canMoireFinal;
  const shouldShowMoireMax = onMoireClean && canMoireMax;
  const shouldShowForceMoireCleanMax = onMoireClean && showForceMoireCleanMax;

  const hasEnhanceActions =
    shouldShowUpscaleFinal ||
    shouldShowUpscaleMax ||
    shouldShowForceUpscaleMax ||
    shouldShowSoftSecondPass ||
    shouldShowSkinRefine ||
    shouldShowRefine ||
    shouldShowFaceDetail ||
    shouldShowMoireFinal ||
    shouldShowMoireMax ||
    shouldShowForceMoireCleanMax;

  if (!hasEnhanceActions) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Fix & improve" collapsible>
      {shouldShowUpscaleFinal ? (
        <GalleryMenuButton
          label="Upscale → Good (~1.25× Lanczos)"
          onClick={() => {
            onUpscale('final');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowUpscaleMax ? (
        <GalleryMenuButton
          label="Upscale → Best (full pipeline)"
          onClick={() => {
            onUpscale('max');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowForceUpscaleMax ? (
        <GalleryMenuButton
          label="Force Upscale · Best"
          onClick={() => {
            onUpscale('max', { force: true });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowRefine ? (
        <GalleryMenuButton
          label="Refine → low-denoise second pass"
          onClick={() => {
            onRefine();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowSoftSecondPass ? (
        <GalleryMenuButton
          label="Soft second pass → gentler denoise"
          onClick={() => {
            onSoftSecondPass();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowSkinRefine ? (
        <GalleryMenuButton
          label="Skin refine → natural texture (Edit/Klein)"
          onClick={() => {
            onSkinRefine();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowFaceDetail ? (
        <GalleryMenuButton
          label="Face detail → second KSampler pass"
          onClick={() => {
            onFaceDetail();
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowMoireFinal ? (
        <GalleryMenuButton
          label="Polish → Good (soft blur)"
          onClick={() => {
            onMoireClean('final');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowMoireMax ? (
        <GalleryMenuButton
          label="Polish → Best (blur + resample)"
          onClick={() => {
            onMoireClean('max');
            setMenuOpen(false);
          }}
        />
      ) : null}
      {shouldShowForceMoireCleanMax ? (
        <GalleryMenuButton
          label="Force polish → Best"
          onClick={() => {
            onMoireClean('max', { force: true });
            setMenuOpen(false);
          }}
        />
      ) : null}
    </GalleryMenuGroup>
  );
}
