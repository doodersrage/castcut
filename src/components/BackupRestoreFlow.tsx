'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import {
  backupAgeLabel,
  compareBackup,
  summarizeBackup,
  type BackupCompareRow,
  type BackupSummary,
} from '@/lib/storage/backup-preview';
import type { StudioBackup } from '@/lib/storage/studio-backup';

type Pending = {
  backup: StudioBackup;
  name: string;
  file: BackupSummary;
  rows: BackupCompareRow[];
};

/**
 * Restore from a backup file, guided: the file is read first and shown beside what is here
 * (Cast, films, renders, history, workflows — rows where it has fewer are marked), and the
 * default restore downloads a copy of what is here before it overwrites anything.
 */
export default function BackupRestoreFlow({
  label = 'Restore backup',
  className = 'ui-btn ui-btn-secondary cursor-pointer',
  testId = 'backup-restore',
  onRestored,
  onError,
}: {
  label?: string;
  className?: string;
  testId?: string;
  onRestored: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const titleId = useId();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    try {
      const { exportStudioBackup, parseStudioBackupFile } =
        await import('@/lib/storage/studio-backup');
      const backup = parseStudioBackupFile(await file.text());
      const fileSummary = summarizeBackup(backup as never);
      const here = summarizeBackup(exportStudioBackup() as never);
      setPending({
        backup,
        name: file.name,
        file: fileSummary,
        rows: compareBackup(fileSummary, here),
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'That is not a Castcut backup file.');
    }
  };

  const restore = async (keepCopy: boolean) => {
    if (!pending) return;
    setBusy(true);
    try {
      const { downloadStudioBackup, importStudioBackup } =
        await import('@/lib/storage/studio-backup');
      if (keepCopy) downloadStudioBackup();
      importStudioBackup(pending.backup);
      setPending(null);
      onRestored(
        keepCopy
          ? 'Backup restored — a copy of what was here downloaded first. Reload to finish.'
          : 'Backup restored. Reload to finish.'
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not restore that backup.');
    } finally {
      setBusy(false);
    }
  };

  const age = pending ? backupAgeLabel(pending.file.exportedAt) : null;
  const losing = pending?.rows.filter(row => row.fewer) ?? [];

  return (
    <>
      <label className={className} data-testid={testId}>
        {label}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          data-testid={`${testId}-file`}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void readFile(file);
          }}
        />
      </label>
      {pending ? (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => !busy && setPending(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-testid={`${testId}-preview`}
              className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              onClick={event => event.stopPropagation()}
              onKeyDown={event => {
                if (event.key === 'Escape' && !busy) setPending(null);
              }}
            >
              <div>
                <h2 id={titleId} className="type-heading">
                  Restore this backup?
                </h2>
                <p className="type-caption text-[var(--text-muted)]">
                  {pending.name}
                  {age ? ` · ${age}` : ''}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="py-1 pr-2 font-normal" scope="col">
                      <span className="sr-only">What</span>
                    </th>
                    <th className="py-1 pr-2 font-normal" scope="col">
                      In the file
                    </th>
                    <th className="py-1 font-normal" scope="col">
                      Here now
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.rows.map(row => (
                    <tr
                      key={row.label}
                      className="border-t border-[var(--border-subtle)] align-top"
                      data-testid={`${testId}-row-${row.label.toLowerCase().replace(/\s+/g, '-')}`}
                      data-fewer={row.fewer ? 'true' : 'false'}
                    >
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                        {row.label}
                      </th>
                      <td
                        className={`py-1.5 pr-2 ${row.fewer ? 'text-[var(--tint-warning-text)]' : ''}`}
                      >
                        {row.file}
                      </td>
                      <td className="py-1.5 text-[var(--text-secondary)]">{row.here}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {losing.length > 0 ? (
                <p
                  className="type-caption text-[var(--tint-warning-text)]"
                  data-testid={`${testId}-losing`}
                >
                  Restoring replaces what is here: the file has less of{' '}
                  {losing.map(row => row.label.toLowerCase()).join(', ')}.
                </p>
              ) : null}
              {pending.file.rendersNotKept > 0 ? (
                <p
                  className="type-caption text-[var(--text-muted)]"
                  data-testid={`${testId}-not-kept`}
                >
                  {pending.file.rendersNotKept} render
                  {pending.file.rendersNotKept === 1 ? '' : 's'} in this file live only in ComfyUI’s
                  output folder — on another computer they show as missing until that folder is
                  copied too. A backup holds the list, settings and Cast, not the files.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  loadingLabel="Restoring"
                  data-testid={`${testId}-confirm`}
                  onClick={() => void restore(true)}
                >
                  Save a copy of what’s here, then restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  data-testid={`${testId}-confirm-no-copy`}
                  onClick={() => void restore(false)}
                >
                  Restore without a copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  data-testid={`${testId}-cancel`}
                  onClick={() => setPending(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
