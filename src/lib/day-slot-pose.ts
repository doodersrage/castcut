/**
 * What Day's Image 3 pose guide will draw for a slot: the scene text the guide reads and the
 * options it is drawn with. One function so the slot editor's pose preview and Queue day can't
 * disagree about the pose.
 */

import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import {
  dayPoseGuideFallbackIndex,
  resolveSceneGuidePlan,
  SCENE_POSE_BODY_IDS,
  SCENE_POSE_LAYOUT_IDS,
  type PoseGuideBase,
  type PoseGuideBuildOptions,
  parseIntimateLayout,
  reconcileWrittenPose,
  sceneTextStatesPose,
  type ScenePoseSpec,
  type SocialLayout,
  textLeadPosture,
} from '@/lib/day-pose-guide';
import { RAPID_ORAL_FALLBACK_RE } from '@/lib/rapid-duo-recipe';
import { SEATED_ORAL_GUIDE_TEXT } from '@/lib/rapid-oral-pose';
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
import { stripNegatedClauses } from '@/lib/negated-clauses';
import { mergeAvoidedPoseLayouts } from '@/lib/pose-guide-prompt';

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
  writtenByModel: ScenePoseSpec | null | undefined,
  /** The scene's own words: the writer's pose is kept only where it agrees with them. */
  sceneText?: string | null
): ScenePoseSpec | undefined {
  const written =
    sceneText == null ? writtenByModel : reconcileWrittenPose(writtenByModel, sceneText).spec;
  const override = daySlotPoseOverride(poseLayout);
  if (!override) return written ?? undefined;
  return {
    ...(override.layout ? {} : written),
    ...override,
    ...(written?.people ? { people: written.people } : {}),
  };
}

/**
 * The stance directive as pose-guide text. A beat with a pose class gets that class's directive;
 * a beat without one gets nothing — the general directive lists every stance ("seated,
 * reclining, dancing, climbing, or waving as written"), and the guide read "dancing" out of it:
 * lying and sitting beats on Edit 2511 were drawn (and described) as a dance.
 */
function stanceDirectiveForGuide(poseClass: string | null | undefined): string {
  const directive = vacationStanceDirective(poseClass);
  if (directive === vacationStanceDirective(null)) return '';
  // Only what the stance is, not what it is not: the guide text is read for a pose, and the
  // KICKING directive's "never a yoga tree pose" was read as yoga.
  return ` · ${stripNegatedClauses(directive).replace(/\s+/g, ' ').trim()}`;
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
  // only — a Setting must not rewrite the Image 3 stance. On Everyday the Setting may supply a
  // pose only when the beat gives none: read together, "bedroom at midnight with the laptop
  // glow" sat every late-night beat (cooking, lying on the floor, walking home) at a laptop, and
  // a laundromat's "bench along the wall" sat "standing in line at the post office".
  const beatOwnsPose =
    isDayHeatMood(dayMood) || sceneTextStatesPose(beatOnly, { allowIntimate: false });
  const rawPoseScene = (beatOwnsPose ? [beatOnly] : [input.slot.sceneHints, input.slot.location])
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
      poseStickyModel: poseProfileForModel(input.model).poseStickyClothed,
    })
      ? `${base}${stanceDirectiveForGuide(clothedHeatUnlockPoseClass(beatOnly, dayMood))} · nuclear Image 3 silhouette — never planted fashion stand`
      : base;
  const headcount = resolveDayPoseHeadcount({
    haystack: reinforced,
    beat: input.slot.sceneHints,
    dayMood,
    intimateMix: normalizeDayIntimateMix(input.intimateMix),
    allowCompanions: input.allowCompanions === true,
  });
  // Rapid AIO draws neither a 69 nor face-sitting — its recipe (rapid-duo-recipe.ts) renders
  // seated oral, so draw that guide too, or the pose check flags every such still and rerolls it.
  // The guide text is reworded to match: "sitting on his face" reads as a sitting posture and
  // would override the act back to face-sitting. "Seated oral sex" makes the map seat her on
  // the edge with him kneeling between her knees, as the recipe says (oralReceiverSeated).
  const rapidOralFallback =
    isDayAdultMood(dayMood) &&
    poseProfileForModel(input.model).seatedOralFallback &&
    (parseIntimateLayout(beatOnly) === 'sixty_nine' || parseIntimateLayout(beatOnly) === 'facesit');
  const guideText = rapidOralFallback
    ? reinforced?.replace(RAPID_ORAL_FALLBACK_RE, SEATED_ORAL_GUIDE_TEXT)
    : reinforced;
  // Duo mix must draw exactly two figures — never inflate to a trio.
  const sceneText =
    headcount === 2
      ? `${guideText || 'intimate duo mid-sex on the bed'} · exactly two adults only: Cast lead in the beat pose plus one distinct partner — both fully visible mid-contact in frame; never solo Cast; no third person`
      : guideText || undefined;

  const override = daySlotPoseOverride(input.slot.poseLayout);
  const beatSpec: ScenePoseSpec | undefined = rapidOralFallback
    ? { act: 'oral' }
    : dayPoseSpecForBeat(beatOnly, dayMood);
  const pose: ScenePoseSpec | undefined = override
    ? { ...(override.layout ? {} : beatSpec), ...override }
    : beatSpec;
  const variant = (input.slot.poseVariant ?? 0) + (input.retryVariant ?? 0);
  const avoidLayouts = mergeAvoidedPoseLayouts(input.weakLayouts, input.model);

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
      ...(!override && avoidLayouts.size ? { avoidLayouts } : {}),
      ...(poseProfileForModel(input.model).plainPostureBase
        ? { plainPostureBase: poseProfileForModel(input.model).plainPostureBase }
        : {}),
      ...(input.slot.posePhoto ? { photoPose: input.slot.posePhoto } : {}),
      ...(input.slot.poseCamera ? { camera: input.slot.poseCamera } : {}),
      ...(input.slot.poseLead ? { leadSide: input.slot.poseLead } : {}),
      ...(input.slot.poseLook ? { look: input.slot.poseLook } : {}),
    },
  };
}

/**
 * The pose key (`kneel:1`) a slot's plan draws — what the pose × engine stats count a take under
 * when no map was attached (an engine that takes no map), and what the slot hint reads. Pure.
 */
export function plannedDaySlotPoseKey(plan: DaySlotPosePlan, slotId: DaySlot['id']): string {
  return resolveSceneGuidePlan(plan.sceneText, dayPoseGuideFallbackIndex(slotId), {
    ...plan.options,
    openPose: true,
  }).openPose.poseKey;
}

/**
 * The layout a slot's guide draws (`walk`, `lie_side`, `sport_squat`; a plain posture like `sit`
 * when no layout applies) and its headcount — what the pose report card is keyed by. Null when
 * the guide is a photo pose or the slot's default stance (no beat).
 */
export function daySlotPoseLayout(input: Parameters<typeof planDaySlotPose>[0]): {
  layout: string | null;
  headcount: number;
} {
  const plan = planDaySlotPose(input);
  if (input.slot.posePhoto?.people.length || !plan.sceneText?.trim()) {
    return { layout: null, headcount: plan.headcount };
  }
  const { intent } = resolveSceneGuidePlan(
    plan.sceneText,
    dayPoseGuideFallbackIndex(input.slot.id as DaySlot['id']),
    { ...plan.options, openPose: false }
  );
  return {
    layout: intent.intimate || intent.social || intent.base || null,
    headcount: plan.headcount,
  };
}

const LYING_LAYOUTS: ReadonlySet<string> = new Set(['lie_side', 'lie_front', 'lounge_elbows']);
const SEATED_LAYOUTS: ReadonlySet<string> = new Set(['sit_floor', 'perch_edge', 'sport_cycle']);

/** The body posture a drawing reads as: its layout's when it lies or sits, else its base's. */
function drawnPosture(intent: { base: PoseGuideBase; social?: SocialLayout | null }) {
  if (intent.social && LYING_LAYOUTS.has(intent.social)) return 'lie';
  if (intent.social && SEATED_LAYOUTS.has(intent.social)) return 'sit';
  const base = intent.base;
  if (base === 'sit') return 'sit';
  if (base === 'lie') return 'lie';
  if (base === 'kneel' || base === 'crouch') return 'kneel';
  return 'stand';
}

/** Words that state a lie or a kneel for someone in the frame ("he lies on his back"). */
const LIE_OR_KNEEL_WORDS_RE =
  /\b(?:kneel(?:s|ing)?|knelt|lies|lying|lie\s+(?:back|down)|reclin(?:es|ing))\b/i;

/**
 * Vacation / Suggestive draw clothed stills upright: a kneel or a lie becomes a seated pair and a
 * hug a lean (parsePoseGuideIntent, clothedUprightOnly — a kneeling figure pulled clothed stills
 * toward sex layouts). Beats written lying, kneeling, on a lap or carried then got a drawing that
 * says something else: "lying face to face on the bed" went out as a standing hands-on-hips pair,
 * "he kneels in front of her, kisses her knee" as two people sitting. Edit 2511 followed the
 * drawing over the words (live 2026-10-06: with the drawing left out, the kneel was right 3/3).
 *
 * True when the clothed drawing contradicts the beat — the rule rewrote the stance the words
 * read as, or the lead's stated posture differs from the drawn one — so Day sends no drawing and
 * the words carry the pose. A pose the player picked is always drawn.
 */
export function dayClothedGuideContradictsBeat(
  input: Parameters<typeof planDaySlotPose>[0]
): boolean {
  const plan = planDaySlotPose(input);
  const beat = input.slot.sceneHints?.trim() || '';
  if (
    !plan.options.clothedUprightOnly ||
    !beat ||
    !plan.sceneText?.trim() ||
    input.slot.poseLayout ||
    input.slot.posePhoto?.people.length
  ) {
    return false;
  }
  const fallback = dayPoseGuideFallbackIndex(input.slot.id as DaySlot['id']);
  const drawn = resolveSceneGuidePlan(plan.sceneText, fallback, {
    ...plan.options,
    openPose: false,
  }).intent;
  const unrestricted = resolveSceneGuidePlan(plan.sceneText, fallback, {
    ...plan.options,
    clothedUprightOnly: false,
    allowIntimate: false,
    openPose: false,
  }).intent;
  // A dance is upright whatever else the words say ("her cheek on his chest, his hand low on
  // her back" reads as lying on her back).
  if (drawn.social === 'dance') return false;
  const drawnAs = drawnPosture(drawn);
  const readAs = drawnPosture(unrestricted);
  // (a) The rule rewrote a kneel or a lie the words state — for the lead or the partner ("her
  // partner kneeling in front of her" drew two people sitting).
  if (
    (readAs === 'kneel' || readAs === 'lie') &&
    readAs !== drawnAs &&
    LIE_OR_KNEEL_WORDS_RE.test(beat)
  ) {
    return true;
  }
  // A hug or a lap became a lean pair.
  if (unrestricted.social === 'hug' && drawn.social !== 'hug') return true;
  // (b) The lead lies or kneels and the drawing doesn't ("lying face to face … his hand on her
  // hip" drew a standing hands-on-hips pair). Only those two: the word reader also calls "on a
  // pier bench" standing, and the rule only ever suppresses a lie or a kneel.
  const lead = textLeadPosture(beat);
  return (lead === 'lie' || lead === 'kneel') && lead !== drawnAs;
}
