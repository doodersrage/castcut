'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { applyCharacterRecordFresh, getCharacter } from '@/lib/character-os';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { getReformatTargetModel } from '@/lib/reformat-target';
import {
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  type MoodboardTile,
} from '@/lib/moodboard-scene';
import { resolvePlayLoopEntryCharacterId } from '@/lib/play-campaign';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { DEFAULT_MOODBOARD_TOOL_CACHE } from '@/lib/settings-cache';

const TOOL_ID = 'moodboard' as const;
const MAX_TILES = 4;

export function useMoodboardToolOrchestrationCore() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'moodboard',
    DEFAULT_MOODBOARD_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lookStatus, setLookStatus] = useState<string | null>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

  const tiles = useMemo(() => normalizeMoodboardTiles(toolSettings.tiles), [toolSettings.tiles]);
  const templateId = normalizeMoodboardTemplateId(toolSettings.templateId);
  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);
  const plate = useMemo(() => resolveFittingPlateFromCharacter(character), [character]);
  const hasPlate = Boolean(plate?.filename || plate?.imageUrl);
  const activeTile = tiles.find(tile => tile.id === activeTileId) ?? tiles[0] ?? null;

  useEffect(() => {
    if (tiles.length === 0) {
      return;
    }
    if (!activeTileId || !tiles.some(tile => tile.id === activeTileId)) {
      scheduleAfterCommit(() => setActiveTileId(tiles[0]!.id));
    }
  }, [activeTileId, tiles]);

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Moodboard',
    href: '/moodboard',
    fields: [character?.name, toolSettings.instruction, tiles.map(tile => tile.label).join(', ')],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.instruction,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const persistTiles = useCallback(
    (next: MoodboardTile[]) => {
      updateToolSettings({ tiles: normalizeMoodboardTiles(next) });
    },
    [updateToolSettings]
  );

  const updateTile = useCallback(
    (tileId: string, patch: Partial<MoodboardTile>) => {
      persistTiles(tiles.map(tile => (tile.id === tileId ? { ...tile, ...patch } : tile)));
    },
    [persistTiles, tiles]
  );

  const addTile = useCallback(() => {
    if (tiles.length >= MAX_TILES) {
      return;
    }
    const id = newMoodboardTileId();
    persistTiles([...tiles, { id, role: 'mood' }]);
    setActiveTileId(id);
  }, [persistTiles, tiles]);

  const removeTile = useCallback(
    (tileId: string) => {
      const next = tiles.filter(tile => tile.id !== tileId);
      persistTiles(next);
      if (activeTileId === tileId) {
        setActiveTileId(next[0]?.id ?? null);
      }
    },
    [activeTileId, persistTiles, tiles]
  );

  const applyImageToTile = useCallback(
    async (tileId: string, input: { file?: File | null; imageUrl?: string; filename?: string }) => {
      const imageUrl = input.imageUrl?.trim() || '';
      const file = input.file ?? null;
      if (!file && !imageUrl && !input.filename?.trim()) {
        throw new Error('Choose a photo or gallery still first.');
      }
      setUploadingTileId(tileId);
      setError(null);
      try {
        const originalName = input.filename || file?.name || `moodboard-${tileId}.png`;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const sourceFile =
          file ??
          (await (async () => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl,
                filename: originalName,
                comfyUrl,
              })
            );
            return new File([blob], originalName, {
              type: blob.type || 'image/png',
              lastModified: Date.now(),
            });
          })());
        const uploaded = await resolveQueueInputImage({
          file: sourceFile,
          filename: originalName,
          model: shared.model,
        });
        const filename = uploaded?.filename?.trim();
        if (!filename) {
          throw new Error('Upload did not return a filename.');
        }
        const viewUrl =
          collectIsolateSourceUrls({
            filename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ?? imageUrl;
        updateTile(tileId, {
          imageFilename: filename,
          imageUrl: viewUrl || imageUrl || undefined,
        });
      } finally {
        setUploadingTileId(null);
      }
    },
    [shared.model, updateTile]
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const queryCharacterId =
      new URLSearchParams(window.location.search).get('character')?.trim() || '';
    const characterId = resolvePlayLoopEntryCharacterId({
      queryCharacterId,
      activeCharacterId: shared.activeCharacterId,
    });
    if (!characterId) {
      return;
    }
    const record = getCharacter(characterId);
    if (!record) {
      return;
    }
    const alreadyActive = shared.activeCharacterId?.trim() === characterId;
    if (!queryCharacterId && alreadyActive) {
      return;
    }
    try {
      updateShared(applyCharacterRecordFresh(record));
    } catch (err) {
      scheduleAfterCommit(() =>
        setError(err instanceof Error ? err.message : 'Could not apply that character.')
      );
    }
  }, [mounted, shared.activeCharacterId, updateShared]);

  useGalleryHandoff('moodboard', handoff => {
    const tileId = activeTileId ?? tiles[0]?.id;
    if (!tileId) {
      const id = newMoodboardTileId();
      persistTiles([{ id, role: 'mood' }]);
      setActiveTileId(id);
      void applyImageToTile(id, {
        imageUrl: handoff.previewUrl ?? handoff.payload.imageUrl,
        filename: handoff.payload.imageFilename,
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not apply gallery still.');
      });
      return;
    }
    void applyImageToTile(tileId, {
      imageUrl: handoff.previewUrl ?? handoff.payload.imageUrl,
      filename: handoff.payload.imageFilename,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not apply gallery still.');
    });
  });

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    busy,
    setBusy,
    extracting,
    setExtracting,
    lookStatus,
    setLookStatus,
    activeTileId,
    setActiveTileId,
    uploadingTileId,
    tiles,
    templateId,
    character,
    selectedModel,
    plate,
    hasPlate,
    activeTile,
    actions,
    updateTile,
    addTile,
    removeTile,
    applyImageToTile,
  };
}

export type MoodboardToolOrchestrationCore = ReturnType<typeof useMoodboardToolOrchestrationCore>;
