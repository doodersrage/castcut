'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  activeLook,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  setLookKeeperStandIn,
  subscribeCharacters,
  type CharacterRecord,
} from '@/lib/character/os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  getGalleryCache,
  initGalleryStore,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { buildFittingStandingPlatePrompt } from '@/lib/fitting/room';
import {
  keeperStandInStatus,
  latestKeeperEntry,
  type KeeperStandInStatus,
} from '@/lib/fitting/keeper-stand-in';
import { loadImageBlobFromUrls } from '@/lib/edit/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue/input-image';
import { comfyInputViewUrl } from '@/lib/face/match-client';
import { buildRoleplayQueueStillOptions } from '@/lib/story/roleplay-play-core';
import { withCastIdentityQueueFields } from '@/lib/look/outfit-plate';
import { dayPartnerNoun } from '@/lib/day/partner';
import { footwearIsBarefoot, normalizeFootwear } from '@/lib/wardrobe/footwear';
import { pushAppToast, shortErrorText } from '@/lib/app/toast';
import type { FittingRoomQueueInput } from '@/hooks/fitting-room/useFittingRoomQueueCore';

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onStoreChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
}

export type QueueKeeperStandInInput = {
  characterId: string;
  lookId: string;
  keeperEntryId: string;
  /** The kept (posed) picture: Image 1 of the edit. */
  imageUrl: string;
  /** The shoes she wears in it, in words. */
  shoeWords?: string;
  /** Stored as the dressed plate under this key when it lands. */
  dressPlateKey?: string;
};

/**
 * A posed Keep's standing picture (fitting/keeper-stand-in.ts): queued at Keep (or with one tap
 * for a posed Keep from before), followed in the gallery — it is an ordinary ComfyUI job, so a
 * reload or another page loses nothing — and recorded on the look when it lands.
 */
export function useKeeperStandIn(input: FittingRoomQueueInput) {
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  const characterId = input.shared.activeCharacterId?.trim() || '';
  const character: CharacterRecord | undefined = useMemo(
    () => characters.find(entry => entry.id === characterId),
    [characters, characterId]
  );
  const busyRef = useRef(new Set<string>());
  // The gallery is read from memory: load it (once per page; a no-op when loaded).
  useEffect(() => {
    void initGalleryStore();
  }, []);

  const queueStandIn = useCallback(
    async (job: QueueKeeperStandInInput): Promise<boolean> => {
      const key = `${job.characterId}:${job.keeperEntryId}`;
      if (busyRef.current.has(key)) return false;
      busyRef.current.add(key);
      const model = input.shared.model;
      try {
        const blob = await loadImageBlobFromUrls([job.imageUrl]);
        const name = `outfit-standing-${Date.now()}.png`;
        const uploaded = await resolveQueueInputImage({
          file: new File([blob], name, {
            type: blob.type || 'image/png',
            lastModified: Date.now(),
          }),
          filename: name,
          model,
        });
        const filename = uploaded?.filename?.trim();
        if (!filename) throw new Error('The kept picture could not be staged.');
        const owner = characters.find(entry => entry.id === job.characterId);
        const subject: 'she' | 'he' = dayPartnerNoun(owner ?? {}) === 'man' ? 'he' : 'she';
        const prompt = buildFittingStandingPlatePrompt({ subject, shoeWords: job.shoeWords });
        const queueOptions = buildRoleplayQueueStillOptions({
          photoMode: true,
          // The kept picture is the plate now; it was rendered from the (isolated) plate already.
          isolateSubject: false,
          referenceIsolated: false,
          filename,
          imageUrl: comfyInputViewUrl(filename) ?? undefined,
          identityLockStrength: input.shared.ipAdapterStrength,
          identityKind: input.shared.identityKind,
        });
        const promptId = await input.actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueOptions ?? {}),
          castPlateReference: true,
          // A pose change of the same picture, as the back view and shoe pass are.
          turboEditStrength: 'balanced' as const,
          ...withCastIdentityQueueFields(owner, input.shared.ipAdapterStrength ?? 0.75),
          queueHints: '',
          parentGalleryEntryId: job.keeperEntryId,
          characterId: job.characterId,
          lookId: job.lookId,
        });
        if (typeof promptId !== 'string' || !promptId.trim()) {
          throw new Error('The standing picture was not queued.');
        }
        setLookKeeperStandIn(job.characterId, job.lookId, job.keeperEntryId, {
          promptId: promptId.trim(),
          entryId: undefined,
          imageUrl: undefined,
          failed: undefined,
          at: Date.now(),
          model,
          ...(job.dressPlateKey ? { dressPlateKey: job.dressPlateKey } : {}),
        });
        return true;
      } catch (error) {
        console.warn('Outfit standing picture failed:', error);
        setLookKeeperStandIn(job.characterId, job.lookId, job.keeperEntryId, {
          failed: true,
          at: Date.now(),
        });
        pushAppToast({
          text: `The standing picture wasn't queued — Day and Story use the posed one: ${shortErrorText(error)}`,
          tone: 'warning',
          ttlMs: 15_000,
        });
        return false;
      } finally {
        busyRef.current.delete(key);
      }
    },
    [characters, input.actions, input.shared]
  );

  // A stand-in that landed (or failed): recorded on its look, and stored as the dressed plate.
  useEffect(() => {
    if (!character || gallery.length === 0) return;
    for (const look of looksOf(character)) {
      for (const [keeperId, standIn] of Object.entries(look.keeperStandIns ?? {})) {
        const promptId = standIn.promptId?.trim();
        if (!promptId || standIn.entryId || standIn.failed) continue;
        const entry = gallery.find(item => item.promptId === promptId);
        if (entry?.status === 'error') {
          setLookKeeperStandIn(character.id, look.id, keeperId, { failed: true });
          continue;
        }
        if (entry?.status !== 'completed') continue;
        const imageUrl = galleryEntryPrimaryViewUrl(entry)?.trim();
        if (!imageUrl) continue;
        setLookKeeperStandIn(character.id, look.id, keeperId, { entryId: entry.id, imageUrl });
        const plateKey = standIn.dressPlateKey?.trim();
        if (plateKey) {
          const plate = { key: plateKey, model: standIn.model?.trim() || input.shared.model };
          void import('@/lib/day/dress-plate-client').then(({ registerDressPlateFromImage }) =>
            registerDressPlateFromImage(plate, imageUrl)
          );
        }
      }
    }
  }, [character, gallery, input.shared.model]);

  const look = character ? activeLook(character) : null;
  const status: KeeperStandInStatus | null = useMemo(
    () =>
      keeperStandInStatus({
        look,
        gallery,
        pictureOf: entry => galleryEntryPrimaryViewUrl(entry),
      }),
    [look, gallery]
  );

  /** One tap: a standing picture for the look's newest (posed) Keep — new, or again. */
  const makeStandingPicture = useCallback(async (): Promise<boolean> => {
    if (!character || !look) return false;
    const keeper = latestKeeperEntry(look, gallery);
    const imageUrl = keeper ? galleryEntryPrimaryViewUrl(keeper)?.trim() : '';
    if (!keeper || !imageUrl) return false;
    const shoes = look.keptOutfit?.footwear?.trim();
    return queueStandIn({
      characterId: character.id,
      lookId: look.id,
      keeperEntryId: keeper.id,
      imageUrl,
      ...(shoes && !footwearIsBarefoot(shoes) ? { shoeWords: normalizeFootwear(shoes) } : {}),
      dressPlateKey:
        look.keeperStandIns?.[keeper.id]?.dressPlateKey ||
        (look.keptOutfit?.entryId === keeper.id ? look.keptOutfit.dressPlateKey : undefined),
    });
  }, [character, gallery, look, queueStandIn]);

  return { status, queueStandIn, makeStandingPicture };
}

export type KeeperStandInApi = ReturnType<typeof useKeeperStandIn>;
