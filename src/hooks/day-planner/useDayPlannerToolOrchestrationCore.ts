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
  applyCharacterRecordFresh,
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
import { resolveAdultNudePlateQueueModel } from '@/lib/queue-tool-model';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import {
  clarifyIntimateImageLanguage,
  reinforceIntimateStillPrompt,
} from '@/lib/intimate-prompt-clarify';
import { STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP } from '@/lib/roleplay';
import {
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayBeatOmitsGarmentPackshot,
  dayMoodReplacesKeepOutfit,
  dayQueueBlockReason,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  ensureDaySlotsMatchMood,
  isDayAdultMood,
  isDayHeatMood,
  mergeDaySlotStills,
  nextDaySlotToEdit,
  normalizeDayIntimateMix,
  normalizeDayMood,
  normalizeDaySlotStills,
  normalizeDaySlots,
  promoteDayStillsToSoftPassChildren,
  resolveDayPoseHeadcount,
  rerollDaySlotScene,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
  DAY_PLATE_IDENTITY_LOCK_CAP,
  DAY_VACATION_POSE_IDENTITY_LOCK_CAP,
  DAY_VACATION_UPRIGHT_FACE_IDENTITY_LOCK_CAP,
  DAY_VACATION_POSE_DENOISE,
  DAY_VACATION_UPRIGHT_FACE_DENOISE,
  DAY_ADULT_DUO_IDENTITY_LOCK_CAP,
  DAY_ADULT_SOLO_NUDE_IDENTITY_LOCK_CAP,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day-planner';
import {
  castFaceDuplicatesBodyPlate,
  resolveDayFaceOnlyPlate,
  resolveDayGarmentReinforce,
  resolveDayPlate,
  resolveDayQueueIdentityPlate,
} from '@/lib/day-plate';
import { resolveDayNudeIdentityPlateWithFaceCrop } from '@/lib/day-nude-face-crop';
import {
  resolveDayVacationFaceBreakPlate,
  uploadDayOutfitVlPlate,
} from '@/lib/day-vacation-face-crop';
import {
  dayClothedHeatPoseNeedsBodyUnlock,
  clothedHeatUnlockPoseClass,
  vacationStanceDirective,
} from '@/lib/day-vacation';
import { buildDayPoseGuideFile } from '@/lib/day-pose-guide';
import { resolvePoseGuideControlNetExtras } from '@/lib/pose-guide-controlnet';
import { useDayPlateIsolate } from '@/hooks/day-planner/useDayPlateIsolate';
import { collectIsolateSourceUrls, ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
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
  const intimateEnabled = useNsfwGeneratorEnabled();
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
  // Display Keep when present. Everyday queues Keep as Image 1; Sport uses Cast so
  // Outfit Keep floral/street try-ons cannot win over athletic kit.
  const preferCastPlate = dayMoodReplacesKeepOutfit(toolSettings.dayMood);
  const queuePlate = useMemo(
    () =>
      resolveDayQueueIdentityPlate({
        character,
        displayPlate: plate,
        preferCastPlate,
      }),
    [character, plate, preferCastPlate]
  );

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
          updateShared(applyCharacterRecordFresh(record));
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
        const moodAligned = ensureDaySlotsMatchMood(nextSlots, {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
        });
        updateToolSettings({
          slots: moodAligned.slots,
          notes: notes || toolSettings.notes,
        });
        scheduleAfterCommit(() =>
          setFilmStatus(
            moodAligned.changed
              ? 'Applied Look pack to day slots · refreshed adult Setting/Beat.'
              : 'Applied Look pack to day slots.'
          )
        );
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
      const galleryEntries = loadComfyGallery();
      const promoted = promoteDayStillsToSoftPassChildren(
        current,
        galleryEntries.map(entry => ({
          id: entry.id,
          promptId: entry.promptId,
          parentGalleryEntryId: entry.parentGalleryEntryId,
          derivedKind: entry.derivedKind,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          queuedAt: entry.queuedAt,
        }))
      );
      const baseStills = promoted.changed ? promoted.stills : current;
      const wanted = new Set(
        baseStills.map(still => still.promptId?.trim()).filter(Boolean) as string[]
      );
      const clipWanted = new Set(
        baseStills.map(still => still.clipPromptId?.trim()).filter(Boolean) as string[]
      );
      if (wanted.size === 0 && clipWanted.size === 0 && !promoted.changed) {
        return;
      }
      const gallery = galleryEntries
        .filter(entry => wanted.has(entry.promptId) || clipWanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          isClip: isGalleryClipEntry(entry) || clipWanted.has(entry.promptId),
        }));
      const merged = mergeDaySlotStills(baseStills, gallery);
      if (promoted.changed || merged.changed) {
        const next = merged.changed ? merged.stills : baseStills;
        stillsRef.current = next;
        updateToolSettings(dayStillsCachePatch(next, shared.activeCharacterId));
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
    (
      slot: DaySlot,
      options?: { poseGuide?: boolean; faceOnlyIdentity?: boolean; forceGarmentReinforce?: boolean }
    ) => {
      const wardrobeId = slot.wardrobeId?.trim() || shared.lockedWardrobeId?.trim();
      const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
      const garmentReinforce = Boolean(
        options?.forceGarmentReinforce ||
        resolveDayGarmentReinforce({
          plateSource: plate?.source,
          packshotUrl,
          customGarmentUrl: toolSettings.customGarmentImageUrl,
          customGarmentFilename: toolSettings.customGarmentImageFilename,
        })
      );
      const dayMood = normalizeDayMood(
        isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
      );
      const omitGarment = dayBeatOmitsGarmentPackshot({
        blurb: slot.sceneHints,
        prompt: [slot.location, slot.sceneHints].filter(Boolean).join(' · '),
        dayMood,
        intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
      });
      const replaceKeepOutfit = dayMoodReplacesKeepOutfit(dayMood);
      const preferCastPlate = replaceKeepOutfit || omitGarment;
      const identityPlate = preferCastPlate
        ? resolveDayQueueIdentityPlate({
            character,
            displayPlate: plate,
            preferCastPlate: true,
            preferFaceOnlyPlate: omitGarment,
          })
        : queuePlate;
      const poseGuide = options?.poseGuide !== false && Boolean(hasPlate);
      return buildDaySlotPrompt({
        slot,
        wardrobeLabel: wardrobeLabelFor(slot.wardrobeId),
        characterName: character?.name,
        characterDescriptor: character?.descriptor || character?.hints,
        lockedLocation: shared.lockedLocation,
        notes: toolSettings.notes,
        hasPlate,
        plateSource: identityPlate?.source,
        plateIsolated: identityPlate?.isolated === true,
        garmentReinforce: garmentReinforce && !omitGarment && !replaceKeepOutfit,
        garmentDescription: toolSettings.customGarmentDescription,
        poseGuide,
        model: shared.model,
        realismMode: shared.renderRealismMode,
        allowCompanions: toolSettings.allowCompanions === true,
        dayMood,
        intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
        omitGarment,
        faceOnlyIdentity: options?.faceOnlyIdentity === true,
        replaceKeepOutfit,
      });
    },
    [
      character,
      hasPlate,
      plate,
      queuePlate,
      shared.lockedLocation,
      shared.lockedWardrobeId,
      shared.model,
      shared.renderRealismMode,
      toolSettings.allowCompanions,
      toolSettings.customGarmentDescription,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      toolSettings.notes,
      intimateEnabled,
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
        // Adult Solo/Duo: also replace stale everyday notebook/bookstore beats left from prior mood.
        let workingSlots = slots;
        const moodAligned = ensureDaySlotsMatchMood(slots, {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
        });
        if (moodAligned.changed) {
          workingSlots = moodAligned.slots;
          updateToolSettings({ slots: moodAligned.slots });
        }
        let queueTarget = workingSlots.find(entry => entry.id === slot.id) ?? slot;
        const needsScene = !queueTarget.location?.trim() || !queueTarget.sceneHints?.trim();
        if (needsScene) {
          const diversified = diversifyDaySlotScenes(
            workingSlots.map(entry => (entry.id === queueTarget.id ? queueTarget : entry)),
            {
              allowCompanions: toolSettings.allowCompanions === true,
              dayMood: toolSettings.dayMood,
              intimateMix: toolSettings.intimateMix,
            }
          );
          if (diversified.changed) {
            workingSlots = diversified.slots;
            updateToolSettings({ slots: diversified.slots });
            queueTarget =
              diversified.slots.find(entry => entry.id === queueTarget.id) ?? queueTarget;
          }
        }
        const wardrobeId = queueTarget.wardrobeId?.trim() || shared.lockedWardrobeId?.trim();
        await loadWardrobeGarmentThumbManifest();
        const packshotUrl = resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
        const omitGarment = dayBeatOmitsGarmentPackshot({
          blurb: queueTarget.sceneHints,
          prompt: [queueTarget.location, queueTarget.sceneHints].filter(Boolean).join(' · '),
          dayMood: toolSettings.dayMood,
          intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
        });
        const replaceKeepOutfit = dayMoodReplacesKeepOutfit(toolSettings.dayMood);
        let identityPlate = resolveDayQueueIdentityPlate({
          character,
          displayPlate: plate,
          preferCastPlate: replaceKeepOutfit || omitGarment,
          preferFaceOnlyPlate: omitGarment,
        });
        let nudeFaceAutoCropped = false;
        let vacationFaceBreak = false;
        let vacationKeepBodyPlate: typeof identityPlate = null;
        if (omitGarment && character) {
          const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          const nudeIdentity = await resolveDayNudeIdentityPlateWithFaceCrop({
            character,
            model: shared.model,
            comfyUrl,
          });
          if (nudeIdentity.plate) {
            identityPlate = nudeIdentity.plate;
            nudeFaceAutoCropped = nudeIdentity.autoCropped;
          }
        } else if (
          (normalizeDayMood(toolSettings.dayMood) === 'vacation' ||
            normalizeDayMood(toolSettings.dayMood) === 'suggestive') &&
          dayClothedHeatPoseNeedsBodyUnlock(queueTarget.sceneHints, toolSettings.dayMood) &&
          (identityPlate ?? queuePlate)
        ) {
          // Upright MID-STRIDE / WAVING / DANCING: full Keep as Image 1 freezes stand.
          // Face-crop Image 1; full Keep rides Image 2 for outfit (no re-suggest needed).
          const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          const bodyPlate = identityPlate ?? queuePlate;
          const faceBreak = await resolveDayVacationFaceBreakPlate({
            bodyPlate,
            model: shared.model,
            comfyUrl,
          });
          if (faceBreak.facePlate) {
            vacationKeepBodyPlate = faceBreak.outfitVlPlate ?? faceBreak.bodyPlate;
            identityPlate = faceBreak.facePlate;
            vacationFaceBreak = true;
          }
        }
        // Distinct Cast face lock OR auto crop → face-only Image 1 language + IP pin.
        const faceOnlyIdentity =
          (omitGarment && (nudeFaceAutoCropped || Boolean(resolveDayFaceOnlyPlate(character)))) ||
          vacationFaceBreak;
        // Prefer Day Clothing BYO / wardrobe packshot over Keep body on Image 2.
        // Face-break used to always attach Keep — when Keep is lingerie and BYO is a
        // floral dress, CLOTHING LOCK text fought lingerie pixels → bikini invent.
        const byoOrPackGarment = resolveDayGarmentReinforce({
          plateSource: plate?.source,
          packshotUrl,
          customGarmentUrl: toolSettings.customGarmentImageUrl,
          customGarmentFilename: toolSettings.customGarmentImageFilename,
        });
        let garmentReinforce =
          omitGarment || replaceKeepOutfit
            ? null
            : vacationFaceBreak && vacationKeepBodyPlate
              ? {
                  imageUrl: vacationKeepBodyPlate.imageUrl?.trim() || undefined,
                  imageFilename: vacationKeepBodyPlate.filename?.trim() || undefined,
                  source: 'packshot' as const,
                }
              : byoOrPackGarment;
        if (
          !omitGarment &&
          !replaceKeepOutfit &&
          vacationFaceBreak &&
          byoOrPackGarment &&
          (byoOrPackGarment.imageUrl || byoOrPackGarment.imageFilename)
        ) {
          const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
          const byoVl = await uploadDayOutfitVlPlate({
            imageUrl: byoOrPackGarment.imageUrl,
            filename: byoOrPackGarment.imageFilename,
            model: shared.model,
            comfyUrl,
          });
          if (byoVl?.filename) {
            garmentReinforce = {
              imageUrl: byoVl.imageUrl?.trim() || undefined,
              imageFilename: byoVl.filename,
              source: byoOrPackGarment.source,
            };
          } else {
            garmentReinforce = byoOrPackGarment;
          }
        }

        // Image 3: mannequin pose guide from Beat (Keep / Cast stay Image 1).
        // Heat moods: beat only — Setting location text must not rewrite Image 3 stance.
        let poseGuideUrl: string | undefined;
        let poseGuideFilename: string | undefined;
        if (hasPlate) {
          try {
            const dayMood = normalizeDayMood(
              isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
                ? 'everyday'
                : toolSettings.dayMood
            );
            const beatOnly = queueTarget.sceneHints?.trim() || '';
            const rawPoseScene = (
              isDayHeatMood(dayMood) ? [beatOnly] : [queueTarget.location, queueTarget.sceneHints]
            )
              .map(part => part?.trim())
              .filter(Boolean)
              .join(' · ');
            // Adult moods only: intimate clarify rewrites euphemisms into sex-act
            // language. Running it on Vacation/Suggestive injects rear-entry priors.
            const clarifiedPose =
              isDayAdultMood(dayMood) && rawPoseScene
                ? clarifyIntimateImageLanguage(rawPoseScene)
                : undefined;
            const poseSceneBase = clarifiedPose || rawPoseScene || beatOnly;
            const vacationPoseClass = clothedHeatUnlockPoseClass(beatOnly, dayMood);
            const poseSceneReinforced =
              (dayMood === 'vacation' || dayMood === 'suggestive') &&
              dayClothedHeatPoseNeedsBodyUnlock(beatOnly, dayMood) &&
              poseSceneBase
                ? `${poseSceneBase} · ${vacationStanceDirective(vacationPoseClass)} · nuclear Image 3 silhouette — never planted fashion stand`
                : poseSceneBase;
            const intimateMix = normalizeDayIntimateMix(toolSettings.intimateMix);
            const poseHeadcount = resolveDayPoseHeadcount({
              haystack: poseSceneReinforced,
              beat: queueTarget.sceneHints,
              dayMood,
              intimateMix,
              allowCompanions: toolSettings.allowCompanions === true,
            });
            // Duo mix must draw exactly two figures — never inflate to a trio.
            const poseScene =
              poseHeadcount === 2
                ? `${poseSceneReinforced || 'intimate duo mid-sex on the bed'} · exactly two adults only: Cast lead in the beat pose plus one distinct partner — both fully visible mid-contact in frame; never solo Cast; no third person`
                : poseHeadcount >= 3 && poseSceneReinforced
                  ? poseSceneReinforced
                  : poseSceneReinforced || undefined;
            const poseFile = await buildDayPoseGuideFile(
              queueTarget.id,
              poseScene || undefined,
              shared.model,
              {
                forcePeople: poseHeadcount,
                clothedUprightOnly: dayMood === 'vacation' || dayMood === 'suggestive',
              }
            );
            const uploaded = await resolveQueueInputImage({
              file: poseFile,
              filename: poseFile.name,
              model: shared.model,
            });
            poseGuideFilename = uploaded?.filename?.trim() || undefined;
            if (poseGuideFilename) {
              const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
              poseGuideUrl =
                collectIsolateSourceUrls({
                  filename: poseGuideFilename,
                  comfyUrl,
                }).find(url => url.includes('/api/comfyui/view?')) || undefined;
            }
          } catch {
            // Pose guide is best-effort — Day still queues without Image 3.
          }
        }

        const prompt = buildSlotPrompt(queueTarget, {
          poseGuide: Boolean(poseGuideFilename),
          faceOnlyIdentity,
          forceGarmentReinforce: vacationFaceBreak,
        });
        // Play/Simple: skip lint round-trip — Day stills are draft-speed first film.
        const drafted = leanChrome
          ? prompt
          : await actions.finalizePrompt(prompt, character?.name || slot.label);
        // Adult moods only — reinforceIntimateStillPrompt false-positives on Suggestive/
        // Vacation ("hands on" zipper, "sex contact" bans) and injects nude/duo locks
        // that fight CLOTHING LOCK → bikini/beach drift.
        const dayMoodForPrompt = normalizeDayMood(
          isDayAdultMood(toolSettings.dayMood) && !intimateEnabled
            ? 'everyday'
            : toolSettings.dayMood
        );
        const finalized = isDayAdultMood(dayMoodForPrompt)
          ? reinforceIntimateStillPrompt(drafted)
          : drafted;
        setOutput(finalized);
        rememberDraftFields({
          toolKey: TOOL_ID,
          label: 'Day',
          href: '/day',
          fields: [character?.name ?? '', queueTarget.label, finalized],
        });
        // Everyday: Keep as Image 1 for worn-kit fidelity on Qwen 2511.
        // Sport / nude adult beats: Cast as Image 1 so Keep lingerie cannot stick.
        // Upright vacation face-break: face crop Image 1; full Keep on Image 2.
        // Image 2 = optional garment packshot; Image 3 = crude pose wireframe.
        const extraUrls: Array<string | undefined> = [undefined];
        const extraFilenames: string[] = [''];
        if (garmentReinforce?.imageUrl || garmentReinforce?.imageFilename) {
          extraUrls[1] = garmentReinforce.imageUrl;
          extraFilenames[1] = garmentReinforce.imageFilename?.trim() || '';
        } else {
          extraUrls[1] = undefined;
          extraFilenames[1] = '';
        }
        if (poseGuideUrl || poseGuideFilename) {
          extraUrls[2] = poseGuideUrl;
          extraFilenames[2] = poseGuideFilename || '';
        }
        const hasExtras =
          extraUrls.some((url, index) => index > 0 && Boolean(url)) ||
          extraFilenames.some((name, index) => index > 0 && Boolean(name.trim()));
        const poseControlNet = resolvePoseGuideControlNetExtras({
          poseGuideFilename,
          poseGuideUrl,
          model: shared.model,
        });
        const queueImagePlate = omitGarment ? identityPlate : (identityPlate ?? queuePlate);
        const queueOptions = !hasPlate
          ? undefined
          : queueImagePlate?.filename?.trim() || queueImagePlate?.imageUrl?.trim()
            ? {
                inputImageFilename: queueImagePlate?.filename?.trim() || undefined,
                inputImageUrl: queueImagePlate?.imageUrl?.trim() || undefined,
                ...(hasExtras
                  ? {
                      ...(extraUrls.some(url => Boolean(url)) ? { inputImageUrls: extraUrls } : {}),
                      ...(extraFilenames.some(name => Boolean(name.trim()))
                        ? { inputImageFilenames: extraFilenames }
                        : {}),
                    }
                  : {}),
                ...(poseControlNet?.controlImageFilename
                  ? { controlImageFilename: poseControlNet.controlImageFilename }
                  : {}),
                ...(poseControlNet?.controlImageUrl
                  ? { controlImageUrl: poseControlNet.controlImageUrl }
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
        const dayMood = normalizeDayMood(toolSettings.dayMood);
        const intimateMix = normalizeDayIntimateMix(toolSettings.intimateMix);
        // Nude Solo: always soft-cap identity even without Image 3 — high IP + lingerie
        // face crop is how beige bras win over FULLY NUDE.
        const identityCap =
          isDayAdultMood(dayMood) && omitGarment && intimateMix !== 'duo'
            ? DAY_ADULT_SOLO_NUDE_IDENTITY_LOCK_CAP
            : isDayAdultMood(dayMood) && Boolean(poseGuideFilename)
              ? intimateMix === 'duo'
                ? DAY_ADULT_DUO_IDENTITY_LOCK_CAP
                : Math.min(DAY_PLATE_IDENTITY_LOCK_CAP, STORY_INTIMATE_POSE_IDENTITY_LOCK_CAP)
              : vacationFaceBreak
                ? DAY_VACATION_UPRIGHT_FACE_IDENTITY_LOCK_CAP
                : (dayMood === 'vacation' || dayMood === 'suggestive') && Boolean(poseGuideFilename)
                  ? DAY_VACATION_POSE_IDENTITY_LOCK_CAP
                  : DAY_PLATE_IDENTITY_LOCK_CAP;
        const identityStrength = Math.min(shared.ipAdapterStrength ?? 0.75, identityCap);
        // Never pin Cast lingerie plate as IP when we auto-cropped a face window —
        // that was how beige bras re-entered after soft Identity Lock.
        const croppedFaceFilename =
          nudeFaceAutoCropped || vacationFaceBreak
            ? identityPlate?.filename?.trim() || undefined
            : undefined;
        const faceQueueParams = croppedFaceFilename
          ? {
              ipAdapterImageFilename: croppedFaceFilename,
              ipAdapterImageFilenames: [croppedFaceFilename],
              ipAdapterStrength: identityStrength,
            }
          : omitGarment && castFaceDuplicatesBodyPlate(character)
            ? undefined
            : castFaceQueueParamsBase(character, identityStrength);
        const castLoras = castLoraSessionIds(character);
        const vacationPoseDenoise = vacationFaceBreak
          ? DAY_VACATION_UPRIGHT_FACE_DENOISE
          : (dayMood === 'vacation' || dayMood === 'suggestive') && Boolean(poseGuideFilename)
            ? DAY_VACATION_POSE_DENOISE
            : undefined;
        // Plate + pose Image 3 need an Edit-capable model. Adult nude + Rapid AIO
        // must use Edit NSFW — SFW Edit soft-censors into beige lingerie.
        const plateQueueModel = hasPlate
          ? resolveAdultNudePlateQueueModel(shared.model, {
              adultNude: isDayAdultMood(dayMood) && omitGarment,
            })
          : undefined;
        if (plateQueueModel && plateQueueModel !== shared.model) {
          updateShared({ model: plateQueueModel });
        }
        const promptId = await actions.sendComfyUi(finalized, undefined, undefined, {
          ...(queueOptions ?? {}),
          ...(hasPlate
            ? {
                queueTool: 'image-prompt',
                turboEditStrength: 'strong',
                identityLock: true,
                identityLockStrength: identityStrength,
                ...(plateQueueModel ? { queueModel: plateQueueModel } : {}),
              }
            : {}),
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
          ...(faceQueueParams || poseControlNet || vacationPoseDenoise != null
            ? {
                queueParamsBase: {
                  ...poseControlNet?.queueParamsBase,
                  ...faceQueueParams,
                  ...(vacationPoseDenoise != null ? { denoise: vacationPoseDenoise } : {}),
                },
              }
            : {}),
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
      toolSettings.allowCompanions,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      intimateEnabled,
      shared.model,
      updateShared,
      updateToolSettings,
    ]
  );
  const suggestDayScenes = useCallback(() => {
    const diversified = diversifyDaySlotScenes(slots, {
      forceLocations: true,
      forceBeats: true,
      fillBeats: true,
      allowCompanions: toolSettings.allowCompanions === true,
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
    });
    if (diversified.changed) {
      updateToolSettings({ slots: diversified.slots });
    }
    return diversified.changed;
  }, [
    slots,
    toolSettings.allowCompanions,
    toolSettings.dayMood,
    toolSettings.intimateMix,
    updateToolSettings,
  ]);

  const rerollActiveSlotScene = useCallback(
    (options?: {
      slotId?: import('@/lib/day-planner').DaySlotId;
      rerollLocation?: boolean;
      rerollBeat?: boolean;
    }) => {
      const slotId = options?.slotId ?? activeSlotId;
      const next = rerollDaySlotScene(slots, slotId, {
        rerollLocation: options?.rerollLocation !== false,
        rerollBeat: options?.rerollBeat !== false,
        allowCompanions: toolSettings.allowCompanions === true,
        dayMood: toolSettings.dayMood,
        intimateMix: toolSettings.intimateMix,
      });
      if (next.changed) {
        if (slotId !== activeSlotId) {
          setActiveSlotId(slotId);
        }
        updateToolSettings({ slots: next.slots });
      }
      return next.changed;
    },
    [
      activeSlotId,
      slots,
      toolSettings.allowCompanions,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      updateToolSettings,
    ]
  );

  const queueBlockReason = dayQueueBlockReason({
    hasCharacter: Boolean(character),
    hasPlate,
    isolateSubject,
    isolatePending,
  });

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
    allowCompanions: toolSettings.allowCompanions === true,
    setAllowCompanions: (next: boolean) => updateToolSettings({ allowCompanions: next }),
    hideStickyCutCoach: toolSettings.hideStickyCutCoach === true,
    setHideStickyCutCoach: (next: boolean) => updateToolSettings({ hideStickyCutCoach: next }),
    dayMood: normalizeDayMood(
      isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
    ),
    setDayMood: (next: import('@/lib/day-planner').DayMood) => {
      const mood = isDayAdultMood(next) && !intimateEnabled ? 'everyday' : normalizeDayMood(next);
      const mix = normalizeDayIntimateMix(toolSettings.intimateMix);
      const aligned = ensureDaySlotsMatchMood(slots, {
        dayMood: mood,
        intimateMix: mix,
        allowCompanions: toolSettings.allowCompanions === true,
      });
      updateToolSettings({
        dayMood: mood,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    intimateEnabled,
    intimateMix: normalizeDayIntimateMix(toolSettings.intimateMix),
    setIntimateMix: (next: import('@/lib/day-planner').DayIntimateMix) => {
      const mix = normalizeDayIntimateMix(next);
      const mood = normalizeDayMood(
        isDayAdultMood(toolSettings.dayMood) && !intimateEnabled ? 'everyday' : toolSettings.dayMood
      );
      const aligned = ensureDaySlotsMatchMood(slots, {
        dayMood: mood,
        intimateMix: mix,
        allowCompanions: toolSettings.allowCompanions === true,
      });
      updateToolSettings({
        intimateMix: mix,
        ...(aligned.changed ? { slots: aligned.slots } : {}),
      });
    },
    suggestDayScenes,
    rerollActiveSlotScene,
    queueBlockReason,
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
