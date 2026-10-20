'use client';

import { useMemo, useState } from 'react';
import { diffWorkflowJson, formatWorkflowForDiff } from '@/lib/workflow/diff';
import { MonoTextArea } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';

export default function WorkflowDiffPanel() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const diff = useMemo(() => {
    if (!left.trim() || !right.trim()) {
      return null;
    }
    return diffWorkflowJson(formatWorkflowForDiff(left), formatWorkflowForDiff(right));
  }, [left, right]);

  return (
    <ToolSection title="Workflow diff">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Compare two workflow JSON files line-by-line.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <MonoTextArea
          value={left}
          onChange={event => setLeft(event.target.value)}
          rows={12}
          placeholder="Workflow A JSON"
        />
        <MonoTextArea
          value={right}
          onChange={event => setRight(event.target.value)}
          rows={12}
          placeholder="Workflow B JSON"
        />
      </div>
      {diff ? (
        <pre className="ui-code-block mt-3 max-h-64 overflow-auto p-3 text-xs">
          {diff.lines.map((line, index) => (
            <div
              key={`${index}-${line.type}`}
              className={
                line.type === 'add'
                  ? 'text-[var(--tint-success-text)]'
                  : line.type === 'remove'
                    ? 'text-[var(--tint-danger-text)]'
                    : 'text-[var(--text-muted)]'
              }
            >
              {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : ''}
              {line.text}
            </div>
          ))}
        </pre>
      ) : null}
    </ToolSection>
  );
}
