'use client';

import { inSpokenLanguage, normalizeDubLanguage, requestDubLines } from '@/lib/day/dub';
import { holdJobCompletionEmail } from '@/lib/server/job-completion-email';
import { pronounceForCast } from '@/lib/cast/speech';
import { previouslyOnShots } from '@/lib/play/series';
import { widenStillForFilm } from '@/lib/film/widen-client';
import { isH3Model } from '@/lib/engine/h3-renderer';
import { makeFilmAngles } from '@/lib/film/angles-client';
import { castVoiceOf } from '@/lib/cast/voice';
import { renderNarrationLine } from '@/lib/film/narration-client';
import { applyDayNarration, type DayNarrationLine } from '@/lib/day/narration';
import { filmShapeOf } from '@/lib/video/resolution';
import {
  framedTalkingStill,
  talkingStillFraming,
  talkingStillBody,
} from '@/lib/clip/talking-clip-framing-client';
import { stillWordsSeated } from '@/lib/clip/talking-clip-framing';
import {
  isLtx25Model,
  ROOM_SOUND_UNDER_TALKING,
  stillHeldGesture,
  stillInMotion,
  withAdultLtxLines,
  conversationClipPrompt,
  conversationPartnerNoun,
  LTX25_TALKING_FULL_FRAME_LONG_SIDE,
  normalizeSpokenLine,
  talkingClipPrompt,
} from '@/lib/video/ltx25-renderer';
import { castVoiceSampleFor } from '@/lib/cast/voice';
import { swapDayForCast } from '@/lib/day/cast-park';
import { swapSceneForCast, type SceneToolCache } from '@/lib/day/scenes';
import { useFootwearPhoto } from '@/hooks/useFootwearPhoto';
import { nextDayThread, planTomorrowSlots } from '@/lib/day/thread';
import {
  dayPremiseAvailable,
  requestDayPremiseBeats,
  type DayPremiseBeat,
} from '@/lib/day/premise';
import { sharedLlmRequestBody } from '@/lib/llm/request-options';
import {
  clearDayEventSlots,
  dayEventClipPrompt,
  dayEventMomentWords,
  activeDayEvent,
} from '@/lib/day/event';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { resolveDayClipEngine } from '@/hooks/day-planner/useDayEndPose';
import { activeDayEndPose, dayEndPoseSupported } from '@/lib/day/end-pose';
import { fetchComfyObjectInfoNodeTypesCached } from '@/lib/comfyui/object-info-cache';
import { resolveQueueInputImageFilename } from '@/lib/queue/input-image';
import { dayPartnerNoun } from '@/lib/day/partner';
import { applyCutShotEdits, cutPosterPick, type KeyedShot } from '@/lib/film/cut-plan';
import { bringBackSetAsideDayPatch, dayEpisodeSnapshot } from '@/lib/day/episode-snapshot';
import { dayPosterSubtitle, loadPlaySeriesStore, nextDayFilmTitleCard } from '@/lib/play/series';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  shareFilmBlob,
  stampAssembledFilm,
} from '@/lib/film/character-film-assemble-lazy';
import { filmDownloadFilename } from '@/lib/film/character-film';
import {
  applyCharacterRecord,
  castLoraSessionIds,
  getCharacter,
  upsertCharacter,
} from '@/lib/character/os';
import { markOnboardingFirstFilmCut, markOnboardingFirstPlayCampaign } from '@/lib/play/onboarding';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import {
  dayStillShownImage,
  dayStillsBelongToCharacter,
  dayStillsCachePatch,
  dayWatchPlaylist,
  diversifyDaySlotScenes,
  ensureDaySlotsMatchMood,
  normalizeDaySlotStills,
  upsertDaySlotStill,
  daySlotDefaultLabel,
  type DaySlot,
  type DaySlotId,
  isDayAdultMood,
} from '@/lib/day/planner';
import { buildDaySlotClipPrompt, defaultDayClipDirection } from '@/lib/day/clip-direction';
import { RAPID_DUO_RECIPE_MARK } from '@/lib/prompt/recipe-mark';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { stillPromptPeople } from '@/lib/still/clip-prompt';
import {
  DAY_CLIP_EXTRA_SECONDS,
  dayClipFrames,
  dayClipSeconds,
  normalizeDayClipExtraSeconds,
  type DayPendingDialogue,
} from '@/lib/day/clip-length';
import { spokenLineHeat } from '@/lib/audio/spoken-line';
import { adultAgeLineIn, isAdultContentPrompt } from '@/lib/adult/adult-age-safeguard';
import { loadLookPack, saveLookPack } from '@/lib/look/pack';
import { bumpPlayCampaignStep, completePlayCampaign } from '@/lib/play/campaign';
import { loadPlayMetrics } from '@/lib/play/metrics';
import { canEnterPlayStep, resolvePlayStepHref } from '@/lib/play/step-machine';
import { applyRemixDayFilmState, remixNewOutfitHref } from '@/lib/play/starter';
import { dayThemeById, type DayRemixKind } from '@/lib/play/remix';
import { recordDayFilmEpisode } from '@/lib/play/series';
import { exportFilmPoster, pickPosterStillUrl } from '@/lib/film/poster';
import { dayToolHref, dayToolPathname, toMobileStudioHref } from '@/lib/app/mobile-studio';
import { markComfyQueueIntent } from '@/lib/comfyui/comfy-setup-intent';
import { planAppBurst } from '@/lib/comfyui/comfy-model-turn';
import { buildDemoDayStills } from '@/lib/film/welcome-sample-film';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { resolveFilmFailurePlaybook } from '@/lib/queue/failure-playbook';
import { syncSharedIdentityToCast, withCastFaceQueueParams } from '@/lib/look/outfit-plate';
import { applyCustomGarmentUpload } from '@/lib/fitting/custom-garment-apply';
import { clearDayVacationFaceBreakCache } from '@/lib/day/vacation-face-crop';
import {
  loadSavedFittingGarments,
  removeSavedFittingGarment,
  saveFittingGarment,
  updateSavedFittingGarmentDescription,
} from '@/lib/fitting/saved-garments';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { collectIsolateSourceUrls } from '@/lib/edit/isolate-subject';
import { scanStillWithVision } from '@/lib/vision/still-scan-client';
import { resolveStillFileForVisionScan } from '@/lib/vision/scan-still';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings/cache';
import { DEFAULT_DAY_TOOL_CACHE } from '@/lib/play/settings';

import type { DayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { filmResolutionForCutOptions } from '@/lib/video/resolution';

export function useDayPlannerToolOrchestrationPart2(ctx: DayPlannerToolOrchestrationCore) {
  const {
    sceneMode,
    router,
    setBusy,
    setAssemblingFilm,
    setFilmStatus,
    setFilmNeedsCast,
    stillsRef,
    assembledFilmRef,
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    setError,
    setFilmGuideHref,
    activeSlotId,
    setActiveSlotId,
    assemblingFilm,
    filmCutOptions,
    setFilmCutOptions,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    isolatePending,
    isolateSubject,
    actions,
    updateSlot,
    latestSlotsRef,
    queueSlot,
    queueEventMoment,
    queueEventEnding,
    resolveSlotStillModel,
  } = ctx;

  const [firstCutCelebrate, setFirstCutCelebrate] = useState(false);
  const starterAutoQueueRef = useRef(false);
  const remixAppliedRef = useRef(false);
  /** Label of the themed remix the current Day came from — recorded on its season episode. */
  const dayThemeRef = useRef<string | undefined>(undefined);
  /** Gallery entry of the most recent stamped cut — the poster hangs off it. */
  const lastFilmEntryRef = useRef<string | undefined>(undefined);
  const [posterBusy, setPosterBusy] = useState(false);
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
      // Park this Day under the Cast it belongs to; the active Cast's parked Day comes back.
      // Scene: the open scene is saved and the Cast's newest scene opens (day/scenes.ts).
      const swapped = sceneMode
        ? swapSceneForCast(toolSettings as SceneToolCache, nextId)
        : swapDayForCast(toolSettings, owner, nextId);
      stillsRef.current = swapped.stills ?? [];
      updateToolSettings({
        ...swapped,
        referenceIsolated: false,
        plateIsolateSourceKey: undefined,
        plateCharacterId: undefined,
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

    // Clear only what belongs to another Cast. A change of the active Cast is not enough: on a
    // fresh browser or a phone it goes from none to the real lead when the server copy arrives,
    // and clearing then wiped the stills just pulled (and saved the empty list back).
    if (prevId === undefined || prevId !== nextId) {
      prevCharacterIdRef.current = nextId;
      // Returning to Day after Cast changed off-page (or legacy unowned stills/plates).
      const hasStalePlate = Boolean(
        toolSettings.plateImageUrl?.trim() ||
        toolSettings.plateImageFilename?.trim() ||
        toolSettings.plateIsolateSourceKey?.trim()
      );
      const stillsMismatch =
        stillsRef.current.length > 0 && !dayStillsBelongToCharacter(owner, nextId);
      // The plate's own owner first (stamped when it was isolated); the stills' owner covers
      // plates from before that stamp existed.
      const plateOwner = toolSettings.plateCharacterId?.trim() || owner;
      const plateMismatch =
        hasStalePlate &&
        ((plateOwner && plateOwner !== nextId) || (!plateOwner && Boolean(nextId)));
      if (stillsMismatch || plateMismatch) {
        clearStills();
      }
    }
  }, [
    assembledFilmRef,
    mounted,
    sceneMode,
    setFilmStatus,
    shared.activeCharacterId,
    stillsRef,
    toolSettings,
    updateToolSettings,
  ]);

  const queueAll = useCallback(
    async (options?: { qualityProfile?: 'draft' | 'final' | 'max' }) => {
      setBusy(true);
      setError(null);
      // One "jobs finished" email for the whole Day, when its last still lands — not one per
      // still (the queue runs dry between slots while the next one is prepared).
      const releaseEmail = holdJobCompletionEmail('Your Day', '/day');
      // One shared face crop for the whole Day — prevents per-slot identity float.
      clearDayVacationFaceBreakCache();
      try {
        // Fill blank Setting/Beat only — Suggest day (or manual edit) owns the plan.
        // Adult Solo/Duo still force-rerolls stale everyday leftover boards.
        const moodAligned = ensureDaySlotsMatchMood(slots, {
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
          allowCompanions: toolSettings.allowCompanions === true,
          keepSettings: sceneMode,
        });
        const diversified = diversifyDaySlotScenes(moodAligned.slots, {
          forceLocations: false,
          forceBeats: false,
          fillBeats: true,
          allowCompanions: toolSettings.allowCompanions === true,
          dayMood: toolSettings.dayMood,
          intimateMix: toolSettings.intimateMix,
        });
        const queueSlots = diversified.slots;
        if (moodAligned.changed || diversified.changed) {
          // queueSlot reads the latest slots before the next render.
          latestSlotsRef.current = queueSlots;
          updateToolSettings({ slots: queueSlots });
        }
        // One event: each moment is made from the one before, so they run in order and each
        // waits for the last. From the first moment without a still (all done: from the top);
        // a moment that fails stops the rest, which would be made from it.
        if (activeDayEvent(toolSettings.dayEvent, queueSlots)) {
          const firstOpen = queueSlots.findIndex(
            slot =>
              stillsRef.current.find(still => still.slotId === slot.id)?.status !== 'completed'
          );
          for (const slot of queueSlots.slice(Math.max(0, firstOpen))) {
            await queueSlot(slot, {
              manageBusy: false,
              qualityProfile: options?.qualityProfile,
              byPlayer: true,
            });
            const promptId = stillsRef.current.find(still => still.slotId === slot.id)?.promptId;
            if (!promptId) break;
            const [entry] = await waitForGalleryPromptIds([promptId], {
              timeoutMs: 20 * 60_000,
              pollMs: 3_000,
            });
            if (entry?.status !== 'completed') break;
            // Moment 1 is a Day still, which follows its pose drawing more than its words (legs
            // out where the beat said cross-legged) — the next moments are edits that follow the
            // words, and clip 1 dissolved between the two. One edit of moment 1 to its own beat
            // makes it match the moments after it.
            if (slot.id === queueSlots[0]?.id) {
              const settled = await queueEventMoment(slot, slot);
              if (!settled) break;
              const [settledEntry] = await waitForGalleryPromptIds([settled], {
                timeoutMs: 20 * 60_000,
                pollMs: 3_000,
              });
              if (settledEntry?.status !== 'completed') break;
            }
            // The last moment's ending as its end picture: the last clip moves into it.
            if (slot.id === queueSlots.at(-1)?.id) await queueEventEnding(slot);
          }
          return;
        }
        // Model-aware queue: a mixed Day (Rapid SFW clothed + NSFW nude stills, 2511 handing
        // nude stills to Rapid, 2.1 handing clothed duos to Rapid) runs each engine's stills
        // together instead of switching models between them.
        const engines = await Promise.all(
          queueSlots.map(async slot => ({
            id: slot.id,
            slot,
            model: await resolveSlotStillModel(slot)
              .then(resolved => resolved.queueModel)
              .catch(() => null),
          }))
        );
        const burst = await planAppBurst(engines);
        // Sequential submit — sendComfyUi is single-flight; Promise.all only queues morning
        // and marks the other Day slots as error.
        for (const { slot } of burst.submit) {
          await queueSlot(slot, {
            manageBusy: false,
            qualityProfile: options?.qualityProfile,
            byPlayer: true,
          });
        }
      } finally {
        releaseEmail();
        setBusy(false);
      }
    },
    [
      latestSlotsRef,
      queueEventEnding,
      sceneMode,
      queueEventMoment,
      queueSlot,
      resolveSlotStillModel,
      slots,
      stillsRef,
      toolSettings.allowCompanions,
      toolSettings.dayEvent,
      toolSettings.dayMood,
      toolSettings.intimateMix,
      updateToolSettings,
      setBusy,
      setError,
    ]
  );

  // `queueAll` closes over `slots` and the Day mood from the render that created it. A remix
  // rewrites both and then wants to queue, so it must run the NEXT render's version — otherwise
  // the fresh plan is saved but the previous Day's beats (and mood) are what actually queue.
  const queueAllRef = useRef(queueAll);
  useEffect(() => {
    queueAllRef.current = queueAll;
  }, [queueAll]);

  /** The slot's still widened to 16:9 — made once per still and kept on it. */
  const wideStillUrl = useCallback(
    async (slotId: DaySlotId, imageUrl: string): Promise<string | null> => {
      const current = stillsRef.current.find(entry => entry.slotId === slotId);
      if (current?.wideUrl && current.wideFor === imageUrl) return current.wideUrl;
      setFilmStatus('Widening the still to 16:9…');
      const wide = await widenStillForFilm({
        imageUrl,
        sendComfyUi: actions.sendComfyUi,
        model: shared.model,
        characterId: shared.activeCharacterId,
      }).catch(() => null);
      if (!wide) return null;
      const nextStills = upsertDaySlotStill(stillsRef.current, {
        slotId,
        wideUrl: wide,
        wideFor: imageUrl,
      });
      stillsRef.current = nextStills;
      updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      return wide;
    },
    [
      actions.sendComfyUi,
      shared.activeCharacterId,
      shared.model,
      stillsRef,
      updateToolSettings,
      setFilmStatus,
    ]
  );

  const animateSlot = useCallback(
    async (
      slot: DaySlot,
      options?: {
        manageBusy?: boolean;
        direction?: string;
        extraSeconds?: number;
        /**
         * Longer (Animate sheet): continued in parts once this clip lands — LTX dialogue, or
         * MiniMax-H3 parts (H3 cuts to a new shot past its own ~5 s).
         */
        dialogue?: Pick<DayPendingDialogue, 'targetSec' | 'lines' | 'beats'>;
      }
    ) => {
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
        // LTX-2.5 drifts off two-person sex acts — those clips stay on WAN.
        // A spoken line makes a talking clip (LTX-2.5 speaks it, lip-synced, with sound).
        const spokenLine = normalizeSpokenLine(slot.line);
        const videoModel = resolveDayClipEngine({
          stillPromptId: still?.promptId,
          dayMood: toolSettings.dayMood,
          sharedModel: shared.model,
          speaking: Boolean(spokenLine),
        });
        // MiniMax-H3 speaks a line too (with its own sound); the voice sample, room sound and
        // larger canvas below are LTX-2.5's and do nothing there.
        const speaking = Boolean(spokenLine) && (isLtx25Model(videoModel) || isH3Model(videoModel));
        // End pose: the clip lands on a second picture (first+last frame) when this ComfyUI
        // has the node for the engine; otherwise the plain clip, said once.
        // One event: the clip ends on the next moment's still (day-event.ts) — the joins line up
        // in Cut. An end pose picked by hand still wins. A moment with a line says it on the way.
        const dayEvent = activeDayEvent(toolSettings.dayEvent, slots);
        const momentIndex = dayEvent ? slots.findIndex(entry => entry.id === slot.id) : -1;
        const nextMoment = momentIndex >= 0 ? slots[momentIndex + 1] : undefined;
        const nextMomentStill = nextMoment
          ? stillsRef.current.find(entry => entry.slotId === nextMoment.id)
          : undefined;
        // The last moment ends on its own still: with nothing to land on, its camera pushed in to
        // her face; its ending is a small gesture that leaves her as she was.
        const lastMoment = momentIndex >= 0 && !nextMoment;
        const landOn = lastMoment ? slot : nextMoment;
        const landOnStill = lastMoment ? still : nextMomentStill;
        const eventEndPose =
          landOn && landOnStill?.status === 'completed' && landOnStill.imageUrl?.trim()
            ? {
                imageUrl: landOnStill.imageUrl.trim(),
                source: 'still' as const,
                fromSlotId: landOn.id,
                poseWords: dayEventMomentWords(landOn),
              }
            : undefined;
        const endPose = activeDayEndPose(still) ?? eventEndPose;
        let endImageFilename: string | undefined;
        let endPoseNote = '';
        if (endPose) {
          const nodeTypes = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
          if (dayEndPoseSupported(videoModel, nodeTypes)) {
            endImageFilename = await resolveQueueInputImageFilename({
              imageUrl: endPose.imageUrl,
              filename: `ffab-day-end-pose-${slot.id}-${Date.now()}.png`,
              model: videoModel,
            });
          } else {
            endPoseNote = ' End pose skipped — this ComfyUI can’t pin a last frame on that engine.';
          }
        }
        // A man lead: the beats are written for a woman (see day-lead-gender).
        const manLead = dayPartnerNoun(character ?? {}) === 'man';
        // The slot's beat, or the direction the player gave in the Animate sheet — formatted by
        // the same templates either way (day-clip-direction.ts).
        let prompt = buildDaySlotClipPrompt({
          slot,
          direction: options?.direction,
          characterName: character?.name,
          dayMood: toolSettings.dayMood,
          stillPrompt: parentEntry?.prompt,
          manLead,
          endPoseWords: endImageFilename ? endPose?.poseWords : undefined,
          durationSec: 4 + normalizeDayClipExtraSeconds(options?.extraSeconds),
        });
        // One event, no line and no direction of the player's: she moves into the next moment
        // (or, on the last, rounds the event off) with the camera held.
        if (dayEvent && !spokenLine && !options?.direction?.trim()) {
          prompt = dayEventClipPrompt({
            place: dayEvent.place,
            move: slot.eventMove,
            nextBeat:
              endImageFilename && endPose === eventEndPose && !lastMoment
                ? dayEventMomentWords(landOn ?? {})
                : undefined,
            speaker: manLead ? 'He' : 'She',
          });
        }
        // An adult clip on LTX-2.5 — two-person (Video ltxAdultDuo) or a nude solo still: a calm
        // tempo line, a firmer hold on the still and 1024 (comfyui-config); two-person clips also
        // say the anatomy outright. Solo (2026-10-11): kept her anatomy where the plain clip lost
        // it, and moved like WAN where plain LTX overshot.
        const adultDuoStill = (parentEntry?.prompt ?? '').includes(RAPID_DUO_RECIPE_MARK);
        const fastPace =
          !spokenLine &&
          isLtx25Model(videoModel) &&
          isDayAdultMood(toolSettings.dayMood) &&
          (adultDuoStill || isAdultContentPrompt(parentEntry?.prompt));
        if (fastPace) prompt = withAdultLtxLines(prompt, adultDuoStill);
        // A clothed one-person clip on LTX also holds the still harder at 1024: her face stayed
        // closer to the still than plain LTX or WAN (8 stills, 2026-10-11: 0.55 vs 0.71 / 0.79).
        const holdStill =
          fastPace ||
          (!spokenLine &&
            isLtx25Model(videoModel) &&
            stillPromptPeople(parentEntry?.prompt) === 1 &&
            !isAdultContentPrompt(parentEntry?.prompt));
        // A reply on a two-person still: a one-shot conversation (both speak, LTX gives each a
        // voice and their own lip movement).
        const replyLine = normalizeSpokenLine(slot.replyLine);
        const conversation =
          speaking && Boolean(replyLine) && stillPromptPeople(parentEntry?.prompt) >= 2;
        // A talking clip starts chest-up when her face is small in the still (the lips are
        // unreadable full-body) — not with an end pose, whose frame matches the full still.
        const framed =
          speaking && !conversation && !endImageFilename && !slot.lineFullFrame && imageUrl
            ? await framedTalkingStill(imageUrl)
            : null;
        // Kept whole and not already close: wording that holds the framing, or LTX punches in
        // to her face (talking-clip-framing.ts).
        const framing =
          speaking && !conversation && !framed && imageUrl
            ? await talkingStillFraming(imageUrl)
            : 'close';
        // The still's pose: seated or lying (else its words) — only then the seated hold — and the
        // limbs it caught mid-action, which the clip relaxes instead of freezing.
        const stillBody =
          speaking && !conversation && imageUrl
            ? await talkingStillBody(imageUrl, parentEntry?.prompt)
            : null;
        const seated =
          framing !== 'close' &&
          (stillBody?.posture ?? (stillWordsSeated(parentEntry?.prompt) ? 'seated' : null)) ===
            'seated';
        if (speaking) {
          // Talking: she stays put facing the camera (the beat's motion walked her out of frame
          // mid-line). An adult still's age sentence stays with the clip.
          const ageLine = adultAgeLineIn(parentEntry?.prompt ?? '');
          const lead = manLead ? 'man' : 'woman';
          prompt = [
            dayEvent && !conversation && endImageFilename && endPose === eventEndPose
              ? dayEventClipPrompt({
                  place: dayEvent.place,
                  move: slot.eventMove,
                  nextBeat: lastMoment ? undefined : dayEventMomentWords(landOn ?? {}),
                  speaker: manLead ? 'He' : 'She',
                  line: pronounceForCast(spokenLine, shared.activeCharacterId),
                })
              : conversation
                ? conversationClipPrompt({
                    setting: slot.location,
                    line: pronounceForCast(spokenLine, shared.activeCharacterId),
                    reply: replyLine && pronounceForCast(replyLine, shared.activeCharacterId),
                    tone: slot.lineTone,
                    lead,
                    partner: conversationPartnerNoun(parentEntry?.prompt, lead),
                  })
                : talkingClipPrompt({
                    setting: slot.location,
                    line: pronounceForCast(spokenLine, shared.activeCharacterId),
                    speaker: manLead ? 'He' : 'She',
                    tone: slot.lineTone,
                    framing,
                    seated,
                    inMotion: stillInMotion(parentEntry?.prompt),
                    heldGesture: stillHeldGesture(parentEntry?.prompt),
                    ...(stillBody ? { limbs: stillBody.limbs } : {}),
                  }),
            ageLine,
          ]
            .filter(Boolean)
            .join(' ');
          // Dub: the line (and reply) said in the slot's language (day-dub.ts).
          prompt = inSpokenLanguage(prompt, slot.lineLanguage);
        }
        // 2.0: keep Cast face + pinned LoRAs on Animate — I2V init still is Image 1.
        if (character) {
          syncSharedIdentityToCast(character);
        }
        const castLoras = castLoraSessionIds(character);
        // Widescreen film: the clip starts from the still widened to 16:9 (kept on the still).
        let startUrl = imageUrl;
        if (toolSettings.widescreenFilm === true && !framed) {
          const wide = await wideStillUrl(slot.id, imageUrl);
          if (wide) startUrl = wide;
        }
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          ...(framed ? { inputImage: framed } : { inputImageUrl: startUrl }),
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: 'i2v',
          clipMode: 'i2v',
          qualityProfile: 'final',
          queueParamsBase: withCastFaceQueueParams(
            {
              // Motion ~4 s, talking ~5 s (a line of ~14 words), a conversation ~6 s — plus
              // the Animate sheet's Length pick (day-clip-length.ts).
              videoFrames: dayClipFrames({
                speaking,
                conversation,
                extraSeconds: options?.extraSeconds,
              }),
              ...(holdStill ? { videoStillHold: 'on' as const } : {}),
              // Refine detail (Video ltxRefine): any LTX clip — a talking one keeps its voice
              // and lip timing (4 clips, 2026-10-11).
              ...(isLtx25Model(videoModel) &&
              loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).ltxRefine === true
                ? { videoRefine: 'on' as const }
                : {}),
              videoFps: 16,
              ...(endImageFilename ? { videoEndImageFilename: endImageFilename } : {}),
              ...(speaking
                ? {
                    videoSpeech: 'on',
                    // A kept voice would pull both speakers toward hers — not in a conversation.
                    ...(conversation ? {} : castVoiceSampleFor(shared.activeCharacterId)),
                    // Not cropped chest-up: render larger so the small face holds.
                    ...(framed ? {} : { videoLongSide: LTX25_TALKING_FULL_FRAME_LONG_SIDE }),
                    // The place's room sound under the voice (ROOM_SOUND_UNDER_TALKING; the
                    // talkAmbience checkbox under the line, on by default).
                    ...(ROOM_SOUND_UNDER_TALKING &&
                    slot.location?.trim() &&
                    loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).talkAmbience !== false
                      ? { videoAmbience: slot.location.trim() }
                      : {}),
                  }
                : {}),
            },
            character,
            shared.ipAdapterStrength ?? 0.75
          ),
          ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
        });
        // Longer: a one-person talking clip on LTX-2.5 lip-syncs its extension parts; a
        // MiniMax-H3 clip not pinned to a last frame grows in H3 parts. Kept on the still for this
        // clip job; a new Animate replaces or clears it.
        const growsInParts =
          !conversation &&
          ((speaking && isLtx25Model(videoModel)) || (isH3Model(videoModel) && !endImageFilename));
        const dialogue =
          options?.dialogue?.lines.length && growsInParts && typeof promptId === 'string'
            ? {
                targetSec: options.dialogue.targetSec,
                lines: options.dialogue.lines,
                ...(slot.lineTone &&
                slot.lineTone !== 'natural' &&
                options.dialogue.lines.some(Boolean)
                  ? { tones: options.dialogue.lines.map(() => slot.lineTone as string) }
                  : {}),
                ...(options.dialogue.beats?.length ? { beats: options.dialogue.beats } : {}),
                forClip: promptId,
              }
            : undefined;
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slot.id,
          clipPromptId: typeof promptId === 'string' ? promptId : undefined,
          clipStatus: promptId ? 'queued' : 'error',
          clipUrl: undefined,
          pendingDialogue: dialogue,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        if (promptId) {
          setFilmStatus(
            `Queued ${slot.label.toLowerCase()} clip${
              endImageFilename ? ' (ending on its end pose)' : ''
            } — motion reel prefers clips when ready.${endPoseNote}`
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slot.id,
          clipStatus: 'error',
          pendingDialogue: undefined,
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
      toolSettings.widescreenFilm,
      wideStillUrl,
      actions,
      character,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.ipAdapterStrength,
      shared.model,
      slots,
      stillsRef,
      toolSettings.dayEvent,
      toolSettings.dayMood,
      updateToolSettings,
      setActiveSlotId,
      setBusy,
      setError,
      setFilmStatus,
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
      // Model-aware queue: adult duo clips stay on WAN, the rest may be LTX — each engine's
      // clips run together.
      const burst = await planAppBurst(
        pending.map(slot => ({
          id: slot.id,
          slot,
          model: resolveDayClipEngine({
            stillPromptId: stillsRef.current.find(entry => entry.slotId === slot.id)?.promptId,
            dayMood: toolSettings.dayMood,
            sharedModel: shared.model,
          }),
        }))
      );
      // Sequential — same single-flight Comfy lock as queueAll.
      for (const { slot } of burst.submit) {
        await animateSlot(slot, { manageBusy: false });
      }
    } finally {
      setBusy(false);
    }
  }, [animateSlot, shared.model, slots, stillsRef, toolSettings.dayMood, setBusy, setError]);

  /**
   * Dub (day-dub.ts): every spoken line (and reply) translated, then each talking clip made
   * again with the line said in that language. `null` puts the original lines back. Returns
   * what happened, for the note.
   */
  const dubDay = useCallback(
    async (language: string | null): Promise<string> => {
      const target = normalizeDubLanguage(language ?? '');
      const spoken = slots.filter(slot => normalizeSpokenLine(slot.lineOriginal || slot.line));
      if (spoken.length === 0) throw new Error('No moment has a spoken line to dub.');
      const current = spoken.find(slot => slot.lineLanguage)?.lineLanguage;
      if ((target ?? null) === (current ?? null)) {
        return target ? `Already in ${target}.` : 'The lines are already as written.';
      }
      setBusy(true);
      setError(null);
      try {
        const sources = spoken.map(slot => ({
          line: normalizeSpokenLine(slot.lineOriginal || slot.line),
          reply: normalizeSpokenLine(slot.replyOriginal || slot.replyLine),
        }));
        let changed: DaySlot[];
        if (!target) {
          changed = spoken.map((slot, index) => ({
            ...slot,
            line: sources[index]!.line,
            replyLine: sources[index]!.reply || undefined,
            lineLanguage: undefined,
            lineOriginal: undefined,
            replyOriginal: undefined,
          }));
        } else {
          const translated = await requestDubLines(
            sources.flatMap(source => (source.reply ? [source.line, source.reply] : [source.line])),
            target,
            sharedLlmRequestBody(loadSettingsCache().shared)
          );
          let next = 0;
          changed = spoken.map((slot, index) => {
            const source = sources[index]!;
            const line = normalizeSpokenLine(translated[next++]);
            const reply = source.reply ? normalizeSpokenLine(translated[next++]) : '';
            return {
              ...slot,
              line,
              replyLine: reply || undefined,
              lineLanguage: target,
              lineOriginal: source.line,
              replyOriginal: source.reply || undefined,
            };
          });
        }
        const byId = new Map(changed.map(slot => [slot.id, slot]));
        updateToolSettings({ slots: slots.map(slot => byId.get(slot.id) ?? slot) });
        let remade = 0;
        for (const slot of changed) {
          const still = stillsRef.current.find(entry => entry.slotId === slot.id);
          if (still?.status !== 'completed') continue;
          await animateSlot(slot, { manageBusy: false });
          remade += 1;
        }
        const lines = `${changed.length} line${changed.length === 1 ? '' : 's'}`;
        const clips = remade
          ? ` — ${remade} talking clip${remade === 1 ? '' : 's'} queued again`
          : ' — Animate the moments to hear them';
        return target ? `${lines} in ${target}${clips}.` : `${lines} back as written${clips}.`;
      } finally {
        setBusy(false);
      }
    },
    [animateSlot, slots, stillsRef, updateToolSettings, setBusy, setError]
  );

  /** Close-ups of a slot's still (a face close-up and a detail), cut in right after it. */
  /** A close-up widened to 16:9 for a widescreen cut — made once and kept on the angle. */
  const wideAngleUrl = useCallback(
    async (slotId: DaySlotId, imageUrl: string): Promise<string | null> => {
      const angles = stillsRef.current.find(entry => entry.slotId === slotId)?.angles ?? [];
      const angle = angles.find(entry => entry.imageUrl === imageUrl);
      if (!angle) return null;
      if (angle.wideUrl) return angle.wideUrl;
      const wide = await widenStillForFilm({
        imageUrl,
        sendComfyUi: actions.sendComfyUi,
        model: shared.model,
        characterId: shared.activeCharacterId,
      }).catch(() => null);
      if (!wide) return null;
      const latest = stillsRef.current.find(entry => entry.slotId === slotId)?.angles ?? [];
      const nextStills = upsertDaySlotStill(stillsRef.current, {
        slotId,
        angles: latest.map(entry =>
          entry.imageUrl === imageUrl ? { ...entry, wideUrl: wide } : entry
        ),
      });
      stillsRef.current = nextStills;
      updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      return wide;
    },
    [actions.sendComfyUi, shared.activeCharacterId, shared.model, stillsRef, updateToolSettings]
  );

  const addCloseUps = useCallback(
    async (slotId: DaySlotId) => {
      const slot = slots.find(entry => entry.id === slotId);
      const still = stillsRef.current.find(entry => entry.slotId === slotId);
      const imageUrl = still?.status === 'completed' ? still.imageUrl?.trim() : '';
      if (!slot || !imageUrl) return;
      setFilmStatus(`Making close-ups of ${slot.label}…`);
      setBusy(true);
      try {
        const angles = await makeFilmAngles({
          imageUrl,
          moment: slot.sceneHints ?? '',
          manLead: dayPartnerNoun(character ?? {}) === 'man',
          sendComfyUi: actions.sendComfyUi,
          model: shared.model,
          characterId: shared.activeCharacterId,
        });
        if (!angles.length) {
          setError('The close-ups did not finish — check the queue and try again.');
          return;
        }
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId,
          angles: angles.map(angle => ({ ...angle, for: imageUrl })),
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
        setFilmStatus(
          `${slot.label}: ${angles.length} close-up${angles.length === 1 ? '' : 's'} added to the cut.`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not make the close-ups.');
        setFilmStatus(null);
      } finally {
        setBusy(false);
      }
    },
    [
      actions.sendComfyUi,
      character,
      shared.activeCharacterId,
      shared.model,
      slots,
      stillsRef,
      updateToolSettings,
      setBusy,
      setError,
      setFilmStatus,
    ]
  );

  /** Record narration lines not yet rendered (Cut film, and the Cut preview's Record button). */
  const recordDayNarration = useCallback(
    async (lines: DayNarrationLine[]) => {
      for (const { slotId, label, line } of lines) {
        setFilmStatus(`Recording the narration for ${label}…`);
        const url = await renderNarrationLine({
          line,
          speaker: dayPartnerNoun(character ?? {}) === 'man' ? 'man' : 'woman',
          voiceSample: castVoiceOf(character?.id)?.sample,
        }).catch(() => undefined);
        if (!url) continue;
        const nextStills = upsertDaySlotStill(stillsRef.current, {
          slotId: slotId as DaySlotId,
          narrationUrl: url,
          narrationFor: line,
        });
        stillsRef.current = nextStills;
        updateToolSettings(dayStillsCachePatch(nextStills, shared.activeCharacterId));
      }
    },
    [character, setFilmStatus, shared.activeCharacterId, stillsRef, updateToolSettings]
  );

  const cutDayFilm = useCallback(
    async (options?: { excludeKeys?: string[] }) => {
      // The shot list (order, leave-outs, captions, holds), plus any shots left out at the
      // pre-cut check.
      const edits = filmCutOptions.shotEdits;
      const excluded = options?.excludeKeys ?? [];
      const shots = applyCutShotEdits(
        dayWatchPlaylist(stillsRef.current, slots) as KeyedShot[],
        excluded.length > 0
          ? {
              ...edits,
              shots: {
                ...edits?.shots,
                ...Object.fromEntries(
                  excluded.map(key => [key, { ...edits?.shots?.[key], include: false }])
                ),
              },
            }
          : edits
      );
      if (shots.length === 0) {
        setFilmGuideHref(null);
        setError('Queue and wait for at least one completed slot still before cutting a film.');
        return;
      }
      const name = character?.name?.trim() || 'day';
      setAssemblingFilm(true);
      // Widescreen film: stills in a 16:9 cut are widened too (clips already start from one).
      if (toolSettings.widescreenFilm === true && filmShapeOf(filmCutOptions) === 'wide') {
        for (const [index, shot] of shots.entries()) {
          if (shot.kind !== 'still' || !shot.key) continue;
          // A close-up's key is "<slot>#face" / "<slot>#detail".
          const [slotKey, angleKind] = shot.key.split('#');
          const slotId = slotKey as DaySlotId;
          if (!slots.some(slot => slot.id === slotId)) continue;
          setFilmStatus(`Widening ${shot.title} to 16:9…`);
          const wide = angleKind
            ? await wideAngleUrl(slotId, shot.url)
            : await wideStillUrl(slotId, shot.url);
          if (wide) shots[index] = { ...shot, url: wide };
        }
      }
      // Narration: each slot's voice-over, rendered once per line and kept on the still (the
      // Cut preview records them the same way — recordDayNarration).
      await recordDayNarration(applyDayNarration(shots, slots, stillsRef.current).missing);
      shots.splice(0, shots.length, ...applyDayNarration(shots, slots, stillsRef.current).shots);
      // "Previously on": a few shots of the season's last episode open this one.
      const recap =
        character && filmCutOptions.previouslyOn !== false
          ? previouslyOnShots(loadPlaySeriesStore(), character.id, name)
          : [];
      setError(null);
      setFilmGuideHref(null);
      setFilmNeedsCast(false);
      setFilmStatus('Checking shots…');
      try {
        const result = await assembleAndStampFilm({
          source: 'day',
          shots: recap.length ? [...(recap as KeyedShot[]), ...shots] : shots,
          characterId: character?.id ?? '',
          characterName: name,
          lookId: character?.activeLookId ?? shared.activeLookId,
          crossfadeSec: filmCutOptions.crossfadeSec,
          resolution: filmResolutionForCutOptions(filmCutOptions),
          audioBedUrl: filmCutOptions.audioBedUrl.trim() || undefined,
          musicLevel: filmCutOptions.musicLevel,
          voiceLevel: filmCutOptions.voiceLevel,
          stillMotion: filmCutOptions.stillMotion !== false,
          captions: filmCutOptions.titles === true,
          subtitles: filmCutOptions.subtitles !== false,
          // After a "Previously on" recap, the title card follows it.
          titleCard: filmCutOptions.titles
            ? {
                ...(character
                  ? nextDayFilmTitleCard(loadPlaySeriesStore(), character.id, name)
                  : { title: name }),
                ...(recap.length ? { afterShots: recap.length } : {}),
              }
            : null,
          length: filmCutOptions.length,
          beatSnap: filmCutOptions.beatSnap,
          onProgress: progress => setFilmStatus(progress.label),
        });
        downloadFilmBlob(result.blob, result.filename);
        assembledFilmRef.current = {
          filename: result.filename,
          data: new Uint8Array(await result.blob.arrayBuffer()),
        };
        lastFilmEntryRef.current = result.entryId;
        if (character && result.persisted) {
          recordDayFilmEpisode({
            characterId: character.id,
            characterName: character.name,
            filename: result.filename,
            galleryEntryId: result.entryId,
            theme: dayThemeRef.current,
            // For the season page: what this episode looked like and where it went.
            posterUrl:
              slots
                .map(slot =>
                  dayStillShownImage(stillsRef.current.find(still => still.slotId === slot.id))
                )
                .find(url => url && !url.startsWith('data:')) || undefined,
            places: slots.map(slot => slot.location?.trim() ?? '').filter(Boolean),
            beats: slots.map(slot => slot.sceneHints?.trim() ?? '').filter(Boolean),
            // The Day itself, so the Cast page can show it and open it again.
            day: dayEpisodeSnapshot({ ...toolSettings, slots, stills: stillsRef.current }),
          });
          setFilmNeedsCast(false);
          setFilmStatus(
            `Saved ${result.filename} to ${character.name} (${result.encodePath} encode${
              result.cutNotes.length ? ` · ${result.cutNotes.join(' · ')}` : ''
            }) and started the download.`
          );
        } else {
          setFilmNeedsCast(true);
          setFilmStatus(
            character
              ? `Downloaded ${result.filename} (${result.encodePath} encode${
                  result.cutNotes.length ? ` · ${result.cutNotes.join(' · ')}` : ''
                }). Save to Cast to stamp a studio copy.`
              : `Downloaded ${result.filename} (${result.encodePath} encode${
                  result.cutNotes.length ? ` · ${result.cutNotes.join(' · ')}` : ''
                }) unstamped. Save to Cast to attach this film.`
          );
          if (character && !result.persisted) {
            setError('Film downloaded — Save film to Cast to stamp it into Gallery.');
          }
        }
        markOnboardingFirstPlayCampaign();
        const firstCut = markOnboardingFirstFilmCut();
        void import('@/lib/server/local-observability').then(
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
          void import('@/lib/app/system-tray-celebrate').then(({ celebrateSystemTray }) => {
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
    },
    [
      character,
      filmCutOptions,
      shared.activeLookId,
      setFilmGuideHref,
      slots,
      toolSettings,
      wideAngleUrl,
      stillsRef,
      wideStillUrl,
      assembledFilmRef,
      recordDayNarration,
      setAssemblingFilm,
      setError,
      setFilmNeedsCast,
      setFilmStatus,
    ]
  );

  /**
   * What Animate would send for a slot, for the Animate sheet: the engine, and the prompt built
   * from a direction (the beat by default) the way Animate builds it. A talking slot speaks its
   * line instead (talkingClipPrompt), so the direction does not apply there.
   */
  const previewSlotClip = useCallback(
    (slot: DaySlot, direction?: string, extraSeconds?: number) => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const parentEntry = still?.promptId
        ? loadComfyGallery().find(entry => entry.promptId === still.promptId)
        : undefined;
      const spokenLine = normalizeSpokenLine(slot.line);
      const engine = resolveDayClipEngine({
        stillPromptId: still?.promptId,
        dayMood: toolSettings.dayMood,
        sharedModel: shared.model,
        speaking: Boolean(spokenLine),
      });
      const talking = Boolean(spokenLine) && isLtx25Model(engine);
      // Same length rule as animateSlot: talking / conversation clips start longer.
      const speaking = Boolean(spokenLine) && (isLtx25Model(engine) || isH3Model(engine));
      const conversation =
        speaking &&
        Boolean(normalizeSpokenLine(slot.replyLine)) &&
        stillPromptPeople(parentEntry?.prompt) >= 2;
      const lengthSeconds = DAY_CLIP_EXTRA_SECONDS.map(extraSeconds =>
        dayClipSeconds(dayClipFrames({ speaking, conversation, extraSeconds }), engine)
      );
      // Longer dialogue (extension parts that each say a line): one speaker on LTX-2.5, and not a
      // clip pinned to a last frame (an end pose / an event's next moment) — parts would run on
      // past it.
      const pinned = Boolean(
        activeDayEndPose(still) || activeDayEvent(toolSettings.dayEvent, slots)
      );
      const longDialogue = talking && !conversation && !pinned;
      // MiniMax-H3 past its own ~5 s cuts to a new shot: a longer H3 clip is the first clip
      // then H3 parts (not when pinned to a last frame — the parts would run on past it).
      const h3Chain = isH3Model(engine) && !conversation && !pinned;
      const manLead = dayPartnerNoun(character ?? {}) === 'man';
      const prompt = talking
        ? inSpokenLanguage(
            talkingClipPrompt({
              setting: slot.location,
              line: pronounceForCast(spokenLine, shared.activeCharacterId),
              tone: slot.lineTone,
            }),
            slot.lineLanguage
          )
        : buildDaySlotClipPrompt({
            slot,
            direction,
            characterName: character?.name,
            dayMood: toolSettings.dayMood,
            stillPrompt: parentEntry?.prompt,
            manLead,
            durationSec: 4 + normalizeDayClipExtraSeconds(extraSeconds),
          });
      return {
        engine,
        engineLabel: isLtx25Model(engine)
          ? 'LTX-2.5'
          : (getComfyModelDefinition(engine)?.label ?? engine),
        talking,
        // MiniMax-H3 renders a longer clip with no spoken line silent (h3RendersSound) — only
        // still offered when pinned to a last frame; otherwise H3 grows in parts with sound.
        silentWhenLong: isH3Model(engine) && !spokenLine && !h3Chain,
        ...(h3Chain ? { chainLength: { firstSec: lengthSeconds[0] ?? 5 } } : {}),
        prompt,
        defaultDirection: defaultDayClipDirection(slot, character?.name),
        lengthSeconds,
        ...(longDialogue
          ? {
              talkLength: {
                firstSec: lengthSeconds[0] ?? 5,
                lead: manLead ? ('man' as const) : ('woman' as const),
                scene: slot.sceneHints?.trim() || still?.beatKey?.trim() || slot.label,
                setting: slot.location,
                when: slot.label,
                heat: spokenLineHeat(toolSettings.dayMood),
                castId: character?.id,
              },
            }
          : {}),
      };
    },
    [
      character,
      shared.activeCharacterId,
      shared.model,
      slots,
      stillsRef,
      toolSettings.dayEvent,
      toolSettings.dayMood,
    ]
  );

  // "Open this Day again" (Cast → Seasons) set the Day it replaced aside — offer it back.
  const setAsideDay = toolSettings.setAsideDay ?? null;
  const bringBackSetAsideDay = useCallback(() => {
    const patch = bringBackSetAsideDayPatch(toolSettings);
    if (!patch) return;
    stillsRef.current = patch.stills ?? [];
    updateToolSettings(patch);
  }, [stillsRef, toolSettings, updateToolSettings]);
  const dismissSetAsideDay = useCallback(
    () => updateToolSettings({ setAsideDay: undefined }),
    [updateToolSettings]
  );

  /** Save a poster frame from a finished still, matching the cut's aspect. */
  const saveFilmPoster = useCallback(async () => {
    // The shot picked as poster in the shot list (a clip: one of its frames), else a still.
    const picked = cutPosterPick(
      applyCutShotEdits(
        dayWatchPlaylist(stillsRef.current, slots) as KeyedShot[],
        filmCutOptions.shotEdits
      ),
      filmCutOptions.shotEdits
    );
    const posterUrl =
      picked && 'imageUrl' in picked
        ? picked.imageUrl
        : pickPosterStillUrl(slots, stillsRef.current, activeSlotId);
    if (!posterUrl && !picked) {
      setError('Queue and wait for at least one completed slot still before saving a poster.');
      return;
    }
    setPosterBusy(true);
    setError(null);
    setFilmStatus('Rendering poster…');
    try {
      const poster = await exportFilmPoster({
        ...(picked && 'videoUrl' in picked
          ? { videoFrame: { url: picked.videoUrl, timeSec: picked.timeSec } }
          : { imageUrl: posterUrl ?? undefined }),
        characterName: character?.name?.trim() || 'day',
        characterId: character?.id,
        lookId: character?.activeLookId,
        parentGalleryEntryId: lastFilmEntryRef.current,
        resolution: filmResolutionForCutOptions(filmCutOptions),
        // The episode was recorded at Cut, so the poster names the season it landed in.
        titleCard: filmCutOptions.titles
          ? { title: character?.name?.trim() || 'Day', subtitle: dayPosterSubtitle(character?.id) }
          : null,
      });
      downloadFilmBlob(poster.blob, poster.filename);
      setFilmStatus(
        poster.persisted
          ? `Saved ${poster.filename} (${poster.width}×${poster.height}) to Gallery and started the download.`
          : `Downloaded ${poster.filename} (${poster.width}×${poster.height}). Studio storage could not keep a copy.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the poster.');
      setFilmStatus(null);
    } finally {
      setPosterBusy(false);
    }
  }, [activeSlotId, character, filmCutOptions, slots, setError, setFilmStatus, stillsRef]);

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
    void import('@/lib/server/local-observability').then(({ noteSaveToCastMetric }) => {
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
  }, [character, setError, setFilmNeedsCast, setFilmStatus, assembledFilmRef]);

  const goRoleplay = useCallback(() => {
    const gate = canEnterPlayStep('roleplay', {
      metrics: loadPlayMetrics(),
      campaign: character ? { characterId: character.id, stepIndex: 3 } : null,
    });
    if (!gate.ok) {
      setError(gate.reason ?? 'Finish a Day — every still rendered — before opening Story.');
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
    void import('@/lib/server/local-observability').then(({ noteDemoDayStillsMetric }) => {
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

  const runRemixDay = useCallback(
    (applyOptions: { kind?: DayRemixKind; themeId?: string | null }, status: string) => {
      if (!character?.id) {
        setError('Pick a Cast character before starting a new Day.');
        return;
      }
      applyRemixDayFilmState(applyOptions);
      dayThemeRef.current = dayThemeById(applyOptions.themeId)?.label;
      const next = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      stillsRef.current = [];
      updateToolSettings({
        // A new Day is a whole day again (One event ends with its Day).
        slots: next.dayEvent
          ? clearDayEventSlots(next.slots ?? [], daySlotDefaultLabel)
          : next.slots,
        dayEvent: undefined,
        dayMood: next.dayMood,
        ...dayStillsCachePatch([], undefined),
        notes: next.notes,
      });
      setFirstCutCelebrate(false);
      setFilmStatus(status);
      setError(null);
      autoCutRef.current = false;
      pendingAutoCutRef.current = false;
      starterAutoQueueRef.current = false;
      // Deferred to the next macrotask so the tool-settings commit above has landed and
      // `queueAllRef` points at a `queueAll` that sees the new slots and mood.
      setTimeout(() => {
        void queueAllRef.current().finally(() => {
          pendingAutoCutRef.current = true;
        });
      }, 0);
    },
    [character?.id, setError, setFilmStatus, stillsRef, updateToolSettings]
  );

  // Tomorrow: the next episode of this Cast's season, written to follow on from this Day.
  const [writingTomorrow, setWritingTomorrow] = useState(false);
  const castId = character?.id;
  const castName = character?.name ?? '';
  const startTomorrow = useCallback(async () => {
    if (!castId) {
      setError('Pick a Cast character before starting a new Day.');
      return;
    }
    if (writingTomorrow) return;
    const thread = nextDayThread(toolSettings.dayThread, slots);
    const yesterday = thread?.yesterday ?? [];
    let beats: DayPremiseBeat[] | null = null;
    setWritingTomorrow(true);
    if (dayPremiseAvailable(toolSettings.dayMood) && yesterday.length > 0) {
      setFilmStatus('Tomorrow — writing the next day…');
      try {
        beats = await requestDayPremiseBeats({
          premise: thread?.premise ?? '',
          slotIds: slots.map(slot => slot.id),
          companions: toolSettings.allowCompanions === true,
          previousBeats: yesterday,
          llmBody: sharedLlmRequestBody(shared),
        });
      } catch {
        // LLM off or no usable beats: Day's own fresh picks below.
        beats = null;
      }
    }
    const nextSlots = planTomorrowSlots(slots, {
      beats,
      yesterday,
      dayMood: toolSettings.dayMood,
      intimateMix: toolSettings.intimateMix,
      allowCompanions: toolSettings.allowCompanions === true,
    });
    const episode = nextDayFilmTitleCard(loadPlaySeriesStore(), castId, castName).subtitle;
    stillsRef.current = [];
    updateToolSettings({
      slots: toolSettings.dayEvent ? clearDayEventSlots(nextSlots, daySlotDefaultLabel) : nextSlots,
      dayThread: thread,
      dayEvent: undefined,
      ...dayStillsCachePatch([], undefined),
    });
    setWritingTomorrow(false);
    setFirstCutCelebrate(false);
    setError(null);
    setFilmStatus(
      `${episode} — ${beats ? 'the next day, following on' : 'a fresh day'}; queueing stills…`
    );
    autoCutRef.current = false;
    pendingAutoCutRef.current = false;
    starterAutoQueueRef.current = false;
    // Next macrotask, so queueAll sees the new slots (as Same look, new Day).
    setTimeout(() => {
      void queueAllRef.current().finally(() => {
        pendingAutoCutRef.current = true;
      });
    }, 0);
  }, [
    castId,
    castName,
    setError,
    setFilmStatus,
    shared,
    slots,
    stillsRef,
    toolSettings.allowCompanions,
    toolSettings.dayEvent,
    toolSettings.dayMood,
    toolSettings.dayThread,
    toolSettings.intimateMix,
    updateToolSettings,
    writingTomorrow,
  ]);

  const remixSameLookDay = useCallback(() => {
    runRemixDay({}, 'Same look · new Day — queueing fresh stills…');
  }, [runRemixDay]);

  /** Same look, but a themed Setting + Beat set (rainy day, workday, city trip, …). */
  const remixThemeDay = useCallback(
    (themeId: string) => {
      const theme = dayThemeById(themeId);
      if (!theme) {
        return;
      }
      runRemixDay(
        { kind: 'theme', themeId: theme.id },
        `${theme.label} day — queueing fresh stills…`
      );
    },
    [runRemixDay]
  );

  /** Same Day plan (Settings + Beats), new Outfit: clear stills and kits, then pick on Outfit. */
  const remixNewOutfitDay = useCallback(() => {
    if (!castId) {
      setError('Pick a Cast character before starting a new Day.');
      return;
    }
    applyRemixDayFilmState({ kind: 'new-outfit' });
    const next = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    stillsRef.current = [];
    updateToolSettings({
      // A new Day is a whole day again (One event ends with its Day).
      slots: next.dayEvent ? clearDayEventSlots(next.slots ?? [], daySlotDefaultLabel) : next.slots,
      dayEvent: undefined,
      customGarmentImageUrl: undefined,
      customGarmentImageFilename: undefined,
      customGarmentDescription: undefined,
      ...dayStillsCachePatch([], undefined),
      notes: next.notes,
    });
    updateShared({ lockedWardrobeId: undefined });
    setFirstCutCelebrate(false);
    setError(null);
    autoCutRef.current = false;
    pendingAutoCutRef.current = false;
    starterAutoQueueRef.current = false;
    setFilmStatus('Same Day · new outfit — pick a new Outfit, then Continue to Day.');
    const href = remixNewOutfitHref(castId, loadLookPack());
    router.push(dayToolPathname() === '/m/day' ? toMobileStudioHref(href) : href);
  }, [castId, router, setError, setFilmStatus, stillsRef, updateShared, updateToolSettings]);

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
      const theme = dayThemeById(params.get('theme'));
      applyRemixDayFilmState(theme ? { kind: 'theme', themeId: theme.id } : undefined);
      dayThemeRef.current = theme?.label;
      const next = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      stillsRef.current = [];
      updateToolSettings({
        // A new Day is a whole day again (One event ends with its Day).
        slots: next.dayEvent
          ? clearDayEventSlots(next.slots ?? [], daySlotDefaultLabel)
          : next.slots,
        dayEvent: undefined,
        dayMood: next.dayMood,
        ...dayStillsCachePatch([], undefined),
        notes: next.notes,
      });
      setFirstCutCelebrate(false);
      setFilmStatus(
        theme
          ? `${theme.label} day — ready for fresh stills.`
          : 'Same look · new Day — ready for fresh stills.'
      );
      autoCutRef.current = false;
      params.delete('remix');
      params.delete('theme');
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
      void import('@/lib/server/local-observability').then(({ noteStarterDayQueueMetric }) => {
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

  // Auto-cut when every Day still completes (starter / demo / remix / explicit autocut).
  useEffect(() => {
    if (!mounted || assemblingFilm || autoCutRef.current) {
      return;
    }
    const completed = stills.filter(entry => entry.status === 'completed' && entry.imageUrl).length;
    if (completed < Math.max(1, slots.length)) {
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
  }, [slots, assemblingFilm, cutDayFilm, mounted, stills]);

  const completedShotCount = watchPlaylist.length;
  const fittingWardrobe = (activeSlot.wardrobeId || shared.lockedWardrobeId || '').trim();

  const [garmentUploading, setGarmentUploading] = useState(false);
  const [garmentScanStatus, setGarmentScanStatus] = useState<string | null>(null);

  const scanCustomGarmentDescription = useCallback(
    async (image: File) => {
      setGarmentScanStatus('Scanning clothing with vision…');
      try {
        return await scanStillWithVision({
          image,
          purpose: 'fitting-garment',
          model: shared.model,
          detail: shared.detail,
          shared,
        });
      } finally {
        setGarmentScanStatus(null);
      }
    },
    [shared]
  );

  const clearDayKitLocks = useCallback(() => {
    updateShared({ lockedWardrobeId: undefined });
    updateToolSettings({
      slots: slots.map(slot => ({ ...slot, wardrobeId: undefined })),
    });
  }, [slots, updateShared, updateToolSettings]);

  const applyFootwearPhoto = useFootwearPhoto({
    shared,
    lookId: character?.activeLookId,
    currentFootwear: toolSettings.footwear,
    currentImageUrl: toolSettings.footwearImageUrl,
    currentImageFilename: toolSettings.footwearImageFilename,
    sendComfyUi: (prompt, _a, _b, options) =>
      actions.sendComfyUi(prompt, undefined, undefined, options),
    onPatch: updateToolSettings,
    onError: setError,
  });

  const applyCustomGarment = useCallback(
    async (input: {
      file?: File | null;
      imageUrl?: string;
      filename?: string;
      asPackshot?: boolean;
    }) => {
      setGarmentUploading(true);
      setGarmentScanStatus(null);
      setError(null);
      try {
        const result = await applyCustomGarmentUpload(input, {
          model: shared.model,
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
          sendComfyUi: (prompt, _a, _b, options) =>
            actions.sendComfyUi(prompt, undefined, undefined, options),
          scanDescription: scanCustomGarmentDescription,
          onStatus: setGarmentScanStatus,
          onSoftError: setError,
        });
        updateToolSettings({
          customGarmentImageFilename: result.filename,
          customGarmentImageUrl: result.previewUrl,
          customGarmentDescription: result.description,
          slots: slots.map(slot => ({ ...slot, wardrobeId: undefined })),
        });
        updateShared({ lockedWardrobeId: undefined });
        setFilmStatus(`Using clothing photo for Day stills.`);
      } finally {
        setGarmentUploading(false);
        setGarmentScanStatus(null);
      }
    },
    [
      actions,
      character?.activeLookId,
      scanCustomGarmentDescription,
      setError,
      setFilmStatus,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.model,
      slots,
      updateShared,
      updateToolSettings,
    ]
  );

  const clearCustomGarment = useCallback(() => {
    const previousUrl = toolSettings.customGarmentImageUrl?.trim();
    if (previousUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrl);
    }
    updateToolSettings({
      customGarmentImageUrl: undefined,
      customGarmentImageFilename: undefined,
      customGarmentDescription: undefined,
    });
    setGarmentScanStatus(null);
  }, [toolSettings.customGarmentImageUrl, updateToolSettings]);

  const rescanCustomGarment = useCallback(async () => {
    const preview = toolSettings.customGarmentImageUrl?.trim();
    const filename = toolSettings.customGarmentImageFilename?.trim();
    if (!preview && !filename) {
      throw new Error('Upload a clothing photo first.');
    }
    setGarmentUploading(true);
    setGarmentScanStatus('Loading clothing photo…');
    setError(null);
    try {
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const urls = collectIsolateSourceUrls({
        imageUrl: preview,
        filename,
        comfyUrl,
      });
      const file = await resolveStillFileForVisionScan({
        urls,
        fallbackName: filename || 'day-garment.png',
      });
      const description = await scanCustomGarmentDescription(file);
      if (!description?.trim()) {
        throw new Error('Vision returned an empty garment description. Try Rescan again.');
      }
      updateToolSettings({ customGarmentDescription: description.trim() });
      updateSavedFittingGarmentDescription(filename, description);
    } finally {
      setGarmentUploading(false);
      setGarmentScanStatus(null);
    }
  }, [
    scanCustomGarmentDescription,
    setError,
    toolSettings.customGarmentImageFilename,
    toolSettings.customGarmentImageUrl,
    updateToolSettings,
  ]);

  const saveCurrentCustomGarment = useCallback(() => {
    const filename = toolSettings.customGarmentImageFilename?.trim();
    if (!filename) {
      throw new Error('Upload a clothing photo first.');
    }
    const entry = saveFittingGarment({
      imageFilename: filename,
      imageUrl: toolSettings.customGarmentImageUrl,
      description: toolSettings.customGarmentDescription,
    });
    setFilmStatus(`Saved “${entry.label}” for later.`);
    return entry;
  }, [
    setFilmStatus,
    toolSettings.customGarmentDescription,
    toolSettings.customGarmentImageFilename,
    toolSettings.customGarmentImageUrl,
  ]);

  const applySavedCustomGarment = useCallback(
    (garmentId: string) => {
      const id = garmentId.trim();
      const entry = loadSavedFittingGarments().find(item => item.id === id);
      if (!entry) {
        throw new Error('That saved clothing photo is gone.');
      }
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const previewUrl =
        entry.imageUrl?.trim() ||
        collectIsolateSourceUrls({
          filename: entry.imageFilename,
          comfyUrl,
        }).find(url => url.includes('/api/comfyui/view?')) ||
        '';
      if (!previewUrl) {
        throw new Error('Could not resolve that saved clothing photo — re-upload it.');
      }
      updateToolSettings({
        customGarmentImageFilename: entry.imageFilename,
        customGarmentImageUrl: previewUrl,
        customGarmentDescription: entry.description,
        slots: slots.map(slot => ({ ...slot, wardrobeId: undefined })),
      });
      updateShared({ lockedWardrobeId: undefined });
      setFilmStatus(`Using saved “${entry.label}”.`);
    },
    [setFilmStatus, slots, updateShared, updateToolSettings]
  );

  const removeSavedCustomGarment = useCallback((garmentId: string) => {
    removeSavedFittingGarment(garmentId);
  }, []);

  const selectSlotWardrobe = useCallback(
    (slotId: DaySlotId, wardrobeId: string | undefined) => {
      const id = wardrobeId?.trim() || undefined;
      const slot = slots.find(entry => entry.id === slotId);
      // Picked by hand in the slot's sheet: a new Day-wide outfit leaves it (day-outfit-scope).
      updateSlot(slotId, {
        wardrobeId: id,
        wardrobeAuto: undefined,
        outfitByHand: id || slot?.lookId ? true : undefined,
      });
      if (id) {
        const previousUrl = toolSettings.customGarmentImageUrl?.trim();
        if (previousUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(previousUrl);
        }
        updateToolSettings({
          customGarmentImageUrl: undefined,
          customGarmentImageFilename: undefined,
          customGarmentDescription: undefined,
        });
      }
    },
    [slots, toolSettings.customGarmentImageUrl, updateSlot, updateToolSettings]
  );

  return {
    previewSlotClip,
    setAsideDay,
    bringBackSetAsideDay,
    dismissSetAsideDay,
    queueAll,
    animateSlot,
    animateAllClips,
    dubDay,
    cutDayFilm,
    recordDayNarration,
    addCloseUps,
    saveFilmToCast,
    shareLastCut,
    saveFilmPoster,
    posterBusy,
    remixSameLookDay,
    remixThemeDay,
    remixNewOutfitDay,
    goRoleplay,
    seedDemoStills,
    firstCutCelebrate,
    startTomorrow,
    writingTomorrow,
    completedShotCount,
    fittingWardrobe,
    filmCutOptions,
    setFilmCutOptions,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    applyFootwearPhoto,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectSlotWardrobe,
    clearDayKitLocks,
  };
}
