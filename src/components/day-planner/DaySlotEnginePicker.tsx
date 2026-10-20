'use client';

import { useEffect, useState } from 'react';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import {
  fetchComfyObjectInfoModelsCached,
  readCachedComfyObjectInfoModels,
} from '@/lib/comfyui/object-info-cache';
import { DAY_SLOT_ENGINES, type DaySlot, type DaySlotId } from '@/lib/day/planner';
import { installedComfyModels } from '@/lib/model-picker';
import { pinnedEngineModel, POSE_REPORT_ENGINE_LABELS } from '@/lib/pose/pose-engine-report';
import { poseModelFamily } from '@/lib/pose/pose-model-profile';
import { loadSettingsCache } from '@/lib/settings-cache';

function readInstalled(
  inventory: ReturnType<typeof readCachedComfyObjectInfoModels>
): Map<string, string> | null {
  return (
    installedComfyModels(
      COMFY_IMAGE_MODELS,
      inventory,
      loadSettingsCache().shared.modelCheckpointMap
    ) ?? null
  );
}

/**
 * "Engine for this shot" in a Day card's sheet: one still on another of Day's engines — a pose
 * the Day's engine keeps missing, redone alone — while the rest of the Day keeps its own. Only
 * engines with an installed variant are offered.
 */
export default function DaySlotEnginePicker({
  slot,
  model,
  disabled,
  updateSlot,
}: {
  slot: DaySlot;
  /** The Day's engine. */
  model?: string | null;
  disabled: boolean;
  updateSlot: (slotId: DaySlotId, patch: Partial<DaySlot>) => void;
}) {
  const [installed, setInstalled] = useState<Map<string, string> | null>(() => {
    const cached = readCachedComfyObjectInfoModels();
    return cached ? readInstalled(cached) : null;
  });
  useEffect(() => {
    if (installed) return;
    let cancelled = false;
    void fetchComfyObjectInfoModelsCached()
      .then(inventory => {
        if (!cancelled) setInstalled(readInstalled(inventory));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [installed]);

  const dayFamily = poseModelFamily(model);
  const offered = DAY_SLOT_ENGINES.filter(
    family =>
      family !== dayFamily &&
      (installed ? Boolean(pinnedEngineModel(family, id => installed.has(id))) : false)
  );
  // Nothing else installed (or the list not loaded yet) and nothing pinned: no picker.
  if (offered.length === 0 && !slot.engine) return null;
  const dayLabel =
    dayFamily in POSE_REPORT_ENGINE_LABELS
      ? POSE_REPORT_ENGINE_LABELS[dayFamily as keyof typeof POSE_REPORT_ENGINE_LABELS]
      : 'its engine';

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm" data-testid="day-slot-engine">
      <span className="text-[var(--text-secondary)]">Engine for this shot</span>
      <select
        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-sm text-[var(--text-primary)]"
        value={slot.engine ?? ''}
        disabled={disabled}
        onChange={event =>
          updateSlot(slot.id, {
            engine: (event.target.value || undefined) as DaySlot['engine'],
          })
        }
      >
        <option value="">The Day&apos;s ({dayLabel})</option>
        {[...offered, ...(slot.engine && !offered.includes(slot.engine) ? [slot.engine] : [])].map(
          family => (
            <option key={family} value={family}>
              {POSE_REPORT_ENGINE_LABELS[family]}
            </option>
          )
        )}
      </select>
      {slot.engine ? (
        <span className="type-caption text-[var(--text-muted)]">
          Queue or redo this card to render it there.
        </span>
      ) : null}
    </label>
  );
}
