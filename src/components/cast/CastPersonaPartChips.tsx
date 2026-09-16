'use client';

import { useMemo, useState } from 'react';
import { ChipButton, TextArea, TextInput } from '@/components/ui/Field';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPE_FEATURED_IDS,
  ROLEPLAY_ARCHETYPES,
} from '@/lib/roleplay';

type CastPersonaPartChipsProps = {
  personaId: string;
  customPersona?: string;
  disabled?: boolean;
  onChange: (next: { personaId: string; customPersona?: string }) => void;
  /** Compact Film-create layout: featured chips only until expanded. */
  testIdPrefix?: string;
};

const FEATURED_ID_SET = new Set<string>(ROLEPLAY_ARCHETYPE_FEATURED_IDS);

/**
 * Part / archetype chips for Cast identity creation (Film create + Cast home).
 * Story continues whatever Part was set here — it does not own a separate cast island.
 */
export default function CastPersonaPartChips({
  personaId,
  customPersona,
  disabled = false,
  onChange,
  testIdPrefix = 'cast-persona',
}: CastPersonaPartChipsProps) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');

  const featured = useMemo(
    () =>
      ROLEPLAY_ARCHETYPE_FEATURED_IDS.map(id =>
        ROLEPLAY_ARCHETYPES.find(entry => entry.id === id)
      ).filter((entry): entry is (typeof ROLEPLAY_ARCHETYPES)[number] => Boolean(entry)),
    []
  );

  const filteredAll = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return ROLEPLAY_ARCHETYPES;
    }
    return ROLEPLAY_ARCHETYPES.filter(
      entry =>
        entry.label.toLowerCase().includes(needle) ||
        entry.prompt.toLowerCase().includes(needle) ||
        entry.id.includes(needle)
    );
  }, [query]);

  const visible = useMemo(() => {
    if (showAll) {
      return filteredAll;
    }
    if (!personaId || personaId === CUSTOM_ROLEPLAY_PERSONA_ID || FEATURED_ID_SET.has(personaId)) {
      return featured;
    }
    const selected = ROLEPLAY_ARCHETYPES.find(entry => entry.id === personaId);
    return selected ? [...featured, selected] : featured;
  }, [showAll, filteredAll, featured, personaId]);

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption text-[var(--text-muted)]">Part (optional)</p>
        <button
          type="button"
          disabled={disabled}
          className="type-caption text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
          data-testid={`${testIdPrefix}-toggle-all`}
          onClick={() => {
            setShowAll(open => !open);
            if (showAll) {
              setQuery('');
            }
          }}
        >
          {showAll ? 'Show fewer' : `Show all (${ROLEPLAY_ARCHETYPES.length})`}
        </button>
      </div>
      {showAll ? (
        <TextInput
          value={query}
          disabled={disabled}
          placeholder="Search parts…"
          onChange={event => setQuery(event.target.value)}
          aria-label="Search Cast parts"
          data-testid={`${testIdPrefix}-search`}
        />
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {visible.map(entry => (
          <ChipButton
            key={entry.id}
            active={personaId === entry.id}
            disabled={disabled}
            data-testid={`${testIdPrefix}-chip-${entry.id}`}
            onClick={() => {
              if (personaId === entry.id) {
                onChange({ personaId: '', customPersona: undefined });
                return;
              }
              onChange({ personaId: entry.id, customPersona: undefined });
            }}
          >
            {entry.label}
          </ChipButton>
        ))}
        <ChipButton
          active={personaId === CUSTOM_ROLEPLAY_PERSONA_ID}
          disabled={disabled}
          data-testid={`${testIdPrefix}-chip-custom`}
          onClick={() =>
            onChange({
              personaId: CUSTOM_ROLEPLAY_PERSONA_ID,
              customPersona: customPersona ?? '',
            })
          }
        >
          Custom…
        </ChipButton>
      </div>
      {personaId === CUSTOM_ROLEPLAY_PERSONA_ID ? (
        <TextArea
          value={customPersona ?? ''}
          disabled={disabled}
          rows={2}
          placeholder="e.g. a shy lighthouse keeper who talks to gulls"
          data-testid={`${testIdPrefix}-custom`}
          onChange={event =>
            onChange({
              personaId: CUSTOM_ROLEPLAY_PERSONA_ID,
              customPersona: event.target.value,
            })
          }
        />
      ) : null}
    </div>
  );
}
