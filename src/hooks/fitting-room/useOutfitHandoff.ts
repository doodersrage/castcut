'use client';

import { useEffect, useRef } from 'react';
import { handOffOutfitPicks, outfitPicksSignature, type OutfitPicks } from '@/lib/outfit-handoff';

/**
 * Hand Outfit's clothing photo and shoes to Day and Story whenever they change here (not on the
 * first load: a choice made in Day since then stands until Outfit changes again).
 */
export function useOutfitHandoff(mounted: boolean, picks: OutfitPicks) {
  const signature = outfitPicksSignature(picks);
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (lastSignature.current === null) {
      lastSignature.current = signature;
      return;
    }
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    void handOffOutfitPicks(JSON.parse(signature) as OutfitPicks);
  }, [mounted, signature]);
}
