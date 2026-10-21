'use client';

import dynamic from 'next/dynamic';
import Dialog from '@/components/ui/Dialog';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';

const GalleryComparePanel = dynamic(() => import('@/components/GalleryComparePanel'), {
  loading: () => null,
});

export type GalleryCompareModalProps = {
  open: boolean;
  entries: GalleryComparePanelProps['entries'];
  onClose: () => void;
} & Omit<GalleryComparePanelProps, 'entries' | 'onClose'>;

export default function GalleryCompareModal({
  open,
  entries,
  onClose,
  ...panelProps
}: GalleryCompareModalProps) {
  // Above the lightbox it can be opened from.
  return (
    <Dialog
      open={open && entries.length >= 2}
      onClose={onClose}
      ariaLabel="Compare gallery outputs"
      layer="dialogOverLightbox"
      size="full"
      align="top"
      testId="gallery-compare"
      backdropClassName="bg-[var(--bg-base)]/85 backdrop-blur-sm"
      panelClassName=""
      bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4"
    >
      <GalleryComparePanel entries={entries.slice(0, 4)} onClose={onClose} {...panelProps} />
    </Dialog>
  );
}
