'use client';

import { useState } from 'react';
import { TextInput } from '@/components/ui/Field';
import { normalizeSpokenLine, SPOKEN_LINE_MAX_CHARS } from '@/lib/ltx25-renderer';

/**
 * What the lead says in a clip (Story scene / Day slot). A line makes Animate render a talking
 * clip on LTX-2.5 — the words spoken to the camera, lip-synced, saved with sound. Saves on blur
 * or Enter.
 */
export default function SpokenLineField({
  line,
  disabled = false,
  onSave,
  testId = 'spoken-line',
  hasVoice = false,
}: {
  line?: string;
  disabled?: boolean;
  onSave: (line: string) => void;
  testId?: string;
  /** The Cast has a voice sample — say the line will use it. */
  hasVoice?: boolean;
}) {
  const [value, setValue] = useState(line ?? '');
  const commit = () => {
    const next = normalizeSpokenLine(value);
    setValue(next);
    if (next !== (line ?? '')) onSave(next);
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <label className="type-caption block text-[var(--text-muted)]" htmlFor={`${testId}-input`}>
        Line in the clip (optional)
      </label>
      <TextInput
        id={`${testId}-input`}
        value={value}
        disabled={disabled}
        maxLength={SPOKEN_LINE_MAX_CHARS + 10}
        placeholder="Honestly? Best part of my day."
        data-testid={`${testId}-input`}
        onChange={event => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <p className="type-caption text-[var(--text-muted)]">
        {value.trim()
          ? `Animate makes a talking clip: they say this to the camera, with sound (LTX-2.5, about 5 s)${hasVoice ? ', in their voice' : ''}.`
          : 'Add a few words and Animate makes a talking clip with sound.'}
      </p>
    </div>
  );
}
