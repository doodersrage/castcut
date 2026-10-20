import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { ComfyOutputMediaKind } from '@/lib/comfyui/outputs';
import { isStillLightboxKind } from '@/lib/comfyui/outputs';
import type { ImageLightboxSlideshowOptions } from '@/components/ui/image-lightbox/types';

export type UseImageLightboxStageOptions = {
  open: boolean;
  index: number;
  imagesLength: number;
  mediaKinds?: ComfyOutputMediaKind[];
  slideshow?: ImageLightboxSlideshowOptions;
  onIndexChange: (index: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  isFullscreen: boolean;
  mounted: boolean;
};

export type UseImageLightboxStageResult = {
  zoom: number;
  pan: { x: number; y: number };
  dragging: boolean;
  zoomRef: RefObject<number>;
  dragRef: RefObject<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    mode: 'pan' | 'swipe';
  } | null>;
  touchPinchRef: RefObject<{ distance: number; zoom: number } | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  resetZoom: () => void;
  applyZoom: (next: number) => void;
  toggleZoom: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  onStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStageTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onStageTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onStageTouchEnd: () => void;
  goToIndex: (nextIndex: number, manual?: boolean) => void;
};

export function useImageLightboxStage(
  options: UseImageLightboxStageOptions
): UseImageLightboxStageResult {
  const {
    open,
    index,
    imagesLength,
    mediaKinds,
    slideshow,
    onIndexChange,
    canGoNext,
    canGoPrevious,
    isFullscreen,
    mounted,
  } = options;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    mode: 'pan' | 'swipe';
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const touchPinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const resetZoom = useCallback(() => {
    setZoom(1);
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(5, Math.max(1, next));
    zoomRef.current = clamped;
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const toggleZoom = useCallback(() => {
    setZoom(previous => {
      if (previous > 1) {
        setPan({ x: 0, y: 0 });
        zoomRef.current = 1;
        return 1;
      }
      zoomRef.current = 2;
      return 2;
    });
  }, []);

  const goToIndex = useCallback(
    (nextIndex: number, manual = false) => {
      if (manual && slideshow?.playing) {
        slideshow.onPlayingChange(false);
      }
      resetZoom();
      onIndexChange(nextIndex);
    },
    [onIndexChange, resetZoom, slideshow]
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      resetZoom();
    });
  }, [index, resetZoom]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const el = stageRef.current;
    if (!el) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      const mediaKind = mediaKinds?.[index] ?? 'image';
      if (event.ctrlKey || event.metaKey) {
        if (!isStillLightboxKind(mediaKind)) {
          return;
        }
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.92 : 1.08;
        applyZoom(zoomRef.current * factor);
        return;
      }

      if (zoomRef.current > 1) {
        return;
      }

      if (imagesLength <= 1) {
        return;
      }

      const dominant =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(dominant) < 18) {
        return;
      }

      event.preventDefault();
      if (dominant > 0) {
        const nextIndex = index < imagesLength - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      } else {
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? imagesLength - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [
    open,
    index,
    imagesLength,
    goToIndex,
    slideshow?.playing,
    mediaKinds,
    applyZoom,
    isFullscreen,
    mounted,
  ]);

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const mode = zoom > 1 ? 'pan' : 'swipe';
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
      mode,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true;
    }
    if (drag.mode === 'pan' && zoom > 1) {
      setPan({ x: drag.originX + dx, y: drag.originY + dy });
    }
  };

  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const clickedImage = event.target instanceof HTMLElement && event.target.tagName === 'IMG';
    const mediaKind = mediaKinds?.[index] ?? 'image';
    if (!drag.moved && clickedImage && isStillLightboxKind(mediaKind)) {
      toggleZoom();
      return;
    }

    if (drag.mode === 'swipe' && zoom <= 1 && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && (canGoNext || slideshow?.playing)) {
        const nextIndex = index < imagesLength - 1 ? index + 1 : slideshow?.playing ? 0 : index;
        if (nextIndex !== index) {
          goToIndex(nextIndex, !slideshow?.playing);
        }
      } else if (dx > 0 && (canGoPrevious || slideshow?.playing)) {
        const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? imagesLength - 1 : index;
        if (prevIndex !== index) {
          goToIndex(prevIndex, !slideshow?.playing);
        }
      }
    }
  };

  const onStageTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && isStillLightboxKind(mediaKinds?.[index])) {
      const [a, b] = [event.touches[0], event.touches[1]];
      if (!a || !b) {
        return;
      }
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      touchPinchRef.current = { distance, zoom: zoomRef.current };
      dragRef.current = null;
      setDragging(false);
    }
  };

  const onStageTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinch = touchPinchRef.current;
    if (!pinch || event.touches.length !== 2) {
      return;
    }
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    if (!a || !b) {
      return;
    }
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch.distance < 8) {
      return;
    }
    applyZoom(pinch.zoom * (distance / pinch.distance));
  };

  const onStageTouchEnd = () => {
    touchPinchRef.current = null;
  };

  return {
    zoom,
    pan,
    dragging,
    zoomRef,
    dragRef,
    touchPinchRef,
    stageRef,
    resetZoom,
    applyZoom,
    toggleZoom,
    setPan,
    onStagePointerDown,
    onStagePointerMove,
    onStagePointerUp,
    onStageTouchStart,
    onStageTouchMove,
    onStageTouchEnd,
    goToIndex,
  };
}
