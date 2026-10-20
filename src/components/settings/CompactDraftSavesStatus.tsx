'use client';

import { useEffect, useState } from 'react';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui/object-info-cache';
import { pickWebpSaveAdapter } from '@/lib/workflow/save-format';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export default function CompactDraftSavesStatus({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      scheduleAfterCommit(() => setStatus(null));
      return;
    }

    let cancelled = false;
    void fetchComfyObjectInfoCached().then(payload => {
      if (cancelled) {
        return;
      }
      if (!payload) {
        setStatus('Could not reach ComfyUI object_info — WebP capability unknown.');
        return;
      }
      const adapter = pickWebpSaveAdapter(payload.nodeTypes, payload.webpSaveAdapters);
      if (adapter) {
        setStatus(`WebP save ready · ${adapter.classType} (${String(adapter.formatValues[0])}).`);
        return;
      }
      setStatus(
        'No WebP save node detected — Draft queues stay PNG until you install e.g. SaveImageExtended.'
      );
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !status) {
    return null;
  }

  const ready = status.startsWith('WebP save ready');
  return (
    <p
      className={`ml-7 mt-1 text-xs ${ready ? 'text-[var(--tint-success-text)]' : 'text-[var(--tint-warning-text)]'}`}
    >
      {status}
    </p>
  );
}
