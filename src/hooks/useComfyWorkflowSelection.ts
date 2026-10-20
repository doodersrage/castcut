'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadComfyWorkflowFiles, type ComfyWorkflowFile } from '@/lib/comfyui/workflow-files';
import { getSelectedWorkflowFileId, setSelectedWorkflowFileId } from '@/lib/comfyui/runtime';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export type ServerWorkflowOption = {
  id: string;
  name: string;
  source: 'server';
};

export type UseComfyWorkflowSelectionResult = {
  mounted: boolean;
  selectedId?: string;
  localFiles: ComfyWorkflowFile[];
  serverFiles: ServerWorkflowOption[];
  defaultLabel: string;
  setSelectedId: (fileId: string | undefined) => void;
  refreshFiles: () => void;
};

export function useComfyWorkflowSelection(): UseComfyWorkflowSelectionResult {
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedIdState] = useState<string | undefined>();
  const [localFiles, setLocalFiles] = useState<ComfyWorkflowFile[]>([]);
  const [serverFiles, setServerFiles] = useState<ServerWorkflowOption[]>([]);
  const [defaultLabel, setDefaultLabel] = useState('Default workflow');

  const refreshFiles = useCallback(() => {
    setLocalFiles(loadComfyWorkflowFiles());
    setSelectedIdState(getSelectedWorkflowFileId());
    const settings = loadComfyUiSettings();
    setDefaultLabel(
      settings.useServerDefaults ? 'Server default workflow' : 'Settings workflow JSON'
    );
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refreshFiles();
      void fetch('/api/comfyui/workflows')
        .then(response => response.json())
        .then((data: { workflows?: ServerWorkflowOption[] }) => {
          setServerFiles(data.workflows ?? []);
        })
        .catch(() => {
          setServerFiles([]);
        })
        .finally(() => {
          setMounted(true);
        });
    });
  }, [refreshFiles]);

  const setSelectedId = useCallback((fileId: string | undefined) => {
    setSelectedIdState(fileId);
    setSelectedWorkflowFileId(fileId);
    const cache = loadSettingsCache();
    saveSharedSettings({
      ...cache.shared,
      selectedWorkflowFileId: fileId,
      selectedWorkflowPresetId: undefined,
    });
  }, []);

  return {
    mounted,
    selectedId,
    localFiles,
    serverFiles,
    defaultLabel,
    setSelectedId,
    refreshFiles,
  };
}
