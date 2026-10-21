'use client';

import { useId, useMemo, useState } from 'react';
import type { StorageNamespaceConflict, MergeChoice } from '@/lib/storage/merge';
import type { StorageNamespace } from '@/lib/storage/namespaces';
import { previewMergeChoices } from '@/lib/storage/merge-preview';
import BrandBars from '@/components/BrandBars';
import BrandMark from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

type Props = {
  conflicts: StorageNamespaceConflict[];
  initialChoices?: Partial<Record<StorageNamespace, MergeChoice>>;
  onResolve: (choices: Partial<Record<StorageNamespace, MergeChoice>>) => void;
  onDismiss: () => void;
};

export default function StorageSyncConflictModal({
  conflicts,
  initialChoices,
  onResolve,
  onDismiss,
}: Props) {
  const [choices, setChoices] = useState<Partial<Record<StorageNamespace, MergeChoice>>>(
    () => initialChoices ?? {}
  );
  const dryRun = useMemo(() => previewMergeChoices(conflicts, choices), [choices, conflicts]);
  const titleId = useId();

  // Escape means "Decide later"; a stray backdrop click does not dismiss a merge decision.
  return (
    <Dialog
      open
      onClose={onDismiss}
      labelledBy={titleId}
      closeOnBackdrop={false}
      layer="dialogOverLightbox"
      size="lg"
      testId="storage-sync-conflict"
      backdropClassName="ui-overlay"
      panelClassName="page-enter ui-modal-card"
      bodyClassName="min-h-0 space-y-4 overflow-y-auto overscroll-contain"
    >
      <div className="flex items-start justify-between gap-3">
        <BrandMark
          size={32}
          withWordmark
          wordmarkClassName="type-brand type-heading tracking-tight"
        />
        <p className="ui-meta flex items-center gap-1.5">
          <BrandBars />
          Sync
        </p>
      </div>
      <div>
        <h2 id={titleId} className="type-display text-[1.35rem]">
          Storage sync conflict
        </h2>
        <p className="mt-1 type-body">
          Browser and server data differ. Choose how to merge each namespace. Preview below is a
          dry-run from counts (no write yet).
        </p>
      </div>
      <ul className="space-y-3">
        {conflicts.map(conflict => (
          <li
            key={conflict.namespace}
            className="rounded-xl border border-[var(--border-subtle)] p-3"
          >
            <p className="text-sm font-medium text-[var(--text-primary)]">{conflict.namespace}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Local: {conflict.localCount ?? 0} · Server: {conflict.serverCount ?? 0}
              {conflict.detail ? ` · ${conflict.detail}` : ''}
            </p>
            {conflict.mapDiffKeys?.length ? (
              <div className="ui-alert-warning mt-2 space-y-1.5 text-xs">
                <p>
                  Diverging maps: {conflict.mapDiffKeys.join(', ')}. Choose{' '}
                  <span className="font-medium">Keep local</span> /{' '}
                  <span className="font-medium">Prefer server</span>, or{' '}
                  <span className="font-medium">Merge</span> to union keys (local wins on overlap).
                </p>
                {conflict.mapDiffSamples?.length ? (
                  <ul className="ui-code-block space-y-1 p-2 text-[10px]" data-tone="muted">
                    {conflict.mapDiffSamples.map(sample => (
                      <li key={`${sample.mapKey}:${sample.entryKey}`}>
                        <span className="text-[var(--text-muted)]">{sample.mapKey}</span>.
                        {sample.entryKey}
                        <br />
                        local: {sample.localValue}
                        <br />
                        server: {sample.serverValue}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {(['local', 'server', 'merge'] as MergeChoice[]).map(choice => (
                <button
                  key={choice}
                  type="button"
                  onClick={() =>
                    setChoices(prev => ({
                      ...prev,
                      [conflict.namespace as StorageNamespace]: choice,
                    }))
                  }
                  className="ui-chip"
                  data-active={
                    choices[conflict.namespace as StorageNamespace] === choice ? 'true' : 'false'
                  }
                >
                  {choice === 'local'
                    ? 'Keep local'
                    : choice === 'server'
                      ? 'Prefer server'
                      : 'Merge / Diff union'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {dryRun.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
          <p className="text-xs font-medium text-[var(--text-secondary)]">Dry-run preview</p>
          <ul className="mt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
            {dryRun.map(row => (
              <li key={row.namespace}>
                <span className="text-[var(--text-secondary)]">{row.namespace}</span>
                {' · '}
                {row.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onResolve(choices)}
          disabled={conflicts.some(c => !choices[c.namespace as StorageNamespace])}
        >
          Apply merge
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Decide later
        </Button>
      </div>
    </Dialog>
  );
}
