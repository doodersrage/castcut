'use client';

import { useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { saveCharacterBio, type CharacterRecord } from '@/lib/character-os';
import { syncRoleplayLibraryBioFromCharacter } from '@/lib/roleplay-library';
import { formatRoleplayBio, type RoleplayBio } from '@/lib/roleplay';

const ACCENT = 'sky' as const;

type CharacterBibleSectionProps = {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
};

/**
 * Character bible on Cast — Story continues this bio when you open Continue in Story.
 */
export default function CharacterBibleSection({
  character,
  onUpdated,
}: CharacterBibleSectionProps) {
  const [editorOpen, setEditorOpen] = useState(!character.bio);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <ToolSection
      title={bio ? `${bio.name} · character bible` : 'Character bible'}
      description="Name, look, and personality for Story. Edit here on Cast — Story continues whatever you save."
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
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="cast-bible-edit"
              onClick={() => {
                setStatus(null);
                setError(null);
                setEditorOpen(true);
              }}
            >
              Edit bible
            </Button>
          </div>
        </>
      ) : (
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
        />
      )}
      {bio && editorOpen ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
