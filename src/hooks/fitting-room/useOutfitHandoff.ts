'use client';

import { useEffect, useRef } from 'react';
import { handOffOutfitPicks, outfitPicksSignature, type OutfitPicks } from '@/lib/outfit-handoff';

/**
 * Hand Outfit's clothing photo and shoes to Day and Story whenever they change here, and Day's
 * slots whenever the kit or the look changes too (not on the first load: a choice made in Day
 * since then stands until Outfit changes again). Another Cast is not a hand-off.
 */
export function useOutfitHandoff(
  mounted: boolean,
  picks: OutfitPicks,
  outfit: { characterId?: string | null; kitId?: string | null; lookId?: string | null } = {}
) {
  const signature = outfitPicksSignature(picks);
  const characterId = outfit.characterId?.trim() || '';
  const kitId = outfit.kitId?.trim() || '';
  const lookId = outfit.lookId?.trim() || '';
  const last = useRef<{
    signature: string;
    characterId: string;
    kitId: string;
    lookId: string;
  } | null>(null);
  useEffect(() => {
    if (!mounted) return;
    const previous = last.current;
    last.current = { signature, characterId, kitId, lookId };
    if (!previous || previous.characterId !== characterId) return;
    const picksChanged = previous.signature !== signature;
    if (!picksChanged && previous.kitId === kitId && previous.lookId === lookId) return;
    void handOffOutfitPicks(picksChanged ? (JSON.parse(signature) as OutfitPicks) : null, {
      kitId: kitId || null,
      characterId: characterId || null,
    });
  }, [characterId, kitId, lookId, mounted, signature]);
}
