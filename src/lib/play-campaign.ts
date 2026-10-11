/**
 * Guided Play loop durable state: Moodboard → Fitting → Day → Roleplay.
 * Step graph lives in play-step-machine; this module owns persistence + bumps.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { notePlayPhaseStep } from './play-metrics';
import type { LookPack } from './look-pack';
import { saveLookPack } from './look-pack';
import {
  canEnterPlayStep,
  derivePlayJourney,
  PLAY_CAMPAIGN_STEPS,
  PLAY_CORE_STEP_IDS,
  type PlayArtifacts,
  type PlayCampaignStep,
  type PlayCampaignStepId,
  type PlayGateResult,
} from './play-step-machine';

export type { PlayCampaignStep, PlayCampaignStepId };
export { PLAY_CAMPAIGN_STEPS, PLAY_CORE_STEP_IDS };

/**
 * Play-loop entry Cast: explicit `?character=` wins; otherwise the shared active Cast
 * (so nav between Film / Look / Outfit / Day / Story matches Cast profile CTAs).
 */
export function resolvePlayLoopEntryCharacterId(options: {
  queryCharacterId?: string | null;
  activeCharacterId?: string | null;
}): string | null {
  const fromQuery = options.queryCharacterId?.trim() || '';
  if (fromQuery) {
    return fromQuery;
  }
  const fromActive = options.activeCharacterId?.trim() || '';
  return fromActive || null;
}

const PLAY_LOOP_NAV_PATHS = new Set([
  '/play',
  '/moodboard',
  '/fitting',
  '/day',
  '/story',
  '/roleplay',
  '/m/film',
  '/m/moodboard',
  '/m/fitting',
  '/m/day',
  '/m/story',
]);

/** Append active Cast to Film-loop nav hrefs when the link has no `character=` yet. */
export function resolvePlayLoopNavHref(href: string, activeCharacterId?: string | null): string {
  const hashIndex = href.indexOf('#');
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const [path] = withoutHash.split('?');
  if (!PLAY_LOOP_NAV_PATHS.has(path || '')) {
    return href;
  }
  const id = activeCharacterId?.trim();
  if (!id) {
    return href;
  }
  const params = new URLSearchParams(withoutHash.split('?')[1] || '');
  if (params.get('character')?.trim()) {
    return href;
  }
  params.set('character', id);
  const next = params.toString();
  return `${path}${next ? `?${next}` : ''}${hash}`;
}

export function playCampaignProgressLabel(
  state: Pick<PlayCampaignState, 'stepIndex' | 'completedAt'> | null
): string {
  if (!state) {
    return 'Film · start';
  }
  if (state.completedAt) {
    return 'Film · complete';
  }
  const step = PLAY_CAMPAIGN_STEPS[state.stepIndex];
  const coreCount = PLAY_CORE_STEP_IDS.length;
  // Counted among the core steps; an optional one (Outfit, Story) is named, not numbered.
  const coreIndex = step ? PLAY_CORE_STEP_IDS.indexOf(step.id) : -1;
  if (step && coreIndex < 0) {
    return `Film · ${step.label} (optional)`;
  }
  const displayIndex = Math.min((coreIndex < 0 ? state.stepIndex : coreIndex) + 1, coreCount);
  return `Film · ${displayIndex} of ${coreCount}${step ? ` · ${step.label}` : ''}`;
}

/**
 * The header's "Film · 3 of 4 · Outfit" for the same step the step strip shows: the saved step
 * is only a cache that artifacts can advance, and reading it raw named an earlier step than
 * the strip beside it.
 */
export function playEffectiveProgressLabel(artifacts: PlayArtifacts = {}): string {
  return derivePlayJourney(artifacts).label;
}

export const PLAY_CAMPAIGN_KEY = 'play-campaign-v1';

export const PLAY_CAMPAIGN_UPDATED_EVENT = 'play-campaign-updated';

export type PlayCampaignState = {
  version: 1;
  characterId: string;
  lookPackId?: string;
  stepIndex: number;
  /** Set when Day/Roleplay Cut film closes the campaign loop. */
  completedAt?: number;
  updatedAt: number;
};

function normalizePlayCampaignState(value: unknown): PlayCampaignState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const parsed = value as Partial<PlayCampaignState>;
  if (parsed.version !== 1 || !parsed.characterId?.trim()) {
    return null;
  }
  return {
    version: 1,
    characterId: parsed.characterId.trim(),
    lookPackId: parsed.lookPackId?.trim() || undefined,
    stepIndex:
      typeof parsed.stepIndex === 'number'
        ? Math.max(0, Math.min(PLAY_CAMPAIGN_STEPS.length - 1, parsed.stepIndex))
        : 0,
    completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : undefined,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  };
}

export function savePlayCampaignState(state: PlayCampaignState): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = normalizePlayCampaignState(state);
  if (!normalized) {
    return;
  }
  writeBrowserValue(PLAY_CAMPAIGN_KEY, normalized);
  // Mirror to sessionStorage so same-tab e2e seeds and in-flight handoffs keep working.
  try {
    window.sessionStorage.setItem(PLAY_CAMPAIGN_KEY, JSON.stringify(normalized));
  } catch {
    /* private mode */
  }
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PLAY_CAMPAIGN_UPDATED_EVENT));
  }
}

function readSessionPlayCampaignState(): PlayCampaignState | null {
  try {
    const raw = window.sessionStorage.getItem(PLAY_CAMPAIGN_KEY);
    if (!raw) {
      return null;
    }
    return normalizePlayCampaignState(JSON.parse(raw) as unknown);
  } catch {
    window.sessionStorage.removeItem(PLAY_CAMPAIGN_KEY);
    return null;
  }
}

function mergePlayCampaignState(
  durable: PlayCampaignState,
  session: PlayCampaignState
): PlayCampaignState {
  if (durable.characterId !== session.characterId) {
    return durable.updatedAt >= session.updatedAt ? durable : session;
  }
  return {
    version: 1,
    characterId: durable.characterId,
    lookPackId: durable.lookPackId?.trim() || session.lookPackId?.trim() || undefined,
    stepIndex: Math.max(durable.stepIndex, session.stepIndex),
    completedAt: durable.completedAt ?? session.completedAt,
    updatedAt: Math.max(durable.updatedAt, session.updatedAt),
  };
}

/**
 * The saved film when it belongs to the Cast picked now (or when none is picked). A film saved
 * for another Cast is not this one's progress: the header said "Film · 2 of 3 · Day" for last
 * week's lead while a different Cast was picked (UI audit 2026-10-11).
 */
export function loadActivePlayCampaign(
  activeCharacterId?: string | null
): PlayCampaignState | null {
  const campaign = loadPlayCampaignState();
  const active = activeCharacterId?.trim();
  if (!campaign || !active) return campaign;
  return campaign.characterId === active ? campaign : null;
}

export function loadPlayCampaignState(): PlayCampaignState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const durable = normalizePlayCampaignState(readBrowserValue(PLAY_CAMPAIGN_KEY));
  const session = readSessionPlayCampaignState();
  if (durable && session) {
    const merged = mergePlayCampaignState(durable, session);
    if (
      merged.lookPackId !== durable.lookPackId ||
      merged.stepIndex !== durable.stepIndex ||
      merged.completedAt !== durable.completedAt
    ) {
      writeBrowserValue(PLAY_CAMPAIGN_KEY, merged);
    }
    return merged;
  }
  if (durable) {
    return durable;
  }
  if (session) {
    writeBrowserValue(PLAY_CAMPAIGN_KEY, session);
    return session;
  }
  return null;
}

/** Stage look pack for the next Play tool hop. */
export function stagePlayCampaignHandoff(pack: LookPack): void {
  saveLookPack(pack);
}

/**
 * The Cast a roster's "Start a film" opens: the active Cast when it is on the roster,
 * else the most recently updated one.
 */
export function rosterFilmLead<T extends { id: string; updatedAt?: number }>(
  characters: readonly T[],
  activeCharacterId?: string | null
): T | undefined {
  const activeId = activeCharacterId?.trim();
  const active = activeId ? characters.find(entry => entry.id === activeId) : undefined;
  if (active) {
    return active;
  }
  let latest: T | undefined;
  for (const entry of characters) {
    if (!latest || (Number(entry.updatedAt) || 0) > (Number(latest.updatedAt) || 0)) {
      latest = entry;
    }
  }
  return latest;
}

export function playCampaignHref(characterId: string, lookPackId?: string): string {
  const params = new URLSearchParams();
  params.set('character', characterId);
  if (lookPackId?.trim()) {
    params.set('lookPack', lookPackId.trim());
  }
  return `/play?${params.toString()}`;
}

export function clearPlayCampaignState(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(PLAY_CAMPAIGN_KEY, null);
  try {
    window.sessionStorage.removeItem(PLAY_CAMPAIGN_KEY);
  } catch {
    /* private mode */
  }
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PLAY_CAMPAIGN_UPDATED_EVENT));
  }
}

/** Prefer query look pack id, then durable campaign resume id. */
export function resolveCampaignLookPackId(input: {
  queryLookPackId?: string;
  savedLookPackId?: string;
}): string | undefined {
  const fromQuery = input.queryLookPackId?.trim();
  if (fromQuery) {
    return fromQuery;
  }
  const fromSaved = input.savedLookPackId?.trim();
  return fromSaved || undefined;
}

/**
 * Advance (or set) campaign resume step for desk handoffs.
 * Skips when a different character owns the saved campaign.
 * Default is monotonic — never moves resume backward.
 */
export function bumpPlayCampaignStep(input: {
  characterId: string;
  stepId: PlayCampaignStepId;
  lookPackId?: string;
  /** When true, set absolute stepIndex (wizard Restart). */
  absolute?: boolean;
}): PlayCampaignState | null {
  const characterId = input.characterId.trim();
  if (!characterId) {
    return null;
  }
  const stepIndex = PLAY_CAMPAIGN_STEPS.findIndex(entry => entry.id === input.stepId);
  if (stepIndex < 0) {
    return null;
  }
  const saved = loadPlayCampaignState();
  if (saved && saved.characterId !== characterId) {
    return null;
  }
  const nextIndex = input.absolute ? stepIndex : Math.max(saved?.stepIndex ?? 0, stepIndex);
  const next: PlayCampaignState = {
    version: 1,
    characterId,
    lookPackId: input.lookPackId?.trim() || saved?.lookPackId,
    stepIndex: nextIndex,
    completedAt: saved?.completedAt,
    updatedAt: Date.now(),
  };
  savePlayCampaignState(next);
  notePlayPhaseStep(input.stepId);
  void import('./local-observability').then(
    ({ noteCampaignStepMetric, noteCampaignMaxStepMetric }) => {
      noteCampaignStepMetric();
      noteCampaignMaxStepMetric(nextIndex);
    }
  );
  return next;
}

/**
 * Advance to a step after gate check (Story lock, etc.).
 * Returns null state when blocked or character mismatch.
 */
export function advancePlayTo(
  input: {
    characterId: string;
    stepId: PlayCampaignStepId;
    lookPackId?: string;
    absolute?: boolean;
  },
  artifacts?: PlayArtifacts
): { state: PlayCampaignState | null; gate: PlayGateResult } {
  const gate = canEnterPlayStep(input.stepId, {
    ...artifacts,
    campaign: artifacts?.campaign ?? loadPlayCampaignState(),
  });
  if (!gate.ok) {
    return { state: null, gate };
  }
  return { state: bumpPlayCampaignStep(input), gate };
}

/** Mark the Play campaign loop complete after a successful Cut film. */
export function completePlayCampaign(input: {
  characterId: string;
  lookPackId?: string;
  /** Step that closed the loop — Day cut stays on Day; Roleplay cut lands on Roleplay. */
  stepId?: PlayCampaignStepId;
}): PlayCampaignState | null {
  const characterId = input.characterId.trim();
  if (!characterId) {
    return null;
  }
  const saved = loadPlayCampaignState();
  if (saved && saved.characterId !== characterId) {
    return null;
  }
  const preferredId = input.stepId === 'roleplay' ? 'roleplay' : 'day';
  const preferredIndex = PLAY_CAMPAIGN_STEPS.findIndex(entry => entry.id === preferredId);
  const dayIndex = PLAY_CAMPAIGN_STEPS.findIndex(entry => entry.id === 'day');
  const next: PlayCampaignState = {
    version: 1,
    characterId,
    lookPackId: input.lookPackId?.trim() || saved?.lookPackId,
    stepIndex:
      preferredIndex >= 0
        ? preferredIndex
        : dayIndex >= 0
          ? dayIndex
          : PLAY_CAMPAIGN_STEPS.length - 1,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  };
  savePlayCampaignState(next);
  // The cut ends the Day phase — close it rather than leaving the clock running.
  notePlayPhaseStep('complete');
  void import('./local-observability').then(({ noteCampaignMaxStepMetric }) => {
    noteCampaignMaxStepMetric(next.stepIndex);
  });
  return next;
}
