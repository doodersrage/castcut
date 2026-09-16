'use client';

import CastPersonaPartChips from '@/components/cast/CastPersonaPartChips';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { getCharacter, upsertCharacter } from '@/lib/character-os';
import type { CharacterRecord } from '@/lib/character-os';
import { CUSTOM_ROLEPLAY_PERSONA_ID } from '@/lib/roleplay';

type CharacterPersonaSectionProps = {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
};

/**
 * Part / persona for an existing Cast lead — Story continues this, it does not re-cast.
 */
export default function CharacterPersonaSection({
  character,
  onUpdated,
}: CharacterPersonaSectionProps) {
  const personaId = character.personaId?.trim() || '';
  const customPersona = character.customPersona ?? '';

  const persist = (next: { personaId: string; customPersona?: string }) => {
    const personaIdNext = next.personaId.trim();
    const customNext =
      personaIdNext === CUSTOM_ROLEPLAY_PERSONA_ID
        ? next.customPersona?.trim() || undefined
        : undefined;
    upsertCharacter({
      ...character,
      personaId: personaIdNext || undefined,
      customPersona: customNext,
    });
    const saved = getCharacter(character.id);
    if (saved) {
      onUpdated?.(saved);
    }
  };

  return (
    <ToolSection
      title="Part"
      description="Optional Story archetype for this Cast lead. Story continues whatever you set here."
      data-testid="cast-persona-section"
    >
      <CastPersonaPartChips
        personaId={personaId}
        customPersona={customPersona}
        testIdPrefix="cast-home-persona"
        onChange={persist}
      />
    </ToolSection>
  );
}
