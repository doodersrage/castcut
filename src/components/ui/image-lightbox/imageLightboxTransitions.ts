import type { GallerySlideshowTransition } from '@/lib/gallery/comfyui-gallery';

export function resolveSlideDirection(
  fromIndex: number,
  toIndex: number,
  totalImages: number,
  slideshowPlaying: boolean
): 1 | -1 {
  if (toIndex > fromIndex) {
    return 1;
  }

  if (toIndex < fromIndex) {
    if (toIndex === 0 && fromIndex === totalImages - 1 && slideshowPlaying) {
      return 1;
    }

    return -1;
  }

  return 1;
}

export function resolveTransitionClasses(
  transition: GallerySlideshowTransition,
  direction: 1 | -1
): { enter: string; exit: string } {
  switch (transition) {
    case 'fade':
      return { enter: 'lightbox-fade-enter', exit: 'lightbox-fade-exit' };
    case 'zoom':
      return { enter: 'lightbox-zoom-enter', exit: 'lightbox-zoom-exit' };
    case 'none':
      return { enter: '', exit: '' };
    case 'slide':
    default:
      return direction === 1
        ? {
            enter: 'lightbox-slide-enter-forward',
            exit: 'lightbox-slide-exit-forward',
          }
        : {
            enter: 'lightbox-slide-enter-back',
            exit: 'lightbox-slide-exit-back',
          };
  }
}
