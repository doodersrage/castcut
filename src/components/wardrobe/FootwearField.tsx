'use client';

import WardrobePackButtons from '@/components/wardrobe/WardrobePackButtons';
import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
import { SegmentedControl, accentFocusClass } from '@/components/ui/ToolPageShell';
import UiIcon from '@/components/ui/UiIcon';
import ClothingTile, { CLOTHING_STRIP_CLASS } from '@/components/wardrobe/ClothingTile';
import UploadTile from '@/components/wardrobe/UploadTile';
import WardrobeKitBrowser from '@/components/wardrobe/WardrobeKitBrowser';
import WearingCard from '@/components/wardrobe/WearingCard';
import type { ApplyFootwearPhoto, FootwearPatch } from '@/hooks/useFootwearPhoto';
import { FOOTWEAR_MAX_LENGTH, footwearIsBarefoot, normalizeFootwear } from '@/lib/footwear';
import {
  FOOTWEAR_KITS,
  footwearKitForWords,
  footwearKitImageUrl,
  type FootwearKitGroup,
} from '@/lib/footwear-kits';
import {
  findSavedFootwearByFilename,
  loadSavedFootwear,
  removeSavedFootwear,
  saveFootwear,
  subscribeSavedFootwear,
  updateSavedFootwearWords,
  type SavedFootwear,
} from '@/lib/footwear-saved';
import type { ToolAccent } from '@/lib/tool-theme';

type FootwearMode = 'kit' | 'photo' | 'words';

/** What a tool hands the footwear picker (ClothingPicker's `footwear` prop). */
export type FootwearFieldValue = {
  /** The shoes in words ('' = auto). */
  value?: string;
  imageUrl?: string;
  imageFilename?: string;
  onChange: (patch: FootwearPatch) => void;
  /** Your own shoe photo (worn photo → cut out, or a ready packshot). Hidden when absent. */
  onApplyPhoto?: ApplyFootwearPhoto;
};

const GROUPS: ReadonlyArray<FootwearKitGroup | 'All'> = [
  'All',
  'Sneakers',
  'Heels',
  'Boots',
  'Flats',
  'Sandals',
  'At home',
];

function useSavedFootwear(): SavedFootwear[] {
  const json = useSyncExternalStore(
    subscribeSavedFootwear,
    () => JSON.stringify(loadSavedFootwear()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as SavedFootwear[], [json]);
}

const NO_IMAGE: FootwearPatch = { footwearImageUrl: undefined, footwearImageFilename: undefined };

/**
 * Footwear beside the clothing, picked the way clothing is: a catalog kit, your own photo, or
 * your own words. A kit or photo is shown to the model with the clothing in Image 2 and named in
 * the prompt; words alone are named in the prompt.
 */
export default function FootwearField({
  value,
  imageUrl,
  imageFilename,
  onChange,
  onApplyPhoto,
  disabled,
  accent = 'teal',
  tileSize = 'md',
  testIdPrefix,
  onError,
}: FootwearFieldValue & {
  disabled?: boolean;
  accent?: ToolAccent;
  tileSize?: 'sm' | 'md';
  testIdPrefix: string;
  onError?: (message: string) => void;
}) {
  const fieldId = useId();
  const stored = normalizeFootwear(value);
  const kit = footwearKitForWords(stored);
  const barefoot = footwearIsBarefoot(stored);
  // Your own photo is uploaded to ComfyUI (it has a filename); a kit's image is a shipped file.
  const ownPhoto = Boolean(imageFilename?.trim());
  const [pickedMode, setPickedMode] = useState<FootwearMode | null>(null);
  const [group, setGroup] = useState<FootwearKitGroup | 'All'>('All');
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const mode: FootwearMode =
    pickedMode ?? (ownPhoto ? 'photo' : stored && !kit && !barefoot ? 'words' : 'kit');
  const busy = Boolean(disabled) || photoBusy;
  const savedShoes = useSavedFootwear();
  const [browse, setBrowse] = useState<'kits' | 'saved' | null>(null);
  const alreadySaved = savedShoes.some(entry => entry.imageFilename === imageFilename?.trim());
  const kits = useMemo(
    () => (group === 'All' ? FOOTWEAR_KITS : FOOTWEAR_KITS.filter(entry => entry.group === group)),
    [group]
  );

  const applyPhoto = (file: File, asPackshot: boolean) => {
    if (!onApplyPhoto) return;
    setPhotoBusy(true);
    void onApplyPhoto({ file, asPackshot }, setPhotoStatus)
      .catch(err => {
        onError?.(err instanceof Error ? err.message : 'Could not use that shoe photo.');
      })
      .finally(() => {
        setPhotoBusy(false);
        setPhotoStatus(null);
      });
  };

  // No claim about pictures here: only some engines are sent the shoe picture (footwear-image.ts).
  const summary = barefoot
    ? 'Barefoot on every clothed still.'
    : stored
      ? `Worn on every clothed still: ${stored}.`
      : ownPhoto
        ? 'Your shoe photo has no description yet — add one under “What the model is told”.'
        : 'Auto — the shoes are left to the outfit and the scene.';

  return (
    <div
      className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3"
      data-testid={`${testIdPrefix}-footwear`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={mode === 'words' ? fieldId : undefined}>Footwear</FieldLabel>
        <SegmentedControl<FootwearMode>
          aria-label="Footwear source"
          value={mode}
          onChange={setPickedMode}
          options={[
            { value: 'kit', label: 'Kits' },
            ...(onApplyPhoto ? [{ value: 'photo' as const, label: 'My shoes' }] : []),
            { value: 'words', label: 'In words' },
          ]}
        />
      </div>

      {mode === 'kit' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipButton
              active={!stored && !ownPhoto}
              disabled={busy}
              data-testid={`${testIdPrefix}-footwear-auto`}
              title="Leave the shoes to the outfit and the scene"
              onClick={() => onChange({ footwear: '', ...NO_IMAGE })}
            >
              Auto
            </ChipButton>
            <ChipButton
              active={barefoot}
              disabled={busy}
              data-testid={`${testIdPrefix}-footwear-barefoot`}
              onClick={() => onChange({ footwear: 'barefoot', ...NO_IMAGE })}
            >
              Barefoot
            </ChipButton>
            {/* The type filter and Browse wrap together: alone, Browse fell to a line of its own
                under the chips (UI audit 2026-10-11). */}
            <div className="ml-auto flex items-center gap-2">
              <SelectInput
                aria-label="Footwear type"
                value={group}
                disabled={busy}
                className={`w-auto! py-1 text-sm ${accentFocusClass(accent)}`}
                onChange={event => setGroup(event.target.value as FootwearKitGroup | 'All')}
              >
                {GROUPS.map(option => (
                  <option key={option} value={option}>
                    {option === 'All' ? `All footwear (${FOOTWEAR_KITS.length})` : option}
                  </option>
                ))}
              </SelectInput>
              {/* The strip shows a handful at a time; Browse shows them all, searchable — as the
                  clothing kits have. */}
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid={`${testIdPrefix}-footwear-browse`}
                onClick={() => setBrowse('kits')}
              >
                Browse
              </Button>
            </div>
          </div>
          <WardrobeKitBrowser
            open={browse === 'kits'}
            kits={kits.map(entry => ({
              id: entry.id,
              label: entry.label,
              group: `${entry.group} ${entry.words}`,
            }))}
            selectedId={!ownPhoto ? kit?.id : undefined}
            disabled={busy}
            title="Browse footwear"
            description={`${kits.length} pair${kits.length === 1 ? '' : 's'}${
              group === 'All' ? '' : ` in ${group}`
            } — search, then tap one to wear it.`}
            searchPlaceholder="Search — heels, boots, white, strappy…"
            thumbFit="contain"
            resolveThumb={entry => ({ url: footwearKitImageUrl(entry.id) })}
            onSelect={id => {
              const picked = FOOTWEAR_KITS.find(entry => entry.id === id);
              if (!picked) return;
              onChange({
                footwear: picked.words,
                footwearImageUrl: footwearKitImageUrl(picked.id),
                footwearImageFilename: undefined,
              });
            }}
            onClose={() => setBrowse(null)}
          />
          <div className={CLOTHING_STRIP_CLASS} data-testid={`${testIdPrefix}-footwear-kits`}>
            {kits.map(entry => (
              <ClothingTile
                key={entry.id}
                label={entry.label}
                thumbUrl={footwearKitImageUrl(entry.id)}
                selected={kit?.id === entry.id && !ownPhoto}
                disabled={busy}
                size={tileSize}
                fit="contain"
                testId={`${testIdPrefix}-footwear-kit-${entry.id}`}
                onSelect={() =>
                  onChange({
                    footwear: entry.words,
                    footwearImageUrl: footwearKitImageUrl(entry.id),
                    footwearImageFilename: undefined,
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'photo' && onApplyPhoto ? (
        <div className="space-y-2" data-testid={`${testIdPrefix}-footwear-own`}>
          {ownPhoto ? (
            <WearingCard
              thumbUrl={imageUrl}
              title="Your shoe photo"
              meta={stored || 'Shown to the model with the clothing'}
              end={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label="Remove shoe photo"
                  title="Remove photo"
                  className="shrink-0 px-1.5"
                  onClick={() => onChange({ footwear: '', ...NO_IMAGE })}
                >
                  <UiIcon name="close" size={14} />
                </Button>
              }
            />
          ) : (
            <WearingCard
              emptyLabel={
                savedShoes.length > 0
                  ? 'No shoe photo yet — upload one, or reuse a saved one below.'
                  : 'No shoe photo yet — upload one below.'
              }
            />
          )}
          {ownPhoto ? (
            <div className="flex flex-wrap items-center gap-1 px-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || alreadySaved}
                data-testid={`${testIdPrefix}-footwear-save`}
                onClick={() => {
                  try {
                    saveFootwear({ imageFilename: imageFilename ?? '', imageUrl, words: stored });
                  } catch (err) {
                    onError?.(
                      err instanceof Error ? err.message : 'Could not save that shoe photo.'
                    );
                  }
                }}
              >
                {alreadySaved ? 'Saved' : 'Save for later'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                title="Read the shoe photo again"
                data-testid={`${testIdPrefix}-footwear-rescan`}
                onClick={() => {
                  setPhotoBusy(true);
                  setPhotoStatus('Reading the shoe photo again…');
                  void onApplyPhoto({ rescan: true }, setPhotoStatus)
                    .catch(err => {
                      onError?.(err instanceof Error ? err.message : 'Vision scan failed.');
                    })
                    .finally(() => {
                      setPhotoBusy(false);
                      setPhotoStatus(null);
                    });
                }}
              >
                Rescan
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <UploadTile
              title={ownPhoto ? 'Replace with a worn photo' : 'Worn photo'}
              hint="Someone wearing them — we cut the shoes out."
              ariaLabel="Upload a photo of shoes being worn"
              testId={`${testIdPrefix}-footwear-upload-worn`}
              disabled={busy}
              onFile={file => applyPhoto(file, false)}
            />
            <UploadTile
              title={ownPhoto ? 'Replace with a packshot' : 'Packshot'}
              hint="Just the shoes on a plain background."
              ariaLabel="Upload a ready shoe packshot"
              testId={`${testIdPrefix}-footwear-upload-packshot`}
              disabled={busy}
              onFile={file => applyPhoto(file, true)}
            />
          </div>
          {savedShoes.length > 0 ? (
            <div className="space-y-1" data-testid={`${testIdPrefix}-footwear-saved`}>
              <div className="flex items-center justify-between gap-2">
                <p className="type-caption text-[var(--text-muted)]">
                  Saved shoes · {savedShoes.length}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  data-testid={`${testIdPrefix}-footwear-browse-saved`}
                  onClick={() => setBrowse('saved')}
                >
                  Browse
                </Button>
              </div>
              <WardrobeKitBrowser
                open={browse === 'saved'}
                kits={savedShoes.map(entry => ({
                  id: entry.id,
                  label: entry.label,
                  group: entry.words,
                }))}
                selectedId={
                  savedShoes.find(entry => entry.imageFilename === imageFilename?.trim())?.id
                }
                disabled={busy}
                title="Browse my shoes"
                description={`${savedShoes.length} saved pair${savedShoes.length === 1 ? '' : 's'} — search, then tap one to wear it.`}
                searchPlaceholder="Search — heels, boots, white, strappy…"
                thumbFit="contain"
                resolveThumb={entry => ({
                  url: savedShoes.find(saved => saved.id === entry.id)?.imageUrl ?? null,
                })}
                onSelect={id => {
                  const picked = savedShoes.find(entry => entry.id === id);
                  if (!picked) return;
                  onChange({
                    footwear: picked.words ?? '',
                    footwearImageUrl: picked.imageUrl,
                    footwearImageFilename: picked.imageFilename,
                  });
                }}
                onClose={() => setBrowse(null)}
              />
              <div className={CLOTHING_STRIP_CLASS}>
                {savedShoes.map(entry => (
                  <ClothingTile
                    key={entry.id}
                    label={entry.label}
                    thumbUrl={entry.imageUrl}
                    selected={entry.imageFilename === imageFilename?.trim()}
                    disabled={busy}
                    size={tileSize}
                    fit="contain"
                    onSelect={() =>
                      onChange({
                        footwear: entry.words ?? '',
                        footwearImageUrl: entry.imageUrl,
                        footwearImageFilename: entry.imageFilename,
                      })
                    }
                    onRemove={() => removeSavedFootwear(entry.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <WardrobePackButtons
            kind="shoes"
            count={savedShoes.length}
            disabled={busy}
            testIdPrefix={testIdPrefix}
          />
          {photoBusy || photoStatus ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              role="status"
              data-testid={`${testIdPrefix}-footwear-photo-status`}
            >
              {photoStatus || 'Working on the shoe photo…'}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'words' || (mode === 'photo' && ownPhoto) ? (
        <label className="block space-y-1">
          {mode === 'photo' ? (
            <span className="type-caption text-[var(--text-muted)]">What the model is told</span>
          ) : null}
          <TextInput
            id={mode === 'words' ? fieldId : undefined}
            value={value ?? ''}
            maxLength={FOOTWEAR_MAX_LENGTH}
            disabled={busy}
            aria-label="Footwear in your own words"
            data-testid={`${testIdPrefix}-footwear-custom`}
            className={accentFocusClass(accent)}
            placeholder="e.g. red suede block-heel sandals with ankle straps"
            onChange={event => {
              const words = event.target.value.replace(/\s+/g, ' ');
              // Typed words that no longer match the kit drop the kit's picture; a photo stays.
              onChange(
                ownPhoto || footwearKitForWords(words)
                  ? { footwear: words }
                  : { footwear: words, ...NO_IMAGE }
              );
            }}
            onBlur={() => {
              onChange({ footwear: normalizeFootwear(value) });
              // A saved photo follows an edit to its words, or re-picking it brings back the old text.
              if (ownPhoto && findSavedFootwearByFilename(imageFilename)) {
                updateSavedFootwearWords(imageFilename, value);
              }
            }}
          />
        </label>
      ) : null}

      <p
        className="type-caption text-[var(--text-muted)]"
        data-testid={`${testIdPrefix}-footwear-hint`}
      >
        {summary}
      </p>
    </div>
  );
}
