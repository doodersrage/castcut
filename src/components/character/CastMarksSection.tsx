'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, SelectInput, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_MARK_PRESETS,
  CAST_MARK_SPOTS,
  CAST_MARK_WHAT_MAX,
  CAST_MARKS_MAX,
  castMarkPhrase,
  newCastMarkId,
  normalizeCastMarks,
  saveCastMarks,
  type CastMark,
  type CastMarkSpot,
} from '@/lib/cast/marks';
import type { CharacterRecord } from '@/lib/character-os';

/**
 * Cast → Marks: tattoos, scars, moles, freckles, glasses (cast-marks.ts). Each goes into a Day
 * still's words when that part of them shows, and into a plate made from the description.
 */
export default function CastMarksSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  return (
    <ToolSection
      title="Marks"
      description="Tattoos, scars, moles, freckles, glasses — kept in every Day still where that part of them shows (an arm tattoo stays out under long sleeves). A plate made from the description shows them too."
      data-testid="cast-marks-section"
    >
      <CastMarksEditor
        marks={normalizeCastMarks(character.marks) ?? []}
        onChange={marks => {
          const next = saveCastMarks(character.id, marks);
          if (next) onUpdated?.(next);
        }}
      />
    </ToolSection>
  );
}

/**
 * The marks list with its preset chips — controlled, so Film's create form can hold marks before
 * the Cast exists (they go onto the first plate) and Cast home saves them as they change.
 */
export function CastMarksEditor({
  marks: saved,
  onChange: save,
}: {
  marks: CastMark[];
  onChange: (marks: CastMark[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const add = (preset?: (typeof CAST_MARK_PRESETS)[number]) =>
    save([
      ...saved,
      {
        id: newCastMarkId(),
        what: preset?.what ?? 'a small tattoo',
        where: preset?.where ?? 'left arm',
      },
    ]);
  const update = (id: string, patch: Partial<CastMark>) =>
    save(saved.map(mark => (mark.id === id ? { ...mark, ...patch } : mark)));
  const full = saved.length >= CAST_MARKS_MAX;

  return (
    <div className="space-y-3">
      {saved.map(mark => (
        <div
          key={mark.id}
          className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
          data-testid={`cast-mark-${mark.id}`}
        >
          <TextInput
            className="min-w-0"
            aria-label="What the mark is"
            maxLength={CAST_MARK_WHAT_MAX}
            value={drafts[mark.id] ?? mark.what}
            onChange={event =>
              setDrafts(previous => ({ ...previous, [mark.id]: event.target.value }))
            }
            onBlur={() => {
              const text = drafts[mark.id]?.trim();
              if (text && text !== mark.what) update(mark.id, { what: text });
              setDrafts(({ [mark.id]: _dropped, ...rest }) => rest);
            }}
          />
          <SelectInput
            aria-label="Where"
            value={mark.where}
            onChange={event => update(mark.id, { where: event.target.value as CastMarkSpot })}
          >
            {CAST_MARK_SPOTS.map(spot => (
              <option key={spot} value={spot}>
                {spot}
              </option>
            ))}
          </SelectInput>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => save(saved.filter(other => other.id !== mark.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      {saved.length ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="cast-marks-preview">
          In a still: {saved.map(castMarkPhrase).join('; ')}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Add a mark">
        {CAST_MARK_PRESETS.map(preset => (
          <ChipButton
            key={preset.label}
            active={false}
            disabled={full}
            data-testid={`cast-mark-add-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => add(preset)}
          >
            + {preset.label}
          </ChipButton>
        ))}
        <ChipButton active={false} disabled={full} onClick={() => add()}>
          + Other
        </ChipButton>
      </div>
    </div>
  );
}
