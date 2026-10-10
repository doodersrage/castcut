'use client';

import { useState } from 'react';
import { TextInput } from '@/components/ui/Field';
import { normalizeSpokenLine, SPOKEN_LINE_MAX_CHARS } from '@/lib/ltx25-renderer';

/**
 * What the lead says in a clip (Story scene / Day slot). A line makes Animate render a talking
 * clip on LTX-2.5 — the words spoken to the camera, lip-synced, saved with sound. Saves on blur
 * or Enter. A suggestion (the Story writer's, or "Suggest a line" from the LLM) is one tap — a
 * clip only talks when the player puts a line in.
 */
export default function SpokenLineField({
  line,
  disabled = false,
  onSave,
  testId = 'spoken-line',
  hasVoice = false,
  suggestion,
  onSuggest,
}: {
  line?: string;
  disabled?: boolean;
  onSave: (line: string) => void;
  testId?: string;
  /** The Cast has a voice sample — say the line will use it. */
  hasVoice?: boolean;
  /** A line already written for this scene (Story's writer). */
  suggestion?: string;
  /** Ask for a fresh line (LLM). Rejects with a message to show. */
  onSuggest?: () => Promise<string>;
}) {
  const [value, setValue] = useState(line ?? '');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commit = (raw = value) => {
    const next = normalizeSpokenLine(raw);
    setValue(next);
    if (next !== (line ?? '')) onSave(next);
  };
  const offered = suggestion?.trim() && suggestion.trim() !== value.trim() ? suggestion.trim() : '';
  const ask = async () => {
    if (!onSuggest) return;
    setAsking(true);
    setError(null);
    try {
      commit(await onSuggest());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suggest a line.');
    } finally {
      setAsking(false);
    }
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <label className="type-caption block text-[var(--text-muted)]" htmlFor={`${testId}-input`}>
        Line in the clip (optional)
      </label>
      <TextInput
        id={`${testId}-input`}
        value={value}
        disabled={disabled || asking}
        maxLength={SPOKEN_LINE_MAX_CHARS + 10}
        placeholder="Honestly? Best part of my day."
        data-testid={`${testId}-input`}
        onChange={event => setValue(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      {offered || onSuggest ? (
        <div className="flex flex-wrap items-center gap-2">
          {offered ? (
            <button
              type="button"
              className="ui-chip max-w-full truncate text-left"
              disabled={disabled || asking}
              title="Use this line"
              data-testid={`${testId}-use-suggestion`}
              onClick={() => commit(offered)}
            >
              Use “{offered}”
            </button>
          ) : null}
          {onSuggest ? (
            <button
              type="button"
              className="ui-chip"
              disabled={disabled || asking}
              data-testid={`${testId}-suggest`}
              onClick={() => void ask()}
            >
              {asking ? 'Writing a line…' : value.trim() ? 'Another line' : 'Suggest a line'}
            </button>
          ) : null}
          {value.trim() ? (
            <button
              type="button"
              className="ui-chip"
              disabled={disabled || asking}
              data-testid={`${testId}-clear`}
              onClick={() => commit('')}
            >
              No line
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
      <p className="type-caption text-[var(--text-muted)]">
        {value.trim()
          ? `Animate makes a talking clip: they say this to the camera, with sound (LTX-2.5, about 5 s)${hasVoice ? ', in their voice' : ''}.`
          : 'Add a few words and Animate makes a talking clip with sound.'}
      </p>
    </div>
  );
}
