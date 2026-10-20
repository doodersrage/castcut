'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchComfyLoraInventoryFiles,
  type ComfyLoraInventoryFile,
} from '@/lib/comfyui/object-info-cache';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export function useLoraLibraryInventory(comfyUrl?: string) {
  const [inventoryLoras, setInventoryLoras] = useState<ComfyLoraInventoryFile[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const refreshInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const loras = [
        ...((await fetchComfyLoraInventoryFiles({
          comfyUrl: comfyUrl?.trim() || undefined,
          forceRefresh: true,
        })) ?? []),
      ]
        .map(file => ({
          name: file.name.trim(),
          pathIndex: file.pathIndex,
        }))
        .filter(file => file.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setInventoryLoras(loras);
      if (loras.length === 0) {
        setInventoryError(
          'Could not load ComfyUI LoRA inventory. Start ComfyUI or check Settings → ComfyUI URL.'
        );
      }
    } catch {
      setInventoryLoras([]);
      setInventoryError('Could not load ComfyUI LoRA inventory.');
    } finally {
      setInventoryLoading(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refreshInventory();
    });
  }, [refreshInventory]);

  return {
    inventoryLoras,
    inventoryNames: inventoryLoras.map(file => file.name),
    inventoryLoading,
    inventoryError,
    refreshInventory,
  };
}
