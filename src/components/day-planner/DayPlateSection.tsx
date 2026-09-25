'use client';

import { ButtonLink } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { DayPlate } from '@/lib/day-plate';
import { lookPackFittingHref } from '@/lib/look-pack';
import { galleryPickPath } from '@/lib/gallery-handoff';
import UploadButton from '@/components/ui/UploadButton';

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
  /** Upload a photo as the Cast's look plate (shared with Outfit and Story). */
  onUploadPlate?: (file: File) => void;
  uploading?: boolean;
  uploadError?: string | null;
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
  onUploadPlate,
  uploading = false,
  uploadError = null,
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
          No plate yet — upload a clear photo of this character (it becomes their Cast look plate),
          pick one from Gallery, or Keep a try-on in Outfit.
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
      {uploadError ? (
        <p
          className="type-caption mt-2 text-[var(--danger-text)]"
          data-testid="day-plate-upload-error"
        >
          {uploadError}
        </p>
      ) : null}
      {!previewUrl || onUploadPlate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onUploadPlate && characterId ? (
            <>
              <UploadButton
                label={uploading ? 'Uploading…' : previewUrl ? 'Replace plate' : 'Upload plate'}
                variant={previewUrl ? 'secondary' : 'primary'}
                disabled={busy || uploading}
                ariaLabel="Upload a look plate for this Cast"
                testId="day-plate-upload"
                onFile={onUploadPlate}
              />
              <ButtonLink
                href={galleryPickPath('cast', { characterId })}
                variant="secondary"
                size="sm"
              >
                Choose from Gallery
              </ButtonLink>
            </>
          ) : null}
          {!previewUrl ? (
            <ButtonLink href={outfitHref} variant="ghost" size="sm">
              Open Outfit
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </ToolSection>
  );
}
