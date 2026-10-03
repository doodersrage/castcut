'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import UploadButton from '@/components/ui/UploadButton';
import { usePlateCheck } from '@/hooks/usePlateCheck';
import type { FittingPlate } from '@/lib/fitting-room';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';
import type { stripCastPlateClothing } from '@/lib/cast-plate-strip';
import type { CastPlateTile } from '@/lib/cast-plate-thumb';

const CastPlateStripButton = dynamic(() => import('@/components/character/CastPlateStripButton'), {
  ssr: false,
  loading: () => null,
});

export type CharacterLookPlateSectionProps = {
  characterId: string;
  plate: FittingPlate | null;
  uploading: boolean;
  status: string | null;
  error: string | null;
  onClear: () => void;
  onUpload: (file: File) => void;
  /** Edit the plate down to a plain base layer (hidden when omitted). */
  onStripClothing?: (
    sendComfyUi: Parameters<typeof stripCastPlateClothing>[0]['sendComfyUi']
  ) => void;
  canUndoStrip?: boolean;
  onUndoStrip?: () => void;
  /** Every plate of the Cast (one per look) — picked from tiles when there are several. */
  plates?: CastPlateTile[];
  activePlateId?: string;
  onSelectPlate?: (lookId: string) => void;
  /** Upload another plate beside this one (it becomes the active plate). */
  onAddPlate?: (file: File) => void;
  /** Drop the active plate (only offered with several). */
  onRemovePlate?: () => void;
  onRenamePlate?: (name: string) => void;
};

/** Name of the active plate, saved on blur or Enter. */
function PlateNameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(name);
      return;
    }
    if (next !== name) {
      onRename(next);
    }
  };
  return (
    <input
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      maxLength={80}
      aria-label="Plate name"
      data-testid="cast-plate-name"
      className="ui-input w-full max-w-[16rem] px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
    />
  );
}

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
  onStripClothing,
  canUndoStrip = false,
  onUndoStrip,
  plates = [],
  activePlateId,
  onSelectPlate,
  onAddPlate,
  onRemovePlate,
  onRenamePlate,
}: CharacterLookPlateSectionProps) {
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const previewUrl = plate?.imageUrl?.trim()
    ? cacheBustIdentityMediaUrl(plate.imageUrl.trim())
    : '';
  const hasPlate = Boolean(previewUrl || plate?.filename?.trim());
  const severalPlates = plates.length > 1;
  const activePlate = plates.find(entry => entry.id === activePlateId);

  return (
    <ToolSection
      title={severalPlates ? 'Look plates' : 'Look plate'}
      description={
        severalPlates
          ? 'Tap a plate to use it in Outfit, Day and Story. Each plate keeps its own dressed plates.'
          : 'Identity still for Outfit, Day, and Story — checked for one clear, visible face.'
      }
      data-testid="cast-look-plate"
    >
      {severalPlates && onSelectPlate ? (
        <PortraitTileStrip
          label="Active plate"
          value={activePlateId ?? ''}
          onChange={onSelectPlate}
          disabled={uploading}
          testIdPrefix="cast-plate-tile"
          tiles={plates.map(entry => ({
            id: entry.id,
            label: entry.label,
            title: entry.hasPlate ? entry.label : `${entry.label} — no picture yet`,
            thumb: entry.thumb,
          }))}
        />
      ) : null}
      {severalPlates && activePlate && onRenamePlate ? (
        <PlateNameField
          key={`${activePlate.id}:${activePlate.label}`}
          name={activePlate.label}
          onRename={onRenamePlate}
        />
      ) : null}
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
              {onAddPlate ? (
                <UploadButton
                  label="Add plate"
                  disabled={uploading}
                  ariaLabel="Add another look plate"
                  testId="cast-plate-add"
                  onFile={onAddPlate}
                />
              ) : null}
              <ButtonLink
                href={galleryPickPath('cast', { characterId })}
                variant="secondary"
                size="sm"
                data-testid="cast-look-plate-gallery"
              >
                Choose from Gallery
              </ButtonLink>
              {onStripClothing ? (
                <CastPlateStripButton disabled={uploading} onStrip={onStripClothing} />
              ) : null}
              {canUndoStrip && onUndoStrip ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  data-testid="cast-look-plate-strip-undo"
                  onClick={onUndoStrip}
                >
                  Undo
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                data-testid="cast-look-plate-clear"
                onClick={severalPlates && onRemovePlate ? onRemovePlate : onClear}
              >
                {severalPlates && onRemovePlate ? 'Remove plate' : 'Remove'}
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
            {severalPlates && onRemovePlate ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                data-testid="cast-look-plate-clear"
                onClick={onRemovePlate}
              >
                Remove plate
              </Button>
            ) : null}
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
