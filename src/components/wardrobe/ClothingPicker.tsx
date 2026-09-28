'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { SegmentedControl, accentFocusClass } from '@/components/ui/ToolPageShell';
import UiIcon from '@/components/ui/UiIcon';
import ClothingTile, { CLOTHING_STRIP_CLASS } from '@/components/wardrobe/ClothingTile';
import WardrobeKitPicker, {
  type WardrobeKitPickerKit,
  type WardrobeKitThumbState,
} from '@/components/wardrobe/WardrobeKitPicker';
import WearingCard from '@/components/wardrobe/WearingCard';
import type { ToolAccent } from '@/lib/tool-theme';
import {
  findSavedFittingGarmentByFilename,
  loadSavedFittingGarments,
  subscribeSavedFittingGarments,
  type SavedFittingGarment,
} from '@/lib/fitting-saved-garments';

type ClothingMode = 'kit' | 'photo';

function useSavedFittingGarments(): SavedFittingGarment[] {
  const json = useSyncExternalStore(
    subscribeSavedFittingGarments,
    () => JSON.stringify(loadSavedFittingGarments()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as SavedFittingGarment[], [json]);
}

/** First sentence of the vision description — enough to tell photos apart on the card. */
function describeGarment(description: string | undefined): string {
  const text = description?.trim() ?? '';
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return first.length > 90 ? `${first.slice(0, 88).trimEnd()}…` : first;
}

export type ClothingPickerGarment = {
  uploading: boolean;
  scanStatus?: string | null;
  imageUrl?: string;
  imageFilename?: string;
  description?: string;
  onApply: (input: { file: File; asPackshot?: boolean }) => Promise<void>;
  onClear: () => void;
  onRescan: () => Promise<void>;
  onSave: () => void;
  onApplySaved: (garmentId: string) => void;
  onRemoveSaved: (garmentId: string) => void;
  onDescriptionChange?: (description: string) => void;
};

export type ClothingPickerProps = {
  accent?: ToolAccent;
  busy: boolean;
  /** Test-id prefix (`day`, `story`) — keeps the ids the old controls used. */
  testIdPrefix: string;
  garment: ClothingPickerGarment;
  kits: WardrobeKitPickerKit[];
  kitsReady: boolean;
  selectedKitId?: string;
  kitSize?: 'sm' | 'md';
  kitPickerTestId?: string;
  onSelectKit: (wardrobeId: string) => void;
  onSwipeKit?: (delta: -1 | 1) => void;
  /** Clear the kit so the planner picks one (the old list picker's "Default" row). */
  onClearKit?: () => void;
  resolveKitThumb?: (kit: WardrobeKitPickerKit) => WardrobeKitThumbState;
  /** Clothing-type filter shown in the kit toolbar. */
  category?: {
    value: string;
    options: ReadonlyArray<{ value: string; label: string }>;
    onChange: (value: string) => void;
  };
  onError: (message: string) => void;
};

function UploadTile({
  title,
  hint,
  ariaLabel,
  disabled,
  testId,
  onFile,
}: {
  title: string;
  hint: string;
  ariaLabel: string;
  disabled: boolean;
  testId?: string;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border-default)] px-3 py-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)] ${
        disabled ? 'pointer-events-none opacity-55' : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
        <UiIcon name="upload" size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="block type-caption text-[var(--text-muted)]">{hint}</span>
      </span>
      <input
        type="file"
        accept="image/*"
        aria-label={ariaLabel}
        data-testid={testId}
        disabled={disabled}
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            onFile(file);
          }
        }}
      />
    </label>
  );
}

/**
 * One Clothing tool for Day / Story: a catalog outfit kit or your own clothing photo, chosen with
 * a mode switch, shown on the same "now wearing" card and the same 3:4 tiles. The two were always
 * exclusive (a photo turns kits off) but used to render as two unrelated forms.
 */
export default function ClothingPicker({
  accent = 'teal',
  busy,
  testIdPrefix,
  garment,
  kits,
  kitsReady,
  selectedKitId,
  kitSize = 'md',
  kitPickerTestId,
  onSelectKit,
  onSwipeKit,
  onClearKit,
  resolveKitThumb,
  category,
  onError,
}: ClothingPickerProps) {
  const savedGarments = useSavedFittingGarments();
  const hasPhoto = Boolean(garment.imageUrl?.trim());
  // Follows the photo unless the player switched tabs themselves.
  const [pickedMode, setPickedMode] = useState<ClothingMode | null>(null);
  const mode: ClothingMode = pickedMode ?? (hasPhoto ? 'photo' : 'kit');
  const photoBusy = busy || garment.uploading;
  const alreadySaved = Boolean(findSavedFittingGarmentByFilename(garment.imageFilename)?.id);

  const applyFile = (file: File, asPackshot: boolean) => {
    void garment.onApply({ file, asPackshot }).catch(err => {
      onError(
        err instanceof Error
          ? err.message
          : asPackshot
            ? 'Could not upload that packshot.'
            : 'Could not upload that clothing photo.'
      );
    });
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-clothing-picker`}>
      <SegmentedControl<ClothingMode>
        aria-label="Clothing source"
        value={mode}
        onChange={setPickedMode}
        options={[
          { value: 'kit', label: 'Outfit kit' },
          { value: 'photo', label: 'My photo' },
        ]}
      />

      {mode === 'kit' ? (
        <div className="space-y-2.5">
          {hasPhoto ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2"
              data-testid={`${testIdPrefix}-byo-active`}
            >
              <p className="type-caption text-[var(--text-secondary)]">
                Your clothing photo is on, so kits are paused.
              </p>
              <Button size="sm" variant="secondary" disabled={photoBusy} onClick={garment.onClear}>
                Wear a kit instead
              </Button>
            </div>
          ) : null}
          {hasPhoto ? null : kits.length > 0 ? (
            <WardrobeKitPicker
              kits={kits}
              selectedId={selectedKitId}
              disabled={!kitsReady || busy || hasPhoto}
              size={kitSize}
              testId={kitPickerTestId}
              emptyLabel="No kit picked — the planner chooses one for this slot."
              onSelect={onSelectKit}
              onSwipe={onSwipeKit}
              resolveThumb={resolveKitThumb}
              cardAction={
                onClearKit && selectedKitId && !hasPhoto ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label="Clear kit — let the planner pick"
                    title="Clear kit — let the planner pick"
                    className="shrink-0 px-1.5"
                    onClick={onClearKit}
                  >
                    <UiIcon name="close" size={14} />
                  </Button>
                ) : null
              }
              toolbarExtra={
                category ? (
                  <SelectInput
                    aria-label="Clothing type"
                    value={category.value}
                    disabled={!kitsReady || busy}
                    className={`w-full sm:w-auto sm:max-w-[15rem] ${accentFocusClass(accent)}`}
                    onChange={event => category.onChange(event.target.value)}
                  >
                    {category.options.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                ) : null
              }
            />
          ) : (
            <p className="type-caption text-[var(--text-muted)]">Loading outfit kits…</p>
          )}
        </div>
      ) : (
        <div className="space-y-3" data-testid={`${testIdPrefix}-custom-garment`}>
          {hasPhoto ? (
            <div className="space-y-1.5">
              <WearingCard
                thumbUrl={garment.imageUrl}
                title="Your clothing photo"
                meta={describeGarment(garment.description) || 'Used as Image 2 for every still'}
                end={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={photoBusy}
                    aria-label="Remove clothing photo"
                    title="Remove photo"
                    className="shrink-0 px-1.5"
                    onClick={garment.onClear}
                  >
                    <UiIcon name="close" size={14} />
                  </Button>
                }
              />
              <div className="flex flex-wrap items-center gap-1 px-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={photoBusy || alreadySaved}
                  data-testid={`${testIdPrefix}-save-garment`}
                  onClick={() => {
                    try {
                      garment.onSave();
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
                  size="sm"
                  variant="ghost"
                  disabled={photoBusy}
                  title="Read the photo again"
                  onClick={() => {
                    void garment.onRescan().catch(err => {
                      onError(err instanceof Error ? err.message : 'Vision scan failed.');
                    });
                  }}
                >
                  Rescan
                </Button>
                {garment.uploading || garment.scanStatus ? (
                  <span
                    className="type-caption text-[var(--text-muted)]"
                    data-testid={`${testIdPrefix}-garment-scan-status`}
                  >
                    {garment.scanStatus || 'Working on clothing photo…'}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <WearingCard emptyLabel="No photo yet — upload one, or reuse a saved one below." />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <UploadTile
              title={hasPhoto ? 'Replace with a worn photo' : 'Worn photo'}
              hint="Someone wearing it — we cut the clothes out."
              ariaLabel="Upload clothing photo to extract a packshot"
              disabled={photoBusy}
              onFile={file => applyFile(file, false)}
            />
            <UploadTile
              title={hasPhoto ? 'Replace with a packshot' : 'Packshot'}
              hint="Just the clothes on a plain background."
              ariaLabel="Upload a ready clothing packshot"
              testId={`${testIdPrefix}-upload-ready-packshot`}
              disabled={photoBusy}
              onFile={file => applyFile(file, true)}
            />
          </div>

          {!hasPhoto && (garment.uploading || garment.scanStatus) ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid={`${testIdPrefix}-garment-scan-status`}
            >
              {garment.scanStatus || 'Working on clothing photo…'}
            </p>
          ) : null}

          {savedGarments.length > 0 ? (
            <div className="space-y-1" data-testid={`${testIdPrefix}-saved-garments`}>
              <p className="type-caption text-[var(--text-muted)]">
                Saved photos · {savedGarments.length}
              </p>
              <div className={CLOTHING_STRIP_CLASS}>
                {savedGarments.map(entry => {
                  const active =
                    garment.imageFilename?.trim() === entry.imageFilename ||
                    garment.imageUrl?.trim() === entry.imageUrl;
                  return (
                    <ClothingTile
                      key={entry.id}
                      label={entry.label}
                      thumbUrl={entry.imageUrl}
                      selected={active}
                      disabled={photoBusy}
                      size={kitSize}
                      fit="contain"
                      onSelect={() => {
                        try {
                          garment.onApplySaved(entry.id);
                        } catch (err) {
                          onError(
                            err instanceof Error
                              ? err.message
                              : 'Could not use that saved clothing photo.'
                          );
                        }
                      }}
                      onRemove={() => garment.onRemoveSaved(entry.id)}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {hasPhoto && garment.onDescriptionChange ? (
            <label className="block space-y-1.5">
              <FieldLabel>What the model is told</FieldLabel>
              <TextArea
                data-testid={`${testIdPrefix}-garment-description`}
                rows={2}
                value={garment.description ?? ''}
                disabled={photoBusy}
                className={accentFocusClass(accent)}
                placeholder="Vision fills this from your photo — edit if needed"
                onChange={event => garment.onDescriptionChange?.(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}
