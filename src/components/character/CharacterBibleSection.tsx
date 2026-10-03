'use client';

import { useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { isRolledAppearanceDescriptor } from '@/lib/character-appearance';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';
import {
  activeLook,
  clearCharacterBio,
  saveCharacterBio,
  type CharacterRecord,
} from '@/lib/character-os';
import { buildRoleplayRequestBody, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import {
  clearRoleplayLibraryBioFromCharacter,
  syncRoleplayLibraryBioFromCharacter,
} from '@/lib/roleplay-library';
import {
  formatRoleplayBio,
  normalizeRoleplayContent,
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

  const photoUrl = castReferenceImage(character).imageUrl;
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
            extraHints: character.hints || character.notes,
            setting: character.setting,
            tone: normalizeRoleplayTone(character.tone),
            content: normalizeRoleplayContent(character.content),
            allowGore: false,
            hasReferenceImage,
            isolatedSubject: Boolean(look.reference?.isolated || character.reference?.isolated),
            bio: character.bio,
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
    </ToolSection>
  );
}
