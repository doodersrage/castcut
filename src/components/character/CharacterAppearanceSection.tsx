'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, SelectInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CHARACTER_AGE_BAND_OPTIONS,
  CHARACTER_BODY_BUILD_OPTIONS,
  CHARACTER_ETHNICITY_OPTIONS,
  CHARACTER_HAIR_COLOR_OPTIONS,
  CHARACTER_HAIR_LENGTH_OPTIONS,
  CHARACTER_HAIR_STYLE_OPTIONS,
  CHARACTER_HEIGHT_OPTIONS,
  CHARACTER_SEX_OPTIONS,
  isRolledAppearanceDescriptor,
  normalizeCharacterTraits,
  type CharacterTraits,
} from '@/lib/character-appearance';
import { castHasPicture, saveCharacterTraits, type CharacterRecord } from '@/lib/character-os';

const FIELDS: Array<{
  key: keyof CharacterTraits;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}> = [
  { key: 'sex', label: 'Sex', options: CHARACTER_SEX_OPTIONS },
  { key: 'ethnicity', label: 'Ethnicity', options: CHARACTER_ETHNICITY_OPTIONS },
  { key: 'ageBand', label: 'Age', options: CHARACTER_AGE_BAND_OPTIONS },
  { key: 'height', label: 'Height', options: CHARACTER_HEIGHT_OPTIONS },
  { key: 'bodyBuild', label: 'Body type', options: CHARACTER_BODY_BUILD_OPTIONS },
  { key: 'hairColor', label: 'Hair colour', options: CHARACTER_HAIR_COLOR_OPTIONS },
  { key: 'hairLength', label: 'Hair length', options: CHARACTER_HAIR_LENGTH_OPTIONS },
  { key: 'hairStyle', label: 'Hair style', options: CHARACTER_HAIR_STYLE_OPTIONS },
];

/**
 * The Cast's body: the traits picked when it was made, editable. They are the physical
 * description every picture uses (Day, Look, Outfit); the bible below is for Story.
 */
export default function CharacterAppearanceSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const hasPicture = castHasPicture(character);
  const [draft, setDraft] = useState<CharacterTraits>(() => character.traits ?? {});
  const [syncedKey, setSyncedKey] = useState(`${character.id}:${character.updatedAt}`);
  const nextKey = `${character.id}:${character.updatedAt}`;
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setDraft(character.traits ?? {});
  }
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = normalizeCharacterTraits(character.traits) ?? {};
  const changed = JSON.stringify(normalizeCharacterTraits(draft) ?? {}) !== JSON.stringify(saved);
  // Casts made from a photo before 2.3: every trait was rolled at random into the description.
  const madeUp =
    hasPicture && !character.traits && isRolledAppearanceDescriptor(character.descriptor);
  // Before 2.3 saving the Story bible overwrote the description with the bible's look.
  const fromBible =
    !madeUp &&
    !character.traits &&
    Boolean(character.descriptor?.trim()) &&
    character.descriptor?.trim() === character.bio?.look?.trim();

  const save = () => {
    setError(null);
    const next = saveCharacterTraits(character.id, normalizeCharacterTraits(draft));
    if (!next) {
      setError('Could not save the appearance — try again.');
      return;
    }
    onUpdated?.(next);
    setStatus('Saved — Day, Look and Outfit use this from the next still.');
  };

  return (
    <ToolSection
      title="Appearance"
      description={
        hasPicture
          ? 'How this person looks in every picture — Day, Look, Outfit. Leave a trait unset to let the picture decide. The bible below is for Story.'
          : 'How this person looks in every picture — Day, Look, Outfit. Unset traits are picked once at random. The bible below is for Story.'
      }
      data-testid="cast-appearance-section"
    >
      {madeUp ? (
        <p
          className="mb-3 text-sm text-[var(--tint-warning-text)]"
          data-testid="cast-appearance-made-up"
        >
          This description was made up at random when the Cast was created and may not match the
          picture. Pick the traits that match it (or leave them unset) and save.
        </p>
      ) : null}
      {fromBible ? (
        <p
          className="mb-3 text-sm text-[var(--tint-warning-text)]"
          data-testid="cast-appearance-from-bible"
        >
          This description is the Story bible&apos;s look (an older version copied it here), so
          story details can end up in Day and Look pictures. Pick the traits and save to describe
          only the body.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3" data-testid="cast-appearance-traits">
        {FIELDS.map(field => {
          // Bald (hair colour) means no hair: length and style don't apply.
          const noHair =
            draft.hairColor === 'bald' && (field.key === 'hairLength' || field.key === 'hairStyle');
          return (
            <label key={field.key} className="block space-y-1.5">
              <FieldLabel htmlFor={`cast-trait-${field.key}`}>{field.label}</FieldLabel>
              <SelectInput
                id={`cast-trait-${field.key}`}
                data-testid={`cast-trait-${field.key}`}
                value={noHair ? '' : (draft[field.key] ?? '')}
                disabled={noHair}
                title={noHair ? 'Bald — no hair length or style' : undefined}
                onChange={event => {
                  setStatus(null);
                  const value = event.target.value;
                  setDraft(previous => {
                    const next = { ...previous } as Record<string, string | undefined>;
                    if (value) next[field.key] = value;
                    else delete next[field.key];
                    if (field.key === 'hairColor' && value === 'bald') {
                      delete next.hairLength;
                      delete next.hairStyle;
                    }
                    return next as CharacterTraits;
                  });
                }}
              >
                <option value="">{hasPicture ? 'Not set — the picture decides' : 'Not set'}</option>
                {field.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
          );
        })}
      </div>
      {!draft.sex ? (
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          Set Sex so Day and Story say “he” or “she” — the picture alone can&apos;t tell the
          wording.
        </p>
      ) : null}
      <p
        className="mt-3 text-sm text-[var(--text-muted)]"
        data-testid="cast-appearance-description"
      >
        {character.descriptor?.trim()
          ? `Description: ${character.descriptor.trim()}`
          : 'No description — the picture alone shows this person.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={changed || madeUp || fromBible ? 'primary' : 'secondary'}
          disabled={!changed && !madeUp && !fromBible}
          data-testid="cast-appearance-save"
          onClick={save}
        >
          Save appearance
        </Button>
        {status ? (
          <span className="type-caption text-[var(--text-muted)]" role="status">
            {status}
          </span>
        ) : null}
        {error ? (
          <span className="type-caption text-[var(--tint-danger-text)]" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </ToolSection>
  );
}
