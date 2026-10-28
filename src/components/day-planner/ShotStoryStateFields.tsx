'use client';

import { useState } from 'react';
import { ChipButton, FieldLabel, TextInput } from '@/components/ui/Field';
import {
  STORY_DAY_MAX,
  STORY_STATE_EMOTION_MAX,
  normalizeStoryState,
  storyItemsFromText,
  type ShotStoryState,
  type StoryStateItem,
} from '@/lib/day/story-state';

const listText = (items?: readonly StoryStateItem[]) =>
  (items ?? []).map(item => item.text).join(', ');

/**
 * The shot's story state (M8 T5): what she carries, what has changed about her, how she feels and
 * which day of the story it is — said in the still's prompt and on Cut's shot card. Lists are
 * comma separated and kept when the field is left. An item marked "carries over" holds in the
 * shots after this one at the same story time; Cut flags one that drops it (M8 T6).
 */
export default function ShotStoryStateFields({
  state,
  onChange,
}: {
  state: ShotStoryState | undefined;
  onChange: (next: ShotStoryState | undefined) => void;
}) {
  const [drafts, setDrafts] = useState<{ carries?: string; changes?: string; emotion?: string }>(
    {}
  );
  const save = (patch: Partial<ShotStoryState>) =>
    onChange(normalizeStoryState({ ...state, ...patch }));
  const carryChips = (key: 'carries' | 'changes') => {
    const items = state?.[key] ?? [];
    if (!items.length || drafts[key] !== undefined) return null;
    return (
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Carries over to the next shots"
      >
        {items.map(item => (
          <ChipButton
            key={item.text}
            active={Boolean(item.carriesOver)}
            data-testid={`shot-state-carry-${item.text}`}
            title="Holds in the shots after this one at the same story time, until it is put down"
            onClick={() =>
              save({
                [key]: items.map(entry =>
                  entry === item
                    ? entry.carriesOver
                      ? { text: entry.text }
                      : { text: entry.text, carriesOver: true }
                    : entry
                ),
              })
            }
          >
            {item.carriesOver ? `↪ ${item.text} carries over` : `${item.text} — this shot only`}
          </ChipButton>
        ))}
      </div>
    );
  };
  const commitList = (key: 'carries' | 'changes') => {
    const draft = drafts[key];
    if (draft === undefined) return;
    save({ [key]: storyItemsFromText(draft, state?.[key]) });
    setDrafts(({ [key]: _dropped, ...rest }) => rest);
  };

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="shot-story-state">
      <legend className="type-label mb-1">Story state</legend>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <FieldLabel>She carries</FieldLabel>
          <TextInput
            data-testid="shot-state-carries"
            placeholder="the red umbrella, a paper bag"
            value={drafts.carries ?? listText(state?.carries)}
            onChange={event =>
              setDrafts(previous => ({ ...previous, carries: event.target.value }))
            }
            onBlur={() => commitList('carries')}
          />
        </label>
        {carryChips('carries')}
      </div>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <FieldLabel>What has changed</FieldLabel>
          <TextInput
            data-testid="shot-state-changes"
            placeholder="left hand bandaged, wet hair"
            value={drafts.changes ?? listText(state?.changes)}
            onChange={event =>
              setDrafts(previous => ({ ...previous, changes: event.target.value }))
            }
            onBlur={() => commitList('changes')}
          />
        </label>
        {carryChips('changes')}
      </div>
      <label className="space-y-1.5">
        <FieldLabel>How she feels</FieldLabel>
        <TextInput
          data-testid="shot-state-emotion"
          placeholder="anxious, relieved…"
          maxLength={STORY_STATE_EMOTION_MAX}
          value={drafts.emotion ?? state?.emotion ?? ''}
          onChange={event => setDrafts(previous => ({ ...previous, emotion: event.target.value }))}
          onBlur={() => {
            if (drafts.emotion === undefined) return;
            save({ emotion: drafts.emotion });
            setDrafts(({ emotion: _dropped, ...rest }) => rest);
          }}
        />
      </label>
      <label className="space-y-1.5">
        <FieldLabel>Story day</FieldLabel>
        <TextInput
          type="number"
          min={1}
          max={STORY_DAY_MAX}
          inputMode="numeric"
          data-testid="shot-state-day"
          title="Which day of the story this shot is — story order, not where it sits in the edit"
          value={state?.storyDay ?? ''}
          onChange={event => {
            const day = Number.parseInt(event.target.value, 10);
            save({ storyDay: Number.isFinite(day) ? day : undefined });
          }}
        />
      </label>
    </fieldset>
  );
}
