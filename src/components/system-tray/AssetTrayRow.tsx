'use client';

import type { SystemTrayAssetJob } from '@/hooks/useSystemTrayState';
import { Button } from '@/components/ui/Button';
import { TrayProgressBar } from '@/components/system-tray/TrayProgressBar';
import { assetStatusLabel } from '@/components/system-tray/system-tray-helpers';

export function AssetTrayRow({
  job,
  onCancel,
}: {
  job: SystemTrayAssetJob;
  onCancel: (jobId: string) => void;
}) {
  const percent = Math.round(job.progress * 100);
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text-primary)]">{job.label}</p>
          <p className="mt-1 type-caption text-[var(--text-tertiary)]">{assetStatusLabel(job)}</p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => onCancel(job.id)}
          className="shrink-0 rounded-lg border-[var(--border-subtle)] px-2 py-1 text-2xs text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Cancel
        </Button>
      </div>
      {job.status === 'downloading' || job.status === 'verifying' ? (
        <div className="mt-2">
          <TrayProgressBar percent={percent} />
        </div>
      ) : null}
    </li>
  );
}
