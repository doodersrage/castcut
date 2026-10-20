'use client';

import { getCharacter, loraTriggerFromCharacter } from '../character/os';
import { loadSettingsCache } from '../settings/cache';

/** Prefix a trained trigger when it is not already in the prompt. */
export function applyLoraTriggerToPrompt(prompt: string, trigger?: string): string {
  const text = prompt.trim();
  const word = trigger?.trim();
  if (!word) {
    return text;
  }
  if (text.toLowerCase().includes(word.toLowerCase())) {
    return text;
  }
  return text ? `${word}, ${text}` : word;
}

function resolveActiveCharacterTrigger(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    const characterId = loadSettingsCache().shared.activeCharacterId?.trim();
    return loraTriggerFromCharacter(getCharacter(characterId));
  } catch {
    return undefined;
  }
}

/** Inject the active character's LoRA trigger so Generate / Roleplay / Video honor the flywheel. */
export function injectLoraTriggers(prompt: string): string {
  return applyLoraTriggerToPrompt(prompt, resolveActiveCharacterTrigger());
}
