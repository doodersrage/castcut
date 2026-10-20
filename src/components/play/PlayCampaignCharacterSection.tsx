'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import CastPersonaPartChips from '@/components/cast/CastPersonaPartChips';
import { CastMarksEditor } from '@/components/character/CastMarksSection';
import CharacterOsPicker from '@/components/shared-tool-controls/CharacterOsPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
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
  CHARACTER_BUST_SELECT_OPTIONS,
  CHARACTER_EYE_COLOR_SELECT_OPTIONS,
  CHARACTER_FACE_SHAPE_SELECT_OPTIONS,
  CHARACTER_FACIAL_HAIR_SELECT_OPTIONS,
  CHARACTER_HAIR_COLOR_SELECT_OPTIONS,
  CHARACTER_HIPS_SELECT_OPTIONS,
  CHARACTER_SKIN_TONE_SELECT_OPTIONS,
  CHARACTER_EYEBROWS_SELECT_OPTIONS,
  CHARACTER_LIPS_SELECT_OPTIONS,
  CHARACTER_MAKEUP_SELECT_OPTIONS,
  CHARACTER_MUSCLE_TONE_SELECT_OPTIONS,
  CHARACTER_BODY_HAIR_SELECT_OPTIONS,
  CHARACTER_PUBIC_HAIR_SELECT_OPTIONS,
  CHARACTER_TRAIT_GROUPS,
  LITTLE_PERSON_PHOTO_HINT,
  traitAppliesToSex,
  CHARACTER_HAIR_LENGTH_SELECT_OPTIONS,
  CHARACTER_HAIR_STYLE_SELECT_OPTIONS,
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
import type { CastMark } from '@/lib/cast/marks';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';
import { followCastOutfitInSessions } from '@/lib/cast/plate-switch';

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

/** The create form's Hair / Face / Body pickers (Basics are laid out above them), in group order. */
const CREATE_TRAIT_SELECTS = [
  ['hairColor', 'Hair colour', CHARACTER_HAIR_COLOR_SELECT_OPTIONS],
  ['hairLength', 'Hair length', CHARACTER_HAIR_LENGTH_SELECT_OPTIONS],
  ['hairStyle', 'Hair style', CHARACTER_HAIR_STYLE_SELECT_OPTIONS],
  ['facialHair', 'Facial hair', CHARACTER_FACIAL_HAIR_SELECT_OPTIONS],
  ['skinTone', 'Skin tone', CHARACTER_SKIN_TONE_SELECT_OPTIONS],
  ['faceShape', 'Face shape', CHARACTER_FACE_SHAPE_SELECT_OPTIONS],
  ['eyeColor', 'Eye colour', CHARACTER_EYE_COLOR_SELECT_OPTIONS],
  ['eyebrows', 'Eyebrows', CHARACTER_EYEBROWS_SELECT_OPTIONS],
  ['lips', 'Lips', CHARACTER_LIPS_SELECT_OPTIONS],
  ['makeup', 'Makeup', CHARACTER_MAKEUP_SELECT_OPTIONS],
  ['bust', 'Bust', CHARACTER_BUST_SELECT_OPTIONS],
  ['hips', 'Hips', CHARACTER_HIPS_SELECT_OPTIONS],
  ['muscleTone', 'Muscle tone', CHARACTER_MUSCLE_TONE_SELECT_OPTIONS],
  ['bodyHair', 'Body hair', CHARACTER_BODY_HAIR_SELECT_OPTIONS],
  ['pubicHair', 'Pubic hair', CHARACTER_PUBIC_HAIR_SELECT_OPTIONS],
] as const;

export default function PlayCampaignCharacterSection({
  shared,
  updateShared,
  character,
  activeLookPack,
  persistCharacter,
  createCharacter,
  setStatus,
}: PlayCampaignCharacterSectionProps) {
  const intimateEnabled = useNsfwGeneratorEnabled();
  const [draftName, setDraftName] = useState('');
  const [appearance, setAppearance] = useState<CharacterAppearanceFormDraft>(() =>
    defaultCharacterAppearanceForm()
  );
  const [personaId, setPersonaId] = useState('');
  const [customPersona, setCustomPersona] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [marks, setMarks] = useState<CastMark[]>([]);
  const [creating, setCreating] = useState(false);
  const createNameRef = useRef<HTMLInputElement>(null);
  // Characters' "New character" opens Film with ?new=1: bring the create form to the front.
  const wantsNewCharacter = useSearchParams().get('new') === '1';
  const showCreateForm = !character;
  useEffect(() => {
    if (!wantsNewCharacter || !showCreateForm) {
      return;
    }
    const input = createNameRef.current;
    if (!input) {
      return;
    }
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  }, [wantsNewCharacter, showCreateForm]);
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
    setMarks([]);
  };

  const submitCreate = async () => {
    const name = draftName.trim() || 'Untitled character';
    setCreating(true);
    try {
      await createCharacter({
        name,
        appearance,
        personaId: personaId || undefined,
        customPersona: personaId ? customPersona : undefined,
        referenceFile,
        marks,
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
          ? 'Who the film is about. Story carries on with them.'
          : 'Name who the film is about, or start from a photo.'
      }
      data-testid="play-campaign-character"
    >
      {!character ? (
        <div className="space-y-3" data-testid="play-campaign-create-character">
          <div className="space-y-2">
            <FieldLabel htmlFor="play-campaign-create-name">New character</FieldLabel>
            <input
              ref={createNameRef}
              id="play-campaign-create-name"
              data-testid="play-campaign-create-name"
              value={draftName}
              onChange={event => setDraftName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitCreate();
                }
              }}
              placeholder="e.g. Nova"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              aria-label="New character name"
            />
          </div>

          <div className="space-y-2" data-testid="play-campaign-create-from-photo">
            <FieldLabel htmlFor="play-campaign-create-photo">From photo (optional)</FieldLabel>
            <p className="type-caption text-[var(--text-muted)]">
              Without one, the first picture is made from the description.
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
              onClick={() => void submitCreate()}
            >
              Create
            </Button>
          </div>

          <details
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
            data-testid="play-campaign-create-more-traits"
          >
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              More traits · Part, look, body, hair, face, marks
            </summary>
            <div className="mt-3 space-y-3">
              <p className="type-caption text-[var(--text-muted)]">
                Each trait defaults to Random — pick specifics only when you want them locked in.
              </p>
              <div className="space-y-4" data-testid="play-campaign-create-appearance">
                <fieldset className="space-y-2" data-testid="play-campaign-create-group-basics">
                  <legend className="type-overline text-[var(--text-muted)]">Basics</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                </fieldset>
                {CHARACTER_TRAIT_GROUPS.filter(group => group.id !== 'basics').map(group => (
                  <fieldset
                    key={group.id}
                    className="space-y-2"
                    data-testid={`play-campaign-create-group-${group.id}`}
                  >
                    <legend className="type-overline text-[var(--text-muted)]">
                      {group.label}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {CREATE_TRAIT_SELECTS.filter(
                        ([key]) =>
                          group.keys.includes(key) &&
                          // Pubic hair is said on nude Intimate / Raunchy Day stills only.
                          (key !== 'pubicHair' || intimateEnabled)
                      ).map(([key, label, options]) => {
                        // Bald (hair colour) means no hair: length and style don't apply; facial hair is
                        // for men and nonbinary Casts, bust for women and nonbinary Casts (as in the Cast editor).
                        const noHair =
                          appearance.hairColor === 'bald' &&
                          (key === 'hairLength' || key === 'hairStyle');
                        const notForSex =
                          (key === 'facialHair' || key === 'bust') &&
                          !traitAppliesToSex(key, appearance.sex);
                        const off = noHair || notForSex;
                        const id = `play-campaign-create-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
                        return (
                          <label key={key} className="block space-y-1.5">
                            <FieldLabel htmlFor={id}>{label}</FieldLabel>
                            <SelectInput
                              id={id}
                              data-testid={id}
                              value={off ? 'random' : (appearance[key] ?? 'random')}
                              disabled={off}
                              title={
                                noHair
                                  ? 'Bald — no hair length or style'
                                  : notForSex
                                    ? `Not for a ${appearance.sex}`
                                    : undefined
                              }
                              onChange={event => {
                                const value = event.target.value;
                                setAppearance(current => ({
                                  ...current,
                                  [key]: value,
                                  ...(key === 'hairColor' && value === 'bald'
                                    ? { hairLength: undefined, hairStyle: undefined }
                                    : {}),
                                }));
                              }}
                            >
                              {options.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SelectInput>
                          </label>
                        );
                      })}
                    </div>
                    {group.id === 'hair' && appearance.hairColor === 'custom' ? (
                      <label className="block space-y-1.5">
                        <FieldLabel htmlFor="play-campaign-create-hair-color-custom">
                          Custom hair colour
                        </FieldLabel>
                        <TextInput
                          id="play-campaign-create-hair-color-custom"
                          data-testid="play-campaign-create-hair-color-custom"
                          value={appearance.hairColorCustom ?? ''}
                          maxLength={48}
                          placeholder="e.g. copper with blonde streaks"
                          onChange={event => {
                            const value = event.target.value;
                            setAppearance(current => ({ ...current, hairColorCustom: value }));
                          }}
                        />
                      </label>
                    ) : null}
                  </fieldset>
                ))}
              </div>

              {appearance.height === 'little-person' && !referenceFile ? (
                <p
                  className="type-caption text-[var(--tint-warning-text)]"
                  data-testid="play-campaign-create-little-person"
                >
                  {LITTLE_PERSON_PHOTO_HINT}
                </p>
              ) : null}

              <p
                className="type-caption text-[var(--text-muted)]"
                data-testid="play-campaign-create-appearance-summary"
              >
                {summarizeCharacterAppearanceForm(appearance)}
              </p>

              <div className="space-y-1.5" data-testid="play-campaign-create-marks">
                <FieldLabel>Marks (optional)</FieldLabel>
                <p className="type-caption text-[var(--text-muted)]">
                  Tattoos, scars, moles, freckles, glasses — on the first plate and every still
                  where that part shows.
                </p>
                <CastMarksEditor marks={marks} onChange={setMarks} />
              </div>

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

              <Button
                size="sm"
                variant="ghost"
                data-testid="play-campaign-create-reset-random"
                disabled={creating}
                onClick={() => {
                  setAppearance(defaultCharacterAppearanceForm());
                  setPersonaId('');
                  setCustomPersona('');
                }}
              >
                Reset traits to Random
              </Button>
            </div>
          </details>

          {characters.length > 0 ? (
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <p className="type-caption text-[var(--text-muted)]">
                Or pick an existing Cast character
              </p>
              <CharacterOsPicker
                onCastChange={followCastOutfitInSessions}
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
            onCastChange={followCastOutfitInSessions}
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
