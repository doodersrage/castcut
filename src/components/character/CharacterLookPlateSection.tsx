'use client';

import { useState } from 'react';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import UploadButton from '@/components/ui/UploadButton';
import { usePlateCheck } from '@/hooks/usePlateCheck';
import type { FittingPlate } from '@/lib/fitting-room';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';

export type CharacterLookPlateSectionProps = {
  characterId: string;
  plate: FittingPlate | null;
  uploading: boolean;
  status: string | null;
  error: string | null;
  onClear: () => void;
  onUpload: (file: File) => void;
};

/** DWPose read of the plate: one person, face visible and big enough, sharp enough. */
function PlateCheckLine({ plate }: { plate: FittingPlate | null }) {
  const { outcome, checking } = usePlateCheck(plate);
  if (checking) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="cast-plate-check">
        Checking the plate…
      </p>
    );
  }
  if (!outcome) {
    return null;
  }
  if (outcome.state === 'off') {
    return (
      <p
        className="type-caption text-[var(--text-muted)]"
        data-testid="cast-plate-check"
        data-state="off"
      >
        Plate check off — {outcome.reason}
      </p>
    );
  }
  const { check } = outcome;
  if (check.status === 'good') {
    return (
      <p
        className="type-caption text-[var(--tint-success-text,var(--text-secondary))]"
        data-testid="cast-plate-check"
        data-state="good"
      >
        Plate check: good — one person
        {check.facePx ? `, face about ${check.facePx}px wide` : ''}.
      </p>
    );
  }
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2"
      data-testid="cast-plate-check"
      data-state="warn"
      role="status"
    >
      <p className="type-caption font-medium text-[var(--tint-warning-text)]">
        This plate may hurt Outfit, Day and Story
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {check.notes.map(note => (
          <li key={note} className="type-caption text-[var(--text-secondary)]">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CharacterLookPlateSection({
  characterId,
  plate,
  uploading,
  status,
  error,
  onClear,
  onUpload,
}: CharacterLookPlateSectionProps) {
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const previewUrl = plate?.imageUrl?.trim()
    ? cacheBustIdentityMediaUrl(plate.imageUrl.trim())
    : '';
  const hasPlate = Boolean(previewUrl || plate?.filename?.trim());

  return (
    <ToolSection
      title="Look plate"
      description="Identity still for Outfit, Day, and Story — checked for one clear, visible face."
      data-testid="cast-look-plate"
    >
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cast-look-plate-status">
          {status}
        </p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {hasPlate ? (
        <div className="flex flex-wrap items-start gap-4">
          {previewUrl ? (
            <button
              type="button"
              className="block shrink-0 cursor-zoom-in border-0 bg-transparent p-0"
              data-testid="cast-look-plate-preview"
              onClick={() =>
                setLightbox({
                  images: [previewUrl],
                  index: 0,
                  title: 'Look plate',
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Look plate"
                className="max-h-64 max-w-[16rem] rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
              />
            </button>
          ) : null}
          <div className="min-w-[12rem] flex-1 space-y-3">
            <PlateCheckLine plate={plate} />
            <div className="flex flex-wrap gap-2">
              <UploadButton
                label="Replace"
                disabled={uploading}
                ariaLabel="Upload a new look plate"
                testId="cast-look-plate-upload"
                onFile={onUpload}
              />
              <ButtonLink
                href={galleryPickPath('cast', { characterId })}
                variant="secondary"
                size="sm"
                data-testid="cast-look-plate-gallery"
              >
                Choose from Gallery
              </ButtonLink>
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                data-testid="cast-look-plate-clear"
                onClick={onClear}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center"
          data-testid="cast-look-plate-empty"
        >
          <p className="text-sm text-[var(--text-muted)]">
            No look plate yet — Outfit, Day and Story need one. Use a clear photo of this character,
            one person, face visible.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <UploadButton
              label="Upload plate"
              variant="primary"
              disabled={uploading}
              ariaLabel="Upload a look plate"
              testId="cast-look-plate-upload"
              onFile={onUpload}
            />
            <ButtonLink
              href={galleryPickPath('cast', { characterId })}
              variant="secondary"
              size="sm"
              data-testid="cast-look-plate-gallery"
            >
              Choose from Gallery
            </ButtonLink>
            <ButtonLink
              href={`/moodboard?character=${encodeURIComponent(characterId)}`}
              variant="ghost"
              size="sm"
            >
              Extract a look in Look
            </ButtonLink>
          </div>
        </div>
      )}
      {plate?.isolated === true ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          Isolated on white for Outfit / Day / Story.
        </p>
      ) : null}
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />
    </ToolSection>
  );
}
