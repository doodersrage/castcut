import type { GalleryPanelBodyProps } from '@/components/gallery/gallery-panel-body-types';

export type GalleryPanelBodyBuildInput = {
  chrome: GalleryPanelBodyProps['chrome'];
  upload: GalleryPanelBodyProps['upload'];
  lightbox: GalleryPanelBodyProps['lightbox'];
  header: GalleryPanelBodyProps['header'];
  requeueStatus: string | null;
  cap: GalleryPanelBodyProps['cap'];
  auxiliary: GalleryPanelBodyProps['auxiliary'];
  browse: GalleryPanelBodyProps['browse'];
  selection: GalleryPanelBodyProps['selection'];
  bulk: GalleryPanelBodyProps['bulk'];
  modals: GalleryPanelBodyProps['modals'];
  grid: GalleryPanelBodyProps['grid'];
  review: GalleryPanelBodyProps['review'];
  removeEntries: GalleryPanelBodyProps['removeEntries'];
  setFavorites: GalleryPanelBodyProps['setFavorites'];
  setRequeueStatus: GalleryPanelBodyProps['setRequeueStatus'];
};

export function assembleGalleryPanelBodyProps(
  input: GalleryPanelBodyBuildInput
): GalleryPanelBodyProps {
  return {
    chrome: input.chrome,
    upload: input.upload,
    lightbox: input.lightbox,
    header: input.header,
    status: { requeueStatus: input.requeueStatus },
    cap: input.cap,
    auxiliary: input.auxiliary,
    browse: input.browse,
    selection: input.selection,
    bulk: input.bulk,
    modals: input.modals,
    grid: input.grid,
    review: input.review,
    removeEntries: input.removeEntries,
    setFavorites: input.setFavorites,
    setRequeueStatus: input.setRequeueStatus,
  };
}
