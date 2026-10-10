'use client';

/**
 * "Suggest a line" for the active Cast: their name and bible personality, the shared LLM
 * settings, and the lines already used in this Day / Story (so it says something new).
 */

import { castVoiceOf } from './cast-voice';
import { getCharacter } from './character-os';
import { sharedLlmRequestBody } from './llm-request-options';
import { loadSettingsCache } from './settings-cache';
import { requestSpokenLine, type SpokenLineRequest } from './spoken-line';

export function activeCastHasVoice(): boolean {
  return Boolean(castVoiceOf(loadSettingsCache().shared.activeCharacterId));
}

export function suggestLineForActiveCast(
  input: Pick<SpokenLineRequest, 'scene' | 'setting' | 'when' | 'heat' | 'avoid'>
): Promise<string> {
  const cache = loadSettingsCache();
  const cast = getCharacter(cache.shared.activeCharacterId?.trim() ?? '');
  const bio = cache.tools.roleplay?.bio ?? cast?.bio;
  const personality = [
    bio?.personality,
    bio?.catchphrase ? `says things like: ${bio.catchphrase}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return requestSpokenLine(
    {
      ...input,
      name: cast?.name || bio?.name,
      personality: personality || undefined,
      lead: cast?.traits?.sex === 'man' ? 'man' : 'woman',
    },
    sharedLlmRequestBody(cache.shared)
  );
}
