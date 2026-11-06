'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldError, FieldLabel, TextInput } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import {
  clothingPictureFromFile,
  clothingPictureFromUrl,
  editClothingPicture,
  type ClothingPicture,
} from '@/lib/wardrobe/clothing-edit-client';
import { FOOTWEAR_MAX_LENGTH, normalizeFootwear } from '@/lib/wardrobe/footwear';
import {
  removeSavedFootwear,
  saveFootwear,
  type SavedFootwear,
} from '@/lib/wardrobe/footwear-saved';

/** What the footwear editor opened on: the pair being worn — a catalog kit or your own photo. */
export type FootwearEditorTarget = {
  label: string;
  /** The picture: a kit's shipped image or your photo's view URL. */
  imageUrl: string;
  /** Your own photo's ComfyUI input file (none for a kit — it is copied first). */
  imageFilename?: string;
  /** What stills are told the shoes are. */
  words: string;
  /** The saved pair this is, when it is one (changed in place). */
  saved?: SavedFootwear;
};

/**
 * The footwear editor (user request 2026-11-06, beside the clothing editor): the pair's picture —
 * changed with AI ("make them red", "a lower heel") on Qwen-Image 2.1 Turbo, or replaced with a
 * photo — and the words stills are told. A saved pair is changed in place; a catalog pair is saved
 * as your own copy (the catalog keeps its own). Saving wears the edited pair and keeps it in My
 * shoes.
 */
export default function FootwearEditorSheet(props: {
  target: FootwearEditorTarget | null;
  onClose: () => void;
  onSaved: (pair: { imageUrl: string; imageFilename: string; words: string }) => void;
}) {
  // A fresh editor for each pair (its state starts from that pair).
  if (!props.target) return null;
  return (
    <FootwearEditorBody
      key={`${props.target.imageFilename ?? props.target.imageUrl}|${props.target.words}`}
      {...props}
      target={props.target}
    />
  );
}

function FootwearEditorBody({
  target,
  onClose,
  onSaved,
}: {
  target: FootwearEditorTarget;
  onClose: () => void;
  onSaved: (pair: { imageUrl: string; imageFilename: string; words: string }) => void;
}) {
  const [picture, setPicture] = useState<ClothingPicture | null>(
    target.imageFilename ? { filename: target.imageFilename, url: target.imageUrl } : null
  );
  // Earlier pictures in this session: "Back" steps through them.
  const [history, setHistory] = useState<ClothingPicture[]>([]);
  const [words, setWords] = useState(target.words);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = picture?.url ?? target.imageUrl;

  /** The picture as an input file (a kit's shipped image is copied the first time). */
  const current = async (): Promise<ClothingPicture> =>
    picture ?? (await clothingPictureFromUrl(target.imageUrl, 'footwear.png'));

  const run = async (label: string, work: () => Promise<ClothingPicture>) => {
    setBusy(label);
    setError(null);
    try {
      const before = picture;
      const next = await work();
      if (before) setHistory(list => [...list, before]);
      setPicture(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the picture.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const said = normalizeFootwear(words);
    if (!said) {
      setError('Say what the shoes are — stills are told these words.');
      return;
    }
    setBusy('Saving…');
    setError(null);
    try {
      const kept = await current();
      // A changed picture is a new file: the saved pair's old entry gives way to it.
      if (target.saved && target.saved.imageFilename !== kept.filename) {
        removeSavedFootwear(target.saved.id);
      }
      saveFootwear({ imageFilename: kept.filename, imageUrl: kept.url, words: said });
      onSaved({ imageUrl: kept.url, imageFilename: kept.filename, words: said });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the shoes.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SideSheet
      open
      onClose={onClose}
      title="Footwear editor"
      description={
        target.saved
          ? 'Your saved pair — changed in place.'
          : target.imageFilename
            ? 'Your shoe photo — saved to My shoes when you save.'
            : 'A catalog pair — saved as your own copy; the catalog keeps its own.'
      }
      size="lg"
      testId="footwear-editor"
    >
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI input / shipped kit image */}
        <img
          src={shown}
          alt={target.label}
          className="mx-auto aspect-square w-full max-w-xs rounded-[var(--radius-md)] bg-[var(--bg-muted)] object-contain"
          data-testid="footwear-editor-picture"
        />
        <div className="space-y-1.5">
          <FieldLabel htmlFor="footwear-editor-change">Change it</FieldLabel>
          <div className="flex gap-2">
            <TextInput
              id="footwear-editor-change"
              value={instruction}
              maxLength={200}
              placeholder="make them red · a lower heel · white soles · suede"
              disabled={busy !== null}
              data-testid="footwear-editor-instruction"
              onChange={event => setInstruction(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={busy !== null || !instruction.trim()}
              data-testid="footwear-editor-apply"
              title="Changes the picture on Qwen-Image 2.1 Turbo (about half a minute); the old one is kept"
              onClick={() =>
                void run('Changing the shoes…', async () =>
                  editClothingPicture({
                    picture: await current(),
                    instruction,
                    subject: 'footwear',
                  })
                )
              }
            >
              Change
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              data-testid="footwear-editor-photo"
              onClick={() => fileRef.current?.click()}
            >
              Replace with a photo
            </Button>
            {history.length ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                data-testid="footwear-editor-back"
                onClick={() => {
                  setPicture(history[history.length - 1] ?? null);
                  setHistory(list => list.slice(0, -1));
                }}
              >
                Back to the previous picture
              </Button>
            ) : null}
            {busy ? (
              <span className="type-caption text-[var(--text-muted)]" role="status">
                {busy}
              </span>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void run('Uploading…', () => clothingPictureFromFile(file));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="footwear-editor-words">What the model is told</FieldLabel>
          <TextInput
            id="footwear-editor-words"
            value={words}
            maxLength={FOOTWEAR_MAX_LENGTH}
            placeholder="red suede ankle boots with a low block heel"
            disabled={busy !== null}
            data-testid="footwear-editor-words"
            onChange={event => setWords(event.target.value)}
          />
          <p className="type-caption text-[var(--text-muted)]">
            Change the picture? Say the change here too — stills read these words.
          </p>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy !== null} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy !== null}
            data-testid="footwear-editor-save"
            onClick={() => void save()}
          >
            Save and wear
          </Button>
        </div>
      </div>
    </SideSheet>
  );
}
