'use client';

import { useEffect, useState } from 'react';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui/object-info-cache';
import {
  QWEN_IMAGE_21_POSE_CONTROLNET,
  qwenImage21PoseControlAvailable,
} from '@/lib/engine/qwen-image-21-renderer';

/** undefined = still asking ComfyUI; null = ComfyUI didn't answer. */
type UnionState = boolean | null | undefined;

function useUnionInstalled(): UnionState {
  const [state, setState] = useState<UnionState>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchComfyObjectInfoCached()
      .then(info => {
        if (cancelled) return;
        setState(
          info
            ? qwenImage21PoseControlAvailable({
                nodeTypes: info.nodeTypes,
                controlNets: info.models.controlNets,
              })
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/**
 * Settings → Prompt quality → "Stronger pose control (slower)": the Fun ControlNet Union on a
 * one-person custom pose, Qwen-Image 2.1 engines only. Without the Union nodes or file the
 * switch says so and renders go out without it.
 */
export default function StrongerPoseControlSetting({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const installed = useUnionInstalled();
  const status =
    installed === undefined
      ? 'Checking ComfyUI for the pose ControlNet…'
      : installed === null
        ? "ComfyUI didn't answer — can't check for the pose ControlNet yet."
        : installed
          ? 'Installed ✓ — Qwen-Image 2.1 Fun ControlNet Union.'
          : `Not found in ComfyUI — needs the Qwen-Image 2.1 Fun ControlNet Union nodes (T8) and ${QWEN_IMAGE_21_POSE_CONTROLNET} in models/controlnet. Until then stills render without it.`;
  return (
    <label className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-3 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-muted)]/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent-ring)]">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        data-testid="settings-stronger-pose-control"
        onChange={event => onChange(event.target.checked)}
      />
      <span>
        <span className="font-medium text-[var(--text-primary)]">
          Stronger pose control (slower)
        </span>
        <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
          Qwen-Image 2.1 engines: a one-person pose you made (joint editor or a photo) also steers
          the render through a pose ControlNet. More poses come out right (about 7 in 10 instead of
          5 in 10 on hard poses), but each still takes 2.5–3× as long.
        </span>
        <span
          className={`type-caption mt-1 block ${installed ? 'text-[var(--text-secondary)]' : 'text-[var(--tint-warning-text,var(--text-muted))]'}`}
          data-testid="settings-stronger-pose-control-status"
        >
          {status}
        </span>
      </span>
    </label>
  );
}
