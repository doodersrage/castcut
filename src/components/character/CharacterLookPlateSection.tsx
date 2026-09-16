'use client';

import { useState } from 'react';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
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
      description="Identity still for Outfit, Day, and Story. Review, replace, or remove anytime."
      data-testid="cast-look-plate"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          className="ui-file-input block min-w-0 flex-1"
          data-testid="cast-look-plate-upload"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              onUpload(file);
            }
          }}
        />
        <ButtonLink
          href={galleryPickPath('cast', { characterId })}
          variant="secondary"
          size="sm"
          data-testid="cast-look-plate-gallery"
        >
          Choose from Gallery
        </ButtonLink>
        {hasPlate ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={uploading}
            data-testid="cast-look-plate-clear"
            onClick={onClear}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {status ? (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          data-testid="cast-look-plate-status"
        >
          {status}
        </p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {previewUrl ? (
        <button
          type="button"
          className="mt-3 block max-w-full cursor-zoom-in border-0 bg-transparent p-0"
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
            className="max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          />
        </button>
      ) : (
        <p
          className="type-caption mt-2 text-[var(--text-muted)]"
          data-testid="cast-look-plate-empty"
        >
          No look plate yet — upload a still, pick from Gallery, or Extract look in Look.
        </p>
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
