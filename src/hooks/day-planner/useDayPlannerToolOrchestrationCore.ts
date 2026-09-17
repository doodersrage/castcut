'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble';
import { filmDownloadFilename } from '@/lib/character-film';
import {
  applyCharacterRecord,
  castLoraSessionIds,
  getCharacter,
  upsertCharacter,
} from '@/lib/character-os';
import {
  markOnboardingFirstFilmCut,
  markOnboardingFirstPlayCampaign,
} from '@/lib/onboarding-hooks';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import {
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDaySlotStills,
  normalizeDaySlots,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day-planner';
import { resolveDayGarmentReinforce, resolveDayPlate } from '@/lib/day-plate';
import { useDayPlateIsolate } from '@/hooks/day-planner/useDayPlateIsolate';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe-garment-thumbs';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import {
  applyLookPackToDaySlots,
  loadLookPack,
  lookPackNotes,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import {
  bumpPlayCampaignStep,
  completePlayCampaign,
  resolvePlayLoopEntryCharacterId,
} from '@/lib/play-campaign';
import { castFaceQueueParamsBase, syncSharedIdentityToCast } from '@/lib/look-outfit-plate';
import { hasCompletedFirstFilm, loadPlayMetrics } from '@/lib/play-metrics';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';

const TOOL_ID = 'day' as const;
type ClothingOption = { value: string; label: string; group?: string };

export function useDayPlannerToolOrchestrationCore() {
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'day',
    DEFAULT_DAY_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filmGuideHref, setFilmGuideHref] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<DaySlotId>('morning');
  const [wardrobeLabels, setWardrobeLabels] = useState<Record<string, string>>({});
  const [assemblingFilm, setAssemblingFilm] = useState(false);
  const [filmStatus, setFilmStatus] = useState<string | null>(null);
  const [filmCutOptions, setFilmCutOptions] = useState({ crossfadeSec: 0, audioBedUrl: '' });
  const [filmNeedsCast, setFilmNeedsCast] = useState(false);
  const assembledFilmRef = useRef<{ filename: string; data: Uint8Array } | null>(null);
  const deepLinkHandled = useRef(false);
  const stillsRef = useRef(normalizeDaySlotStills(toolSettings.stills));
  const slotStatusRef = useRef<Partial<Record<DaySlotId, string>>>({});

  const slots = useMemo(() => normalizeDaySlots(toolSettings.slots), [toolSettings.slots]);
  const stills = useMemo(() => normalizeDaySlotStills(toolSettings.stills), [toolSettings.stills]);
  stillsRef.current = stills;
  const watchPlaylist = useMemo(() => dayWatchPlaylist(stills, slots), [slots, stills]);
  const activeSlot = slots.find(slot => slot.id === activeSlotId) ?? slots[0]!;

  // When a still finishes, jump the editor to the next time-of-day that still needs work.
  useEffect(() => {
    let advancedFrom: DaySlotId | null = null;
    for (const slot of slots) {
      const status = stills.find(entry => entry.slotId === slot.id)?.status ?? 'idle';
      const previous = slotStatusRef.current[slot.id] ?? 'idle';
      if (
        previous !== 'completed' &&
        status === 'completed' &&
        (previous === 'queued' || previous === 'running' || activeSlotId === slot.id)
      ) {
        advancedFrom = slot.id;
      }
      slotStatusRef.current[slot.id] = status;
    }
    if (!advancedFrom) {
      return;
    }
    const nextId = nextDaySlotToEdit(slots, stills, advancedFrom);
    if (nextId && nextId !== activeSlotId) {
      setActiveSlotId(nextId);
    }
  }, [activeSlotId, slots, stills]);

  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);
  const [galleryEntries, setGalleryEntries] = useState<ComfyGalleryEntry[]>([]);
  const basePlate = useMemo(
    () => resolveDayPlate({ character, gallery: galleryEntries }),
    [character, galleryEntries]
  );
  const {
    plate,
    hasPlate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
  } = useDayPlateIsolate({
    mounted,
    model: shared.model,
    basePlate,
    toolSettings,
    updateToolSettings,
    setError,
  });
  // Display Keep when present. Queue isolated Keep as Image 1 (outfit); packshot may reinforce as Image 2.
  const queuePlate = plate;

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return;
    }
    const refresh = () => {
      setGalleryEntries(loadComfyGallery());
    };
    refresh();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
    };
  }, [mounted]);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Default kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const wardrobeCategoryFilter = normalizeWardrobeCategoryFilter(
    toolSettings.wardrobeCategoryFilter
  );
  const filteredWardrobeOptions = useMemo(
    () =>
      filterWardrobeSelectOptions(
        wardrobeOptions,
        wardrobeCategoryFilter,
        activeSlot.wardrobeId || shared.lockedWardrobeId
      ),
    [activeSlot.wardrobeId, shared.lockedWardrobeId, wardrobeCategoryFilter, wardrobeOptions]
  );
  const wardrobeKitCount = useMemo(
    () => countWardrobeOptionsForFilter(wardrobeOptions, wardrobeCategoryFilter),
    [wardrobeCategoryFilter, wardrobeOptions]
  );

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Day',
    href: '/day',
    fields: [character?.name, activeSlot.sceneHints, toolSettings.notes],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.notes,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const updateSlot = useCallback(
    (slotId: DaySlotId, patch: Partial<DaySlot>) => {
      updateToolSettings({
        slots: slots.map(slot => (slot.id === slotId ? { ...slot, ...patch } : slot)),
      });
    },
    [slots, updateToolSettings]
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const queryCharacterId = params.get('character')?.trim() || '';
    const wardrobeId = params.get('wardrobe')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';
    const characterId = resolvePlayLoopEntryCharacterId({
      queryCharacterId,
      activeCharacterId: shared.activeCharacterId,
    });

    if (characterId) {
      const record = getCharacter(characterId);
      if (record) {
        try {
          updateShared(applyCharacterRecord(record));
        } catch (err) {
          scheduleAfterCommit(() =>
            setError(err instanceof Error ? err.message : 'Could not apply that character.')
          );
        }
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
      updateToolSettings({
        slots: seedDaySlotsWardrobe(toolSettings.slots, wardrobeId, { force: true }),
      });
    }
    if (fromLook) {
      // Keep the session pack for Roleplay handoff; Roleplay clears on apply.
      const pack = loadLookPack();
      if (pack) {
        if (pack.wardrobeId?.trim() && !wardrobeId) {
          updateShared({ lockedWardrobeId: pack.wardrobeId.trim() });
        }
        const packWardrobe = pack.wardrobeId?.trim() || wardrobeId;
        const nextSlots = applyLookPackToDaySlots(
          seedDaySlotsWardrobe(toolSettings.slots, packWardrobe, { force: Boolean(packWardrobe) }),
          pack
        );
        const notes = lookPackNotes(pack);
        updateToolSettings({
          slots: nextSlots,
          notes: notes || toolSettings.notes,
        });
        scheduleAfterCommit(() => setFilmStatus('Applied Look pack to day slots.'));
      }
    }
  }, [
    mounted,
    shared.activeCharacterId,
    toolSettings.notes,
    toolSettings.slots,
    updateShared,
    updateToolSettings,
  ]);

  useEffect(() => {
    let cancelled = false;
    void fetchClothingSelectOptions('wardrobeCatalog', clothingGender).then(next => {
      if (cancelled) {
        return;
      }
      setWardrobeOptions(next);
      setWardrobeLoadedKey(wardrobeOptionsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [clothingGender, wardrobeOptionsKey]);

  useEffect(() => {
    const ids = [
      ...new Set(slots.map(slot => slot.wardrobeId?.trim()).filter(Boolean) as string[]),
    ];
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchClothingLabels(ids).then(labels => {
      if (cancelled) {
        return;
      }
      setWardrobeLabels(previous => {
        const next = { ...previous };
        for (const [id, label] of labels) {
          if (label) {
            next[id] = label;
          }
        }
        return next;
      });
    });
    for (const id of ids) {
      const cached = getCachedClothingLabel(id);
      if (cached) {
        setWardrobeLabels(previous =>
          previous[id] === cached ? previous : { ...previous, [id]: cached }
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [slots]);

  useEffect(() => {
    const sync = () => {
      const current = stillsRef.current;
      const wanted = new Set(
        current.map(still => still.promptId?.trim()).filter(Boolean) as string[]
      );
      const clipWanted = new Set(
        current.map(still => still.clipPromptId?.trim()).filter(Boolean) as string[]
      );
      if (wanted.size === 0 && clipWanted.size === 0) {
        return;
      }
      const gallery = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId) || clipWanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          isClip: isGalleryClipEntry(entry) || clipWanted.has(entry.promptId),
        }));
      const merged = mergeDaySlotStills(current, gallery);
      if (merged.changed) {
        updateToolSettings(dayStillsCachePatch(merged.stills, shared.activeCharacterId));
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [shared.activeCharacterId, updateToolSettings]);

  const wardrobeLabelFor = useCallback(
    (wardrobeId?: string) => {
      const id = wardrobeId?.trim();
      if (!id) {
        return '';
      }
      return wardrobeLabels[id] ?? id;
    },
    [wardrobeLabels]
  );

  const buildSlotPrompt = useCallback(
    (slot: DaySlot) => {
      const wardrobeId = slot.wardrobeId?.trim() || shared.lockedWardrobeId?.trim();
      const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
      const garmentReinforce = Boolean(
        resolveDayGarmentReinforce({
          plateSource: plate?.source,
          packshotUrl,
        })
      );
      return buildDaySlotPrompt({
        slot,
        wardrobeLabel: wardrobeLabelFor(slot.wardrobeId),
        characterName: character?.name,
        characterDescriptor: character?.descriptor || character?.hints,
        lockedLocation: shared.lockedLocation,
        notes: toolSettings.notes,
        hasPlate,
        plateSource: queuePlate?.source,
        garmentReinforce,
      });
    },
    [
      character?.descriptor,
      character?.hints,
      character?.name,
      hasPlate,
      plate?.source,
      queuePlate?.source,
      shared.lockedLocation,
      shared.lockedWardrobeId,
      toolSettings.notes,
      wardrobeLabelFor,
    ]
  );

  const queueSlot = useCallback(
    async (
      slot: DaySlot,
      options?: { manageBusy?: boolean; qualityProfile?: 'draft' | 'final' | 'max' }
    ) => {
      const manageBusy = options?.manageBusy !== false;
      if (manageBusy) {
        setBusy(true);
      }
      setError(null);
      setCopied(false);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      try {
        if (isolateSubject && isolatePending) {
          throw new Error(ISOLATE_QUEUE_BLOCKED_MESSAGE);
        }
        // Fill blank Setting/Beat so a single Queue doesn't fall back to a generic time-of-day line.
        let queueTarget = slot;
        const needsScene = !slot.location?.trim() || !slot.sceneHints?.trim();
        if (needsScene) {
          const diversified = diversifyDaySlotScenes(
            slots.map(entry => (entry.id === slot.id ? slot : entry))
          );
          if (diversified.changed) {
            updateToolSettings({ slots: diversified.slots });
            queueTarget = diversified.slots.find(entry => entry.id === slot.id) ?? slot;
          }
        }
        const wardrobeId = queueTarget.wardrobeId?.trim() || shared.lockedWardrobeId?.trim();
        await loadWardrobeGarmentThumbManifest();
        const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
        const garmentReinforce = resolveDayGarmentReinforce({
          plateSource: plate?.source,
          packshotUrl,
        });
        const prompt = buildSlotPrompt(queueTarget);
        // Play/Simple: skip lint round-trip — Day stills are draft-speed first film.
        const finalized = leanChrome
          ? prompt
          : await actions.finalizePrompt(prompt, character?.name || slot.label);
        setOutput(finalized);
        rememberDraftFields({
          toolKey: TOOL_ID,
          label: 'Day',
          href: '/day',
          fields: [character?.name ?? '', queueTarget.label, finalized],
        });
        // Keep as Image 1 for worn-kit fidelity on Qwen 2511. Optional packshot Image 2.
        // Never put Cast on Image 1 when Keep exists — that drops the outfit.
        const queueOptions = !hasPlate
          ? undefined
          : queuePlate?.filename?.trim() || queuePlate?.imageUrl?.trim()
            ? {
                inputImageFilename: queuePlate?.filename?.trim() || undefined,
                inputImageUrl: queuePlate?.imageUrl?.trim() || undefined,
                ...(garmentReinforce
                  ? {
                      inputImageUrls: [undefined, garmentReinforce.imageUrl] as Array<
                        string | undefined
                      >,
                    }
                  : {}),
              }
            : undefined;
        const leanQuality: 'draft' | 'final' =
          options?.qualityProfile === 'final' || options?.qualityProfile === 'max'
            ? 'final'
            : options?.qualityProfile === 'draft'
              ? 'draft'
              : hasCompletedFirstFilm(loadPlayMetrics())
                ? 'final'
                : 'draft';
        // 2.0: pin Cast face onto Day stills the same way Outfit plates already do —
        // don't rely on whatever leftover session IP-Adapter shared happens to hold.
        if (character) {
          syncSharedIdentityToCast(character);
        }
        const faceQueueParams = castFaceQueueParamsBase(
          character,
          shared.ipAdapterStrength ?? 0.75
        );
        const castLoras = castLoraSessionIds(character);
        const promptId = await actions.sendComfyUi(finalized, undefined, undefined, {
          ...(queueOptions ?? {}),
          ...(hasPlate
            ? {
                queueTool: 'image-prompt',
                turboEditStrength: 'strong',
              }
            : {}),
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
          ...(faceQueueParams ? { queueParamsBase: faceQueueParams } : {}),
          ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
          ...(leanChrome ? { qualityProfile: leanQuality } : {}),
          ...(options?.qualityProfile && !leanChrome
            ? { qualityProfile: options.qualityProfile }
            : {}),
        });
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: queueTarget.id,
          promptId: typeof promptId === 'string' ? promptId : undefined,
          status: promptId ? 'queued' : 'error',
          imageUrl: undefined,
          clipPromptId: undefined,
          clipUrl: undefined,
          clipStatus: undefined,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that slot.');
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slot.id,
          status: 'error',
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      } finally {
        if (manageBusy) {
          setBusy(false);
        }
      }
    },
    [
      actions,
      buildSlotPrompt,
      character,
      hasPlate,
      isolatePending,
      isolateSubject,
      leanChrome,
      plate?.source,
      queuePlate,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
      shared.lockedWardrobeId,
      slots,
      updateToolSettings,
    ]
  );
  return {
    router,
    setBusy,
    setAssemblingFilm,
    setFilmStatus,
    setFilmNeedsCast,
    stillsRef,
    assembledFilmRef,
    buildSlotPrompt,
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
    filmGuideHref,
    setFilmGuideHref,
    busy,
    activeSlotId,
    setActiveSlotId,
    wardrobeLabels,
    assemblingFilm,
    filmStatus,
    filmCutOptions,
    setFilmCutOptions,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    selectedModel,
    plate,
    hasPlate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
    actions,
    updateSlot,
    wardrobeLabelFor,
    queueSlot,
    leanChrome,
  };
}

export type DayPlannerToolOrchestrationCore = ReturnType<typeof useDayPlannerToolOrchestrationCore>;
