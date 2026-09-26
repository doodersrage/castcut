'use client';

import { autoVramThresholdGb } from '@/lib/vram-queue-guard';

/**
 * "Auto: 7 GB (24 GB card)" — the threshold the guard will use on this ComfyUI's GPU. Uses the
 * Settings page's own health reading (no extra request).
 */
export default function VramAutoThresholdNote({
  totalVramGb,
  fallbackGb,
}: {
  totalVramGb?: number | null;
  fallbackGb: number;
}) {
  const autoGb = autoVramThresholdGb(totalVramGb != null ? totalVramGb * 1e9 : null);
  return (
    <span className="block text-xs text-[var(--text-muted)]" data-testid="vram-auto-threshold">
      {autoGb != null
        ? `Auto: ${autoGb} GB (${Math.round(totalVramGb ?? 0)} GB card).`
        : `ComfyUI hasn't reported its GPU yet — using ${fallbackGb} GB until it does.`}
    </span>
  );
}
