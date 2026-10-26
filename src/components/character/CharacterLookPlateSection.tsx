'use client';

import { getCharacter } from '@/lib/character/os';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import UploadButton from '@/components/ui/UploadButton';
import { usePlateCheck } from '@/hooks/usePlateCheck';
import type { FittingPlate } from '@/lib/fitting/room';
import { galleryPickPath } from '@/lib/gallery/handoff';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery/media-client';
import type { CastPlatePrepareOptions, prepareCastPlate } from '@/lib/cast/plate-prepare';
import { castLookPortraitTile, type CastPlateTile } from '@/lib/character/plate-thumb';
import type { CharacterLookPlateRecord } from '@/lib/character/os';
import type { DayPartnerNoun } from '@/lib/day/partner';
import { plateStanceNote, type PlateStance } from '@/lib/plate/stance';

const CastPlatePrepareControl = dynamic(
  () => import('@/components/character/CastPlatePrepareControl'),
  { ssr: false, loading: () => null }
);
const CastLookGenerateControl = dynamic(
  () => import('@/components/character/CastLookGenerateControl'),
  { ssr: false, loading: () => null }
);

export type CharacterLookPlateSectionProps = {
  characterId: string;
  plate: FittingPlate | null;
  uploading: boolean;
  status: string | null;
  error: string | null;
  onClear: () => void;
  onUpload: (file: File) => void;
  /** One edit to standing / base layer / white, per the ticked options (hidden when omitted). */
  onPreparePlate?: (
    sendComfyUi: Parameters<typeof prepareCastPlate>[0]['sendComfyUi'],
    options: CastPlatePrepareOptions
  ) => void;
  canUndoPrepare?: boolean;
  onUndoPrepare?: () => void;
  /** The active plate's stance (null until read, or when it can't be). */
  stance?: PlateStance | null;
  /** Who the plate shows — her / him in the wording. */
  noun?: DayPartnerNoun;
  /** The prepared plate's face scored under the bar against the previous one. */
  faceDrift?: boolean;
  /** The Cast has marks: Prepare offers painting them on. */
  hasMarks?: boolean;
  /** Every look of the Cast, one picture tile each (a look with no plate shows Add plate). */
  plates?: CastPlateTile[];
  activePlateId?: string;
  onSelectPlate?: (lookId: string) => void;
  /** Make a new look from the active one (its plate and outfit lock), made active. */
  onNewLook?: () => void;
  /** Drop the active look and its plate (only offered with several looks; asks first). */
  onRemovePlate?: () => void;
  onRenamePlate?: (name: string) => void;
  /** The active look's earlier plates, newest first. */
  plateHistory?: CharacterLookPlateRecord[];
  onRestorePlate?: (replacedAt: number) => void;
  /** Earlier plates → "Don't offer again" / "Offer again" (M2 C6). */
  onDeprecatePlate?: (replacedAt: number, deprecated: boolean) => void;
  /** The likeness guard read the active plate as someone else (look-plate-guard.ts). */
  plateDrift?: { face: number; against: string; noFace?: boolean } | null;
};

function EarlierPlates({
  history,
  disabled,
  onRestore,
  onDeprecate,
}: {
  history: CharacterLookPlateRecord[];
  disabled: boolean;
  onRestore: (replacedAt: number) => void;
  /** "Don't offer again" / "Offer again" (M2 C6). */
  onDeprecate?: (replacedAt: number, deprecated: boolean) => void;
}) {
  return (
    <details className="mt-3" data-testid="cast-look-plate-history">
      <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
        Earlier plates ({history.length})
      </summary>
      <div className="mt-2 flex flex-wrap gap-3">
        {history.map(entry => {
          const url =
            entry.reference?.isolatedUrl?.trim() ||
            entry.reference?.originalUrl?.trim() ||
            entry.ipAdapter?.imageUrl?.trim() ||
            '';
          const when = new Date(entry.replacedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
          return (
            <div
              key={entry.replacedAt}
              className={`flex w-24 flex-col items-center gap-1 ${entry.deprecated ? 'opacity-50' : ''}`}
              data-testid="cast-look-plate-earlier"
              data-deprecated={entry.deprecated ? 'true' : 'false'}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cacheBustIdentityMediaUrl(url)}
                  alt={`Plate replaced ${when}`}
                  className="h-32 w-24 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] object-contain"
                />
              ) : (
                <div className="h-32 w-24 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)]" />
              )}
              <span className="type-caption text-center text-[var(--text-muted)]">
                {entry.deprecated ? 'Not offered' : when}
              </span>
              {entry.deprecated ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  data-testid="cast-look-plate-restore"
                  onClick={() => onRestore(entry.replacedAt)}
                >
                  Restore
                </Button>
              )}
              {onDeprecate ? (
                <Button
                  variant="quiet"
                  size="sm"
                  className="text-2xs hover:underline"
                  disabled={disabled}
                  data-testid="cast-look-plate-deprecate"
                  title={
                    entry.deprecated
                      ? 'Offer this plate again'
                      : "This plate is wrong: don't offer it as a plate again"
                  }
                  onClick={() => onDeprecate(entry.replacedAt, !entry.deprecated)}
                >
                  {entry.deprecated ? 'Offer again' : "Don't offer again"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Name of the active look, saved on blur or Enter. */
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
      aria-label="Look name"
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
        // The face size is a detail for when a plate fails, not for a good one.
        title={check.facePx ? `One person, face about ${check.facePx}px wide` : undefined}
      >
        Plate check: good.
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
  onPreparePlate,
  canUndoPrepare = false,
  onUndoPrepare,
  stance = null,
  noun = 'person',
  faceDrift = false,
  hasMarks = false,
  plates = [],
  activePlateId,
  onSelectPlate,
  onNewLook,
  onRemovePlate,
  onRenamePlate,
  plateHistory = [],
  onRestorePlate,
  onDeprecatePlate,
  plateDrift = null,
}: CharacterLookPlateSectionProps) {
  // The likeness guard offers the newest earlier plate not marked "don't offer again" (M2 C6).
  const offered = plateHistory.filter(entry => !entry.deprecated);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  // Day / Outfit's "Prepare plate →" lands on #looks; the section mounts after the Cast store
  // hydrates, so the browser's own jump to the hash has already missed it.
  useEffect(() => {
    if (window.location.hash === '#looks') {
      document.getElementById('looks')?.scrollIntoView({ block: 'start' });
    }
  }, []);
  const previewUrl = plate?.imageUrl?.trim()
    ? cacheBustIdentityMediaUrl(plate.imageUrl.trim())
    : '';
  const hasPlate = Boolean(previewUrl || plate?.filename?.trim());
  const severalLooks = plates.length > 1;
  const activePlate = plates.find(entry => entry.id === activePlateId) ?? plates[0];
  const removeLook = severalLooks && onRemovePlate ? onRemovePlate : undefined;
  const pronoun = noun === 'man' ? 'him' : noun === 'woman' ? 'her' : 'them';
  const stanceNote = plateStanceNote(stance);
  const prepareHint = onPreparePlate
    ? stanceNote
      ? `${stanceNote} Prepare plate stands ${pronoun} up.`
      : plate?.isolated === false && stance?.standing
        ? `Not on white — Prepare plate puts ${pronoun} on plain white.`
        : null
    : stanceNote;

  return (
    <ToolSection
      title="Looks"
      id="looks"
      description="Each look is a plate (and its outfit lock). Tap one to use it in Outfit, Day and Story — each keeps its own dressed plates."
      data-testid="cast-look-plate"
    >
      {plates.length > 0 && onSelectPlate ? (
        // Stacked on a phone: side by side, New look covered the third tile at 390 px.
        <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row">
          <PortraitTileStrip
            label="Active look"
            value={activePlate?.id ?? ''}
            onChange={onSelectPlate}
            disabled={uploading}
            testIdPrefix="cast-plate-tile"
            className="w-full sm:w-auto sm:flex-1"
            tiles={plates.map(tile => castLookPortraitTile(tile))}
          />
          {onNewLook ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={uploading}
              data-testid="cast-look-new"
              title="A copy of this look — its plate and outfit lock — to change from there"
              onClick={onNewLook}
            >
              New look
            </Button>
          ) : null}
        </div>
      ) : null}
      {activePlate && onRenamePlate ? (
        <PlateNameField
          key={`${activePlate.id}:${activePlate.label}`}
          name={activePlate.label}
          onRename={onRenamePlate}
        />
      ) : null}
      {activePlate?.outfit ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cast-look-outfit">
          Outfit lock: {activePlate.outfit}
        </p>
      ) : null}
      {status ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cast-look-plate-status">
          {status}
        </p>
      ) : null}
      {generateStatus ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="cast-look-generate-status"
          role="status"
        >
          {generateStatus}
        </p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {hasPlate ? (
        <div className="flex flex-wrap items-start gap-4">
          {previewUrl ? (
            <Button
              variant="plain"
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
            </Button>
          ) : null}
          <div className="min-w-[12rem] flex-1 space-y-3">
            <PlateCheckLine plate={plate} />
            {prepareHint ? (
              <p
                className="type-caption text-[var(--tint-warning-text)]"
                data-testid="cast-look-plate-stance"
                data-reason={stance?.reason}
              >
                {prepareHint}
              </p>
            ) : null}
            {faceDrift ? (
              <p
                className="type-caption text-[var(--tint-warning-text)]"
                data-testid="cast-look-plate-face-drift"
                role="status"
              >
                The face may have drifted — Undo to keep the original.
              </p>
            ) : null}
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
              {canUndoPrepare && onUndoPrepare ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  data-testid="cast-look-plate-prepare-undo"
                  onClick={onUndoPrepare}
                >
                  Undo
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                data-testid="cast-look-plate-clear"
                // The last look can't go — Remove takes its plate off instead (asks first).
                onClick={removeLook ?? onClear}
              >
                {removeLook ? 'Remove look' : 'Remove plate'}
              </Button>
            </div>
            <CastLookGenerateControl
              key={activePlate?.id ?? 'look'}
              characterId={characterId}
              lookId={activePlate?.id}
              lookName={activePlate?.label}
              hasPlate
              disabled={uploading}
              onStatus={setGenerateStatus}
            />
            {onPreparePlate ? (
              <CastPlatePrepareControl
                key={hasMarks ? 'marks' : 'plain'}
                disabled={uploading}
                noun={noun}
                hasMarks={hasMarks}
                cleanShaven={getCharacter(characterId)?.traits?.facialHair === 'clean-shaven'}
                onPrepare={onPreparePlate}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center"
          data-testid="cast-look-plate-empty"
        >
          <p className="text-sm text-[var(--text-muted)]">
            {severalLooks && activePlate
              ? `“${activePlate.label}” has no plate yet — add one for this look.`
              : 'No look plate yet — Outfit, Day and Story need one.'}{' '}
            Generate one from the Cast&apos;s description and face, or use a clear photo of this
            character — one person, face visible.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <CastLookGenerateControl
              key={activePlate?.id ?? 'look'}
              characterId={characterId}
              lookId={activePlate?.id}
              lookName={activePlate?.label}
              hasPlate={false}
              disabled={uploading}
              onStatus={setGenerateStatus}
            />
            <UploadButton
              label="Add plate"
              variant="secondary"
              disabled={uploading}
              ariaLabel={
                activePlate ? `Add a plate to the look ${activePlate.label}` : 'Add a look plate'
              }
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
            {removeLook ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                data-testid="cast-look-plate-clear"
                onClick={removeLook}
              >
                Remove look
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {plateDrift ? (
        <p
          className="ui-alert-warning type-caption mt-2"
          role="status"
          data-testid="cast-look-plate-drift"
        >
          {plateDrift.noFace
            ? 'This plate shows no face — likely from behind.'
            : `This plate doesn't look like the Cast — ${Math.round(plateDrift.face * 100)}% match with ${plateDrift.against}.`}{' '}
          Every still of this look starts from it.{' '}
          {offered.length > 0 && onRestorePlate ? (
            <button
              type="button"
              className="ui-text-link"
              disabled={uploading}
              data-testid="cast-look-plate-drift-restore"
              onClick={() => onRestorePlate(offered[0]!.replacedAt)}
            >
              Put back the earlier plate
            </button>
          ) : (
            'Generate a new plate, or upload one.'
          )}
        </p>
      ) : null}
      {plateHistory.length > 0 && onRestorePlate ? (
        <EarlierPlates
          history={plateHistory}
          disabled={uploading}
          onRestore={onRestorePlate}
          onDeprecate={onDeprecatePlate}
        />
      ) : null}
      {plate?.isolated === true ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">Background cut out.</p>
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
