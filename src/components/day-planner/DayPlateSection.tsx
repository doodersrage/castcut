'use client';

import { ButtonLink } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { DayPlate } from '@/lib/day-plate';
import { lookPackFittingHref } from '@/lib/look-pack';

export type DayPlateSectionProps = {
  plate: DayPlate | null;
  platePreviewUrl?: string | null;
  characterId?: string | null;
  lockedWardrobeId?: string | null;
  busy?: boolean;
  isolateSubject?: boolean;
  isolateBusy?: boolean;
  isolateStatus?: string | null;
  isolatePending?: boolean;
  onIsolateSubjectChange?: (next: boolean) => void;
};

export default function DayPlateSection({
  plate,
  platePreviewUrl,
  characterId,
  lockedWardrobeId,
  busy = false,
  isolateSubject = true,
  isolateBusy = false,
  isolateStatus = null,
  isolatePending = false,
  onIsolateSubjectChange,
}: DayPlateSectionProps) {
  const previewUrl = platePreviewUrl?.trim() || plate?.imageUrl?.trim() || '';
  const outfitHref = lookPackFittingHref({
    version: 1,
    source: 'moodboard',
    characterId: characterId?.trim() || undefined,
    wardrobeId: lockedWardrobeId?.trim() || undefined,
    savedAt: 0,
  });
  const sourceLabel =
    plate?.source === 'keeper'
      ? 'Kept from Outfit — locks the worn kit for Day stills. Pose may still drift on some models.'
      : plate
        ? 'Cast look plate — identity for Day stills'
        : null;

  return (
    <ToolSection
      title="Plate"
      description="Identity still for Day queues. Isolate on white so scene clothes do not leak."
      data-testid="day-plate"
    >
      {onIsolateSubjectChange ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <ChipButton
            active={isolateSubject}
            disabled={busy || isolateBusy || !plate}
            data-testid="day-plate-isolate"
            onClick={() => onIsolateSubjectChange(!isolateSubject)}
          >
            Isolate on white
          </ChipButton>
        </div>
      ) : null}
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Day plate"
          className="max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          data-testid="day-plate-preview"
          data-source={plate?.source}
          data-isolated={plate?.isolated === true ? 'true' : 'false'}
        />
      ) : (
        <p className="type-caption text-[var(--text-muted)]" data-testid="day-plate-empty">
          No plate yet — Keep a try-on in Outfit, or add a look plate in Cast.
        </p>
      )}
      {isolateStatus ? (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          data-testid="day-plate-isolate-status"
        >
          {isolateStatus}
        </p>
      ) : isolateSubject && isolatePending && plate ? (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          data-testid="day-plate-isolate-status"
        >
          Isolating subject on white…
        </p>
      ) : null}
      {sourceLabel ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">{sourceLabel}</p>
      ) : null}
      {!previewUrl ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={outfitHref} variant="secondary" size="sm">
            Open Outfit
          </ButtonLink>
        </div>
      ) : null}
    </ToolSection>
  );
}
