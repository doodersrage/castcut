'use client';

import { useEffect, useState } from 'react';
import { fetchComfyObjectInfoModelsCached } from '@/lib/comfyui-object-info-cache';
import type { ModelControlNetMap } from '@/lib/model-controlnet-map';
import { resolvePoseControlNetFilename } from '@/lib/pose-guide-controlnet';

/** Which ControlNet the pose lock would use for the active model, or why there's none. */
export default function PoseControlNetStatus({
  model,
  controlNetMap,
}: {
  model?: string | null;
  controlNetMap?: ModelControlNetMap | null;
}) {
  // undefined = still asking ComfyUI; null = ComfyUI didn't answer.
  const [inventory, setInventory] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchComfyObjectInfoModelsCached()
      .then(models => {
        if (!cancelled) setInventory(models ? models.controlNets : null);
      })
      .catch(() => {
        if (!cancelled) setInventory(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolved = resolvePoseControlNetFilename({ model, controlNetMap, inventory });
  const text =
    resolved?.source === 'map'
      ? `Will use ${resolved.filename} (mapped in Settings).`
      : resolved
        ? `Will use ${resolved.filename} (found in ComfyUI).`
        : inventory === undefined
          ? 'Checking ComfyUI for a pose ControlNet…'
          : inventory === null
            ? "ComfyUI didn't answer — can't check for a pose ControlNet yet."
            : 'No pose-capable ControlNet in ComfyUI (OpenPose or Union) — install one, or the switch does nothing.';
  return (
    <span
      className={`type-caption mt-1 block ${resolved ? 'text-[var(--text-secondary)]' : 'text-[var(--tint-warning-text,var(--text-muted))]'}`}
      data-testid="settings-pose-controlnet-status"
    >
      {text}
    </span>
  );
}
