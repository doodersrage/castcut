'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_PROP_LOOKS_MAX,
  CAST_PROP_NAME_MAX,
  CAST_PROP_PRESETS,
  CAST_PROPS_MAX,
  castPropSentence,
  newCastPropId,
  normalizeCastProps,
  saveCastProps,
  type CastProp,
} from '@/lib/cast/props';
import type { CharacterRecord } from '@/lib/character-os';

/**
 * Cast → Props: her phone, bag, car, dog… described once (cast-props.ts). A Day still whose beat
 * mentions one gets a line saying what hers looks like.
 */
export default function CastPropsSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const saved = normalizeCastProps(character.props) ?? [];
  const [drafts, setDrafts] = useState<Record<string, Partial<CastProp>>>({});
  const save = (props: CastProp[]) => {
    const next = saveCastProps(character.id, props);
    if (next) onUpdated?.(next);
  };
  const commit = (prop: CastProp) => {
    const draft = drafts[prop.id];
    if (draft) save(saved.map(other => (other.id === prop.id ? { ...prop, ...draft } : other)));
    setDrafts(({ [prop.id]: _dropped, ...rest }) => rest);
  };
  const taken = new Set(saved.map(prop => prop.name));
  const full = saved.length >= CAST_PROPS_MAX;

  return (
    <ToolSection
      title="Props"
      description="Things that are theirs — phone, bag, car, dog. When a Day beat mentions one, the still shows theirs, the same every time."
      data-testid="cast-props-section"
    >
      <div className="space-y-3">
        {saved.map(prop => {
          const draft = { ...prop, ...drafts[prop.id] };
          return (
            <div
              key={prop.id}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
              data-testid={`cast-prop-${prop.name}`}
            >
              <TextInput
                className="min-w-0"
                aria-label="What it is"
                maxLength={CAST_PROP_NAME_MAX}
                value={draft.name}
                onChange={event =>
                  setDrafts(previous => ({
                    ...previous,
                    [prop.id]: { ...previous[prop.id], name: event.target.value },
                  }))
                }
                onBlur={() => commit(prop)}
              />
              <TextInput
                className="min-w-0"
                aria-label={`What their ${prop.name} looks like`}
                maxLength={CAST_PROP_LOOKS_MAX}
                value={draft.looks}
                onChange={event =>
                  setDrafts(previous => ({
                    ...previous,
                    [prop.id]: { ...previous[prop.id], looks: event.target.value },
                  }))
                }
                onBlur={() => commit(prop)}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save(saved.filter(other => other.id !== prop.id))}
              >
                Remove
              </Button>
            </div>
          );
        })}
        {saved.length ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="cast-props-preview">
            In a still that mentions it: {saved.map(castPropSentence).join('. ')}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a prop">
          {CAST_PROP_PRESETS.filter(preset => !taken.has(preset.name)).map(preset => (
            <ChipButton
              key={preset.name}
              active={false}
              disabled={full}
              data-testid={`cast-prop-add-${preset.name}`}
              onClick={() => save([...saved, { id: newCastPropId(), ...preset }])}
            >
              + {preset.name}
            </ChipButton>
          ))}
        </div>
      </div>
    </ToolSection>
  );
}
