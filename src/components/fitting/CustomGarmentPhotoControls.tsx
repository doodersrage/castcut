'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import {
  findSavedFittingGarmentByFilename,
  loadSavedFittingGarments,
  subscribeSavedFittingGarments,
  type SavedFittingGarment,
} from '@/lib/fitting-saved-garments';

function useSavedFittingGarments(): SavedFittingGarment[] {
  const json = useSyncExternalStore(
    subscribeSavedFittingGarments,
    () => JSON.stringify(loadSavedFittingGarments()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as SavedFittingGarment[], [json]);
}

/**
 * The two ways in for a clothing photo, as labelled buttons (not bare file inputs): a worn photo
 * goes through the extract pass, a packshot is used as is.
 */
export function GarmentUploadButtons({
  busy,
  testIdPrefix = 'fitting',
  onApplyCustomGarment,
  onError,
}: {
  busy: boolean;
  testIdPrefix?: string;
  onApplyCustomGarment: (input: { file: File; asPackshot?: boolean }) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label
        className={`ui-btn-secondary flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left focus-within:ring-2 focus-within:ring-[var(--accent-ring)] ${
          busy ? 'pointer-events-none opacity-55' : ''
        }`}
      >
        <span className="text-sm font-medium">Upload worn photo</span>
        <span className="type-caption font-normal text-[var(--text-muted)]">
          Someone wearing it — we cut the clothes out first.
        </span>
        <input
          type="file"
          accept="image/*"
          aria-label="Upload clothing photo to extract a packshot"
          disabled={busy}
          className="sr-only"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            void onApplyCustomGarment({ file }).catch(err => {
              onError(err instanceof Error ? err.message : 'Could not upload that clothing photo.');
            });
          }}
        />
      </label>
      <label
        className={`ui-btn-secondary flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left focus-within:ring-2 focus-within:ring-[var(--accent-ring)] ${
          busy ? 'pointer-events-none opacity-55' : ''
        }`}
      >
        <span className="text-sm font-medium">Upload packshot</span>
        <span className="type-caption font-normal text-[var(--text-muted)]">
          Just the clothes on a plain background — used as is.
        </span>
        <input
          type="file"
          accept="image/*"
          aria-label="Upload a ready clothing packshot"
          data-testid={`${testIdPrefix}-upload-ready-packshot`}
          disabled={busy}
          className="sr-only"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            void onApplyCustomGarment({ file, asPackshot: true }).catch(err => {
              onError(err instanceof Error ? err.message : 'Could not upload that packshot.');
            });
          }}
        />
      </label>
    </div>
  );
}

export type CustomGarmentPhotoControlsProps = {
  accent?: ToolAccent;
  busy: boolean;
  garmentUploading: boolean;
  garmentScanStatus?: string | null;
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  customGarmentDescription?: string;
  showDescriptionEditor?: boolean;
  testIdPrefix?: string;
  onApplyCustomGarment: (input: { file: File; asPackshot?: boolean }) => Promise<void>;
  onClearCustomGarment: () => void;
  onRescanCustomGarment: () => Promise<void>;
  onSaveCustomGarment: () => void;
  onApplySavedCustomGarment: (garmentId: string) => void;
  onRemoveSavedCustomGarment: (garmentId: string) => void;
  onCustomGarmentDescriptionChange?: (description: string) => void;
  onError: (message: string) => void;
};

/** Shared Outfit/Day BYO clothing photo: extract, ready packshot, save, reuse strip. */
export default function CustomGarmentPhotoControls({
  accent = 'rose',
  busy,
  garmentUploading,
  garmentScanStatus,
  customGarmentImageUrl,
  customGarmentImageFilename,
  customGarmentDescription,
  showDescriptionEditor = true,
  testIdPrefix = 'fitting',
  onApplyCustomGarment,
  onClearCustomGarment,
  onRescanCustomGarment,
  onSaveCustomGarment,
  onApplySavedCustomGarment,
  onRemoveSavedCustomGarment,
  onCustomGarmentDescriptionChange,
  onError,
}: CustomGarmentPhotoControlsProps) {
  const savedGarments = useSavedFittingGarments();
  const hasCustomGarment = Boolean(customGarmentImageUrl?.trim());
  const alreadySaved = Boolean(findSavedFittingGarmentByFilename(customGarmentImageFilename)?.id);

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-custom-garment`}>
      <FieldLabel>Your clothing photo</FieldLabel>
      <GarmentUploadButtons
        busy={busy || garmentUploading}
        testIdPrefix={testIdPrefix}
        onApplyCustomGarment={onApplyCustomGarment}
        onError={onError}
      />
      {hasCustomGarment ? (
        <p className="type-caption text-[var(--text-muted)]">
          Catalog kit cleared while this is set.
        </p>
      ) : null}
      <div className="space-y-2">
        {hasCustomGarment ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || garmentUploading || alreadySaved}
              data-testid={`${testIdPrefix}-save-garment`}
              onClick={() => {
                try {
                  onSaveCustomGarment();
                } catch (err) {
                  onError(
                    err instanceof Error ? err.message : 'Could not save that clothing photo.'
                  );
                }
              }}
            >
              {alreadySaved ? 'Saved' : 'Save for later'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || garmentUploading}
              onClick={() => {
                void onRescanCustomGarment().catch(err => {
                  onError(err instanceof Error ? err.message : 'Vision scan failed.');
                });
              }}
            >
              Rescan
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || garmentUploading}
              onClick={onClearCustomGarment}
            >
              Clear photo
            </Button>
          </div>
        ) : null}
      </div>
      {garmentUploading || garmentScanStatus ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid={`${testIdPrefix}-garment-scan-status`}
        >
          {garmentScanStatus || 'Working on clothing photo…'}
        </p>
      ) : null}
      {hasCustomGarment && customGarmentImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customGarmentImageUrl}
          alt="Custom clothing reference"
          className="max-h-40 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
        />
      ) : null}
      {hasCustomGarment && showDescriptionEditor && onCustomGarmentDescriptionChange ? (
        <label className="mt-2 block space-y-2">
          <FieldLabel>Garment description</FieldLabel>
          <TextArea
            data-testid={`${testIdPrefix}-garment-description`}
            rows={3}
            value={customGarmentDescription ?? ''}
            disabled={busy || garmentUploading}
            className={accentFocusClass(accent)}
            placeholder="Vision fills this from your photo — edit if needed"
            onChange={event => onCustomGarmentDescriptionChange(event.target.value)}
          />
        </label>
      ) : null}
      {savedGarments.length > 0 ? (
        <div className="space-y-2" data-testid={`${testIdPrefix}-saved-garments`}>
          <FieldLabel>Saved clothing</FieldLabel>
          <p className="type-caption text-[var(--text-muted)]">
            Reuse a packshot you saved earlier ({savedGarments.length} stored here).
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {savedGarments.map(entry => {
              const active =
                customGarmentImageFilename?.trim() === entry.imageFilename ||
                customGarmentImageUrl?.trim() === entry.imageUrl;
              return (
                <div
                  key={entry.id}
                  className={`relative shrink-0 rounded-[var(--radius-md)] border ${
                    active ? 'border-[var(--accent-rose)]' : 'border-[var(--border-subtle)]'
                  } bg-[var(--bg-muted)]/40`}
                >
                  <button
                    type="button"
                    disabled={busy || garmentUploading}
                    className="block w-24 space-y-1 p-1.5 text-left"
                    title={entry.description || entry.label}
                    onClick={() => {
                      try {
                        onApplySavedCustomGarment(entry.id);
                      } catch (err) {
                        onError(
                          err instanceof Error
                            ? err.message
                            : 'Could not use that saved clothing photo.'
                        );
                      }
                    }}
                  >
                    {entry.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.imageUrl}
                        alt=""
                        className="h-20 w-full rounded-[var(--radius-sm)] object-contain"
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center type-caption text-[var(--text-muted)]">
                        Packshot
                      </div>
                    )}
                    <span className="line-clamp-2 type-caption text-[var(--text-secondary)]">
                      {entry.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.label}`}
                    disabled={busy || garmentUploading}
                    className="absolute right-1 top-1 rounded-full bg-[var(--bg-elevated)]/90 px-1.5 type-caption text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={() => onRemoveSavedCustomGarment(entry.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
