'use client';

import { useEffect } from 'react';
import { ensureVideoWorkflowScaffold } from '@/lib/video/ensure-video-workflow';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui/object-info-cache';
import { resolvePreferredVideoModel } from '@/lib/queue/tool-model';
import { loadSettingsCache } from '@/lib/settings/cache';

type UseVideoWorkflowScaffoldOptions = {
  mounted: boolean;
  toolModel: string | undefined;
  sharedModel: string;
  updateShared: (patch: Record<string, unknown>) => void;
  setWorkflowStatus: (status: string) => void;
};

export function useVideoWorkflowScaffold({
  mounted,
  toolModel,
  sharedModel,
  updateShared,
  setWorkflowStatus,
}: UseVideoWorkflowScaffoldOptions) {
  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const model = resolvePreferredVideoModel({
          toolModel,
          sharedModel,
        });
        const objectInfo = await fetchComfyObjectInfoCached();
        if (cancelled) {
          return;
        }
        const latestShared = loadSettingsCache().shared.model;
        const ensureModel = resolvePreferredVideoModel({
          toolModel,
          sharedModel: latestShared,
          fallback: model,
        });
        const result = ensureVideoWorkflowScaffold(ensureModel, {
          inventory: objectInfo?.models ?? null,
        });
        if (cancelled) {
          return;
        }
        updateShared(result.sharedPatch);
        const parts = [
          result.created
            ? `Created and assigned “${result.workflow.name}” for ${result.model}.`
            : `Using workflow “${result.workflow.name}” for ${result.model}.`,
          result.checkpointNote,
        ].filter(Boolean);
        setWorkflowStatus(parts.join(' '));
      } catch (ensureError) {
        if (!cancelled) {
          setWorkflowStatus(
            ensureError instanceof Error
              ? ensureError.message
              : 'Could not create WAN video workflow scaffold.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once after settings hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
}
