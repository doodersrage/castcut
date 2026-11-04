'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import {
  SAVED_GARMENT_CONTEXTS,
  editSavedFittingGarment,
  saveEditedCatalogGarment,
  type SavedFittingGarment,
  type SavedGarmentGender,
} from '@/lib/fitting/saved-garments';
import { fetchClothingCatalogItem } from '@/lib/wardrobe/clothing-catalog-client';
import { WARDROBE_CATEGORIES, categoryLabel } from '@/lib/wardrobe/clothing-catalog-fields';
import {
  clothingPictureFromFile,
  clothingPictureFromUrl,
  editClothingPicture,
  type ClothingPicture,
} from '@/lib/wardrobe/clothing-edit-client';

/** What the editor opened on: one of the player's saved pieces, or a catalog item (edited as a copy). */
export type ClothingEditorTarget =
  | { kind: 'saved'; garment: SavedFittingGarment }
  | { kind: 'catalog'; id: string; label: string; thumbUrl: string | null };

const GENDERS: ReadonlyArray<{ value: SavedGarmentGender; label: string }> = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'neutral', label: 'Anyone' },
];

/**
 * The clothing editor (user request 2026-11-04): a piece's picture — changed with AI ("make it
 * red"), or replaced with a photo — its name, the description stills use, and its tags (kind, who
 * it's for, where it fits). A saved piece is changed in place; a catalog item is saved as the
 * player's own copy, and the catalog keeps its own.
 */
export default function ClothingEditorSheet(props: {
  target: ClothingEditorTarget | null;
  onClose: () => void;
  /** The saved piece as kept (a catalog copy is a new one). */
  onSaved: (garment: SavedFittingGarment) => void;
  testId?: string;
}) {
  if (!props.target) return null;
  const key =
    props.target.kind === 'saved'
      ? `saved:${props.target.garment.id}`
      : `catalog:${props.target.id}`;
  // A fresh editor per piece: its fields start from that piece.
  return <ClothingEditorBody key={key} {...props} target={props.target} />;
}

const inputUrl = (filename: string) =>
  `/api/comfyui/view?${new URLSearchParams({ filename, type: 'input' }).toString()}`;

function ClothingEditorBody({
  target,
  onClose,
  onSaved,
  testId = 'clothing-editor',
}: {
  target: ClothingEditorTarget;
  onClose: () => void;
  onSaved: (garment: SavedFittingGarment) => void;
  testId?: string;
}) {
  const saved = target.kind === 'saved' ? target.garment : null;
  const [label, setLabel] = useState(
    saved?.label ?? (target.kind === 'catalog' ? target.label : '')
  );
  const [description, setDescription] = useState(saved?.description ?? '');
  const [category, setCategory] = useState(saved?.category ?? '');
  const [gender, setGender] = useState<SavedGarmentGender>(saved?.gender ?? 'neutral');
  const [contexts, setContexts] = useState<string[]>(saved?.contexts ?? []);
  // The picture: a ComfyUI input file once changed (or saved), else the catalog thumb to copy.
  const [picture, setPicture] = useState<ClothingPicture | null>(
    saved
      ? { filename: saved.imageFilename, url: saved.imageUrl ?? inputUrl(saved.imageFilename) }
      : null
  );
  const [previous, setPrevious] = useState<ClothingPicture | null>(null);
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const catalogId = target.kind === 'catalog' ? target.id : null;

  useEffect(() => {
    if (!catalogId) return;
    let cancelled = false;
    // The catalog's own wording and tags, as the copy's start.
    void fetchClothingCatalogItem(catalogId).then(item => {
      if (cancelled || !item) return;
      setDescription(item.script ?? '');
      setCategory(item.category);
      setGender(item.gender === 'women' || item.gender === 'men' ? item.gender : 'neutral');
      setContexts(
        item.contexts.filter(context =>
          (SAVED_GARMENT_CONTEXTS as readonly string[]).includes(context)
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  const busy = status !== null;
  const shownUrl = picture?.url ?? (target.kind === 'catalog' ? target.thumbUrl : null);

  /** The picture as a ComfyUI input: a catalog thumb is copied in the first time it is needed. */
  const ensurePicture = async (): Promise<ClothingPicture> => {
    if (picture) return picture;
    if (target.kind !== 'catalog' || !target.thumbUrl) {
      throw new Error('This piece has no picture yet — add a photo first.');
    }
    const copied = await clothingPictureFromUrl(target.thumbUrl, `${target.id}.png`);
    setPicture(copied);
    return copied;
  };

  const run = async (label: string, work: () => Promise<void>) => {
    setError(null);
    setStatus(label);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setStatus(null);
    }
  };

  const changeWithAi = () =>
    run('Changing the picture… (about 30 s)', async () => {
      const from = await ensurePicture();
      const edited = await editClothingPicture({ picture: from, instruction });
      setPrevious(from);
      setPicture(edited);
    });

  const replacePhoto = (file: File | undefined) => {
    if (!file) return;
    void run('Adding the photo…', async () => {
      const from = picture;
      const added = await clothingPictureFromFile(file);
      setPrevious(from);
      setPicture(added);
    });
  };

  const save = () =>
    run('Saving…', async () => {
      const name = label.trim() || 'My clothing';
      const fields = {
        label: name,
        description: description.trim() || undefined,
        ...(category ? { category } : {}),
        gender,
        contexts,
      };
      if (target.kind === 'saved') {
        const saved = editSavedFittingGarment(target.garment.id, {
          ...fields,
          ...(picture ? { imageFilename: picture.filename, imageUrl: picture.url } : {}),
        });
        if (!saved) throw new Error('That piece is no longer saved.');
        onSaved(saved);
      } else {
        const kept = await ensurePicture();
        onSaved(
          saveEditedCatalogGarment({
            fromWardrobeId: target.id,
            imageFilename: kept.filename,
            imageUrl: kept.url,
            ...fields,
          })
        );
      }
      onClose();
    });

  return (
    <SideSheet
      open
      onClose={onClose}
      testId={testId}
      title={target.kind === 'saved' ? 'Edit clothing' : 'Edit a copy'}
      description={
        target.kind === 'saved'
          ? 'Change the picture, its name, what stills are told, and its tags.'
          : 'Your edits are saved as a new piece in your clothes — the catalog keeps its own.'
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
            data-testid={`${testId}-save`}
          >
            {target.kind === 'saved' ? 'Save' : 'Save as my copy'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          {shownUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI input or packaged thumb
            <img
              src={shownUrl}
              alt={`${label || 'Clothing'}, as it looks`}
              className="aspect-[4/5] w-36 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] object-contain"
              data-testid={`${testId}-picture`}
            />
          ) : (
            <div className="flex aspect-[4/5] w-36 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-muted)] type-caption text-[var(--text-muted)]">
              No picture
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={event => {
                replacePhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
              data-testid={`${testId}-photo-input`}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              data-testid={`${testId}-replace-photo`}
            >
              Replace photo
            </Button>
            {previous ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setPicture(previous);
                  setPrevious(null);
                }}
                data-testid={`${testId}-undo-picture`}
              >
                Back to the last picture
              </Button>
            ) : null}
          </div>
        </div>
        <label className="block space-y-1.5">
          <FieldLabel>Change it with AI</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              value={instruction}
              maxLength={200}
              placeholder="make it red · shorter hem · add lace trim · black leather"
              className="min-w-[12rem] flex-1"
              disabled={busy}
              onChange={event => setInstruction(event.target.value)}
              data-testid={`${testId}-instruction`}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !instruction.trim() || !shownUrl}
              loading={status?.startsWith('Changing') ?? false}
              loadingLabel="Changing"
              onClick={() => void changeWithAi()}
              data-testid={`${testId}-change`}
            >
              Change it
            </Button>
          </div>
        </label>
        {status ? (
          <p className="type-caption text-[var(--text-muted)]" role="status">
            {status}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <label className="block space-y-1.5">
          <FieldLabel>Name</FieldLabel>
          <TextInput
            value={label}
            maxLength={80}
            onChange={event => setLabel(event.target.value)}
            data-testid={`${testId}-name`}
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel>What stills are told</FieldLabel>
          <TextArea
            rows={3}
            value={description}
            maxLength={600}
            placeholder="a deep red oversized knit sweater dress, crew neck, ribbed hem"
            onChange={event => setDescription(event.target.value)}
            data-testid={`${testId}-description`}
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel>Kind</FieldLabel>
          <SelectInput
            value={category}
            onChange={event => setCategory(event.target.value)}
            data-testid={`${testId}-category`}
          >
            <option value="">Not set</option>
            {WARDROBE_CATEGORIES.map(entry => (
              <option key={entry} value={entry}>
                {categoryLabel(entry)}
              </option>
            ))}
          </SelectInput>
        </label>
        <div className="space-y-1.5">
          <FieldLabel>For</FieldLabel>
          <SegmentedControl<SavedGarmentGender>
            aria-label="Who it is for"
            value={gender}
            onChange={setGender}
            options={GENDERS.map(entry => ({
              ...entry,
              testId: `${testId}-gender-${entry.value}`,
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Where it fits</FieldLabel>
          <div className="flex flex-wrap gap-1.5" data-testid={`${testId}-contexts`}>
            {SAVED_GARMENT_CONTEXTS.map(context => {
              const on = contexts.includes(context);
              return (
                <Button
                  key={context}
                  type="button"
                  size="sm"
                  variant={on ? 'secondary' : 'ghost'}
                  aria-pressed={on}
                  onClick={() =>
                    setContexts(list =>
                      on ? list.filter(entry => entry !== context) : [...list, context]
                    )
                  }
                  data-testid={`${testId}-context-${context}`}
                >
                  {context}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
