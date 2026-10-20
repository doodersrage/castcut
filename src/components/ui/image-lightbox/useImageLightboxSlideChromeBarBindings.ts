'use client';

import { useMemo } from 'react';
import type { ImageLightboxSlideChromeBarProps } from '@/components/ui/image-lightbox/ImageLightboxSlideChrome';
import type { ComfyOutputMediaKind } from '@/lib/comfyui/outputs';
import type { GalleryLightboxFit } from '@/lib/gallery/lightbox-prefs';

type UseImageLightboxSlideChromeBarBindingsArgs = {
  chromeCompact: boolean;
  actionsOpen: boolean;
  metaOpen: boolean;
  helpOpen: boolean;
  moreOpen: boolean;
  baOpen: boolean;
  dualMode: boolean;
  fitMode: GalleryLightboxFit;
  histogramOpen: boolean;
  preferFullRes: boolean;
  fullResLoading: boolean;
  hasDistinctFullRes: boolean;
  currentMediaKind: ComfyOutputMediaKind;
  imagesLength: number;
  index: number;
  setMetaOpen: ImageLightboxSlideChromeBarProps['onMetaOpenChange'];
  setActionsOpen: ImageLightboxSlideChromeBarProps['onActionsOpenChange'];
  setChromeCompact: ImageLightboxSlideChromeBarProps['onChromeCompactChange'];
  setHelpOpen: ImageLightboxSlideChromeBarProps['onHelpOpenChange'];
  setMoreOpen: ImageLightboxSlideChromeBarProps['onMoreOpenChange'];
  setBaOpen: ImageLightboxSlideChromeBarProps['onBaOpenChange'];
  setDualMode: ImageLightboxSlideChromeBarProps['onDualModeChange'];
  setDualIndex: ImageLightboxSlideChromeBarProps['onDualIndexChange'];
  setFitMode: ImageLightboxSlideChromeBarProps['onFitModeChange'];
  setHistogramOpen: ImageLightboxSlideChromeBarProps['onHistogramOpenChange'];
  setPreferFullRes: ImageLightboxSlideChromeBarProps['onPreferFullResChange'];
  setFullResLoading: ImageLightboxSlideChromeBarProps['onFullResLoadingChange'];
  setCurrentImageLoaded: ImageLightboxSlideChromeBarProps['onCurrentImageLoadedChange'];
  loadHistogram: () => Promise<void>;
  applyZoomPreset: ImageLightboxSlideChromeBarProps['onApplyZoomPreset'];
};

export function useImageLightboxSlideChromeBarBindings({
  chromeCompact,
  actionsOpen,
  metaOpen,
  helpOpen,
  moreOpen,
  baOpen,
  dualMode,
  fitMode,
  histogramOpen,
  preferFullRes,
  fullResLoading,
  hasDistinctFullRes,
  currentMediaKind,
  imagesLength,
  index,
  setMetaOpen,
  setActionsOpen,
  setChromeCompact,
  setHelpOpen,
  setMoreOpen,
  setBaOpen,
  setDualMode,
  setDualIndex,
  setFitMode,
  setHistogramOpen,
  setPreferFullRes,
  setFullResLoading,
  setCurrentImageLoaded,
  loadHistogram,
  applyZoomPreset,
}: UseImageLightboxSlideChromeBarBindingsArgs) {
  return useMemo(
    () => ({
      chromeCompact,
      actionsOpen,
      metaOpen,
      helpOpen,
      moreOpen,
      baOpen,
      dualMode,
      fitMode,
      histogramOpen,
      preferFullRes,
      fullResLoading,
      hasDistinctFullRes,
      currentMediaKind,
      imagesLength,
      index,
      onMetaOpenChange: setMetaOpen,
      onActionsOpenChange: setActionsOpen,
      onChromeCompactChange: setChromeCompact,
      onHelpOpenChange: setHelpOpen,
      onMoreOpenChange: setMoreOpen,
      onBaOpenChange: setBaOpen,
      onDualModeChange: setDualMode,
      onDualIndexChange: setDualIndex,
      onFitModeChange: setFitMode,
      onHistogramOpenChange: setHistogramOpen,
      onPreferFullResChange: setPreferFullRes,
      onFullResLoadingChange: setFullResLoading,
      onCurrentImageLoadedChange: setCurrentImageLoaded,
      onLoadHistogram: () => {
        void loadHistogram();
      },
      onApplyZoomPreset: applyZoomPreset,
    }),
    [
      actionsOpen,
      applyZoomPreset,
      baOpen,
      chromeCompact,
      currentMediaKind,
      dualMode,
      fitMode,
      fullResLoading,
      hasDistinctFullRes,
      helpOpen,
      histogramOpen,
      imagesLength,
      index,
      loadHistogram,
      metaOpen,
      moreOpen,
      preferFullRes,
      setActionsOpen,
      setBaOpen,
      setChromeCompact,
      setCurrentImageLoaded,
      setDualIndex,
      setDualMode,
      setFitMode,
      setFullResLoading,
      setHelpOpen,
      setHistogramOpen,
      setMetaOpen,
      setMoreOpen,
      setPreferFullRes,
    ]
  );
}
