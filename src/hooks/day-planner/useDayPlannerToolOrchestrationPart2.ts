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
  shareFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble';
import { filmDownloadFilename } from '@/lib/character-film';
import { applyCharacterRecord, getCharacter, upsertCharacter } from '@/lib/character-os';
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
} from '@/lib/comfyui-gallery';
import {
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayStillsBelongToCharacter,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  mergeDaySlotStills,
  normalizeDaySlotStills,
  normalizeDaySlots,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day-planner';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import {
  applyLookPackToDaySlots,
  loadLookPack,
  lookPackNotes,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep, completePlayCampaign } from '@/lib/play-campaign';
import { loadPlayMetrics } from '@/lib/play-metrics';
import { canEnterPlayStep, resolvePlayStepHref } from '@/lib/play-step-machine';
import { applyRemixDayFilmState } from '@/lib/play-starter';
import { dayToolHref } from '@/lib/mobile-studio';
import { markComfyQueueIntent } from '@/lib/comfy-setup-intent';
import { buildDemoDayStills } from '@/lib/welcome-sample-film';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { resolveFilmFailurePlaybook } from '@/lib/queue-failure-playbook';
import { syncSharedIdentityToCast, withCastFaceQueueParams } from '@/lib/look-outfit-plate';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';

const TOOL_ID = 'day' as const;
type ClothingOption = { value: string; label: string; group?: string };

import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';

export function useDayPlannerToolOrchestrationPart2(ctx: DayPlannerToolOrchestrationCore) {
  const {
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
    setFilmGuideHref,
    busy,
    activeSlotId,
    setActiveSlotId,
    wardrobeLabels,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    selectedModel,
    plate,
    hasPlate,
    isolatePending,
    isolateSubject,
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
  } = ctx;

  const [firstCutCelebrate, setFirstCutCelebrate] = useState(false);
  const starterAutoQueueRef = useRef(false);
  const remixAppliedRef = useRef(false);
  const autoCutRef = useRef(false);
  const pendingAutoCutRef = useRef(false);
  const prevCharacterIdRef = useRef<string | undefined>(undefined);

  // Day stills are cached by slot only — drop them when Cast changes (on this
  // page or elsewhere) so progress never keeps the previous character's face.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const nextId = shared.activeCharacterId?.trim() || '';
    const owner = toolSettings.stillsCharacterId?.trim() || '';
    const prevId = prevCharacterIdRef.current;
    const clearStills = () => {
      stillsRef.current = [];
      updateToolSettings({
        ...dayStillsCachePatch([], undefined),
        referenceIsolated: false,
        plateIsolateSourceKey: undefined,
        plateImageUrl: undefined,
        plateImageFilename: undefined,
        plateOriginalUrl: undefined,
        plateOriginalFilename: undefined,
      });
      assembledFilmRef.current = null;
      setFirstCutCelebrate(false);
      setFilmStatus(null);
      autoCutRef.current = false;
      pendingAutoCutRef.current = false;
    };

    if (prevId === undefined) {
      prevCharacterIdRef.current = nextId;
      // Returning to Day after Cast changed off-page (or legacy unowned stills).
      if (stillsRef.current.length > 0 && !dayStillsBelongToCharacter(owner, nextId)) {
        clearStills();
      }
      return;
    }
    if (prevId === nextId) {
      return;
    }
    prevCharacterIdRef.current = nextId;
    clearStills();
  }, [
    assembledFilmRef,
    mounted,
    setFilmStatus,
    shared.activeCharacterId,
    stillsRef,
    toolSettings.stillsCharacterId,
    updateToolSettings,
  ]);

  const queueAll = useCallback(
    async (options?: { qualityProfile?: 'draft' | 'final' | 'max' }) => {
      setBusy(true);
      setError(null);
      try {
        // Fresh distinct Setting/Beat per daypart — Queue day is the variety pass.
        // Per-slot Queue keeps the current fields (and only fills blanks).
        const diversified = diversifyDaySlotScenes(slots, {
          forceLocations: true,
          forceBeats: true,
          fillBeats: true,
        });
        const queueSlots = diversified.slots;
        if (diversified.changed) {
          updateToolSettings({ slots: queueSlots });
        }
        // Sequential submit — sendComfyUi is single-flight; Promise.all only queues morning
        // and marks the other Day slots as error.
        for (const slot of queueSlots) {
          await queueSlot(slot, {
            manageBusy: false,
            qualityProfile: options?.qualityProfile,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [queueSlot, slots, updateToolSettings]
  );

  const animateSlot = useCallback(
    async (slot: DaySlot, options?: { manageBusy?: boolean }) => {
      const manageBusy = options?.manageBusy !== false;
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const imageUrl = still?.status === 'completed' ? still.imageUrl?.trim() : '';
      if (!imageUrl) {
        setError(
          `${slot.label} still isn’t ready yet — queue it first, wait for the thumbnail here, then Animate.`
        );
        return;
      }
      if (manageBusy) {
        setBusy(true);
      }
      setError(null);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      try {
        const parentEntry = still?.promptId
          ? loadComfyGallery().find(entry => entry.promptId === still.promptId)
          : undefined;
        const videoModel = resolvePreferredVideoModel({
          toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
          sharedModel: shared.model,
        });
        const subject = buildDaySlotMotionSubject(slot, character?.name);
        let prompt = subject;
        try {
          const response = await fetch('/api/video-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: slot.label,
              motion: slot.sceneHints?.trim() || subject,
              model: videoModel,
              durationSec: 4,
            }),
          });
          const data = (await response.json()) as { prompt?: string };
          if (data.prompt?.trim()) {
            prompt = data.prompt.trim();
          }
        } catch {
          /* use subject */
        }
        // 2.0: keep Cast face on Animate — I2V init still is Image 1; pin IP-Adapter too.
        if (character) {
          syncSharedIdentityToCast(character);
        }
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          inputImageUrl: imageUrl,
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: 'i2v',
          clipMode: 'i2v',
          qualityProfile: 'final',
          queueParamsBase: withCastFaceQueueParams(
            { videoFrames: 64, videoFps: 16 },
            character,
            shared.ipAdapterStrength ?? 0.75
          ),
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
        });
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slot.id,
          clipPromptId: typeof promptId === 'string' ? promptId : undefined,
          clipStatus: promptId ? 'queued' : 'error',
          clipUrl: undefined,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        if (promptId) {
          setFilmStatus(
            `Queued ${slot.label.toLowerCase()} clip — motion reel prefers clips when ready.`
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slot.id,
          clipStatus: 'error',
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
      character,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
      shared.model,
      updateToolSettings,
    ]
  );

  const animateAllClips = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const pending = slots.filter(slot => {
        const still = stillsRef.current.find(entry => entry.slotId === slot.id);
        return still?.status === 'completed' && still.clipStatus !== 'completed';
      });
      // Sequential — same single-flight Comfy lock as queueAll.
      for (const slot of pending) {
        await animateSlot(slot, { manageBusy: false });
      }
    } finally {
      setBusy(false);
    }
  }, [animateSlot, slots]);

  const cutDayFilm = useCallback(async () => {
    const shots = dayWatchPlaylist(stillsRef.current, slots);
    if (shots.length === 0) {
      setFilmGuideHref(null);
      setError('Queue and wait for at least one completed slot still before cutting a film.');
      return;
    }
    const name = character?.name?.trim() || 'day';
    setAssemblingFilm(true);
    setError(null);
    setFilmGuideHref(null);
    setFilmNeedsCast(false);
    setFilmStatus('Checking shots…');
    try {
      const result = await assembleAndStampFilm({
        shots,
        characterId: character?.id ?? '',
        characterName: name,
        lookId: character?.activeLookId ?? shared.activeLookId,
        onProgress: progress => setFilmStatus(progress.label),
      });
      downloadFilmBlob(result.blob, result.filename);
      assembledFilmRef.current = {
        filename: result.filename,
        data: new Uint8Array(await result.blob.arrayBuffer()),
      };
      if (character && result.persisted) {
        setFilmNeedsCast(false);
        setFilmStatus(
          `Saved ${result.filename} to ${character.name} (${result.encodePath} encode) and started the download.`
        );
      } else {
        setFilmNeedsCast(true);
        setFilmStatus(
          character
            ? `Downloaded ${result.filename} (${result.encodePath} encode). Save to Cast to stamp a studio copy.`
            : `Downloaded ${result.filename} (${result.encodePath} encode) unstamped. Save to Cast to attach this film.`
        );
        if (character && !result.persisted) {
          setError('Film downloaded — Save film to Cast to stamp it into Gallery.');
        }
      }
      markOnboardingFirstPlayCampaign();
      const firstCut = markOnboardingFirstFilmCut();
      void import('@/lib/local-observability').then(
        ({ noteFilmCutSourceMetric, noteSaveToCastMetric }) => {
          noteFilmCutSourceMetric('day');
          if (character && result.persisted) {
            noteSaveToCastMetric();
          }
        }
      );
      if (character) {
        completePlayCampaign({ characterId: character.id, stepId: 'day' });
      }
      if (firstCut) {
        void import('@/lib/system-tray-celebrate').then(({ celebrateSystemTray }) => {
          celebrateSystemTray('job');
        });
        setFirstCutCelebrate(true);
        setFilmStatus(
          character
            ? `First film cut — watch it on Cast, then cut another Day reel.`
            : `First film cut — pick a Cast lead to save it, or download above.`
        );
      }
    } catch (err) {
      const playbook = resolveFilmFailurePlaybook(
        err instanceof Error ? err.message : 'Could not assemble the film.'
      );
      setError(playbook.message);
      setFilmGuideHref(playbook.href ?? null);
      setFilmStatus(null);
    } finally {
      setAssemblingFilm(false);
    }
  }, [character, shared.activeLookId, setFilmGuideHref, slots]);

  const saveFilmToCast = useCallback(() => {
    if (!character) {
      setError('Pick a Cast character before saving the day film.');
      return;
    }
    const film = assembledFilmRef.current;
    upsertCharacter({
      ...character,
      name: character.name,
    });
    const next = getCharacter(character.id) ?? character;
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(next),
    });
    void import('@/lib/local-observability').then(({ noteSaveToCastMetric }) => {
      noteSaveToCastMetric();
    });
    if (!film?.data?.length) {
      setFilmNeedsCast(true);
      setError('Cut film again — the assembled reel is no longer in memory to stamp.');
      setFilmStatus(`Saved ${next.name} to Cast. Film stamp still needed.`);
      return;
    }
    void (async () => {
      const stamped = await stampAssembledFilm({
        blob: new Blob([film.data.slice()], { type: 'video/mp4' }),
        filename: film.filename || filmDownloadFilename(next.name),
        characterId: next.id,
        characterName: next.name,
        lookId: next.activeLookId,
      });
      if (!stamped.persisted) {
        setFilmNeedsCast(true);
        setError(
          stamped.reason === 'too-large'
            ? 'Film is too large for Gallery storage — download Share cut, or free space and Save again.'
            : 'Could not stamp the film into Gallery — try Save film to Cast again.'
        );
        setFilmStatus(`Saved ${next.name} to Cast. Film stamp pending.`);
        return;
      }
      setFilmNeedsCast(false);
      setError(null);
      setFilmStatus(`Saved ${next.name} to Cast and stamped ${film.filename}.`);
    })();
  }, [character, setError, setFilmNeedsCast, setFilmStatus]);

  const goRoleplay = useCallback(() => {
    const gate = canEnterPlayStep('roleplay', {
      metrics: loadPlayMetrics(),
      campaign: character ? { characterId: character.id, stepIndex: 3 } : null,
    });
    if (!gate.ok) {
      setError(gate.reason ?? 'Cut your first Day film before opening Story.');
      return;
    }
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
      bumpPlayCampaignStep({ characterId: character.id, stepId: 'roleplay' });
      const pack = loadLookPack();
      if (pack) {
        saveLookPack({ ...pack, characterId: character.id });
      }
      router.push(resolvePlayStepHref('roleplay', character.id, pack));
      return;
    }
    router.push('/story');
  }, [character, router, setError]);

  const seedDemoStills = useCallback(() => {
    const demo = buildDemoDayStills();
    stillsRef.current = normalizeDaySlotStills(demo);
    updateToolSettings(dayStillsCachePatch(stillsRef.current, shared.activeCharacterId));
    setFilmStatus('Demo stills loaded — cutting film…');
    setError(null);
    pendingAutoCutRef.current = true;
    void import('@/lib/local-observability').then(({ noteDemoDayStillsMetric }) => {
      noteDemoDayStillsMetric();
    });
  }, [setError, setFilmStatus, shared.activeCharacterId, updateToolSettings, stillsRef]);

  const shareLastCut = useCallback(async () => {
    const film = assembledFilmRef.current;
    if (!film) {
      setError('Cut a film first, then share or download.');
      return;
    }
    const bytes = new Uint8Array(film.data);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    try {
      const shared = await shareFilmBlob(blob, film.filename);
      setFilmStatus(shared ? `Shared ${film.filename}.` : `Downloaded ${film.filename}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share the film.');
    }
  }, [assembledFilmRef, setError, setFilmStatus]);

  const remixSameLookDay = useCallback(() => {
    if (!character?.id) {
      setError('Pick a Cast character before starting a new Day.');
      return;
    }
    applyRemixDayFilmState();
    const next = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    stillsRef.current = [];
    updateToolSettings({
      slots: next.slots,
      ...dayStillsCachePatch([], undefined),
      notes: next.notes,
    });
    setFirstCutCelebrate(false);
    setFilmStatus('Same look · new Day — queueing fresh stills…');
    setError(null);
    autoCutRef.current = false;
    pendingAutoCutRef.current = false;
    starterAutoQueueRef.current = false;
    void queueAll().finally(() => {
      pendingAutoCutRef.current = true;
    });
  }, [character?.id, queueAll, setError, setFilmStatus, stillsRef, updateToolSettings]);

  useEffect(() => {
    if (!mounted || remixAppliedRef.current || typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('remix') !== '1') {
      return;
    }
    remixAppliedRef.current = true;
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      applyRemixDayFilmState();
      const next = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      stillsRef.current = [];
      updateToolSettings({
        slots: next.slots,
        ...dayStillsCachePatch([], undefined),
        notes: next.notes,
      });
      setFirstCutCelebrate(false);
      setFilmStatus('Same look · new Day — ready for fresh stills.');
      autoCutRef.current = false;
      params.delete('remix');
      params.set('autocut', '1');
      const nextQuery = params.toString();
      router.replace(dayToolHref(nextQuery));
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, router, setFilmStatus, stillsRef, updateToolSettings]);

  useEffect(() => {
    if (!mounted || starterAutoQueueRef.current || typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const jumpIn =
      params.get('starter') === '1' || params.get('remix') === '1' || params.get('autocut') === '1';
    if (!jumpIn || params.get('autoqueue') !== '1') {
      return;
    }
    // Wait for isolate-on-white so Image 1 is the cutout, not the busy Keep.
    if (isolateSubject && isolatePending) {
      return;
    }
    starterAutoQueueRef.current = true;
    // Drop cached stills/clips before queueing so auto-cut cannot fire on the last film.
    stillsRef.current = [];
    updateToolSettings(dayStillsCachePatch([], undefined));
    autoCutRef.current = false;
    pendingAutoCutRef.current = false;
    markComfyQueueIntent();
    void (async () => {
      let comfyOk = false;
      try {
        const response = await fetch('/api/health');
        const health = (await response.json()) as { comfyui?: { ok?: boolean } };
        comfyOk = Boolean(health.comfyui?.ok);
      } catch {
        comfyOk = false;
      }
      if (!comfyOk) {
        setFilmStatus(
          'ComfyUI is offline — tap Demo stills to practice Cut, or Heal from the banner.'
        );
        params.delete('autoqueue');
        const next = params.toString();
        router.replace(dayToolHref(next));
        return;
      }
      void import('@/lib/local-observability').then(({ noteStarterDayQueueMetric }) => {
        noteStarterDayQueueMetric();
      });
      await queueAll().finally(() => {
        params.delete('autoqueue');
        params.set('autocut', '1');
        const next = params.toString();
        router.replace(dayToolHref(next));
      });
    })();
  }, [
    isolatePending,
    isolateSubject,
    mounted,
    queueAll,
    router,
    setFilmStatus,
    stillsRef,
    updateToolSettings,
  ]);

  // Auto-cut when all four Day stills complete (starter / demo / remix / explicit autocut).
  useEffect(() => {
    if (!mounted || assemblingFilm || autoCutRef.current) {
      return;
    }
    const completed = stills.filter(entry => entry.status === 'completed' && entry.imageUrl).length;
    if (completed < 4) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const shouldAutoCut =
      pendingAutoCutRef.current ||
      params.get('starter') === '1' ||
      params.get('autocut') === '1' ||
      params.get('remix') === '1';
    if (!shouldAutoCut) {
      return;
    }
    autoCutRef.current = true;
    pendingAutoCutRef.current = false;
    void cutDayFilm();
  }, [assemblingFilm, cutDayFilm, mounted, stills]);

  const completedShotCount = watchPlaylist.length;
  const fittingWardrobe = (activeSlot.wardrobeId || shared.lockedWardrobeId || '').trim();

  return {
    queueAll,
    animateSlot,
    animateAllClips,
    cutDayFilm,
    saveFilmToCast,
    shareLastCut,
    remixSameLookDay,
    goRoleplay,
    seedDemoStills,
    firstCutCelebrate,
    completedShotCount,
    fittingWardrobe,
  };
}
