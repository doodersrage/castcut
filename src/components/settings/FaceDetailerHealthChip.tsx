'use client';

import { useEffect, useState } from 'react';
import { getFaceDetailerHealth, type FaceDetailerHealth } from '@/lib/face-detailer-health';
import { ensureFaceDetailerSetup } from '@/lib/face-detailer-setup';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { Button } from '@/components/ui/Button';

type FaceDetailerHealthChipProps = {
  refreshKey?: number;
  onSetupComplete?: () => void;
};

export default function FaceDetailerHealthChip({
  refreshKey = 0,
  onSetupComplete,
}: FaceDetailerHealthChipProps) {
  const [health, setHealth] = useState<FaceDetailerHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setHealth(getFaceDetailerHealth());
    });
  }, [refreshKey]);

  if (!health) {
    return null;
  }

  const tone =
    health.status === 'ready'
      ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
      : health.status === 'partial' || health.status === 'detected'
        ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
        : 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';

  const needsSetup = health.status !== 'ready';

  const runSetup = async () => {
    setBusy(true);
    setStatus('Setting up FaceDetailer…');
    try {
      const result = await ensureFaceDetailerSetup();
      setHealth(result.health);
      setStatus(result.message);
      onSetupComplete?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'FaceDetailer setup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
        >
          FaceDetailer: {health.label}
          {health.workflowName ? ` · ${health.workflowName}` : ''}
        </span>
        {needsSetup ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void runSetup()}
          >
            {busy ? 'Setting up…' : health.status === 'partial' ? 'Retry Impact install' : 'Set up'}
          </Button>
        ) : null}
      </div>
      {health.status === 'missing' && !status ? (
        <p className="text-xs text-[var(--text-muted)]">
          Set up pins a FaceDetailer workflow and installs ComfyUI Impact Pack when missing (needs
          ComfyUI-Manager). Then Gallery → Face detail works.
        </p>
      ) : null}
      {health.status === 'partial' && !status ? (
        <p className="text-xs text-[var(--text-muted)]">
          Workflow is pinned, but Gallery → Face detail needs ComfyUI Impact Pack. Install it in
          ComfyUI (Manager → Impact Pack), or set Manager{' '}
          <code className="ui-inline-code">security_level</code> so Set up can install, then restart
          Comfy and Soft Refresh.
        </p>
      ) : null}
      {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
    </div>
  );
}
