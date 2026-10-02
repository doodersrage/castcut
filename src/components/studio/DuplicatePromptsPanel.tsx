'use client';

import { useMemo, useState } from 'react';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import { findDuplicatePrompts } from '@/lib/prompt-duplicate-detection';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { useGenerateEmptyCta } from '@/hooks/useEmptyCta';
import { Button } from '@/components/ui/Button';

export default function DuplicatePromptsPanel() {
  const generateCta = useGenerateEmptyCta();
  const { entries, removeEntries } = usePromptHistory();
  const [threshold, setThreshold] = useState(0.85);
  const groups = useMemo(
    () =>
      findDuplicatePrompts(
        entries.map(entry => ({ id: entry.id, prompt: entry.prompt })),
        threshold
      ),
    [entries, threshold]
  );

  return (
    <ToolSection title="Duplicate prompts">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Finds near-identical history entries by token overlap.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        Similarity threshold
        <input
          type="range"
          min={0.7}
          max={0.95}
          step={0.05}
          value={threshold}
          onChange={event => setThreshold(Number(event.target.value))}
        />
        <span>{Math.round(threshold * 100)}%</span>
      </label>
      {groups.length === 0 ? (
        <EmptyState
          compact
          icon="compare"
          title="No duplicate clusters"
          description="Near-identical history prompts will group here. Save more variations or lower the similarity threshold."
          action={entries.length === 0 ? generateCta : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {groups.slice(0, 12).map(group => (
            <li
              key={group.ids.join('-')}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[var(--text-muted)]">
                  {group.ids.length} entries · {Math.round(group.similarity * 100)}% similar
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${group.ids.length} near-duplicate entries? This cannot be undone.`
                      )
                    ) {
                      removeEntries(group.ids);
                    }
                  }}
                >
                  Delete cluster
                </Button>
              </div>
              <p className="mt-1 line-clamp-2 text-[var(--text-secondary)]">{group.prompt}</p>
            </li>
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
