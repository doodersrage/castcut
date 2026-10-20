'use client';

import { useCallback, useState } from 'react';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import type { GenerationDiagnostics } from '@/lib/queue/generation-diagnostics';
import { loadActiveProjectId } from '@/lib/prompt/projects';
import { clearLineageParent, resolveParentHistoryId } from '@/lib/prompt/lineage-session';
import { computePromptContentHash, nextPromptVersionFields } from '@/lib/prompt/versioning';
import { loadPromptHistoryStore } from '@/lib/prompt/history';
import { loadSettingsCache } from '@/lib/settings/cache';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export function usePromptResultHistory(
  config: PromptResultActionsConfig,
  diagnostics: GenerationDiagnostics | null
) {
  const { addEntry } = usePromptHistory();
  const [historySaved, setHistorySaved] = useState(false);

  const resetStatuses = useCallback(() => {
    setHistorySaved(false);
  }, []);

  const saveHistory = useCallback(
    (input: {
      prompt: string;
      hints?: string;
      metadata?: Record<string, unknown>;
      parentHistoryId?: string;
    }): string | undefined => {
      if (!input.prompt) {
        return undefined;
      }

      const projectId = loadActiveProjectId();
      const parentHistoryId = resolveParentHistoryId(input.parentHistoryId);
      const shared = loadSettingsCache().shared;
      const versioningEnabled = shared.promptVersioningEnabled !== false;

      let versionFields:
        | {
            promptVersion: number;
            promptContentHash: string;
            versionRootId: string;
          }
        | undefined;
      let entryId: string | undefined;

      if (versioningEnabled) {
        entryId = crypto.randomUUID();
        const parent = parentHistoryId
          ? loadPromptHistoryStore().find(entry => entry.id === parentHistoryId)
          : undefined;
        versionFields = nextPromptVersionFields({
          contentHash: computePromptContentHash({
            prompt: input.prompt,
            model: config.model,
            loraIds: shared.sessionActiveLoraIds,
          }),
          parent: parent
            ? {
                id: parent.id,
                promptVersion: parent.promptVersion,
                versionRootId: parent.versionRootId,
              }
            : null,
          newEntryId: entryId,
        });
      }

      const historyId = addEntry({
        ...(entryId ? { id: entryId } : {}),
        tool: config.tool,
        prompt: input.prompt,
        hints: input.hints ?? config.hints,
        model: config.model,
        diagnostics: diagnostics ?? undefined,
        ...(versionFields ?? {}),
        metadata: {
          ...(input.metadata ?? {}),
          ...(parentHistoryId ? { parentHistoryId } : {}),
          ...(projectId ? { projectId } : {}),
        },
      });
      setHistorySaved(true);
      void import('@/lib/settings/webhook-settings').then(({ dispatchWebhook }) => {
        void dispatchWebhook({
          event: 'prompt.history.saved',
          tool: config.tool,
          model: config.model,
          prompt: input.prompt.slice(0, 500),
          completedAt: Date.now(),
        });
      });
      void import('@/lib/plugin/queue-hooks').then(({ dispatchPluginLifecycleHooks }) => {
        void dispatchPluginLifecycleHooks({
          event: 'prompt-history-saved',
          tool: config.tool,
          model: config.model,
          prompt: input.prompt.slice(0, 500),
          completedAt: Date.now(),
        });
      });
      if (parentHistoryId) {
        clearLineageParent();
      }
      return historyId;
    },
    [addEntry, config.tool, config.model, config.hints, diagnostics]
  );

  return {
    historySaved,
    saveHistory,
    resetStatuses,
  };
}
