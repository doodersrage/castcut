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
  return castVoiceOf(loadSettingsCache().shared.activeCharacterId)?.steer === true;
}

export function suggestLineForActiveCast(
  input: Pick<SpokenLineRequest, 'scene' | 'setting' | 'when' | 'heat' | 'avoid' | 'replyTo'>,
  options?: { castId?: string | null; story?: boolean }
): Promise<string> {
  const cache = loadSettingsCache();
  const cast = getCharacter(
    options?.castId?.trim() || cache.shared.activeCharacterId?.trim() || ''
  );
  // Story speaks as its persona; Day as the Cast in the stills. The catchphrase is left out: the
  // model built lines around it ("Your coffee's too hot" at a beach bar).
  const bio = options?.story ? (cache.tools.roleplay?.bio ?? cast?.bio) : cast?.bio;
  const personality = bio?.personality?.trim() ?? '';
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
