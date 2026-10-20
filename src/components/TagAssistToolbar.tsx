'use client';

import { useState } from 'react';
import { applyTagAssistToSelection } from '@/lib/prompt/tag-assist';

type TagAssistToolbarProps = {
  value: string;
  onChange: (value: string) => void;
  textareaId?: string;
};

export default function TagAssistToolbar({
  value,
  onChange,
  textareaId = 'generated-prompt-editor',
}: TagAssistToolbarProps) {
  const [hint, setHint] = useState('');

  const apply = (transform: 'emphasis' | 'deemphasis' | 'tags') => {
    const element = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!element) {
      setHint(`Could not find prompt editor (#${textareaId}).`);
      return;
    }
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    const selected = value.slice(start, end).trim();
    if (!selected) {
      setHint('Select text in the prompt editor first.');
      element.focus();
      return;
    }
    const result = applyTagAssistToSelection(value, start, end, transform);
    setHint('');
    onChange(result.nextValue);
    window.requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => apply('emphasis')}
          title="Wrap selection as (phrase:1.2) — SD tag weight syntax"
          className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Emphasize selection
        </button>
        <button
          type="button"
          onClick={() => apply('deemphasis')}
          title="Wrap selection as [phrase:0.8] — lower SD tag weight"
          className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          De-emphasize selection
        </button>
        <button
          type="button"
          onClick={() => apply('tags')}
          title="Convert selection to comma-separated tags"
          className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Tags from selection
        </button>
      </div>
      {hint ? <p className="text-[11px] text-[var(--tint-warning-text)]">{hint}</p> : null}
    </div>
  );
}
