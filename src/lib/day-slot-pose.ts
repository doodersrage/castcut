/**
 * What Day's Image 3 pose guide will draw for a slot: the scene text the guide reads and the
 * options it is drawn with. One function so the slot editor's pose preview and Queue day can't
 * disagree about the pose.
 */

import {
  SCENE_POSE_BODY_IDS,
  SCENE_POSE_LAYOUT_IDS,
  type PoseGuideBase,
  type PoseGuideBuildOptions,
  type ScenePoseSpec,
  type SocialLayout,
} from '@/lib/day-pose-guide';
import { isQwenEdit2511PoseStickyModel } from '@/lib/day-plate';
import {
  dayPoseSpecForBeat,
  isDayAdultMood,
  isDayHeatMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  resolveDayPoseHeadcount,
  type DayIntimateMix,
  type DayMood,
  type DaySlot,
} from '@/lib/day-planner';
import {
  clothedHeatUnlockPoseClass,
  dayClothedHeatPoseNeedsBodyUnlock,
  vacationStanceDirective,
} from '@/lib/day-vacation';
import { clarifyIntimateImageLanguage } from '@/lib/intimate-prompt-clarify';

export type DaySlotPosePlan = {
  /** Scene text the guide reads (undefined → the slot's default stance). */
  sceneText?: string;
  headcount: number;
  options: PoseGuideBuildOptions;
};

const BODY_SET: ReadonlySet<string> = new Set(SCENE_POSE_BODY_IDS);
const LAYOUT_SET: ReadonlySet<string> = new Set(SCENE_POSE_LAYOUT_IDS);

/** A slot's picked pose as a pose spec patch, or null for "read it from the beat". */
export function daySlotPoseOverride(poseLayout: string | null | undefined): ScenePoseSpec | null {
  const id = poseLayout?.trim();
  if (!id) return null;
  if (LAYOUT_SET.has(id)) return { layout: id as SocialLayout };
  if (BODY_SET.has(id)) return { body: id as PoseGuideBase };
  return null;
}

/**
 * A Story beat's pose spec with the card's picked pose applied: a picked layout replaces the
 * writer's layout / act / body; a picked posture keeps the writer's layout. Headcount stays.
 */
export function mergePickedPose(
  poseLayout: string | null | undefined,
  written: ScenePoseSpec | null | undefined
): ScenePoseSpec | undefined {
  const override = daySlotPoseOverride(poseLayout);
  if (!override) return written ?? undefined;
  return {
    ...(override.layout ? {} : written),
    ...override,
    ...(written?.people ? { people: written.people } : {}),
  };
}

export function planDaySlotPose(input: {
  slot: Pick<
    DaySlot,
    | 'id'
    | 'sceneHints'
    | 'location'
    | 'poseLayout'
    | 'poseVariant'
    | 'posePhoto'
    | 'poseCamera'
    | 'poseLead'
    | 'poseLook'
  >;
  dayMood: DayMood | string | null | undefined;
  intimateMix?: DayIntimateMix | string | null;
  allowCompanions?: boolean;
  model?: string | null;
  /** Automatic retry variants from the quality gate (added to the slot's own "Try another"). */
  retryVariant?: number;
  /** Layouts with a poor pose-match record — routed around unless the player picked one. */
  weakLayouts?: ReadonlySet<string>;
}): DaySlotPosePlan {
  const dayMood = normalizeDayMood(input.dayMood);
  const beatOnly = input.slot.sceneHints?.trim() || '';
  // Beat first on every mood: the stance keywords live in the beat. Heat moods read the beat
  // only — a Setting must not rewrite the Image 3 stance.
  const rawPoseScene = (
    isDayHeatMood(dayMood) ? [beatOnly] : [input.slot.sceneHints, input.slot.location]
  )
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' · ');
  // Adult moods only: the clarifier rewrites euphemisms into sex-act language.
  const clarified =
    isDayAdultMood(dayMood) && rawPoseScene
      ? clarifyIntimateImageLanguage(rawPoseScene)
      : undefined;
  const base = clarified || rawPoseScene || beatOnly;
  const clothedMood = dayMood === 'vacation' || dayMood === 'suggestive';
  const reinforced =
    clothedMood &&
    base &&
    dayClothedHeatPoseNeedsBodyUnlock(beatOnly, dayMood, {
      poseStickyModel: isQwenEdit2511PoseStickyModel(input.model),
    })
      ? `${base} · ${vacationStanceDirective(clothedHeatUnlockPoseClass(beatOnly, dayMood))} · nuclear Image 3 silhouette — never planted fashion stand`
      : base;
  const headcount = resolveDayPoseHeadcount({
    haystack: reinforced,
    beat: input.slot.sceneHints,
    dayMood,
    intimateMix: normalizeDayIntimateMix(input.intimateMix),
    allowCompanions: input.allowCompanions === true,
  });
  // Duo mix must draw exactly two figures — never inflate to a trio.
  const sceneText =
    headcount === 2
      ? `${reinforced || 'intimate duo mid-sex on the bed'} · exactly two adults only: Cast lead in the beat pose plus one distinct partner — both fully visible mid-contact in frame; never solo Cast; no third person`
      : reinforced || undefined;

  const override = daySlotPoseOverride(input.slot.poseLayout);
  const beatSpec = dayPoseSpecForBeat(beatOnly, dayMood);
  const pose: ScenePoseSpec | undefined = override
    ? { ...(override.layout ? {} : beatSpec), ...override }
    : beatSpec;
  const variant = (input.slot.poseVariant ?? 0) + (input.retryVariant ?? 0);

  return {
    sceneText,
    headcount,
    options: {
      forcePeople: headcount,
      clothedUprightOnly: clothedMood,
      // Only the adult moods may draw sex layouts.
      allowIntimate: isDayAdultMood(dayMood),
      ...(pose ? { pose } : {}),
      variant,
      // A pose the player picked is drawn as picked, even if its record is poor.
      ...(!override && input.weakLayouts?.size ? { avoidLayouts: input.weakLayouts } : {}),
      ...(input.slot.posePhoto ? { photoPose: input.slot.posePhoto } : {}),
      ...(input.slot.poseCamera ? { camera: input.slot.poseCamera } : {}),
      ...(input.slot.poseLead ? { leadSide: input.slot.poseLead } : {}),
      ...(input.slot.poseLook ? { look: input.slot.poseLook } : {}),
    },
  };
}
