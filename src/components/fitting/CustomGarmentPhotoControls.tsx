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
      <p className="type-caption text-[var(--text-muted)]">
        Worn still → extract a clothing-only packshot, or upload a ready packshot and skip the edit
        pass{hasCustomGarment ? ' · catalog kit cleared' : ''}.
      </p>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption shrink-0 text-[var(--text-muted)]">Extract from photo</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload clothing photo to extract a packshot"
            disabled={busy || garmentUploading}
            className="ui-file-input block min-w-0 flex-1"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void onApplyCustomGarment({ file }).catch(err => {
                onError(
                  err instanceof Error ? err.message : 'Could not upload that clothing photo.'
                );
              });
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption shrink-0 text-[var(--text-muted)]">Ready packshot</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload a ready clothing packshot"
            data-testid={`${testIdPrefix}-upload-ready-packshot`}
            disabled={busy || garmentUploading}
            className="ui-file-input block min-w-0 flex-1"
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
        </div>
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
