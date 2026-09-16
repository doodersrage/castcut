'use client';

import { useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { getCharacter, upsertCharacter, type CharacterRecord } from '@/lib/character-os';
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
  const bio = character.bio;
  const [editorOpen, setEditorOpen] = useState(!bio);
  const [status, setStatus] = useState<string | null>(null);

  const persistBio = (nextBio: RoleplayBio) => {
    const name = nextBio.name.trim() || character.name;
    upsertCharacter({
      ...character,
      name,
      characterName: name,
      bio: nextBio,
      descriptor: nextBio.look.trim() || character.descriptor,
    });
    const saved = getCharacter(character.id);
    if (saved) {
      onUpdated?.(saved);
    }
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
              variant="secondary"
              size="sm"
              data-testid="cast-bible-edit"
              onClick={() => {
                setStatus(null);
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
            variant="ghost"
            size="sm"
            data-testid="cast-bible-cancel"
            onClick={() => setEditorOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {status ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="cast-bible-status">
          {status}
        </p>
      ) : null}
    </ToolSection>
  );
}
