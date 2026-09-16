'use client';

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
}: FittingPlateSectionProps) {
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/*"
          aria-label="Upload Cast plate photo"
          disabled={busy || referenceUploading}
          className="ui-file-input block min-w-0 flex-1"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            void onApplyReference({ file }).catch(err => {
              onError(err instanceof Error ? err.message : 'Could not upload that photo.');
            });
          }}
        />
        <ButtonLink href={galleryPickPath('fitting')} variant="secondary" size="sm">
          Choose from Gallery
        </ButtonLink>
        {hasReference ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClearReference}>
            Clear
          </Button>
        ) : (
          <p className="type-caption w-full text-[var(--text-muted)]">
            Plate cleared — Extract look in Look to queue a new one, or upload / pick from Gallery.
          </p>
        )}
      </div>
      {isolateStatus ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">{isolateStatus}</p>
      ) : null}
      {referencePreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={referencePreviewUrl}
          alt="Fitting plate"
          className="mt-3 max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
        />
      ) : (
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          No plate yet — open a Cast character with a look, or upload / pick from Gallery.
        </p>
      )}
    </ToolSection>
  );
}
