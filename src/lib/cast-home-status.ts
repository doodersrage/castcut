import { CUSTOM_ROLEPLAY_PERSONA_ID, getRoleplayArchetype } from '@/lib/roleplay';

export type CastHomeStatusInput = {
  hasPlate: boolean;
  personaId?: string | null;
  customPersona?: string | null;
  lookCount: number;
  filmCount: number;
  stillCount?: number;
  plateStatus?: string | null;
  plateError?: string | null;
};

export type CastHomeStatus = {
  statusLine: string;
  plateHint: string | null;
  plateError: string | null;
};

/** Part label for Cast status / roster chips. */
export function castPartLabel(
  personaId?: string | null,
  customPersona?: string | null
): string | null {
  const id = personaId?.trim() || '';
  if (!id) {
    return null;
  }
  if (id === CUSTOM_ROLEPLAY_PERSONA_ID) {
    const custom = customPersona?.trim();
    return custom ? `Custom · ${custom.slice(0, 40)}` : 'Custom part';
  }
  return getRoleplayArchetype(id)?.label ?? null;
}

/**
 * Build the Cast home status strip — plate · Part · looks · films.
 * Warns when Outfit/Day need a look plate.
 */
export function buildCastHomeStatus(input: CastHomeStatusInput): CastHomeStatus {
  const part = castPartLabel(input.personaId, input.customPersona);
  const looks = input.lookCount === 1 ? '1 look' : `${Math.max(0, input.lookCount)} looks`;
  const films = input.filmCount === 1 ? '1 film' : `${Math.max(0, input.filmCount)} films`;
  const plate = input.hasPlate ? 'plate ready' : 'no plate';
  const parts = [plate, part, looks, films].filter(Boolean);
  const stills =
    typeof input.stillCount === 'number' && input.stillCount > 0
      ? input.stillCount === 1
        ? '1 still'
        : `${input.stillCount} stills`
      : null;
  if (stills) {
    parts.push(stills);
  }

  return {
    statusLine: parts.join(' · '),
    plateHint: input.hasPlate
      ? null
      : 'Outfit and Day need a look plate — upload one below or Choose from Gallery.',
    plateError: input.plateError?.trim() || null,
  };
}

/** Roster caption chips — looks + optional No plate warning. */
export function castRosterReadinessLine(input: {
  lookCount: number;
  hasPlate: boolean;
  trigger?: string | null;
  loraCount?: number;
}): { line: string; noPlate: boolean } {
  const bits: string[] = [`${input.lookCount} look${input.lookCount === 1 ? '' : 's'}`];
  if (!input.hasPlate) {
    bits.push('No plate');
  }
  const trigger = input.trigger?.trim();
  if (trigger) {
    bits.push(trigger);
  }
  if (input.loraCount && input.loraCount > 0) {
    bits.push(`${input.loraCount} LoRA`);
  }
  return { line: bits.join(' · '), noPlate: !input.hasPlate };
}
