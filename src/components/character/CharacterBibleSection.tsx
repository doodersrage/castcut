'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { isRolledAppearanceDescriptor } from '@/lib/character-appearance';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';
import {
  activeLook,
  clearCharacterBio,
  getCharacter,
  saveCharacterBio,
  upsertCharacter,
  type CharacterRecord,
} from '@/lib/character-os';
import { FieldLabel, SelectInput } from '@/components/ui/Field';
import { buildRoleplayRequestBody, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import {
  clearRoleplayLibraryBioFromCharacter,
  syncRoleplayLibraryBioFromCharacter,
} from '@/lib/roleplay-library';
import {
  formatRoleplayBio,
  isRoleplayAdultContent,
  normalizeRoleplayContent,
  ROLEPLAY_CONTENT,
  normalizeRoleplayTone,
  type RoleplayBio,
} from '@/lib/roleplay';
import {
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

const ACCENT = 'sky' as const;

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), { ssr: false });

const CastBiblePictureButton = dynamic(
  () => import('@/components/character/CastBiblePictureButton'),
  { ssr: false, loading: () => null }
);

type CharacterBibleSectionProps = {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
};

/** The Cast's own picture: its face lock, else its reference photo. */
function castReferenceImage(character: CharacterRecord): { filename: string; imageUrl: string } {
  const look = activeLook(character);
  return {
    filename:
      look.ipAdapter?.imageFilename?.trim() ||
      character.ipAdapter?.imageFilename?.trim() ||
      look.reference?.isolatedFilename?.trim() ||
      look.reference?.originalFilename?.trim() ||
      character.reference?.isolatedFilename?.trim() ||
      character.reference?.originalFilename?.trim() ||
      '',
    imageUrl:
      look.ipAdapter?.imageUrl?.trim() ||
      character.ipAdapter?.imageUrl?.trim() ||
      look.reference?.isolatedUrl?.trim() ||
      look.reference?.originalUrl?.trim() ||
      character.reference?.isolatedUrl?.trim() ||
      character.reference?.originalUrl?.trim() ||
      '',
  };
}

function clearActiveStorySessionBio(characterId: string) {
  const shared = loadSettingsCache().shared;
  if (shared.activeCharacterId?.trim() !== characterId.trim()) {
    return;
  }
  const previous = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  saveToolSettings('roleplay', {
    ...previous,
    bio: undefined,
    story: [],
    rejectedScenes: [],
  });
}

/**
 * Character bible on Cast — rewrite, edit, and clear live here.
 * Story continues this bio when you open Continue in Story.
 */
export default function CharacterBibleSection({
  character,
  onUpdated,
}: CharacterBibleSectionProps) {
  const [editorOpen, setEditorOpen] = useState(!character.bio);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  /** Optimistic preview so a successful save is visible even if the parent re-renders late. */
  const [savedBio, setSavedBio] = useState<RoleplayBio | undefined>(character.bio);
  const [syncedKey, setSyncedKey] = useState(`${character.id}:${character.updatedAt}`);
  const nextKey = `${character.id}:${character.updatedAt}`;
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setSavedBio(character.bio);
  }
  const bio = savedBio ?? character.bio;

  const persistBio = (nextBio: RoleplayBio) => {
    setError(null);
    const saved = saveCharacterBio(character.id, nextBio);
    if (!saved?.bio) {
      setError('Could not save the bible on Cast — try again.');
      return;
    }
    syncRoleplayLibraryBioFromCharacter(saved);
    setSavedBio(saved.bio);
    onUpdated?.(saved);
    setEditorOpen(false);
    setStatus('Bible saved on Cast — Story will continue from this.');
  };

  const castPicture = castReferenceImage(character);
  const photoUrl = castPicture.imageUrl;
  const hasPicture = Boolean(castPicture.filename || castPicture.imageUrl);
  const biblePictureUrl = character.biblePicture?.imageUrl;
  // A bible look still holding the rolled description a photo Cast was given before 2.3.
  const lookIsMadeUp = Boolean(photoUrl && isRolledAppearanceDescriptor(bio?.look));

  const describeFromPhoto = async () => {
    if (!bio || !photoUrl) return;
    setError(null);
    setStatus(null);
    setDescribing(true);
    try {
      const image = await resolveLocalImageFile(null, photoUrl, `${character.id}-face.png`);
      const look = await scanStillWithVision({
        image,
        purpose: 'cast-face',
        shared: loadSettingsCache().shared,
      });
      persistBio({ ...bio, look: look.replace(/\.\s*$/, '') });
      setStatus('Look described from the photo — Story uses it from now on.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the photo.');
    } finally {
      setDescribing(false);
    }
  };

  const clearBible = () => {
    setError(null);
    setStatus(null);
    const cleared = clearCharacterBio(character.id);
    if (!cleared) {
      setError('Could not clear the bible — try again.');
      return;
    }
    clearRoleplayLibraryBioFromCharacter(cleared);
    clearActiveStorySessionBio(cleared.id);
    setSavedBio(undefined);
    setEditorOpen(true);
    onUpdated?.(cleared);
    setStatus('Bible cleared on Cast.');
  };

  const rewriteBible = async () => {
    setError(null);
    setStatus(null);
    setRewriting(true);
    try {
      const shared = loadSettingsCache().shared;
      const look = activeLook(character);
      const { filename, imageUrl } = castReferenceImage(character);
      const hasReferenceImage = Boolean(filename || imageUrl);
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildRoleplayRequestBody({
            action: 'bio',
            shared,
            // No Part: an original character built from the name and notes. 'custom' with no
            // text meant "an unexpected character with a secret inner life", which the writer
            // dressed in corsets and thigh-high boots even at PG-13.
            personaId: character.personaId?.trim() || '',
            customPersona: character.customPersona,
            characterName: character.characterName || character.name,
            // Appearance (the traits) is who this person is: the bible's look agrees with it.
            extraHints: [
              character.descriptor?.trim()
                ? `Appearance (fixed — the look must agree with it, never contradict it): ${character.descriptor.trim()}`
                : character.hints?.trim(),
              character.notes?.trim(),
            ]
              .filter(Boolean)
              .join('\n'),
            setting: character.setting,
            tone: normalizeRoleplayTone(character.tone),
            content: normalizeRoleplayContent(character.content),
            allowGore: false,
            hasReferenceImage,
            isolatedSubject: Boolean(look.reference?.isolated || character.reference?.isolated),
            bio: character.bio,
            lead: character,
          })
        ),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok || !data.bio) {
        throw new Error(data.error ?? 'Could not rewrite the bible.');
      }
      persistBio(data.bio);
      setStatus('Bible rewritten on Cast — Story will continue from this.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rewrite the bible.');
    } finally {
      setRewriting(false);
    }
  };

  return (
    <ToolSection
      title={bio ? `${bio.name} · character bible` : 'Character bible'}
      description="Name, look, and personality for Story. Rewrite, edit, or clear here on Cast — Story continues whatever you save."
      data-testid="cast-bible-section"
    >
      {/* The rating the bible is written at — the Cast's Story rating. Set by a Story and never
          shown here, an Explicit Story left every rewrite adult with no way to see why. */}
      <div className="mb-3 flex flex-wrap items-end gap-3" data-testid="cast-bible-rating">
        <label className="block space-y-1.5">
          <FieldLabel htmlFor="cast-bible-rating-select">Story rating</FieldLabel>
          <SelectInput
            id="cast-bible-rating-select"
            data-testid="cast-bible-rating-select"
            value={normalizeRoleplayContent(character.content)}
            onChange={event => {
              const fresh = getCharacter(character.id);
              if (!fresh) return;
              upsertCharacter({ ...fresh, content: normalizeRoleplayContent(event.target.value) });
              const saved = getCharacter(character.id);
              if (saved) onUpdated?.(saved);
            }}
          >
            {ROLEPLAY_CONTENT.map(option => (
              <option key={option.id} value={option.id}>
                {option.label} — {option.hint}
              </option>
            ))}
          </SelectInput>
        </label>
        <p className="type-caption max-w-md text-[var(--text-muted)]">
          {isRoleplayAdultContent(normalizeRoleplayContent(character.content))
            ? 'Adult: the bible and Story are written uncensored at this rating.'
            : 'The bible and this character’s Story are written at this rating.'}
        </p>
      </div>
      {bio && !editorOpen ? (
        <>
          <p
            className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]"
            data-testid="cast-bible-preview"
          >
            {formatRoleplayBio(bio)}
          </p>
          {lookIsMadeUp ? (
            <p
              className="mt-2 text-sm text-[var(--tint-warning-text)]"
              data-testid="cast-bible-look-made-up"
            >
              Story&apos;s look still holds the description made up when the Cast was created.{' '}
              <em>Describe from photo</em> replaces it with what the picture shows (the body in
              every picture comes from Appearance above).
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={rewriting}
              loadingLabel="Rewriting bible"
              data-testid="cast-bible-rewrite"
              onClick={() => void rewriteBible()}
            >
              Rewrite bible
            </Button>
            {photoUrl ? (
              <Button
                type="button"
                variant={lookIsMadeUp ? 'primary' : 'secondary'}
                size="sm"
                disabled={rewriting}
                loading={describing}
                loadingLabel="Reading the photo"
                data-testid="cast-bible-describe-photo"
                onClick={() => void describeFromPhoto()}
              >
                Describe from photo
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={rewriting}
              data-testid="cast-bible-edit"
              onClick={() => {
                setStatus(null);
                setError(null);
                setEditorOpen(true);
              }}
            >
              Edit bible
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={rewriting}
              data-testid="cast-bible-clear"
              onClick={clearBible}
            >
              Clear bible
            </Button>
          </div>
          <div className="mt-4" data-testid="cast-bible-picture-block">
            {hasPicture ? (
              <CastBiblePictureButton
                character={character}
                bio={bio}
                pictureUrl={castPicture}
                onPictured={next => {
                  onUpdated?.(next);
                  setStatus('Pictured — the still is in the gallery too.');
                }}
                onError={setPictureError}
              />
            ) : (
              <p
                className="type-caption text-[var(--text-muted)]"
                data-testid="cast-bible-picture-hint"
              >
                Add a look plate on Overview first to picture this bible — the picture keeps the
                face from it.
              </p>
            )}
            {pictureError ? (
              <p
                className="type-caption mt-2 text-[var(--danger-text)]"
                data-testid="cast-bible-picture-error"
              >
                {pictureError}
              </p>
            ) : null}
            {biblePictureUrl ? (
              <button
                type="button"
                className="mt-3 block max-w-full cursor-zoom-in rounded-[var(--radius-md)] border-0 bg-transparent p-0 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label="Open the bible picture full size"
                title="View larger"
                data-testid="cast-bible-picture-open"
                onClick={() =>
                  setLightbox({
                    images: [biblePictureUrl],
                    index: 0,
                    title: `${bio.name} · bible picture`,
                  })
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI / gallery media URL */}
                <img
                  src={biblePictureUrl}
                  alt={`${bio.name} as the bible describes them`}
                  className="max-h-[28rem] max-w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
                  data-testid="cast-bible-picture-image"
                />
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={rewriting}
              loadingLabel="Rewriting bible"
              data-testid="cast-bible-rewrite"
              onClick={() => void rewriteBible()}
            >
              {bio ? 'Rewrite bible' : 'Write bible'}
            </Button>
            {bio ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={rewriting}
                data-testid="cast-bible-clear"
                onClick={clearBible}
              >
                Clear bible
              </Button>
            ) : null}
          </div>
          <RoleplayBibleEditor
            key={
              bio
                ? `${bio.name}-${bio.look}-${bio.personality}-${bio.catchphrase ?? ''}`
                : `new-${character.id}`
            }
            initial={bio}
            characterName={character.characterName || character.name}
            accentClass={accentFocusClass(ACCENT)}
            applyLabel={bio ? 'Update bible' : 'Save bible on Cast'}
            onApply={persistBio}
            disabled={rewriting}
          />
        </>
      )}
      {bio && editorOpen ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={rewriting}
            data-testid="cast-bible-cancel"
            onClick={() => setEditorOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="type-caption mt-2 text-[var(--danger-text)]" data-testid="cast-bible-error">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="cast-bible-status">
          {status}
        </p>
      ) : null}
      {lightbox ? (
        <ImageLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={() => {}}
        />
      ) : null}
    </ToolSection>
  );
}
