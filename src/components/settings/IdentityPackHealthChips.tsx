'use client';

import { useEffect, useState } from 'react';
import {
  getInstantIdHealth,
  getIpAdapterHealth,
  getPulidHealth,
  type IdentityPackHealth,
} from '@/lib/identity-pack-health';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui-object-info-cache';

type IdentityPackHealthChipsProps = {
  refreshKey?: number;
};

function chipTone(status: IdentityPackHealth['status']): string {
  if (status === 'ready') {
    return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
  }
  if (status === 'detected') {
    return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
  }
  return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
}

function packTitle(kind: IdentityPackHealth['kind']): string {
  if (kind === 'ipadapter') {
    return 'IP-Adapter';
  }
  if (kind === 'pulid') {
    return 'PuLID';
  }
  return 'InstantID';
}

function PackChip({ health }: { health: IdentityPackHealth }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${chipTone(health.status)}`}
      data-testid={`identity-pack-${health.kind}`}
    >
      {packTitle(health.kind)}: {health.label}
      {health.detail && health.status !== 'missing' ? ` · ${health.detail}` : ''}
    </span>
  );
}

export default function IdentityPackHealthChips({ refreshKey = 0 }: IdentityPackHealthChipsProps) {
  const [ipadapter, setIpadapter] = useState<IdentityPackHealth | null>(null);
  const [instant, setInstant] = useState<IdentityPackHealth | null>(null);
  const [pulid, setPulid] = useState<IdentityPackHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
      if (cancelled) {
        return;
      }
      setIpadapter(getIpAdapterHealth(nodeTypes));
      setInstant(getInstantIdHealth(nodeTypes));
      setPulid(getPulidHealth(nodeTypes));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!ipadapter || !instant || !pulid) {
    return null;
  }

  const allMissing =
    ipadapter.status === 'missing' && instant.status === 'missing' && pulid.status === 'missing';

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <PackChip health={ipadapter} />
        <PackChip health={instant} />
        <PackChip health={pulid} />
      </div>
      {allMissing ? (
        <p className="text-xs text-[var(--text-muted)]">
          Run Heal &amp; ready to install IP-Adapter / InstantID nodes, or scaffold them in the
          workflow library so Cast face lock can run.
        </p>
      ) : null}
    </div>
  );
}
