/**
 * Guided Play loop durable state: Moodboard → Fitting → Day → Roleplay.
 * Step graph lives in play-step-machine; this module owns persistence + bumps.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import type { LookPack } from './look-pack';
import { saveLookPack } from './look-pack';
import {
  canEnterPlayStep,
  PLAY_CAMPAIGN_STEPS,
  PLAY_CORE_STEP_IDS,
  type PlayArtifacts,
  type PlayCampaignStep,
  type PlayCampaignStepId,
  type PlayGateResult,
} from './play-step-machine';

export type { PlayCampaignStep, PlayCampaignStepId };
export { PLAY_CAMPAIGN_STEPS, PLAY_CORE_STEP_IDS };

export function playCampaignProgressLabel(state: PlayCampaignState | null): string {
  if (!state) {
    return 'Film · start';
  }
  if (state.completedAt) {
    return 'Film · complete';
  }
  const step = PLAY_CAMPAIGN_STEPS[state.stepIndex];
  const coreCount = PLAY_CORE_STEP_IDS.length;
  const displayIndex = Math.min(state.stepIndex + 1, coreCount);
  return `Film · ${displayIndex} of ${coreCount}${step ? ` · ${step.label}` : ''}`;
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
  void import('./local-observability').then(({ noteCampaignMaxStepMetric }) => {
    noteCampaignMaxStepMetric(next.stepIndex);
  });
  return next;
}
