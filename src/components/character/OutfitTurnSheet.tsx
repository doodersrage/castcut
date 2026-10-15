'use client';

import dynamic from 'next/dynamic';
import SideSheet from '@/components/ui/SideSheet';

const OutfitTurnViewer = dynamic(() => import('@/components/character/OutfitTurnViewer'), {
  ssr: false,
});

/** Turn around: an outfit's runway clip as a drag-to-turn viewer (OutfitTurnViewer). */
export default function OutfitTurnSheet({
  open,
  onClose,
  clipUrl,
  title,
}: {
  open: boolean;
  onClose: () => void;
  clipUrl: string;
  title: string;
}) {
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={`Turn around · ${title}`}
      description="Every angle is a frame of the runway clip — drag, or use ← →."
      size="lg"
      testId="outfit-turn-sheet"
    >
      <OutfitTurnViewer key={clipUrl} src={clipUrl} label={title} />
    </SideSheet>
  );
}
