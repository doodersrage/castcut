'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { applyCharacterRecordFresh, addCharacterLookPack } from '@/lib/character-os';
import { sanitizeCharacterAppearanceDescriptor } from '@/lib/character-appearance';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import {
  buildLookPackFromMoodboard,
  canReuseStagedLookPack,
  loadLookPack,
  lookPackDayHref,
  lookPackFittingHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { ensureOutfitPlateAfterLook, withCastIdentityQueueFields } from '@/lib/look-outfit-plate';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { synthesizeMoodboardPrompt } from '@/lib/moodboard-scene';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import type { MoodboardToolOrchestrationCore } from '@/hooks/moodboard/useMoodboardToolOrchestrationCore';

const TOOL_ID = 'moodboard' as const;

export function useMoodboardToolOrchestrationPart2(ctx: MoodboardToolOrchestrationCore) {
  const router = useRouter();
  const queueInFlightRef = useRef(false);
  const {
    shared,
    toolSettings,
    output,
    setOutput,
    setCopied,
    setError,
    busy,
    setBusy,
    extracting,
    setExtracting,
    setLookStatus,
    tiles,
    templateId,
    character,
    plate,
    hasPlate,
    actions,
  } = ctx;

  const buildPrompt = useCallback(() => {
    const raw = character?.descriptor || character?.hints || '';
    return synthesizeMoodboardPrompt({
      tiles,
      templateId,
      characterName: character?.name,
      characterDescriptor: raw ? sanitizeCharacterAppearanceDescriptor(raw) : undefined,
      instruction: toolSettings.instruction,
    });
  }, [
    character?.descriptor,
    character?.hints,
    character?.name,
    templateId,
    tiles,
    toolSettings.instruction,
  ]);

  const queueScene = useCallback(async () => {
    // Synchronous lock — React `busy` state alone still allows a second click before re-render.
    if (queueInFlightRef.current) {
      return;
    }
    queueInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();
    try {
      const prompt = buildPrompt();
      const finalized = await actions.finalizePrompt(prompt, character?.name || 'Moodboard scene');
      setOutput(finalized);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Moodboard',
        href: '/moodboard',
        fields: [character?.name ?? '', finalized],
      });
      const queueOptions = hasPlate
        ? buildRoleplayQueueStillOptions({
            photoMode: true,
            isolateSubject: false,
            referenceIsolated: true,
            filename: plate?.filename,
            imageUrl: plate?.imageUrl,
            identityLockStrength: shared.ipAdapterStrength,
            identityKind: shared.identityKind,
          })
        : undefined;
      const identityFields = withCastIdentityQueueFields(
        character,
        shared.ipAdapterStrength ?? 0.75
      );
      await actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        ...identityFields,
        characterId: shared.activeCharacterId,
        lookId: shared.activeLookId ?? character?.activeLookId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue that scene.');
    } finally {
      queueInFlightRef.current = false;
      setBusy(false);
    }
  }, [
    actions,
    buildPrompt,
    character,
    hasPlate,
    plate,
    setBusy,
    setCopied,
    setError,
    setOutput,
    shared.activeCharacterId,
    shared.activeLookId,
    shared.identityKind,
    shared.ipAdapterStrength,
  ]);

  const previewPrompt = useCallback(() => {
    setError(null);
    try {
      setOutput(buildPrompt());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build prompt.');
    }
  }, [buildPrompt, setError, setOutput]);

  const blobToDataUrl = useCallback(async (blob: Blob): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read image data.'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const extractLookPack = useCallback(async () => {
    setExtracting(true);
    setError(null);
    setLookStatus(null);
    try {
      if (tiles.length === 0 && !toolSettings.instruction?.trim()) {
        throw new Error('Add at least one tile or a scene instruction before extracting a look.');
      }

      let vibePrompt = '';
      const imageTiles = tiles.filter(tile => tile.imageUrl?.trim() || tile.imageFilename?.trim());
      if (imageTiles.length > 0) {
        setLookStatus('Reading reference tiles…');
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const images = await Promise.all(
          imageTiles.slice(0, 4).map(async tile => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl: tile.imageUrl,
                filename: tile.imageFilename,
                comfyUrl,
              })
            );
            return {
              image: await blobToDataUrl(blob),
              mimeType: blob.type || 'image/jpeg',
              role: tile.role,
              focus: 'style' as const,
            };
          })
        );
        const styleOnlyHints = [
          'Describe lighting, palette, mood, location, wardrobe style, and atmosphere only.',
          'Do not describe people, faces, race, ethnicity, skin tone, body type, age, or gender — Cast supplies the subject.',
          toolSettings.instruction?.trim() || '',
        ]
          .filter(Boolean)
          .join(' ');
        const response = await fetch('/api/image-prompt/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            model: shared.model,
            detail: shared.detail,
            descriptionPreset: 'standard',
            extraHints: styleOnlyHints,
            ...sharedLlmRequestBody(shared),
          }),
        });
        const data = (await response.json()) as { prompt?: string; error?: string };
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not extract a look from the board.');
        }
        vibePrompt = data.prompt.trim();
      } else {
        vibePrompt = synthesizeMoodboardPrompt({
          tiles,
          templateId,
          characterName: character?.name,
          characterDescriptor: (() => {
            const raw = character?.descriptor || character?.hints || '';
            return raw ? sanitizeCharacterAppearanceDescriptor(raw) : undefined;
          })(),
          instruction: toolSettings.instruction,
        });
      }

      const pack = buildLookPackFromMoodboard({
        tiles,
        templateId,
        characterId: character?.id ?? shared.activeCharacterId,
        instruction: toolSettings.instruction,
        vibePrompt,
        wardrobeId: shared.lockedWardrobeId,
      });
      saveLookPack(pack);
      setOutput(vibePrompt);
      // Moodboard is done once a look pack exists — advance resume past Moodboard even if the
      // user stays on this page (dashboard was stuck on "Stalled at Moodboard" until handoff).
      if (pack.characterId?.trim()) {
        bumpPlayCampaignStep({ characterId: pack.characterId, stepId: 'fitting' });
      }
      markOnboardingFirstPlayCampaign();

      const plateResult = await ensureOutfitPlateAfterLook({
        characterId: pack.characterId,
        tiles,
        vibePrompt,
        lookPack: pack,
        forceReplace: true,
        sendComfyUi: actions.sendComfyUi,
      });
      if (plateResult === 'ready') {
        setLookStatus(
          'Look pack ready — Outfit plate updated from Look. Continue to Outfit or Day.'
        );
      } else if (plateResult === 'queued') {
        setLookStatus(
          'Look pack ready — queuing a full-body Outfit plate. Continue to Outfit while it finishes.'
        );
      } else if (plateResult === 'failed') {
        setLookStatus(
          'Look pack ready — could not auto-make a full-body Outfit plate; upload one in Outfit or retry Extract.'
        );
      } else {
        setLookStatus('Look pack ready — send it to Outfit or Day.');
      }
      return pack;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract look pack.');
      return null;
    } finally {
      setExtracting(false);
    }
  }, [
    actions.sendComfyUi,
    blobToDataUrl,
    character,
    setError,
    setExtracting,
    setLookStatus,
    setOutput,
    shared,
    templateId,
    tiles,
    toolSettings.instruction,
  ]);

  /** Prefer a staged session pack on handoff so Fitting/Day skip a second vision pass. */
  const ensureLookPackForHandoff = useCallback(async () => {
    const characterId = (character?.id ?? shared.activeCharacterId)?.trim() || undefined;
    const staged = loadLookPack();
    if (canReuseStagedLookPack(staged, characterId) && staged) {
      const next = {
        ...staged,
        characterId: characterId || staged.characterId,
        wardrobeId: shared.lockedWardrobeId?.trim() || staged.wardrobeId,
      };
      saveLookPack(next);
      const plateResult = await ensureOutfitPlateAfterLook({
        characterId: next.characterId,
        tiles,
        vibePrompt: next.vibePrompt,
        lookPack: next,
        sendComfyUi: actions.sendComfyUi,
      });
      if (plateResult === 'ready') {
        setLookStatus('Using staged look pack — Outfit plate set from Look.');
      } else if (plateResult === 'queued') {
        setLookStatus('Using staged look pack — queuing a full-body Outfit plate.');
      } else {
        setLookStatus('Using staged look pack — skipped re-reading tiles.');
      }
      return next;
    }
    return extractLookPack();
  }, [
    actions.sendComfyUi,
    character?.id,
    extractLookPack,
    setLookStatus,
    shared.activeCharacterId,
    shared.lockedWardrobeId,
    tiles,
  ]);

  const sendLookToFitting = useCallback(async (): Promise<string | null> => {
    const pack = await ensureLookPackForHandoff();
    if (!pack) {
      return null;
    }
    markOnboardingFirstPlayCampaign();
    if (pack.characterId) {
      bumpPlayCampaignStep({ characterId: pack.characterId, stepId: 'fitting' });
    }
    return lookPackFittingHref(pack);
  }, [ensureLookPackForHandoff]);

  const sendLookToDay = useCallback(async (): Promise<string | null> => {
    const pack = await ensureLookPackForHandoff();
    if (!pack) {
      return null;
    }
    markOnboardingFirstPlayCampaign();
    if (pack.characterId) {
      bumpPlayCampaignStep({ characterId: pack.characterId, stepId: 'day' });
    }
    return lookPackDayHref(pack);
  }, [ensureLookPackForHandoff]);

  const sendLookToRoleplay = useCallback(async (): Promise<string | null> => {
    const pack = await ensureLookPackForHandoff();
    if (!pack) {
      return null;
    }
    if (pack.characterId) {
      bumpPlayCampaignStep({ characterId: pack.characterId, stepId: 'roleplay' });
    }
    return lookPackRoleplayHref(pack);
  }, [ensureLookPackForHandoff]);

  const saveLookPackToCast = useCallback(async () => {
    const pack = await ensureLookPackForHandoff();
    if (!pack || !character) {
      if (!character) {
        setError('Pick a Cast character before saving a look pack.');
      }
      return;
    }
    const defaultName = `Look ${new Date().toLocaleDateString()}`;
    const name =
      typeof window !== 'undefined'
        ? window.prompt('Name this look pack on Cast', defaultName)?.trim() || defaultName
        : defaultName;
    addCharacterLookPack(character.id, name, pack);
    setLookStatus(`Saved "${name}" on ${character.name}.`);
    bumpPlayCampaignStep({ characterId: character.id, stepId: 'fitting' });
    markOnboardingFirstPlayCampaign();
  }, [character, ensureLookPackForHandoff, setError, setLookStatus]);

  const goRoleplay = useCallback(() => {
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecordFresh(character),
      });
      const staged = loadLookPack();
      if (staged) {
        router.push(lookPackRoleplayHref({ ...staged, characterId: character.id }));
        return;
      }
      router.push(`/story?character=${encodeURIComponent(character.id)}`);
      return;
    }
    router.push('/story');
  }, [character, router]);

  return {
    queueScene,
    previewPrompt,
    extractLookPack,
    sendLookToFitting,
    sendLookToDay,
    sendLookToRoleplay,
    saveLookPackToCast,
    goRoleplay,
  };
}
