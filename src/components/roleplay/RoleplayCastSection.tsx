'use client';

import { useMemo } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { RoleplayCastActionsSection } from '@/components/roleplay/sections/RoleplayCastActionsSection';
import { RoleplayCastPhotoSection } from '@/components/roleplay/sections/RoleplayCastPhotoSection';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';
import { ROLEPLAY_ARCHETYPES, ROLEPLAY_CONTENT, ROLEPLAY_TONES } from '@/lib/roleplay';

export type {
  RoleplayCastApplyReferenceInput,
  RoleplayCastSectionProps,
} from '@/components/roleplay/roleplay-cast-section-types';

function moodSummary(
  tone: RoleplayCastSectionProps['tone'],
  content: RoleplayCastSectionProps['content'],
  setting: string | undefined,
  allowGore: boolean | undefined
): string {
  const toneLabel = ROLEPLAY_TONES.find(entry => entry.id === tone)?.label ?? tone;
  const contentLabel = ROLEPLAY_CONTENT.find(entry => entry.id === content)?.label ?? content;
  const place = setting?.trim();
  const parts = [toneLabel, contentLabel];
  if (allowGore) {
    parts.push('Gore');
  }
  if (place) {
    parts.push(place.length > 36 ? `${place.slice(0, 36)}…` : place);
  }
  return parts.join(' · ');
}

function partLabel(
  personaId: string | undefined,
  customPersona: string | undefined
): string | null {
  const id = personaId?.trim();
  if (!id) {
    return null;
  }
  if (id === 'custom') {
    const custom = customPersona?.trim();
    return custom ? (custom.length > 48 ? `${custom.slice(0, 48)}…` : custom) : 'Custom part';
  }
  return ROLEPLAY_ARCHETYPES.find(entry => entry.id === id)?.label ?? id;
}

/**
 * Story continues an existing Cast lead — identity (Part / From photo) lives on Film + Cast.
 */
export default function RoleplayCastSection(props: RoleplayCastSectionProps) {
  const {
    playAs,
    tone,
    content,
    toolSettings,
    activeCharacterId,
    castCharacterName,
    castHomeHref,
    filmHref,
  } = props;
  const mood = useMemo(
    () => moodSummary(tone, content, toolSettings.setting, toolSettings.allowGore),
    [tone, content, toolSettings.setting, toolSettings.allowGore]
  );
  const hasCast = Boolean(activeCharacterId?.trim());
  const displayName =
    castCharacterName?.trim() ||
    toolSettings.characterName?.trim() ||
    props.bio?.name?.trim() ||
    'this Cast lead';
  const part = partLabel(props.personaId, toolSettings.customPersona);

  if (!hasCast) {
    return (
      <ToolSection title="Story needs a Cast" data-testid="story-needs-cast">
        <p className="text-sm text-[var(--text-muted)]">
          Create or pick a Cast lead on Film — Part, From photo, and look traits live there. Story
          only continues that character.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={filmHref} variant="primary" size="sm" data-testid="story-open-film">
            Open Film
          </ButtonLink>
          <ButtonLink
            href="/characters"
            variant="secondary"
            size="sm"
            data-testid="story-open-cast"
          >
            Open Cast
          </ButtonLink>
        </div>
      </ToolSection>
    );
  }

  return (
    <ToolSection title={`Continue as ${displayName}`} data-testid="story-continue-cast">
      <p className="text-sm text-[var(--text-muted)]">
        Story continues this Cast lead
        {part ? ` · Part: ${part}` : ''}. Bible, Part, and look plate live on Cast — edit them
        there, then continue beats here.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ButtonLink href={castHomeHref} variant="secondary" size="sm" data-testid="story-edit-cast">
          Edit bible on Cast
        </ButtonLink>
        <ButtonLink href={filmHref} variant="ghost" size="sm" data-testid="story-back-film">
          Back to Film
        </ButtonLink>
      </div>
      <div className="mt-3">
        <RoleplayCastActionsSection {...props} />
      </div>
      <CollapsibleSection
        title="Mood & world"
        summary={mood}
        defaultOpen={false}
        persistKey="roleplay-cast-mood"
      >
        <RoleplayCastToneSettingSection {...props} />
      </CollapsibleSection>
      <CollapsibleSection
        key={playAs}
        title="Identity for this story"
        summary={playAs === 'photo' ? 'From photo — Cast look plate' : 'From bio'}
        defaultOpen={playAs === 'photo'}
      >
        <RoleplayCastPhotoSection {...props} />
      </CollapsibleSection>
    </ToolSection>
  );
}
