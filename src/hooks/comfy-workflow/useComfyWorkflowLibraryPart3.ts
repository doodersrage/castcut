'use client';

import { useCallback } from 'react';
import { type WorkflowPlaceholderTokens } from '@/lib/comfyui/config';
import {
  addPresetsToPack,
  applyWorkflowPresetPackToLibrary,
  exportWorkflowPresetPack,
  importWorkflowPresetPack,
  loadWorkflowPresetPacks,
  upsertWorkflowPresetPack,
  workflowFileToPreset,
  type WorkflowPresetPack,
} from '@/lib/workflow/preset-packs';
import { applyWorkflowNodeBindings, summarizeBindingChanges } from '@/lib/workflow/apply-bindings';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { downloadText } from '@/lib/storage/download-text';

export type UseComfyWorkflowLibraryOptions = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

import type { ComfyWorkflowLibraryCore } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryCore';
import type { useComfyWorkflowLibraryPart2 } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryPart2';

export function useComfyWorkflowLibraryPart3(
  ctx: ComfyWorkflowLibraryCore & ReturnType<typeof useComfyWorkflowLibraryPart2>
) {
  const {
    setBindingPreview,
    setPresetPacks,
    placeholderTokens,
    files,
    selectedId,
    editingJson,
    setEditingJson,
    packName,
    setPackName,
    activePackId,
    editingNodeMappings,
    refresh,
    onStatus,
  } = ctx;

  const createNewPack = useCallback(() => {
    const name = packName.trim() || `Pack ${new Date().toLocaleDateString()}`;
    const pack: WorkflowPresetPack = {
      id: crypto.randomUUID(),
      name,
      tags: ['workflows'],
      createdAt: Date.now(),
      presets: [],
    };
    upsertWorkflowPresetPack(pack);
    setPresetPacks(loadWorkflowPresetPacks());
    setPackName('');
    onStatus?.(`Created preset pack “${name}”.`);
  }, [onStatus, packName]);

  const importPresetPackFile = useCallback(
    (file: File) => {
      void file.text().then(raw => {
        try {
          const pack = importWorkflowPresetPack(raw);
          upsertWorkflowPresetPack(pack);
          const installed = applyWorkflowPresetPackToLibrary(pack);
          refresh();
          setPresetPacks(loadWorkflowPresetPacks());
          onStatus?.(`Imported preset pack “${pack.name}” and installed ${installed} workflow(s).`);
        } catch (error) {
          onStatus?.(error instanceof Error ? error.message : 'Invalid preset pack JSON.');
        }
      });
    },
    [onStatus, refresh]
  );

  const addSelectedWorkflowToPack = useCallback(() => {
    const file = files.find(entry => entry.id === selectedId);
    if (!file || !activePackId) {
      return;
    }
    const updated = addPresetsToPack(activePackId, [workflowFileToPreset(file)]);
    setPresetPacks(loadWorkflowPresetPacks());
    onStatus?.(
      updated ? `Added “${file.name}” to pack “${updated.name}”.` : 'Could not update pack.'
    );
  }, [activePackId, files, onStatus, selectedId]);

  const saveCurrentSettingsToPack = useCallback(() => {
    const comfySettings = loadComfyUiSettings();
    const workflowJson = comfySettings.workflowJson?.trim();
    if (!workflowJson || !activePackId) {
      onStatus?.('Save a workflow JSON in ComfyUI settings first.');
      return;
    }
    const updated = addPresetsToPack(activePackId, [
      {
        id: crypto.randomUUID(),
        name: `Settings snapshot ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        workflowJson,
        apiUrl: comfySettings.apiUrl,
        positiveToken: comfySettings.positiveToken,
        negativeToken: comfySettings.negativeToken,
        queueParams: comfySettings.queueParams,
        customTokens: comfySettings.customTokens,
      },
    ]);
    setPresetPacks(loadWorkflowPresetPacks());
    onStatus?.(
      updated
        ? `Saved current ComfyUI settings snapshot to “${updated.name}”.`
        : 'Could not update pack.'
    );
  }, [activePackId, onStatus]);

  const installPresetPack = useCallback(
    (pack: WorkflowPresetPack) => {
      const count = applyWorkflowPresetPackToLibrary(pack);
      refresh();
      onStatus?.(`Installed ${count} workflow(s) from “${pack.name}”.`);
    },
    [onStatus, refresh]
  );

  const exportPresetPack = useCallback(
    (pack: WorkflowPresetPack) => {
      downloadText(
        `${pack.name.replace(/\s+/g, '-')}-workflow-pack.json`,
        exportWorkflowPresetPack(pack)
      );
      onStatus?.(`Exported preset pack “${pack.name}”.`);
    },
    [onStatus]
  );

  const copyBindingHints = useCallback(() => {
    const hints = editingNodeMappings
      .filter(mapping => mapping.suggestedBinding)
      .map(mapping => `${mapping.nodeId} (${mapping.classType}) → ${mapping.suggestedBinding}`)
      .join('\n');
    void navigator.clipboard.writeText(hints);
    onStatus?.('Copied node binding hints.');
  }, [editingNodeMappings, onStatus]);

  const applyBindings = useCallback(() => {
    const applied = applyWorkflowNodeBindings(editingJson, editingNodeMappings, placeholderTokens);
    if (applied.changes.length === 0) {
      setBindingPreview('No changes — placeholders may already be present.');
      onStatus?.('No binding changes needed.');
      return;
    }
    setEditingJson(applied.json);
    setBindingPreview(summarizeBindingChanges(applied.changes));
    onStatus?.(`Applied ${applied.changes.length} binding(s). Review and save.`);
  }, [editingJson, editingNodeMappings, onStatus, placeholderTokens]);

  return {
    createNewPack,
    importPresetPackFile,
    addSelectedWorkflowToPack,
    saveCurrentSettingsToPack,
    installPresetPack,
    exportPresetPack,
    copyBindingHints,
    applyBindings,
  };
}
