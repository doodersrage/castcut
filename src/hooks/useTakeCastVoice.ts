'use client';

import { useCallback, useState } from 'react';
import { takeCastVoiceFromClip } from '@/lib/cast-voice';
import { loadSettingsCache } from '@/lib/settings-cache';

export const TAKE_VOICE_DONE = 'Voice kept. Cast → Voice → “Steer talking clips” uses it in clips.';

/**
 * "Use this voice" on a talking clip (Story scene, Day slot): keep a sample of it on the Cast.
 * The note is keyed by the card it was taken from, so a board shows it under the right one.
 */
export function useTakeCastVoice() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ key: string; text: string } | null>(null);
  const take = useCallback(async (key: string, clipUrl: string, castId?: string | null) => {
    const id = castId?.trim() || loadSettingsCache().shared.activeCharacterId?.trim();
    if (!id) {
      setNote({ key, text: 'Pick a Cast member first.' });
      return;
    }
    setBusyKey(key);
    const error = await takeCastVoiceFromClip({ castId: id, clipUrl });
    setBusyKey(null);
    setNote({ key, text: error ?? TAKE_VOICE_DONE });
  }, []);
  return {
    take,
    taking: (key: string) => busyKey === key,
    noteFor: (key: string) => (note?.key === key ? note.text : null),
  };
}
