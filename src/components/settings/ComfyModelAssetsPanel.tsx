'use client';

import { ComfyModelAssetsDownloadQueue } from '@/components/settings/comfy-model-assets/ComfyModelAssetsDownloadQueue';
import { ComfyModelAssetsFiltersBar } from '@/components/settings/comfy-model-assets/ComfyModelAssetsFiltersBar';
import { ComfyModelAssetsRowList } from '@/components/settings/comfy-model-assets/ComfyModelAssetsRowList';
import { useComfyModelAssets } from '@/components/settings/comfy-model-assets/useComfyModelAssets';
import type { ComfyModelAssetsPanelProps } from '@/components/settings/comfy-model-assets/comfy-model-assets-types';

export type { ComfyModelAssetsPanelProps } from '@/components/settings/comfy-model-assets/comfy-model-assets-types';

export default function ComfyModelAssetsPanel(props: ComfyModelAssetsPanelProps) {
  const vm = useComfyModelAssets(props);

  return (
    <div className="space-y-3">
      <p className="type-caption text-[var(--text-muted)]">
        {vm.compact
          ? `Install ${vm.compactModelLabel} and its support files into COMFYUI_ROOT/models. Downloads run one at a time and resume if cancelled.`
          : 'Curated same-machine installs for supported workflows — image, video, audio, and 3D mesh checkpoints plus VAE / text encoder / LoRA companions — into COMFYUI_ROOT/models/…. Downloads run one at a time, resume from .partial after cancel or stall, and show up in the system tray. Only allowlisted Hugging Face URLs run; gated or third-party rows stay manual. Optional HF_TOKEN helps with gated repos / 403s.'}
      </p>

      <ComfyModelAssetsDownloadQueue
        queueJobs={vm.queueJobs}
        activeQueueCount={vm.activeQueueCount}
        busyId={vm.busyId}
        rootConfigured={vm.rootConfigured}
        rootWritable={vm.rootWritable}
        jobAction={vm.jobAction}
      />

      <ComfyModelAssetsFiltersBar
        forcedModelId={vm.forcedModelId}
        filterCurrentModel={vm.filterCurrentModel}
        setFilterCurrentModel={vm.setFilterCurrentModel}
        missingOnly={vm.missingOnly}
        setMissingOnly={vm.setMissingOnly}
        searchQuery={vm.searchQuery}
        setSearchQuery={vm.setSearchQuery}
        loading={vm.loading}
        load={vm.load}
        rootConfigured={vm.rootConfigured}
        rootWritable={vm.rootWritable}
        downloadableMissing={vm.downloadableMissing}
        installMissingForModel={vm.installMissingForModel}
        kindFilter={vm.kindFilter}
        setKindFilter={vm.setKindFilter}
        rows={vm.rows}
      />

      <p className="type-caption text-[var(--text-muted)]">
        {vm.rootConfigured ? (
          <>
            Root:{' '}
            <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--tint-success-text)]">
              {vm.rootPath}
            </code>
            {!vm.rootWritable ? (
              <span className="mt-1 block text-[var(--tint-warning-text)]">
                {vm.rootHint ??
                  'Not writable by this app process — Install cannot save files until COMFYUI_ROOT/models allows write access.'}
              </span>
            ) : null}
          </>
        ) : (
          <>{vm.rootHint ?? 'Set COMFYUI_ROOT to enable Install.'}</>
        )}
      </p>

      {vm.error ? <p className="type-caption ui-status-danger">{vm.error}</p> : null}

      <ComfyModelAssetsRowList
        loading={vm.loading}
        visibleRows={vm.visibleRows}
        groupedRows={vm.groupedRows}
        jobFor={vm.jobFor}
        busyId={vm.busyId}
        rootConfigured={vm.rootConfigured}
        rootWritable={vm.rootWritable}
        jobAction={vm.jobAction}
        install={vm.install}
      />
    </div>
  );
}
