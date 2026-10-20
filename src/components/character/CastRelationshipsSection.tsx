'use client';

import { useSyncExternalStore } from 'react';
import { SelectInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_RELATION_KINDS,
  castRelationOf,
  saveCastRelationship,
  type CastRelationKind,
} from '@/lib/cast/relationships';
import { loadCharacters, subscribeCharacters, type CharacterRecord } from '@/lib/character/os';

const EMPTY: CharacterRecord[] = [];
let snapshot: CharacterRecord[] = EMPTY;
let snapshotKey = '';

function castListSnapshot(): CharacterRecord[] {
  const list = loadCharacters();
  const key = list.map(item => `${item.id}:${item.updatedAt}`).join('|');
  if (key !== snapshotKey) {
    snapshotKey = key;
    snapshot = list;
  }
  return snapshot;
}

/**
 * Cast → People in their life (cast-relationships.ts): what each other Cast is to them. Two-person
 * Day stills say it (siblings aren't a couple), and family never plays the partner in Suggestive,
 * Date night or the adult moods. Set on one, the other Cast gets the mirror.
 */
export default function CastRelationshipsSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const all = useSyncExternalStore(subscribeCharacters, castListSnapshot, () => EMPTY);
  const others = all.filter(item => item.id !== character.id);
  if (!others.length) return null;
  return (
    <ToolSection
      title="People in their life"
      description="Who the rest of your Cast are to them. Two-person Day stills say it, so a sister isn't drawn as a date — and family never plays the partner in Suggestive, Date night or the adult moods."
      data-testid="cast-relationships-section"
    >
      <div className="space-y-2">
        {others.map(other => {
          const kind = castRelationOf(character, other.id);
          return (
            <label
              key={other.id}
              className="flex flex-wrap items-center gap-3 text-sm"
              data-testid={`cast-relationship-${other.id}`}
            >
              <span className="w-40 truncate text-[var(--text-primary)]">{other.name}</span>
              <SelectInput
                aria-label={`What ${other.name} is to ${character.name}`}
                value={kind ?? ''}
                onChange={event => {
                  const next = saveCastRelationship(
                    character.id,
                    other.id,
                    (event.target.value || null) as CastRelationKind | null
                  );
                  if (next) onUpdated?.(next);
                }}
              >
                <option value="">—</option>
                {CAST_RELATION_KINDS.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </SelectInput>
            </label>
          );
        })}
      </div>
    </ToolSection>
  );
}
