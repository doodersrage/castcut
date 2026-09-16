'use client';

import { useState, useSyncExternalStore } from 'react';
import CastPersonaPartChips from '@/components/cast/CastPersonaPartChips';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel, SelectInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  CHARACTER_AGE_BAND_SELECT_OPTIONS,
  CHARACTER_BODY_BUILD_SELECT_OPTIONS,
  CHARACTER_ETHNICITY_SELECT_OPTIONS,
  CHARACTER_HEIGHT_SELECT_OPTIONS,
  CHARACTER_SEX_SELECT_OPTIONS,
  defaultCharacterAppearanceForm,
  summarizeCharacterAppearanceForm,
  type CharacterAppearanceFormDraft,
  type CharacterAppearancePick,
  type CharacterAgeBand,
  type CharacterBodyBuild,
  type CharacterEthnicity,
  type CharacterHeight,
  type CharacterSex,
} from '@/lib/character-appearance';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignCharacterSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  | 'shared'
  | 'updateShared'
  | 'character'
  | 'activeLookPack'
  | 'persistCharacter'
  | 'createCharacter'
  | 'setStatus'
>;

export default function PlayCampaignCharacterSection({
  shared,
  updateShared,
  character,
  activeLookPack,
  persistCharacter,
  createCharacter,
  setStatus,
}: PlayCampaignCharacterSectionProps) {
  const [draftName, setDraftName] = useState('');
  const [appearance, setAppearance] = useState<CharacterAppearanceFormDraft>(() =>
    defaultCharacterAppearanceForm()
  );
  const [personaId, setPersonaId] = useState('');
  const [customPersona, setCustomPersona] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );

  const patchAppearance = <K extends keyof CharacterAppearanceFormDraft>(
    key: K,
    value: CharacterAppearanceFormDraft[K]
  ) => {
    setAppearance(current => ({ ...current, [key]: value }));
  };

  const resetDraft = () => {
    setDraftName('');
    setAppearance(defaultCharacterAppearanceForm());
    setPersonaId('');
    setCustomPersona('');
    setReferenceFile(null);
  };

  const submitCreate = async (continueToMoodboard: boolean) => {
    const name = draftName.trim() || 'Untitled character';
    setCreating(true);
    try {
      await createCharacter({
        name,
        continueToMoodboard,
        appearance,
        personaId: personaId || undefined,
        customPersona: personaId ? customPersona : undefined,
        referenceFile,
      });
      resetDraft();
    } finally {
      setCreating(false);
    }
  };

  return (
    <ToolSection
      title="Character"
      description={
        character
          ? 'This film stays tied to one Cast record. Story continues this lead.'
          : 'Name a Cast lead, optional Part and From photo — Story continues whatever you start here.'
      }
      data-testid="play-campaign-character"
    >
      {!character ? (
        <div className="space-y-3" data-testid="play-campaign-create-character">
          <p className="type-caption text-[var(--text-muted)]">
            Each trait defaults to Random — pick specifics only when you want them locked in.
          </p>
          <div className="space-y-2">
            <FieldLabel htmlFor="play-campaign-create-name">New character</FieldLabel>
            <input
              id="play-campaign-create-name"
              data-testid="play-campaign-create-name"
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitCreate(true);
                }
              }}
              placeholder="e.g. Nova"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              aria-label="New character name"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2" data-testid="play-campaign-create-appearance">
            <label className="block space-y-1.5">
              <FieldLabel htmlFor="play-campaign-create-sex">Sex</FieldLabel>
              <SelectInput
                id="play-campaign-create-sex"
                data-testid="play-campaign-create-sex"
                value={appearance.sex}
                onChange={event =>
                  patchAppearance(
                    'sex',
                    event.target.value as CharacterAppearancePick<CharacterSex>
                  )
                }
              >
                {CHARACTER_SEX_SELECT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block space-y-1.5">
              <FieldLabel htmlFor="play-campaign-create-ethnicity">Ethnicity</FieldLabel>
              <SelectInput
                id="play-campaign-create-ethnicity"
                data-testid="play-campaign-create-ethnicity"
                value={appearance.ethnicity}
                onChange={event =>
                  patchAppearance(
                    'ethnicity',
                    event.target.value as CharacterAppearancePick<CharacterEthnicity>
                  )
                }
              >
                {CHARACTER_ETHNICITY_SELECT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block space-y-1.5">
              <FieldLabel htmlFor="play-campaign-create-age">Age</FieldLabel>
              <SelectInput
                id="play-campaign-create-age"
                data-testid="play-campaign-create-age"
                value={appearance.ageBand}
                onChange={event =>
                  patchAppearance(
                    'ageBand',
                    event.target.value as CharacterAppearancePick<CharacterAgeBand>
                  )
                }
              >
                {CHARACTER_AGE_BAND_SELECT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block space-y-1.5">
              <FieldLabel htmlFor="play-campaign-create-height">Height</FieldLabel>
              <SelectInput
                id="play-campaign-create-height"
                data-testid="play-campaign-create-height"
                value={appearance.height}
                onChange={event =>
                  patchAppearance(
                    'height',
                    event.target.value as CharacterAppearancePick<CharacterHeight>
                  )
                }
              >
                {CHARACTER_HEIGHT_SELECT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <FieldLabel htmlFor="play-campaign-create-body">Body type</FieldLabel>
              <SelectInput
                id="play-campaign-create-body"
                data-testid="play-campaign-create-body"
                value={appearance.bodyBuild}
                onChange={event =>
                  patchAppearance(
                    'bodyBuild',
                    event.target.value as CharacterAppearancePick<CharacterBodyBuild>
                  )
                }
              >
                {CHARACTER_BODY_BUILD_SELECT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
          </div>

          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="play-campaign-create-appearance-summary"
          >
            {summarizeCharacterAppearanceForm(appearance)}
          </p>

          <CastPersonaPartChips
            personaId={personaId}
            customPersona={customPersona}
            disabled={creating}
            testIdPrefix="play-campaign-create-persona"
            onChange={next => {
              setPersonaId(next.personaId);
              setCustomPersona(next.customPersona ?? '');
            }}
          />

          <div className="space-y-2" data-testid="play-campaign-create-from-photo">
            <FieldLabel htmlFor="play-campaign-create-photo">From photo (optional)</FieldLabel>
            <p className="type-caption text-[var(--text-muted)]">
              Sets the Cast look plate so Outfit, Day, and Story share the same identity.
            </p>
            <input
              id="play-campaign-create-photo"
              type="file"
              accept="image/*"
              disabled={creating}
              className="ui-file-input block w-full"
              data-testid="play-campaign-create-photo"
              onChange={event => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                setReferenceFile(file);
              }}
            />
            {referenceFile ? (
              <p className="type-caption text-[var(--text-secondary)]">
                Selected: {referenceFile.name}{' '}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => setReferenceFile(null)}
                >
                  Clear
                </button>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="play-campaign-create-continue"
              loading={creating}
              disabled={creating}
              onClick={() => void submitCreate(true)}
            >
              Create & continue to Look
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="play-campaign-create-only"
              loading={creating}
              disabled={creating}
              onClick={() => void submitCreate(false)}
            >
              Create only
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="play-campaign-create-reset-random"
              disabled={creating}
              onClick={() => {
                setAppearance(defaultCharacterAppearanceForm());
                setPersonaId('');
                setCustomPersona('');
                setReferenceFile(null);
              }}
            >
              Reset to Random
            </Button>
          </div>
          {characters.length > 0 ? (
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <p className="type-caption text-[var(--text-muted)]">
                Or pick an existing Cast character
              </p>
              <CharacterOsPicker
                shared={shared}
                onApply={patch => {
                  try {
                    updateShared(patch);
                    if (patch.activeCharacterId) {
                      persistCharacter(patch.activeCharacterId);
                    }
                  } catch (err) {
                    setStatus(
                      err instanceof Error ? err.message : 'Could not apply that character.'
                    );
                  }
                }}
              />
            </div>
          ) : (
            <ButtonLink href="/characters" size="sm" variant="ghost">
              Browse Cast
            </ButtonLink>
          )}
        </div>
      ) : (
        <>
          <CharacterOsPicker
            shared={shared}
            hints={character.hints}
            onApply={patch => {
              try {
                updateShared(patch);
                if (patch.activeCharacterId) {
                  persistCharacter(patch.activeCharacterId);
                }
              } catch (err) {
                setStatus(err instanceof Error ? err.message : 'Could not apply that character.');
              }
            }}
          />
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Active: {character.name}
            {character.personaId ? ' · Part set' : ''}
            {activeLookPack ? ' · look pack staged' : ''}
          </p>
        </>
      )}
    </ToolSection>
  );
}
