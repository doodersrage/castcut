import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { experimentGroupIdForPrompt } from './experiment-groups';
import type { ComfyGalleryEntry } from './gallery/comfyui-gallery';

export const EXPERIMENT_WINNERS_KEY = 'comfy-experiment-winners-v1';
export const EXPERIMENT_WINNERS_UPDATED_EVENT = 'comfy-experiment-winners-updated';

export type ExperimentWinnerRecord = {
  groupId: string;
  entryId: string;
  markedAt: number;
};

function emitWinnersUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(EXPERIMENT_WINNERS_UPDATED_EVENT));
}

export function loadExperimentWinners(): Record<string, ExperimentWinnerRecord> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    return readBrowserValue<Record<string, ExperimentWinnerRecord>>(EXPERIMENT_WINNERS_KEY) ?? {};
  } catch {
    return {};
  }
}

export function markExperimentWinner(groupId: string, entryId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const winners = loadExperimentWinners();
  winners[groupId] = { groupId, entryId, markedAt: Date.now() };
  writeBrowserValue(EXPERIMENT_WINNERS_KEY, winners);
  emitWinnersUpdated();
}

export function clearExperimentWinner(groupId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const winners = loadExperimentWinners();
  delete winners[groupId];
  writeBrowserValue(EXPERIMENT_WINNERS_KEY, winners);
  emitWinnersUpdated();
}

/** Prefer crowned entry within a selection (or same prompt group); else first selected. */
export function resolveExperimentWinnerEntry(
  entries: ComfyGalleryEntry[]
): ComfyGalleryEntry | null {
  if (entries.length === 0) {
    return null;
  }
  const groupId = experimentGroupIdForPrompt(entries[0]!.prompt);
  if (!groupId) {
    return entries[0] ?? null;
  }
  const winnerId = loadExperimentWinners()[groupId]?.entryId;
  if (!winnerId) {
    return entries[0] ?? null;
  }
  return entries.find(entry => entry.id === winnerId) ?? entries[0] ?? null;
}
