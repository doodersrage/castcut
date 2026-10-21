'use client';

import { useState } from 'react';
import { applyTagAssistToSelection } from '@/lib/prompt/tag-assist';
import { Button } from '@/components/ui/Button';

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
        <Button
          onClick={() => apply('emphasis')}
          title="Wrap selection as (phrase:1.2) — SD tag weight syntax"
          variant="pill"
        >
          Emphasize selection
        </Button>
        <Button
          onClick={() => apply('deemphasis')}
          title="Wrap selection as [phrase:0.8] — lower SD tag weight"
          variant="pill"
        >
          De-emphasize selection
        </Button>
        <Button
          onClick={() => apply('tags')}
          title="Convert selection to comma-separated tags"
          variant="pill"
        >
          Tags from selection
        </Button>
      </div>
      {hint ? <p className="text-2xs text-[var(--tint-warning-text)]">{hint}</p> : null}
    </div>
  );
}
