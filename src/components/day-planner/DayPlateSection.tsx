'use client';

import { ButtonLink } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { DayPlate } from '@/lib/day-plate';
import { lookPackFittingHref } from '@/lib/look-pack';

export type DayPlateSectionProps = {
  plate: DayPlate | null;
  characterId?: string | null;
  lockedWardrobeId?: string | null;
};

export default function DayPlateSection({
  plate,
  characterId,
  lockedWardrobeId,
}: DayPlateSectionProps) {
  const previewUrl = plate?.imageUrl?.trim() || '';
  const outfitHref = lookPackFittingHref({
    version: 1,
    source: 'moodboard',
    characterId: characterId?.trim() || undefined,
    wardrobeId: lockedWardrobeId?.trim() || undefined,
    savedAt: 0,
  });
  const sourceLabel =
    plate?.source === 'keeper'
      ? 'Outfit Keep as Image 1 (kit lock). Packshot may reinforce as Image 2. Qwen 2511 still tends to hold Keep pose.'
      : plate
        ? 'Cast look plate — identity for Day stills'
        : null;

  return (
    <ToolSection
      title="Plate"
      description="Identity still for Day queues. Keep in Outfit to lock the worn kit here."
      data-testid="day-plate"
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Day plate"
          className="max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          data-testid="day-plate-preview"
          data-source={plate?.source}
        />
      ) : (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-plate-empty">
          No plate yet — Keep a try-on in Outfit, or add a look plate in Cast.
        </p>
      )}
      {sourceLabel ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">{sourceLabel}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href={outfitHref} variant="secondary" size="sm">
          Open Outfit
        </ButtonLink>
      </div>
    </ToolSection>
  );
}
