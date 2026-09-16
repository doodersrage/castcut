/**
 * Single Play transition graph: Cast → Look → Outfit → Day → (optional) Story.
 * Day micro-phases: queue → animate → cut → save.
 * Campaign stepIndex is a cache; artifacts (look pack, keeps, stills, cut) win when ahead.
 */

import type { LookPack } from './look-pack';
import { lookPackDayHref, lookPackFittingHref, lookPackRoleplayHref } from './look-pack';
import { countCachedCompletedDayClips, countCachedCompletedDayStills } from './play-day-cache';

/** Deep link for same-look / new-Day remix (clears stills on Day mount). */
export function remixDayFilmHref(characterId: string, options?: { autoQueue?: boolean }): string {
  const id = characterId.trim();
  const params = new URLSearchParams();
  if (id) {
    params.set('character', id);
  }
  params.set('from', 'look');
  params.set('remix', '1');
  if (options?.autoQueue !== false) {
    params.set('autoqueue', '1');
  }
  return `/day?${params.toString()}`;
}

/** Minimal metrics shape — avoids importing play-metrics (circular). */
export type PlayMetricsLike = {
  version?: 1;
  firstPlayCampaignAt?: number;
  firstFilmCutAt?: number;
  lastFilmCutAt?: number;
};

export type PlayCampaignStepId = 'character' | 'moodboard' | 'fitting' | 'day' | 'roleplay';

/** Funnel chips / stall ids — `cut` is Day's cut micro-phase. */
export type PlayFunnelStepId = PlayCampaignStepId | 'cut';

export type PlayDayPhaseId = 'queue' | 'animate' | 'cut' | 'save';

export type PlayCampaignStep = {
  id: PlayCampaignStepId;
  label: string;
  description: string;
  /** Story stays optional after first Day cut. */
  optional?: boolean;
  next?: PlayCampaignStepId;
  href: (input: { characterId: string; pack?: LookPack | null }) => string;
};

export const PLAY_CAMPAIGN_STEPS: PlayCampaignStep[] = [
  {
    id: 'character',
    label: 'Cast',
    description: 'Create or pick the lead for this film.',
    next: 'moodboard',
    href: ({ characterId }) => `/characters/${encodeURIComponent(characterId)}`,
  },
  {
    id: 'moodboard',
    label: 'Look',
    description: 'Add refs and extract a look (or use a saved one).',
    next: 'fitting',
    href: ({ characterId }) => `/moodboard?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'fitting',
    label: 'Outfit',
    description: 'Try wardrobe kits and Keep one for the day.',
    next: 'day',
    href: ({ characterId, pack }) =>
      pack ? lookPackFittingHref(pack) : `/fitting?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'day',
    label: 'Day',
    description: 'Queue morning → night stills, animate clips, then Cut film.',
    next: 'roleplay',
    href: ({ characterId, pack }) =>
      pack ? lookPackDayHref(pack) : `/day?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'roleplay',
    label: 'Story',
    description: 'Optional — story beats after your first Day cut.',
    optional: true,
    href: ({ characterId, pack }) =>
      pack ? lookPackRoleplayHref(pack) : `/roleplay?character=${encodeURIComponent(characterId)}`,
  },
];

/** Core film steps shown before the first cut (Roleplay stays optional / unlocked later). */
export const PLAY_CORE_STEP_IDS: PlayCampaignStepId[] = [
  'character',
  'moodboard',
  'fitting',
  'day',
];

export const PLAY_DAY_PHASES: Array<{
  id: PlayDayPhaseId;
  label: string;
  description: string;
}> = [
  {
    id: 'queue',
    label: 'Queue',
    description: 'Generate morning → night stills.',
  },
  {
    id: 'animate',
    label: 'Animate',
    description: 'Turn stills into motion clips (preferred before Cut).',
  },
  {
    id: 'cut',
    label: 'Cut',
    description: 'Assemble the Day reel.',
  },
  {
    id: 'save',
    label: 'Save',
    description: 'Stamp the reel into Cast / Gallery.',
  },
];

const STEP_INDEX: Record<PlayCampaignStepId, number> = {
  character: 0,
  moodboard: 1,
  fitting: 2,
  day: 3,
  roleplay: 4,
};

const FUNNEL_STEP_LABELS: Record<PlayFunnelStepId, string> = {
  character: 'Cast',
  moodboard: 'Look',
  fitting: 'Outfit',
  day: 'Day',
  roleplay: 'Story',
  cut: 'Cut film',
};

export type PlayFunnelLike = {
  firstPlayCampaign?: number;
  firstFilmCut?: number;
  keepTryOn?: number;
  saveToCast?: number;
  campaignMaxStep?: number;
};

export type PlayCampaignLike = {
  characterId: string;
  lookPackId?: string;
  stepIndex: number;
  completedAt?: number;
} | null;

export type PlayArtifacts = {
  metrics?: PlayMetricsLike;
  funnel?: PlayFunnelLike | null;
  campaign?: PlayCampaignLike;
  lookPack?: LookPack | null;
  watchedFirstFilm?: boolean;
  /** Override cache reads (tests). */
  completedStills?: number;
  completedClips?: number;
  /** Explicit Save-needed flag from Day UI; else inferred from funnel. */
  filmNeedsCast?: boolean;
};

export type DerivedPlayProgress = {
  characterId: string;
  firstFilmDone: boolean;
  storyLocked: boolean;
  /** Max of durable stepIndex and artifact-derived progress. */
  effectiveStepIndex: number;
  resumeStepId: PlayCampaignStepId;
  /** When resume is Day (or cut stall), which micro-phase to push. */
  dayPhase: PlayDayPhaseId | null;
  pack: LookPack | null;
  completedStills: number;
  completedClips: number;
};

export type PlayGateResult = {
  ok: boolean;
  reason?: string;
};

export type PlaySoftAdvanceSpec = {
  href: string;
  label: string;
  message?: string;
};

export type PlayNextAction = {
  label: string;
  href: string;
  reason: string;
};

export type PlayFunnelStall = {
  stepId: PlayFunnelStepId;
  stepLabel: string;
  reason: string;
  daysSinceCampaignStart: number | null;
};

export function playStepById(id: PlayCampaignStepId): PlayCampaignStep | undefined {
  return PLAY_CAMPAIGN_STEPS.find(step => step.id === id);
}

export function playStepIndex(id: PlayCampaignStepId): number {
  return STEP_INDEX[id] ?? -1;
}

export function playFunnelStepLabel(stepId: PlayFunnelStepId): string {
  return FUNNEL_STEP_LABELS[stepId];
}

/** True once the user has cut at least one Play film. */
export function playFirstFilmDone(
  metrics?: PlayMetricsLike | null,
  funnel?: PlayFunnelLike | null
): boolean {
  if (typeof metrics?.firstFilmCutAt === 'number' && metrics.firstFilmCutAt > 0) {
    return true;
  }
  return (funnel?.firstFilmCut ?? 0) > 0;
}

export function isPlayStoryLocked(
  metrics?: PlayMetricsLike | null,
  funnel?: PlayFunnelLike | null
): boolean {
  return !playFirstFilmDone(metrics, funnel);
}

function stagePack(characterId: string, pack?: LookPack | null): LookPack | null {
  if (!pack) {
    return null;
  }
  const id = characterId.trim() || pack.characterId?.trim() || '';
  if (!id) {
    return pack;
  }
  return { ...pack, characterId: pack.characterId || id };
}

/** Deep-link for a Play step chip, soft-advance, or stall CTA. */
export function resolvePlayStepHref(
  stepId: PlayFunnelStepId | PlayDayPhaseId,
  characterId?: string,
  pack?: LookPack | null
): string {
  const id = characterId?.trim() || pack?.characterId?.trim() || '';
  const staged = stagePack(id, pack);

  if (stepId === 'queue' || stepId === 'animate' || stepId === 'cut' || stepId === 'save') {
    if (staged) {
      return lookPackDayHref(staged);
    }
    return id ? `/day?character=${encodeURIComponent(id)}` : '/day';
  }

  if (stepId === 'character') {
    return id ? `/characters/${encodeURIComponent(id)}` : '/characters';
  }

  // Day phases (`cut`, `queue`, …) already returned above — remaining ids are campaign steps.
  const campaignId = stepId as PlayCampaignStepId;
  const campaignStep = playStepById(campaignId);
  if (!campaignStep) {
    return '/play';
  }
  if (!id) {
    // Bare tool roots when no Cast lead is selected.
    if (campaignId === 'moodboard') {
      return '/moodboard';
    }
    if (campaignId === 'fitting') {
      return '/fitting';
    }
    if (campaignId === 'day') {
      return '/day';
    }
    if (campaignId === 'roleplay') {
      return '/roleplay';
    }
    return '/play';
  }
  return campaignStep.href({ characterId: id, pack: staged });
}

function readCompletedStills(artifacts: PlayArtifacts): number {
  if (typeof artifacts.completedStills === 'number') {
    return Math.max(0, artifacts.completedStills);
  }
  if (typeof window === 'undefined') {
    return 0;
  }
  return countCachedCompletedDayStills();
}

function readCompletedClips(artifacts: PlayArtifacts): number {
  if (typeof artifacts.completedClips === 'number') {
    return Math.max(0, artifacts.completedClips);
  }
  if (typeof window === 'undefined') {
    return 0;
  }
  return countCachedCompletedDayClips();
}

/**
 * Derive Day micro-phase from stills / clips / cut / save artifacts.
 * Animate is preferred but never blocks Cut.
 */
export function deriveDayPhase(input: {
  completedStills: number;
  completedClips: number;
  firstFilmDone: boolean;
  filmNeedsCast?: boolean;
  saves?: number;
  campaignCompleted?: boolean;
}): PlayDayPhaseId | null {
  const stills = input.completedStills;
  const clips = input.completedClips;
  const needsSave =
    input.filmNeedsCast === true ||
    (input.firstFilmDone &&
      (input.campaignCompleted || stills > 0) &&
      (input.saves ?? 0) === 0 &&
      input.filmNeedsCast !== false);

  if (input.firstFilmDone && needsSave) {
    return 'save';
  }
  if (stills <= 0) {
    return 'queue';
  }
  if (stills >= 4) {
    // Prefer animate when stills are done but clips lag.
    if (clips < stills) {
      return 'animate';
    }
    return 'cut';
  }
  if (clips > 0 && clips < stills) {
    return 'animate';
  }
  return 'queue';
}

/**
 * Merge durable campaign index with artifact progress (look pack, keeps, stills).
 * stepIndex is treated as a cache — artifacts can only advance it.
 */
export function derivePlayProgress(artifacts: PlayArtifacts = {}): DerivedPlayProgress {
  const funnel = artifacts.funnel ?? {};
  const campaign = artifacts.campaign ?? null;
  const characterId =
    campaign?.characterId?.trim() || artifacts.lookPack?.characterId?.trim() || '';
  const pack = stagePack(characterId, artifacts.lookPack ?? null);
  const firstFilmDone = playFirstFilmDone(artifacts.metrics, funnel);
  const storyLocked = !firstFilmDone;
  const completedStills = readCompletedStills(artifacts);
  const completedClips = readCompletedClips(artifacts);

  let effectiveStepIndex = Math.max(
    0,
    campaign?.stepIndex ?? -1,
    (funnel.campaignMaxStep ?? 0) > 0 ? (funnel.campaignMaxStep ?? 1) - 1 : -1
  );

  const campaignCharacterId = campaign?.characterId?.trim() || '';
  const packCharacterId = pack?.characterId?.trim() || '';
  const packMatchesCampaign =
    Boolean(pack) &&
    (!campaignCharacterId || !packCharacterId || campaignCharacterId === packCharacterId);

  // Look pack present → Moodboard done → resume Outfit (index 2).
  if (packMatchesCampaign && effectiveStepIndex < STEP_INDEX.fitting) {
    effectiveStepIndex = STEP_INDEX.fitting;
  }
  // Keep try-on or Day stills → Day (index 3).
  if ((funnel.keepTryOn ?? 0) > 0 || completedStills > 0) {
    effectiveStepIndex = Math.max(effectiveStepIndex, STEP_INDEX.day);
  }
  if (firstFilmDone) {
    effectiveStepIndex = Math.max(effectiveStepIndex, STEP_INDEX.day);
  }

  effectiveStepIndex = Math.min(effectiveStepIndex, PLAY_CAMPAIGN_STEPS.length - 1);

  let resumeStepId =
    PLAY_CAMPAIGN_STEPS[effectiveStepIndex]?.id ?? (characterId ? 'moodboard' : 'character');

  // Before first film, never resume on optional Story — steer to Day.
  if (resumeStepId === 'roleplay' && storyLocked) {
    resumeStepId = 'day';
    effectiveStepIndex = STEP_INDEX.day;
  }

  const filmNeedsCast =
    artifacts.filmNeedsCast ?? (firstFilmDone && (funnel.saveToCast ?? 0) === 0 ? true : undefined);

  const dayPhase =
    resumeStepId === 'day' || completedStills > 0 || Boolean(campaign?.completedAt)
      ? deriveDayPhase({
          completedStills,
          completedClips,
          firstFilmDone,
          filmNeedsCast,
          saves: funnel.saveToCast ?? 0,
          campaignCompleted: Boolean(campaign?.completedAt),
        })
      : null;

  return {
    characterId,
    firstFilmDone,
    storyLocked,
    effectiveStepIndex,
    resumeStepId,
    dayPhase,
    pack,
    completedStills,
    completedClips,
  };
}

/** Gate entry to a campaign step (Story lock + Cast required for post-Cast tools). */
export function canEnterPlayStep(
  stepId: PlayCampaignStepId,
  artifacts: PlayArtifacts = {}
): PlayGateResult {
  const progress = derivePlayProgress(artifacts);
  if (stepId === 'roleplay' && progress.storyLocked) {
    return {
      ok: false,
      reason: 'Cut your first Day film before opening Story.',
    };
  }
  // Story can open without a Cast lead after unlock; other desks need a character.
  if (stepId !== 'character' && stepId !== 'roleplay') {
    if (!progress.characterId && !artifacts.campaign?.characterId) {
      const fromPack = artifacts.lookPack?.characterId?.trim();
      if (!fromPack) {
        return { ok: false, reason: 'Pick a Cast lead before continuing.' };
      }
    }
  }
  return { ok: true };
}

/** Soft-advance payload for a target step (caller adds nonce + setState). */
export function buildPlaySoftAdvance(
  stepId: PlayCampaignStepId | 'watch',
  input: {
    characterId?: string;
    pack?: LookPack | null;
    message?: string;
  } = {}
): PlaySoftAdvanceSpec {
  const characterId = input.characterId?.trim() || input.pack?.characterId?.trim() || '';
  if (stepId === 'watch') {
    return {
      href: characterId
        ? `/characters/${encodeURIComponent(characterId)}?media=films`
        : '/characters',
      label: 'Watch',
      message: input.message?.trim() || 'Opening your film on Cast',
    };
  }
  const step = playStepById(stepId);
  const href = resolvePlayStepHref(stepId, characterId || undefined, input.pack);
  return {
    href,
    label: step?.label ?? stepId,
    message: input.message,
  };
}

/**
 * Next CTA for Dashboard / Continue chip — prefers live campaign + artifacts, then habit loop.
 */
export function resumePlayAction(artifacts: PlayArtifacts = {}): PlayNextAction {
  const funnel = artifacts.funnel ?? {};
  const campaign = artifacts.campaign ?? null;
  const progress = derivePlayProgress(artifacts);
  const { characterId, pack, firstFilmDone, completedStills, completedClips, dayPhase } = progress;
  const cuts = funnel.firstFilmCut || 0;
  const saves = funnel.saveToCast || 0;
  const starts = funnel.firstPlayCampaign || 0;
  const keeps = funnel.keepTryOn || 0;
  const watched = artifacts.watchedFirstFilm === true;

  if (campaign?.completedAt && cuts > 0 && saves === 0 && characterId) {
    return {
      label: 'Save film to Cast',
      href: resolvePlayStepHref('save', characterId, pack),
      reason: 'Open Day and Save film to Cast to stamp a studio copy.',
    };
  }

  if (campaign?.completedAt && cuts > 0 && characterId) {
    if (!watched) {
      return {
        label: 'Watch film on Cast',
        href: `/characters/${encodeURIComponent(characterId)}?media=films`,
        reason: 'Rewatch the cut on Cast, then queue another Day reel.',
      };
    }
    return {
      label: 'Cut another Day film',
      href: remixDayFilmHref(characterId),
      reason: 'Same look, new Day — clear stills and queue a fresh reel.',
    };
  }

  if (campaign && !campaign.completedAt && characterId) {
    if (progress.resumeStepId === 'day' && dayPhase) {
      return dayPhaseAction({
        dayPhase,
        characterId,
        pack,
        completedStills,
        completedClips,
      });
    }
    const step = playStepById(progress.resumeStepId);
    const labels: Record<PlayCampaignStepId, string> = {
      character: 'Continue to Cast',
      moodboard: 'Continue to Look',
      fitting: 'Continue to Outfit',
      day: 'Continue to Day',
      roleplay: 'Continue to Story',
    };
    return {
      label: labels[progress.resumeStepId],
      href: resolvePlayStepHref(progress.resumeStepId, characterId, pack),
      reason: step ? `Resume your film at ${step.label}.` : 'Resume your film at the current step.',
    };
  }

  if ((starts > 0 || keeps > 0) && cuts === 0) {
    const dayHref = resolvePlayStepHref('day', characterId || undefined, pack);
    if (completedStills > 0 || keeps > 0 || starts > 0) {
      if (dayPhase && (completedStills > 0 || keeps > 0)) {
        return dayPhaseAction({
          dayPhase,
          characterId,
          pack,
          completedStills,
          completedClips,
          fallbackHref: dayHref,
          keepReason: keeps > 0 && completedStills === 0,
        });
      }
      return {
        label: 'Continue to Day',
        href: dayHref,
        reason:
          keeps > 0
            ? 'Outfit kept — queue Day stills and Cut film.'
            : 'Film started — queue Day stills and Cut film.',
      };
    }
  }

  if (cuts > 0 && saves === 0) {
    return {
      label: 'Open Cast films',
      href: characterId
        ? `/characters/${encodeURIComponent(characterId)}?media=films`
        : '/characters',
      reason: 'Film cut — Save to Cast to stamp a studio copy.',
    };
  }

  if (cuts > 0 && saves > 0) {
    return {
      label: watched ? 'Cut another Day film' : 'Watch film on Cast',
      href: watched
        ? characterId
          ? remixDayFilmHref(characterId)
          : '/day'
        : characterId
          ? `/characters/${encodeURIComponent(characterId)}?media=films`
          : '/characters',
      reason: watched
        ? 'Same look, new Day — queue a fresh reel.'
        : 'Film saved — open Cast to watch, then cut another.',
    };
  }

  // Unused firstFilmDone keeps TS + call sites aligned when campaign is absent.
  void firstFilmDone;

  return {
    label: 'Start a film',
    href: '/play',
    reason: 'Create a Cast lead, pick a look, plan a day, Cut film.',
  };
}

function dayPhaseAction(input: {
  dayPhase: PlayDayPhaseId;
  characterId: string;
  pack: LookPack | null;
  completedStills: number;
  completedClips: number;
  fallbackHref?: string;
  keepReason?: boolean;
}): PlayNextAction {
  const href =
    input.fallbackHref ??
    resolvePlayStepHref(input.dayPhase, input.characterId || undefined, input.pack);
  if (input.dayPhase === 'save') {
    return {
      label: 'Save film to Cast',
      href,
      reason: 'Cut is ready — Save film to Cast to stamp a studio copy.',
    };
  }
  if (input.dayPhase === 'cut') {
    return {
      label:
        input.completedStills >= 4
          ? 'Cut film · 4 of 4'
          : `Cut film · ${input.completedStills} stills`,
      href,
      reason:
        input.completedClips > 0
          ? 'Clips ready — Cut film.'
          : 'All Day stills ready — Cut film (Animate first for a motion reel).',
    };
  }
  if (input.dayPhase === 'animate') {
    return {
      label: `Animate · ${input.completedClips} of ${input.completedStills} clips`,
      href,
      reason: 'Stills ready — Animate into clips before Cut for a motion reel.',
    };
  }
  if (input.completedStills > 0 && input.completedStills < 4) {
    return {
      label: `Finish Day · ${input.completedStills} of 4`,
      href,
      reason: `${input.completedStills} stills ready — queue the rest or Cut film.`,
    };
  }
  return {
    label: 'Continue to Day',
    href,
    reason: input.keepReason
      ? 'Outfit kept — queue Day stills and Cut film.'
      : 'Film started — queue Day stills and Cut film.',
  };
}

/**
 * Where the Play funnel is stuck before the first film cut.
 * Uses artifact-derived progress so missed bumps still stall on the right desk.
 */
export function resolvePlayStall(artifacts: PlayArtifacts = {}): PlayFunnelStall | null {
  const metrics = artifacts.metrics ?? { version: 1 };
  const funnel = artifacts.funnel ?? {};
  const progress = derivePlayProgress(artifacts);

  if (progress.firstFilmDone) {
    return null;
  }

  const started = Boolean(metrics.firstPlayCampaignAt) || (funnel.firstPlayCampaign ?? 0) > 0;
  if (!started) {
    return null;
  }

  const daysSinceCampaignStart =
    typeof metrics.firstPlayCampaignAt === 'number'
      ? Math.max(0, (Date.now() - metrics.firstPlayCampaignAt) / (1000 * 60 * 60 * 24))
      : null;

  if (
    (funnel.keepTryOn ?? 0) > 0 ||
    progress.effectiveStepIndex >= STEP_INDEX.day ||
    progress.completedStills > 0
  ) {
    return {
      stepId: 'cut',
      stepLabel: FUNNEL_STEP_LABELS.cut,
      reason: 'Try-ons saved — Cut film in Day to close the loop (Story is optional).',
      daysSinceCampaignStart,
    };
  }

  const stepId = progress.resumeStepId;
  const reasons: Record<PlayCampaignStepId, string> = {
    character: 'Pick a Cast character and start Look.',
    moodboard: 'Extract a look pack on Look, then continue to Outfit.',
    fitting: 'Queue try-ons in Outfit and Keep a plate before Day.',
    day: 'Plan Day slots and queue stills before Cut film.',
    roleplay: 'Optional — cut in Day instead, or run a Story beat then Cut film.',
  };

  return {
    stepId,
    stepLabel: FUNNEL_STEP_LABELS[stepId],
    reason: reasons[stepId],
    daysSinceCampaignStart,
  };
}
