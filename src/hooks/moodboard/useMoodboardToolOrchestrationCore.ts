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
import { applyCastLookPlateFromSource, clearCharacterLookPlate } from '@/lib/look-outfit-plate';
import { getReformatTargetModel } from '@/lib/reformat-target';
import {
  consumeMoodboardGalleryPlatePick,
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  type MoodboardTile,
} from '@/lib/moodboard-scene';
import { resolvePlayLoopEntryCharacterId } from '@/lib/play-campaign';
import { resolvePreferredLookModel } from '@/lib/queue-tool-model';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { suggestLookTileRoleForFile } from '@/lib/look-tile-role-client';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_MOODBOARD_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';

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
  const [plateUploading, setPlateUploading] = useState(false);
  const deepLinkHandled = useRef(false);
  const lookModelDefaultApplied = useRef(false);

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

  // Latest tiles for async work (uploads, role suggestions): several can land in one drop, and
  // a closure over `tiles` would write each back over the one before.
  const tilesRef = useRef(tiles);
  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);
  const patchTile = useCallback(
    (tileId: string, patch: Partial<MoodboardTile>) => {
      const next = normalizeMoodboardTiles(
        tilesRef.current.map(tile => (tile.id === tileId ? { ...tile, ...patch } : tile))
      );
      tilesRef.current = next;
      persistTiles(next);
    },
    [persistTiles]
  );
  // Tiles whose role the player picked — a suggestion never overrides those.
  const userRoleTileIds = useRef(new Set<string>());
  const updateTile = useCallback(
    (tileId: string, patch: Partial<MoodboardTile>) => {
      if (patch.role) {
        userRoleTileIds.current.add(tileId);
      }
      patchTile(tileId, patch);
    },
    [patchTile]
  );
  // Off for the session once the vision model is missing or keeps failing.
  const roleSuggestOff = useRef(false);
  const suggestTileRole = useCallback(
    async (tileId: string, file: File) => {
      if (roleSuggestOff.current || userRoleTileIds.current.has(tileId)) {
        return;
      }
      try {
        const role = await suggestLookTileRoleForFile(file, loadSettingsCache().shared);
        const tile = tilesRef.current.find(entry => entry.id === tileId);
        if (role && tile && !userRoleTileIds.current.has(tileId)) {
          patchTile(tileId, { role });
        }
      } catch {
        roleSuggestOff.current = true;
      }
    },
    [patchTile]
  );

  const addTile = useCallback(() => {
    if (tilesRef.current.length >= MAX_TILES) {
      return;
    }
    const id = newMoodboardTileId();
    const next = normalizeMoodboardTiles([...tilesRef.current, { id, role: 'mood' }]);
    tilesRef.current = next;
    persistTiles(next);
    setActiveTileId(id);
  }, [persistTiles]);

  const removeTile = useCallback(
    (tileId: string) => {
      const next = tilesRef.current.filter(tile => tile.id !== tileId);
      tilesRef.current = next;
      persistTiles(next);
      if (activeTileId === tileId) {
        setActiveTileId(next[0]?.id ?? null);
      }
    },
    [activeTileId, persistTiles]
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
        patchTile(tileId, {
          imageFilename: filename,
          imageUrl: viewUrl || imageUrl || undefined,
        });
        // A fresh image with no notes: let the vision model say what it's for.
        const tile = tilesRef.current.find(entry => entry.id === tileId);
        if (tile && !tile.notes?.trim()) {
          void suggestTileRole(tileId, sourceFile);
        }
      } finally {
        setUploadingTileId(null);
      }
    },
    [patchTile, shared.model, suggestTileRole]
  );

  /**
   * Drop / paste: each image becomes a new tile (up to the 4-tile board), uploaded in turn.
   * Returns how many were added and how many didn't fit.
   */
  const addTilesFromFiles = useCallback(
    async (files: File[]): Promise<{ added: number; skipped: number }> => {
      const images = files.filter(file => file.type.startsWith('image/'));
      const room = Math.max(0, MAX_TILES - tilesRef.current.length);
      const take = images.slice(0, room);
      if (take.length === 0) {
        return { added: 0, skipped: images.length };
      }
      const ids = take.map(() => newMoodboardTileId());
      const next = normalizeMoodboardTiles([
        ...tilesRef.current,
        ...ids.map(id => ({ id, role: 'other' as const })),
      ]);
      tilesRef.current = next;
      persistTiles(next);
      setActiveTileId(ids[0]!);
      for (let index = 0; index < take.length; index += 1) {
        try {
          await applyImageToTile(ids[index]!, { file: take[index]! });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not upload that image.');
        }
      }
      return { added: take.length, skipped: images.length - take.length };
    },
    [applyImageToTile, persistTiles]
  );

  const applyLookPlate = useCallback(
    async (input: { file?: File | null; imageUrl?: string; filename?: string }) => {
      if (!character) {
        setError('Pick a Cast character before setting a look plate.');
        return false;
      }
      setPlateUploading(true);
      setError(null);
      setLookStatus(input.file ? 'Uploading look plate…' : 'Applying look plate…');
      try {
        const result = await applyCastLookPlateFromSource({
          characterId: character.id,
          file: input.file,
          imageUrl: input.imageUrl,
          filename: input.filename,
          isolate: true,
          model: loadSettingsCache().shared.model,
        });
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecordFresh(result.character),
        });
        updateShared(applyCharacterRecordFresh(result.character));
        setLookStatus(
          result.isolated ? 'Look plate saved (isolated on white).' : 'Look plate saved.'
        );
        return true;
      } catch (err) {
        setLookStatus(null);
        setError(err instanceof Error ? err.message : 'Could not update the look plate.');
        return false;
      } finally {
        setPlateUploading(false);
      }
    },
    [character, updateShared]
  );

  const clearLookPlate = useCallback(() => {
    if (!character) {
      return;
    }
    if (
      !window.confirm(
        `Remove the look plate for ${character.name}? Outfit and Day will need a new plate.`
      )
    ) {
      return;
    }
    const cleared = clearCharacterLookPlate(character.id);
    if (cleared) {
      const next = getCharacter(character.id);
      if (next) {
        const patch = applyCharacterRecordFresh(next);
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...patch,
        });
        updateShared(patch);
      }
      setLookStatus('Look plate removed.');
      setError(null);
    } else {
      setError('Nothing to remove — no look plate on this Cast.');
    }
  }, [character, updateShared]);

  const keepSceneAsLookPlate = useCallback(async () => {
    const previewUrl = actions.comfyUiPreviewUrl?.trim();
    if (!previewUrl) {
      setError('Queue a scene still first, then Keep as plate.');
      return false;
    }
    return applyLookPlate({ imageUrl: previewUrl });
  }, [actions.comfyUiPreviewUrl, applyLookPlate]);

  useEffect(() => {
    if (!mounted || lookModelDefaultApplied.current) {
      return;
    }
    let cancelled = false;
    const tryApply = (): boolean => {
      if (cancelled || lookModelDefaultApplied.current) {
        return lookModelDefaultApplied.current;
      }
      const preferred = resolvePreferredLookModel({
        inventory: readCachedComfyObjectInfoModels(),
      });
      if (!preferred) {
        return false;
      }
      lookModelDefaultApplied.current = true;
      if (shared.model !== preferred) {
        updateShared({ model: preferred });
      }
      return true;
    };
    if (tryApply()) {
      return;
    }
    // Object-info inventory often arrives after first paint — retry briefly.
    const timers = [400, 1200, 3500].map(ms =>
      window.setTimeout(() => {
        void tryApply();
      }, ms)
    );
    return () => {
      cancelled = true;
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [mounted, shared.model, updateShared]);

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
    if (consumeMoodboardGalleryPlatePick()) {
      void applyLookPlate({
        file: handoff.file,
        imageUrl: handoff.previewUrl ?? handoff.payload.imageUrl,
        filename: handoff.payload.imageFilename,
      });
      return;
    }
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
    plateUploading,
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
    addTilesFromFiles,
    applyLookPlate,
    clearLookPlate,
    keepSceneAsLookPlate,
  };
}

export type MoodboardToolOrchestrationCore = ReturnType<typeof useMoodboardToolOrchestrationCore>;
