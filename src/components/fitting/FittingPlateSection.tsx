'use client';

import { useState } from 'react';
import UploadButton from '@/components/ui/UploadButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { cacheBustIdentityMediaUrl, IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';

export type FittingPlateApplyReferenceInput = {
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  isolate?: boolean;
};

export type FittingPlateToolSettingsPatch = {
  isolateSubject?: boolean;
  referenceIsolated?: boolean;
  referenceImageFilename?: string;
  referenceImageUrl?: string;
};

export type FittingPlateSectionProps = {
  busy: boolean;
  referenceUploading: boolean;
  isolateSubject: boolean;
  hasReference: boolean;
  isolateStatus: string | null;
  referencePreviewUrl: string | null;
  referenceImageFilename: string;
  referenceImageUrl: string;
  referenceOriginalFilename: string;
  referenceOriginalUrl: string;
  onUpdateToolSettings: (patch: FittingPlateToolSettingsPatch) => void;
  onSetReferencePreviewUrl: (url: string | null) => void;
  onSetIsolateStatus: (status: string | null) => void;
  onApplyReference: (input: FittingPlateApplyReferenceInput) => Promise<void>;
  onClearReference: () => void;
  onError: (message: string) => void;
  /** Look link for the empty state (extract a look → new plate). */
  lookHref?: string;
};

export default function FittingPlateSection({
  busy,
  referenceUploading,
  isolateSubject,
  hasReference,
  isolateStatus,
  referencePreviewUrl,
  referenceImageFilename,
  referenceImageUrl,
  referenceOriginalFilename,
  referenceOriginalUrl,
  onUpdateToolSettings,
  onSetReferencePreviewUrl,
  onSetIsolateStatus,
  onApplyReference,
  onClearReference,
  onError,
  lookHref,
}: FittingPlateSectionProps) {
  // Only say "cleared" after the player cleared it here — a fresh session has nothing to clear.
  const [justCleared, setJustCleared] = useState(false);
  const upload = (file: File) => {
    setJustCleared(false);
    void onApplyReference({ file }).catch(err => {
      onError(err instanceof Error ? err.message : 'Could not upload that photo.');
    });
  };
  return (
    <ToolSection
      title="Plate"
      description="Identity still for img2img. Isolate on white so the photo’s clothes and scene do not leak."
      data-testid="fitting-plate"
    >
      <div className="flex flex-wrap gap-2">
        <ChipButton
          active={isolateSubject}
          disabled={busy || referenceUploading}
          onClick={() => {
            const next = !isolateSubject;
            if (!next) {
              onUpdateToolSettings({
                isolateSubject: false,
                referenceIsolated: false,
                referenceImageFilename: referenceOriginalFilename || referenceImageFilename,
                referenceImageUrl: referenceOriginalUrl || referenceImageUrl,
              });
              if (referenceOriginalUrl || referenceImageUrl) {
                onSetReferencePreviewUrl(
                  cacheBustIdentityMediaUrl(referenceOriginalUrl || referenceImageUrl)
                );
              }
              onSetIsolateStatus(null);
              return;
            }
            onUpdateToolSettings({ isolateSubject: next });
            const originalUrl = referenceOriginalUrl || referenceImageUrl;
            const originalFilename = referenceOriginalFilename || referenceImageFilename;
            if (!originalUrl && !originalFilename) {
              return;
            }
            void onApplyReference({
              imageUrl: originalUrl || IDENTITY_MEDIA_URL,
              filename: originalFilename || 'fitting-ref.png',
              isolate: next,
            }).catch(err => {
              onError(err instanceof Error ? err.message : 'Could not update the reference.');
            });
          }}
        >
          Isolate on white
        </ChipButton>
      </div>
      {isolateStatus ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">{isolateStatus}</p>
      ) : null}
      {referencePreviewUrl ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referencePreviewUrl}
            alt="Fitting plate"
            className="max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          />
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              ariaLabel="Upload Cast plate photo"
              label="Replace"
              variant="secondary"
              disabled={busy || referenceUploading}
              onFile={upload}
            />
            <ButtonLink href={galleryPickPath('fitting')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
            {hasReference ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setJustCleared(true);
                  onClearReference();
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center"
          data-testid="fitting-plate-empty"
        >
          <p className="text-sm text-[var(--text-muted)]">
            {justCleared ? 'Plate cleared.' : 'No plate yet.'} Use a photo of the Cast lead — or
            extract a look in Look.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <UploadButton
              ariaLabel="Upload Cast plate photo"
              label="Upload plate"
              variant="primary"
              disabled={busy || referenceUploading}
              onFile={upload}
            />
            <ButtonLink href={galleryPickPath('fitting')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
            {lookHref ? (
              <ButtonLink
                href={lookHref}
                variant="ghost"
                size="sm"
                data-testid="fitting-plate-open-look"
              >
                Open Look
              </ButtonLink>
            ) : null}
          </div>
        </div>
      )}
    </ToolSection>
  );
}
