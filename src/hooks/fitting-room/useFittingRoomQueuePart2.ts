'use client';

import {
  handOffOutfitPicks,
  keptLookOutfitFromTryOn,
  realKitId,
} from '@/lib/fitting/outfit-handoff';
import { recordCastOutfitWorn } from '@/lib/cast/wardrobe';
import { useCallback, useEffect } from 'react';
import {
  activeLook,
  looksOf,
  setLookKeeperStandIn,
  setLookKeptOutfit,
  toggleLookKeeper,
} from '@/lib/character/os';
import { footwearIsBarefoot, normalizeFootwear } from '@/lib/wardrobe/footwear';
import { dayAfterOutfitHandoff } from '@/lib/day/outfit-scope';
import { getCachedClothingLabel } from '@/lib/wardrobe/clothing-catalog-client';
import { buildFittingKitPreviewPrompt, type FittingCompareTryOn } from '@/lib/fitting/room';
import {
  buildFittingGarmentReferenceExtras,
  loadWardrobeGarmentThumbManifest,
} from '@/lib/wardrobe/garment-thumbs';
import {
  countInFlightFittingKitPreviews,
  FITTING_KIT_PREVIEW_CONCURRENCY,
  FITTING_KIT_PREVIEW_HEIGHT,
  FITTING_KIT_PREVIEW_MAX,
  FITTING_KIT_PREVIEW_PROMPT_VERSION,
  FITTING_KIT_PREVIEW_WIDTH,
  fittingKitsNeedingPreview,
  getFittingKitPreview,
  upsertFittingKitPreview,
} from '@/lib/fitting/kit-previews';
import {
  applyLookPackToDaySlots,
  lookPackDayHref,
  lookPackNotes,
  loadLookPack,
  saveLookPack,
} from '@/lib/look/pack';
import { bumpPlayCampaignStep } from '@/lib/play/campaign';
import { ensureDaySlotsMatchMood } from '@/lib/day/planner';
import { buildRoleplayQueueStillOptions } from '@/lib/story/roleplay-play-core';
import { loadToolSettings, saveToolSettings } from '@/lib/settings/cache';
import { DEFAULT_DAY_TOOL_CACHE } from '@/lib/play/settings';
import type {
  FittingRoomQueueCore,
  FittingRoomQueueInput,
} from '@/hooks/fitting-room/useFittingRoomQueueCore';
import type { KeeperStandInApi } from '@/hooks/fitting-room/useKeeperStandIn';

export function useFittingRoomQueuePart2(
  input: FittingRoomQueueInput,
  core: FittingRoomQueueCore,
  standIn: Pick<KeeperStandInApi, 'queueStandIn'>
) {
  // Pulled off `input` so callbacks list (and call) the setters themselves, not the whole input.
  const {
    setError,
    setSaveStatus,
    updateShared,
    updateToolSettings,
    setContinueDayHref,
    swipeKit,
  } = input;
  const { previewStatus, setPreviewStatus, previewQueueBusyRef, kitPreviewsRef, queueTryOn } = core;
  const { queueStandIn } = standIn;

  const queueKitPreview = useCallback(
    async (wardrobeId: string, wardrobeLabel: string) => {
      const lookId = (input.shared.activeLookId ?? input.character?.activeLookId ?? '').trim();
      if (!lookId || !input.hasReference || !wardrobeId.trim()) {
        return false;
      }
      if (input.isolateSubject && input.toolSettings.referenceIsolated !== true) {
        return false;
      }
      const existing = getFittingKitPreview(kitPreviewsRef.current, wardrobeId, lookId);
      if (
        (existing?.status === 'completed' &&
          existing.imageUrl?.trim() &&
          (existing.promptVersion ?? 0) >= FITTING_KIT_PREVIEW_PROMPT_VERSION) ||
        existing?.status === 'queued' ||
        existing?.status === 'running'
      ) {
        return false;
      }

      try {
        if (!input.previewModel) {
          setError(
            'Install Boogu Edit Turbo or Qwen Edit Lightning 4 for fast kit previews. Queue try-on still uses your sidebar model.'
          );
          return false;
        }
        // Kit drafts keep packshot-only Image 2 so swipe thumbs stay kit-specific.
        // Full try-on prefers a bring-your-own clothing photo when set.
        await loadWardrobeGarmentThumbManifest();
        const garmentExtras = buildFittingGarmentReferenceExtras({
          wardrobeId,
        });
        const prompt = buildFittingKitPreviewPrompt({
          outfitLabel: wardrobeLabel.trim() || wardrobeId,
          hasGarmentReference: Boolean(garmentExtras),
        });
        const queueOptions = buildRoleplayQueueStillOptions({
          photoMode: true,
          isolateSubject: input.isolateSubject,
          referenceIsolated: input.toolSettings.referenceIsolated === true,
          filename: input.referenceImageFilename,
          imageUrl: input.referenceImageUrl,
          identityLockStrength: input.shared.ipAdapterStrength,
          identityKind: input.shared.identityKind,
        });
        const promptId = await input.actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueOptions ?? {}),
          ...(garmentExtras ? { inputImageUrls: garmentExtras.inputImageUrls } : {}),
          identityLock: false,
          queueModel: input.previewModel,
          qualityProfile: 'draft',
          queueParamsBase: input.previewQueueParams,
          ...input.previewQueueResolveOptions,
          figurePixelSize: {
            width: FITTING_KIT_PREVIEW_WIDTH,
            height: FITTING_KIT_PREVIEW_HEIGHT,
          },
          draftPreviewLite: true,
          queueHints: '',
          characterId: input.shared.activeCharacterId,
          lookId,
        });
        const next = upsertFittingKitPreview(kitPreviewsRef.current, {
          wardrobeId,
          lookId,
          promptId: typeof promptId === 'string' ? promptId.trim() : undefined,
          status: promptId ? 'queued' : 'error',
          updatedAt: Date.now(),
          promptVersion: FITTING_KIT_PREVIEW_PROMPT_VERSION,
        });
        kitPreviewsRef.current = next;
        updateToolSettings({ kitPreviews: next });
        return Boolean(promptId);
      } catch {
        const next = upsertFittingKitPreview(kitPreviewsRef.current, {
          wardrobeId,
          lookId,
          status: 'error',
          updatedAt: Date.now(),
        });
        kitPreviewsRef.current = next;
        updateToolSettings({ kitPreviews: next });
        return false;
      }
    },
    [
      input.actions,
      input.character?.activeLookId,
      input.hasReference,
      input.isolateSubject,
      input.previewModel,
      input.previewQueueParams,
      input.previewQueueResolveOptions,
      input.referenceImageFilename,
      input.referenceImageUrl,
      setError,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.shared.identityKind,
      input.shared.ipAdapterStrength,
      input.toolSettings.referenceIsolated,
      updateToolSettings,
      kitPreviewsRef,
    ]
  );

  const fillKitPreviews = useCallback(async () => {
    const lookId = (input.shared.activeLookId ?? input.character?.activeLookId ?? '').trim();
    if (
      !lookId ||
      !input.hasReference ||
      !input.previewModel ||
      previewQueueBusyRef.current ||
      (input.isolateSubject && input.toolSettings.referenceIsolated !== true)
    ) {
      return;
    }
    const needed = fittingKitsNeedingPreview(
      input.swipeDeck,
      kitPreviewsRef.current,
      lookId,
      FITTING_KIT_PREVIEW_MAX,
      input.deckSelectionId
    );
    if (needed.length === 0) {
      return;
    }
    const slots =
      FITTING_KIT_PREVIEW_CONCURRENCY -
      countInFlightFittingKitPreviews(kitPreviewsRef.current, lookId);
    if (slots <= 0) {
      return;
    }

    previewQueueBusyRef.current = true;
    setPreviewStatus('Queueing draft kit previews…');
    try {
      const batch = needed.slice(0, slots);
      await Promise.all(
        batch.map(wardrobeId => {
          const kit = input.swipeDeck.find(entry => entry.id === wardrobeId);
          const label = kit?.label || getCachedClothingLabel(wardrobeId) || wardrobeId;
          return queueKitPreview(wardrobeId, label);
        })
      );
      const remaining = fittingKitsNeedingPreview(
        input.swipeDeck,
        kitPreviewsRef.current,
        lookId,
        FITTING_KIT_PREVIEW_MAX,
        input.deckSelectionId
      ).length;
      setPreviewStatus(
        remaining > 0
          ? `Draft previews: ${FITTING_KIT_PREVIEW_MAX - remaining}/${FITTING_KIT_PREVIEW_MAX} queued near selection…`
          : 'Draft previews queued — thumbs fill as jobs finish.'
      );
    } finally {
      previewQueueBusyRef.current = false;
    }
  }, [
    input.character?.activeLookId,
    input.deckSelectionId,
    input.hasReference,
    input.isolateSubject,
    input.previewModel,
    input.shared.activeLookId,
    input.swipeDeck,
    input.toolSettings.referenceIsolated,
    kitPreviewsRef,
    previewQueueBusyRef,
    queueKitPreview,
    setPreviewStatus,
  ]);

  useEffect(() => {
    if (!input.mounted || !input.autoKitPreviews) {
      return;
    }
    const timer = window.setTimeout(() => {
      void fillKitPreviews();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    fillKitPreviews,
    input.activeLookId,
    input.autoKitPreviews,
    input.hasReference,
    input.inFlightPreviewCount,
    input.mounted,
    input.swipeDeck,
  ]);

  const keepTryOn = useCallback(
    (tryOn: FittingCompareTryOn): string | null => {
      const characterId = input.shared.activeCharacterId?.trim();
      const lookId = input.shared.activeLookId ?? input.character?.activeLookId;
      const entryId = tryOn.galleryEntryId?.trim();
      if (!characterId || !lookId || !entryId) {
        setError('Pick a Cast character with a look before keeping a try-on.');
        return null;
      }
      let updated = toggleLookKeeper(characterId, lookId, entryId);
      // A try-on from a clothing photo records 'custom-garment' — not a kit. Seeded into Day's
      // slots and the shared kit it left Day with no packshot and the wrong outfit.
      const wardrobeId = realKitId(tryOn.wardrobeId);
      // The kept try-on is a dressed plate: share it with Day and Story, under the key of what
      // it was rendered with (recorded when it was queued — the clothing, shoes or pose may have
      // been changed since, and a wrong key would start their stills from the wrong outfit).
      const keptNow = updated ? activeLook(updated)?.keeperEntryIds?.includes(entryId) : false;
      // The look records the kept try-on as its outfit (its kit, or the clothing photo and the
      // shoes), so switching back to the look — or a Day slot wearing it — dresses her in it.
      // Un-keeping drops it when it was this try-on.
      if (updated) {
        const lockBefore = activeLook(updated).lockedWardrobeId?.trim() || undefined;
        updated =
          setLookKeptOutfit(
            characterId,
            activeLook(updated).id,
            keptNow
              ? { outfit: keptLookOutfitFromTryOn(tryOn, input.toolSettings) }
              : { removeEntryId: entryId }
          ) ?? updated;
        const lockAfter = activeLook(updated).lockedWardrobeId?.trim() || undefined;
        if (lockAfter !== lockBefore) {
          // The session's outfit lock is the active look's.
          updateShared({ lockedWardrobeId: lockAfter });
        }
      }
      // The Wardrobe on Cast home has it now, with this try-on as its picture — not only once a
      // Day still is made in it.
      if (keptNow) {
        const kept = keptLookOutfitFromTryOn(tryOn, input.toolSettings);
        const { entryId: _entry, dressPlateKey: _plate, ...worn } = kept;
        void _entry;
        void _plate;
        recordCastOutfitWorn(characterId, {
          outfit: worn,
          label:
            tryOn.wardrobeLabel?.trim() ||
            input.toolSettings.customGarmentDescription?.trim().slice(0, 60) ||
            'Kept outfit',
          promptId: tryOn.promptId,
        });
      }
      if (keptNow && tryOn.imageUrl?.trim() && tryOn.dressPlateKey) {
        const plate = { key: tryOn.dressPlateKey, model: input.shared.model };
        const imageUrl = tryOn.imageUrl;
        void import('@/lib/day/dress-plate-client').then(({ registerDressPlateFromImage }) =>
          registerDressPlateFromImage(plate, imageUrl)
        );
      }
      // A posed try-on stays her kept still, and she is also rendered standing in it: Day and
      // Story start from that picture once it lands (the posed one held its pose into their
      // stills). Un-kept: its standing picture goes with it.
      const standingLookId = updated ? activeLook(updated).id : lookId;
      const renderStanding = Boolean(keptNow && tryOn.posed && tryOn.imageUrl?.trim());
      if (renderStanding) {
        const shoes = input.toolSettings.footwear?.trim();
        void queueStandIn({
          characterId,
          lookId: standingLookId,
          keeperEntryId: entryId,
          imageUrl: tryOn.imageUrl!.trim(),
          ...(shoes && !footwearIsBarefoot(shoes) ? { shoeWords: normalizeFootwear(shoes) } : {}),
          ...(tryOn.standingDressPlateKey ? { dressPlateKey: tryOn.standingDressPlateKey } : {}),
        });
      } else if (!keptNow) {
        setLookKeeperStandIn(characterId, standingLookId, entryId, null);
      }
      const existing = loadLookPack();
      const nextPack = {
        version: 1 as const,
        source: (existing?.source === 'saved' ? 'saved' : 'moodboard') as 'moodboard' | 'saved',
        characterId,
        templateId: existing?.templateId,
        paletteNotes: existing?.paletteNotes,
        lightingNotes: existing?.lightingNotes,
        locationNotes: existing?.locationNotes,
        styleNotes: existing?.styleNotes,
        moodNotes: existing?.moodNotes,
        wardrobeId: wardrobeId || realKitId(existing?.wardrobeId) || undefined,
        instruction: existing?.instruction,
        vibePrompt: existing?.vibePrompt,
        tileSummaries: existing?.tileSummaries,
        savedAt: Date.now(),
      };
      saveLookPack(nextPack);
      // The kept outfit is the whole Day's: its kit is the session's outfit lock (a clothing
      // photo try-on: the photo and shoes), and Day's slots follow it — what an earlier Day-wide
      // choice left on a slot goes, a slot's own look or kit picked by hand stays and Day says
      // so (day-outfit-scope.ts). One write, so nothing races the hand-off.
      let dayKit = input.shared.lockedWardrobeId?.trim() || undefined;
      if (keptNow && wardrobeId && dayKit !== wardrobeId) {
        dayKit = wardrobeId;
        updateShared({ lockedWardrobeId: wardrobeId });
      }
      const daySettings = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      const handed = dayAfterOutfitHandoff(daySettings, {
        picks: input.toolSettings,
        kitId: dayKit,
        activeLookId: updated ? activeLook(updated).id : lookId,
        lookIds: updated ? looksOf(updated).map(entry => entry.id) : undefined,
        at: Date.now(),
      });
      const moodAligned = ensureDaySlotsMatchMood(
        applyLookPackToDaySlots(handed.slots, nextPack, { wardrobe: false }),
        {
          dayMood: daySettings.dayMood,
          intimateMix: daySettings.intimateMix,
          allowCompanions: daySettings.allowCompanions === true,
        }
      );
      // Preserve dayMood/intimateMix from disk — never reset chips on Keep→Day.
      // Soft-advance remount hydrates these; rewriting only slots/notes.
      saveToolSettings('day', {
        ...daySettings,
        ...handed,
        slots: moodAligned.slots,
        notes:
          daySettings.notes?.trim() ||
          input.toolSettings.notes?.trim() ||
          lookPackNotes(nextPack) ||
          daySettings.notes,
      });
      // Story takes the clothing photo and shoes as before.
      void handOffOutfitPicks(input.toolSettings, { kitId: dayKit, day: false });
      const dayHref = lookPackDayHref({
        ...nextPack,
        characterId,
        wardrobeId: wardrobeId || nextPack.wardrobeId,
      });
      setContinueDayHref(dayHref);
      bumpPlayCampaignStep({ characterId, stepId: 'day', lookPackId: undefined });
      void import('@/lib/server/local-observability').then(({ noteKeepTryOnMetric }) => {
        noteKeepTryOnMetric();
      });
      const keptOwn = handed.outfitHandoffKept?.slotIds.length ?? 0;
      const sharedPlate = renderStanding
        ? ' Rendering her standing in it for Day and Story (they use this posed picture until then).'
        : keptNow && tryOn.dressPlateKey
          ? ' Day and Story start from this dressed plate.'
          : '';
      setSaveStatus(
        `Kept ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} as a Cast keeper · Day wears it in every slot` +
          (keptOwn > 0
            ? ` (${keptOwn} slot${keptOwn === 1 ? ' keeps its' : 's keep their'} own outfit).`
            : '.') +
          sharedPlate
      );
      setError(null);
      return dayHref;
    },
    [
      input.character?.activeLookId,
      setContinueDayHref,
      setError,
      setSaveStatus,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.shared.lockedWardrobeId,
      input.shared.model,
      input.toolSettings,
      updateShared,
      queueStandIn,
    ]
  );

  const queueTryOnAndSwipe = useCallback(async () => {
    const ok = await queueTryOn();
    if (ok) {
      swipeKit(1);
    }
  }, [swipeKit, queueTryOn]);

  return {
    queueKitPreview,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
    previewStatus,
  };
}
