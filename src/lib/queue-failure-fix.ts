import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  downgradeQueueQualityProfile,
  fetchComfyUiPoolUrlsForRetry,
  isDeadHostErrorMessage,
  isOomOrExecutionErrorMessage,
  pickAlternateComfyUrl,
} from './oom-retry';
import type { RequeueComfyJobResult } from './comfyui-requeue';
import { resolveQueueFailureHref } from './queue-failure-playbook';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { isMissingCustomNodeFailure } from './workflow-node-type-audit';

export type QueueFailureFixKind =
  | 'install-missing-nodes'
  | 'drop-loras'
  | 'downgrade-quality'
  | 'compact-draft'
  | 'pool-failover'
  | 'remap-loader';

export type QueueFailureFix = {
  kind: QueueFailureFixKind;
  label: string;
  reason: string;
};

export function resolveQueueFailureFixes(
  entry: Pick<
    ComfyGalleryEntry,
    'statusMessage' | 'sessionActiveLoraIds' | 'queueQualityProfile' | 'comfyUrl' | 'model'
  >,
  poolUrls?: string[]
): QueueFailureFix[] {
  const message = entry.statusMessage?.trim() ?? '';
  const fixes: QueueFailureFix[] = [];
  const seen = new Set<QueueFailureFixKind>();

  const add = (fix: QueueFailureFix) => {
    if (seen.has(fix.kind)) {
      return;
    }
    seen.add(fix.kind);
    fixes.push(fix);
  };

  if (isMissingCustomNodeFailure(message)) {
    add({
      kind: 'install-missing-nodes',
      label: 'Install missing nodes',
      reason: 'Install the custom node pack via ComfyUI-Manager, restart, then retry.',
    });
  }

  if (
    /lora/i.test(message) ||
    (entry.sessionActiveLoraIds &&
      entry.sessionActiveLoraIds.length > 0 &&
      /not found|missing|failed to load/i.test(message))
  ) {
    add({
      kind: 'drop-loras',
      label: 'Retry without LoRAs',
      reason: 'Drop the session LoRA stack and rebuild the graph.',
    });
  }

  if (isOomOrExecutionErrorMessage(message)) {
    const next = downgradeQueueQualityProfile(entry.queueQualityProfile);
    if (next) {
      add({
        kind: 'downgrade-quality',
        label: next === 'final' ? 'Retry as Good' : 'Retry as Draft',
        reason: 'Lower quality to reduce VRAM.',
      });
    } else {
      add({
        kind: 'compact-draft',
        label: 'Retry as Draft',
        reason: 'Compact draft uses less VRAM.',
      });
    }
  }

  const alternate = pickAlternateComfyUrl(poolUrls, entry.comfyUrl);
  if (alternate && (isDeadHostErrorMessage(message) || isOomOrExecutionErrorMessage(message))) {
    add({
      kind: 'pool-failover',
      label: 'Retry on another host',
      reason: 'Send this job to a different ComfyUI in the pool.',
    });
  }

  const href = resolveQueueFailureHref(message);
  if (
    /checkpoint|vae|loader filename|upscale|refiner|not in.*inventory|file not found/i.test(
      message
    ) ||
    (href && href.includes('model-assets'))
  ) {
    add({
      kind: 'remap-loader',
      label: 'Remap loaders and retry',
      reason: 'Closest-match filenames from live ComfyUI inventory.',
    });
  }

  if (fixes.length === 0 && normalizeQueueQualityProfile(entry.queueQualityProfile) === 'max') {
    add({
      kind: 'downgrade-quality',
      label: 'Retry as Good',
      reason: 'Max often OOMs; Final is the usual recovery.',
    });
  }

  return fixes.slice(0, 3);
}

export async function applyQueueFailureFix(
  entry: ComfyGalleryEntry,
  kind: QueueFailureFixKind,
  options?: { onStatus?: (message: string) => void }
): Promise<RequeueComfyJobResult> {
  const { requeueComfyJobFromEntry } = await import('./comfyui-requeue');
  const onStatus = options?.onStatus;

  if (kind === 'install-missing-nodes') {
    const { requestComfyManagerInstall, resolveMissingNodeTypesForJob } =
      await import('./comfyui-manager-install-client');
    onStatus?.('Resolving missing custom nodes…');
    const nodeTypes = await resolveMissingNodeTypesForJob(entry);
    if (nodeTypes.length === 0) {
      return { ok: false, error: 'Could not tell which custom node pack is missing.' };
    }
    const installed = await requestComfyManagerInstall({
      nodeTypes,
      comfyUrl: entry.comfyUrl,
      restart: true,
    });
    if (!installed.ok && installed.installed.length === 0) {
      return { ok: false, error: installed.message };
    }
    onStatus?.(installed.message || 'Retrying after node install…');
    return requeueComfyJobFromEntry(entry, {
      exactGraph: false,
      onStatus,
    });
  }

  if (kind === 'drop-loras') {
    onStatus?.('Retrying without LoRAs…');
    return requeueComfyJobFromEntry(entry, {
      sessionActiveLoraIds: [],
      exactGraph: false,
      onStatus,
    });
  }

  if (kind === 'downgrade-quality') {
    const next = downgradeQueueQualityProfile(entry.queueQualityProfile) ?? 'draft';
    onStatus?.(`Retrying as ${next}…`);
    return requeueComfyJobFromEntry(entry, {
      qualityProfile: next,
      exactGraph: false,
      onStatus,
    });
  }

  if (kind === 'compact-draft') {
    onStatus?.('Retrying as Draft…');
    return requeueComfyJobFromEntry(entry, {
      qualityProfile: 'draft',
      exactGraph: false,
      onStatus,
    });
  }

  if (kind === 'pool-failover') {
    const poolUrls = await fetchComfyUiPoolUrlsForRetry();
    const nextUrl = pickAlternateComfyUrl(poolUrls, entry.comfyUrl);
    if (!nextUrl) {
      return { ok: false, error: 'No alternate ComfyUI host in the pool.' };
    }
    onStatus?.(`Retrying on ${nextUrl}…`);
    return requeueComfyJobFromEntry(entry, {
      comfyUrlOverride: nextUrl,
      exactGraph: false,
      onStatus,
    });
  }

  if (kind === 'remap-loader') {
    const applied = await applyClosestLoaderMapRepairs(onStatus);
    onStatus?.(
      applied > 0
        ? `Remapped ${applied} loader(s). Retrying…`
        : 'Retrying with current loader maps…'
    );
    return requeueComfyJobFromEntry(entry, {
      exactGraph: false,
      onStatus,
    });
  }

  return { ok: false, error: 'Unknown fix.' };
}

async function applyClosestLoaderMapRepairs(onStatus?: (message: string) => void): Promise<number> {
  const { fetchComfyObjectInfoCached } = await import('./comfyui-object-info-cache');
  const { loadSettingsCache, saveSharedSettings } = await import('./settings-cache');
  const { suggestLoaderMapRepairs, applyLoaderMapRepairs } =
    await import('./workflow-loader-map-repair');
  const objectInfo = await fetchComfyObjectInfoCached({ forceRefresh: true });
  if (!objectInfo?.models) {
    onStatus?.('Could not read ComfyUI inventory for loader remap.');
    return 0;
  }
  const shared = loadSettingsCache().shared;
  const suggestions = suggestLoaderMapRepairs({
    checkpointMap: { ...(shared.modelCheckpointMap ?? {}) },
    vaeMap: { ...(shared.modelVaeMap ?? {}) },
    upscaleMap: { ...(shared.modelUpscaleMap ?? {}) },
    controlNetMap: { ...(shared.modelControlNetMap ?? {}) },
    models: objectInfo.models,
  });
  if (suggestions.length === 0) {
    return 0;
  }
  const repaired = applyLoaderMapRepairs(
    {
      checkpointMap: { ...(shared.modelCheckpointMap ?? {}) },
      vaeMap: { ...(shared.modelVaeMap ?? {}) },
      upscaleMap: { ...(shared.modelUpscaleMap ?? {}) },
      controlNetMap: { ...(shared.modelControlNetMap ?? {}) },
    },
    suggestions
  );
  saveSharedSettings({
    ...shared,
    modelCheckpointMap: repaired.checkpointMap,
    modelVaeMap: repaired.vaeMap,
    modelUpscaleMap: repaired.upscaleMap,
    modelControlNetMap: repaired.controlNetMap,
  });
  return repaired.applied;
}
