'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import ClipEngineNote from '@/components/ClipEngineNote';
import SharedToolControls from '@/components/SharedToolControls';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import DayEndPoseControl from '@/components/day-planner/DayEndPoseControl';
import DayAnimateSheet from '@/components/day-planner/DayAnimateSheet';
import { dayAnimateOptions, dayAnimateSettingsPatch } from '@/lib/day/clip-length';
import DayClothingPicker, {
  type DayClothingPickerVm,
} from '@/components/day-planner/DayClothingPicker';
import { dayClothingView } from '@/components/day-planner/DayOutfitRow';
import DaySetupSheet, { type DaySetupSheetVm } from '@/components/day-planner/DaySetupSheet';
import SlotMediaSheet from '@/components/day-planner/SlotMediaSheet';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { useDayQualityPreset } from '@/hooks/day-planner/useDayQualityPreset';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import {
  buildDayProgressLightboxState,
  isDayAdultMood,
  normalizeDayIntimateMix,
} from '@/lib/day/planner';
import { clipUrlIsVideo } from '@/lib/clip/media-kind';
import type { SceneTake } from '@/lib/day/scenes';
import { dayQualityPresetLabel } from '@/lib/day/quality-preset';
import type { FixAreaTarget } from '@/lib/edit/fix-area-client';
import { useRenderBackend } from '@/lib/engine/render-backend-status';
import { pickedPostures } from '@/lib/pose/rig3d-posture-points';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});
const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});
// Three.js and the pose body load only when the Director opens.
const DirectorSheet = dynamic(() => import('@/components/director/DirectorSheet'), {
  ssr: false,
});

export const SCENE_ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

type Vm = ReturnType<typeof useDayPlannerToolOrchestration>;
type Page = ReturnType<typeof useScenePage>;

/**
 * What the Scene page's desk and phone layouts share: the engine controls, the clothing and
 * setup view-models, Make it move's sheets (Animate, Copy moves, the Director), Setup, the
 * lightbox and Fix an area — one set of state, each layout places the controls its own way.
 */
export function useSceneToolViews(vm: Vm, page: Page) {
  const { shared, toolSettings, updateShared, updateToolSettings, slotMedia, character } = vm;
  const { slot, kept } = page;
  const renderOffline = useRenderBackend().state === 'offline';
  const queueBlocked = Boolean(vm.queueBlockReason) || renderOffline;
  const quality = useDayQualityPreset({ shared, updateShared, toolSettings, updateToolSettings });
  const [setupOpen, setSetupOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [fixAreaTarget, setFixAreaTarget] = useState<FixAreaTarget | null>(null);
  const mediaBusy = slotMedia.busy !== null;

  const hasCustomGarment = Boolean(toolSettings.customGarmentImageUrl?.trim());
  const clothingView = dayClothingView({
    dayKitId: shared.lockedWardrobeId,
    slotKitId: slot.wardrobeId,
    photoUrl: hasCustomGarment ? toolSettings.customGarmentImageUrl : null,
    footwear: toolSettings.footwear,
    footwearImageUrl: toolSettings.footwearImageUrl,
    labelFor: vm.wardrobeLabelFor,
  });
  const clothingVm: DayClothingPickerVm = {
    shared,
    toolSettings,
    updateToolSettings,
    busy: vm.busy,
    activeSlot: vm.activeSlot,
    filteredWardrobeOptions: vm.filteredWardrobeOptions,
    wardrobeOptions: vm.wardrobeOptions,
    wardrobeReady: vm.wardrobeReady,
    wardrobeCategoryFilter: vm.wardrobeCategoryFilter,
    garmentUploading: vm.garmentUploading,
    garmentScanStatus: vm.garmentScanStatus,
    applyCustomGarment: vm.applyCustomGarment,
    applyFootwearPhoto: vm.applyFootwearPhoto,
    clearCustomGarment: vm.clearCustomGarment,
    rescanCustomGarment: vm.rescanCustomGarment,
    saveCurrentCustomGarment: vm.saveCurrentCustomGarment,
    applySavedCustomGarment: vm.applySavedCustomGarment,
    removeSavedCustomGarment: vm.removeSavedCustomGarment,
    selectSlotWardrobe: vm.selectSlotWardrobe,
    selectDayWardrobe: vm.selectDayWardrobe,
    setError: vm.setError,
  };
  const renderClothingPicker = () => (
    <DayClothingPicker vm={clothingVm} scope="slot" accent={SCENE_ACCENT} />
  );
  const setupVm: DaySetupSheetVm = {
    character,
    hasPlate: vm.hasPlate,
    shared,
    updateShared,
    setError: vm.setError,
    plate: vm.plate,
    platePreviewUrl: vm.platePreviewUrl,
    activeSlot: vm.activeSlot,
    busy: vm.busy,
    isolateSubject: vm.isolateSubject,
    isolateBusy: vm.isolateBusy,
    isolateStatus: vm.isolateStatus,
    isolatePending: vm.isolatePending,
    setIsolateSubject: vm.setIsolateSubject,
    uploadCastPlate: vm.uploadCastPlate,
    makeCastPlate: vm.makeCastPlate,
    makePlateStatus: vm.makePlateStatus,
    plateUploading: vm.plateUploading,
    plateUploadError: vm.plateUploadError,
  };

  const engineControls = (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      showWardrobeOption={false}
      seedLlmWithIngredients={false}
      autoFixRules={shared.autoFixRules !== false}
      onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
      toolId={TOOL_ID}
      qualitySetBy={{
        label: dayQualityPresetLabel(quality.preset),
        hint: 'Change it in the bar above the shot; Good / Best by hand under Advanced.',
      }}
      preferEditModels={vm.hasPlate}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );

  // Make it move: the job runs in the background (the jobs tray follows it); the clip lands on
  // the kept take.
  const runMove = async (work: () => Promise<string | null>) => {
    setMoveNote('Working on ComfyUI — a few minutes. The jobs tray follows it.');
    const failed = await work();
    setMoveNote(failed ?? 'Done — the clip is on the kept take.');
  };
  /** Make it move starts from the kept take: on the card first, then the sheet. */
  const openMove = (which: 'animate' | 'moves' | 'director') => {
    if (!page.keptOnCard()) return;
    if (which === 'animate') setAnimateOpen(true);
    else if (which === 'moves') setMovesOpen(true);
    else setDirectorOpen(true);
  };

  // Make it move's clip engine — Day's own choice (Video `dayClips`), which Scene's Animate
  // renders on (resolveDayClipEngine); Copy moves and the Director render on Wan Animate 2.
  const keptOnCardNow = Boolean(kept?.promptId && page.still?.promptId === kept.promptId);
  const clipEngine: ReactNode = kept ? (
    <div className="space-y-2" data-testid="scene-clip-engine">
      <ClipEngineNote
        day
        dayLabel="Animate clips on"
        twoPersonAdultPossible={
          isDayAdultMood(vm.dayMood) && normalizeDayIntimateMix(vm.intimateMix) !== 'solo'
        }
      />
      <p className="type-caption text-[var(--text-muted)]" data-testid="scene-clip-engine-hint">
        The same choice as Day&apos;s. Copy moves and Direct render on Wan Animate.
      </p>
      <TaskRequirementsCard
        task="Animate"
        testId="scene-animate-requirements"
        input={{ animate: true, adult: isDayAdultMood(vm.dayMood) && vm.intimateEnabled }}
      />
      {/* End pose: the clip lands on a re-pose of the kept take, when this ComfyUI can pin a
          last frame on the clip engine (the kept take must be the one on the card). */}
      {keptOnCardNow && vm.endPoseSupportedFor(slot.id) ? (
        <DayEndPoseControl
          key={slot.id}
          slot={slot}
          slots={vm.slots}
          stills={vm.stills}
          endPose={vm.activeEndPoseFor(slot.id)}
          busy={vm.busy}
          reposing={vm.endPoseReposingSlotId === slot.id}
          status={vm.endPoseStatus}
          onPick={fromSlotId => vm.pickEndPoseStill(slot.id, fromSlotId)}
          onRepose={words => void vm.reposeEndPose(slot.id, words)}
          onClear={() => vm.clearEndPose(slot.id)}
        />
      ) : null}
    </div>
  ) : null;

  /** The card in the lightbox: its clip when one finished (playing), else the still — as Day. */
  const openCard = () => {
    const next = buildDayProgressLightboxState([slot], vm.stills, slot.id, (url, still) =>
      clipUrlIsVideo(url, { promptId: still.clipPromptId })
    );
    if (!next) return;
    setLightbox({
      images: next.images,
      titles: next.titles,
      originalImages: next.images,
      mediaKinds: next.mediaKinds,
      index: 0,
      title: page.active?.name ?? next.title,
    });
  };
  /** A take in the lightbox: its clip when it has one, else its picture. */
  const openTake = (take: SceneTake) => {
    const clip = take.clipUrl?.trim();
    setLightbox({
      images: [clip || take.imageUrl],
      originalImages: [clip || take.imageUrl],
      mediaKinds: [
        clip && clipUrlIsVideo(clip, { promptId: take.clipPromptId }) ? 'video' : 'image',
      ],
      index: 0,
      title: page.active?.name ?? 'Scene',
    });
  };

  const sheets: ReactNode = (
    <>
      <DayAnimateSheet
        key={animateOpen ? slot.id : 'none'}
        slot={animateOpen ? slot : null}
        preview={vm.previewSlotClip}
        initialExtraSeconds={toolSettings.dayClipExtraSeconds}
        initialTalkTotalSeconds={toolSettings.dayTalkTotalSeconds}
        busy={vm.busy}
        onClose={() => setAnimateOpen(false)}
        onAnimate={(target, choice) => {
          setAnimateOpen(false);
          const remember = dayAnimateSettingsPatch(choice, toolSettings);
          if (remember) updateToolSettings(remember);
          void vm.animateSlot(target, dayAnimateOptions(choice));
        }}
      />
      <SlotMediaSheet
        kind={movesOpen ? 'moves' : null}
        onClose={() => setMovesOpen(false)}
        onMoves={(video, options) => {
          setMovesOpen(false);
          void runMove(() => slotMedia.copyMovesToSlot(slot, video, options));
        }}
        onLipSync={() => undefined}
        onRelight={() => undefined}
      />
      {directorOpen && kept ? (
        <DirectorSheet
          open
          stillUrl={kept.imageUrl}
          castId={character?.id}
          castName={character?.name}
          body={vm.leadNoun === 'man' ? 'male' : 'female'}
          place={slot.location}
          postures={pickedPostures(slot)}
          pose3d={slot.posePhoto?.rig3d}
          poseId={slot.posePhoto ? undefined : slot.poseLayout}
          busy={mediaBusy}
          onClose={() => setDirectorOpen(false)}
          onRender={(video, options) => {
            setDirectorOpen(false);
            void runMove(() => slotMedia.copyMovesToSlot(slot, video, options));
          }}
          testId="scene-director-sheet"
        />
      ) : null}
      <DaySetupSheet vm={setupVm} open={setupOpen} onClose={() => setSetupOpen(false)} />
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />
      {fixAreaTarget ? (
        <FixAreaDialog target={fixAreaTarget} onClose={() => setFixAreaTarget(null)} />
      ) : null}
    </>
  );

  return {
    renderOffline,
    queueBlocked,
    quality,
    mediaBusy,
    clothingView,
    renderClothingPicker,
    engineControls,
    clipEngine,
    moveNote,
    openMove,
    setAnimateOpen,
    setSetupOpen,
    setLightbox,
    openCard,
    openTake,
    setFixAreaTarget,
    sheets,
  };
}

export type SceneToolViews = ReturnType<typeof useSceneToolViews>;
