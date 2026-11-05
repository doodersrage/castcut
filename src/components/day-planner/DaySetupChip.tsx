'use client';

import type { CharacterRecord } from '@/lib/character/os';
import CastChip from '@/components/ui/CastChip';
import { castPlateThumbUrl } from '@/lib/character/plate-thumb';

/**
 * Setup as a status chip — "Nora · plate ready" — that opens the Setup sheet (Cast lead, look,
 * plate). Setup is done on the Cast page; on Day it is a check, not a section.
 */
export default function DaySetupChip({
  character,
  hasPlate,
  onClick,
  className = '',
  plateUrl = null,
}: {
  character: CharacterRecord | null | undefined;
  hasPlate: boolean;
  onClick: () => void;
  className?: string;
  /** The plate, when there is one, as the chip's picture. */
  plateUrl?: string | null;
}) {
  const name = character?.name?.trim() || '';
  return (
    <CastChip
      name={character ? name || 'Cast' : 'No Cast lead'}
      detail={character ? (hasPlate ? 'plate ready' : 'no plate yet') : undefined}
      plateUrl={plateUrl ?? (character && hasPlate ? castPlateThumbUrl(character) : null)}
      status={!character || !hasPlate ? 'warn' : 'ok'}
      title="Setup — Cast lead, look and plate"
      testId="day-setup-chip"
      className={className}
      onOpen={onClick}
    />
  );
}
