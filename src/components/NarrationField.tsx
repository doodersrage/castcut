'use client';

import { useState } from 'react';
import { FieldLabel, TextArea } from '@/components/ui/Field';

/**
 * Voice-over for a shot in the film (a Day slot, a Story scene) — not said on screen, recorded when the film is
 * cut (film-narration.ts), in the Cast's kept voice when they have one. Saved on blur.
 */
export default function NarrationField({
  value,
  onSave,
  onSuggest,
  testId = 'day-slot-narration',
}: {
  value: string;
  testId?: string;
  onSave: (next: string) => void;
  /** Ask the LLM for voice-over that fits this shot and follows the Day's narration so far. */
  onSuggest?: () => Promise<string>;
}) {
  const [draft, setDraft] = useState(value);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggest = async () => {
    if (!onSuggest) return;
    setAsking(true);
    setError(null);
    try {
      const next = await onSuggest();
      setDraft(next);
      onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suggest narration.');
    } finally {
      setAsking(false);
    }
  };
  return (
    <label className="space-y-1.5">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Narration</FieldLabel>
        {onSuggest ? (
          <button
            type="button"
            className="ui-chip"
            disabled={asking}
            data-testid={`${testId}-suggest`}
            onClick={event => {
              event.preventDefault();
              void suggest();
            }}
          >
            {asking ? 'Writing…' : draft.trim() ? 'Another narration' : 'Suggest a narration'}
          </button>
        ) : null}
      </span>
      <TextArea
        rows={2}
        maxLength={140}
        data-testid={testId}
        value={draft}
        className="min-h-[3.5rem] [field-sizing:content]"
        placeholder="Voice-over for the film, e.g. Some mornings the city feels like it was made for me."
        onChange={event => setDraft(event.target.value)}
        onBlur={() => onSave(draft.replace(/\s+/g, ' ').trim())}
      />
      <span className="type-caption text-[var(--text-muted)]">
        Heard over this shot when the film is cut, not said on screen — in the Cast&apos;s voice
        when one is kept.
      </span>
      {error ? (
        <span className="type-caption block ui-status-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
