'use client';

import { useState, useSyncExternalStore } from 'react';
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

  const submitCreate = (continueToMoodboard: boolean) => {
    const name = draftName.trim() || 'Untitled character';
    createCharacter({ name, continueToMoodboard, appearance });
    setDraftName('');
    setAppearance(defaultCharacterAppearanceForm());
  };

  return (
    <ToolSection
      title="Character"
      description={
        character
          ? 'The campaign stays tied to one Cast record.'
          : 'Name a Cast lead and set look traits — Story is optional later.'
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
                  submitCreate(true);
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

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="play-campaign-create-continue"
              onClick={() => submitCreate(true)}
            >
              Create & continue to Look
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="play-campaign-create-only"
              onClick={() => submitCreate(false)}
            >
              Create only
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="play-campaign-create-reset-random"
              onClick={() => setAppearance(defaultCharacterAppearanceForm())}
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
            {activeLookPack ? ' · look pack staged' : ''}
          </p>
        </>
      )}
    </ToolSection>
  );
}
