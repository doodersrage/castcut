'use client';

import MediaScaffoldReadyPanel from '@/components/MediaScaffoldReadyPanel';
import ComfyModelAssetsPanel from '@/components/settings/ComfyModelAssetsPanel';
import { isVideoModel } from '@/lib/queue/tool-model';
import type { SharedToolSettings } from '@/lib/settings/cache';

type VideoPromptScaffoldSectionProps = {
  model: string;
  onSharedPatch: (patch: Partial<SharedToolSettings>) => void;
  onStatus: (status: string) => void;
};

export default function VideoPromptScaffoldSection({
  model,
  onSharedPatch,
  onStatus,
}: VideoPromptScaffoldSectionProps) {
  return (
    <div className="mb-4 space-y-3">
      <MediaScaffoldReadyPanel
        kind="video"
        onImported={(summary, result) => {
          if (result.sharedPatch) {
            onSharedPatch(result.sharedPatch);
          }
          onStatus(summary);
        }}
      />
      {isVideoModel(model) ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-3">
          <p className="mb-2 text-xs font-medium text-[var(--text-primary)]">Video model files</p>
          <ComfyModelAssetsPanel
            modelId={model}
            compact
            onStatus={onStatus}
            onInstalled={() => {
              void (async () => {
                try {
                  const { pinVideoWeightsAfterInstall } =
                    await import('@/lib/video/pin-video-weights');
                  const result = await pinVideoWeightsAfterInstall(model);
                  if (result.sharedPatch) {
                    onSharedPatch(result.sharedPatch);
                  }
                  onStatus(
                    result.note ??
                      'Video weights installed and mapped — refresh ComfyUI if loaders stay empty.'
                  );
                } catch (error) {
                  onStatus(
                    error instanceof Error
                      ? error.message
                      : 'Video weights installed — refresh ComfyUI if loaders stay empty.'
                  );
                }
              })();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
