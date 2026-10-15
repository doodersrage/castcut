'use client';

import { useState } from 'react';
import { useOutfitRunwayClip } from '@/hooks/character/useOutfitRunwayClip';
import { saveOutfitRunway } from '@/lib/cast-wardrobe';
import type { CharacterRecord } from '@/lib/character-os';

/**
 * "Runway" on a Wardrobe outfit: a short turn-around clip made from the outfit's picture, kept
 * with the outfit. Loaded lazily — it owns a ComfyUI queue hook the rest of Cast home never needs.
 */
export default function OutfitRunwayButton({
  character,
  outfitKey,
  imageUrl,
  man,
  onDone,
  onStatus,
}: {
  character: CharacterRecord;
  outfitKey: string;
  imageUrl: string;
  man: boolean;
  onDone: (character: CharacterRecord) => void;
  onStatus: (text: string) => void;
}) {
  const makeClip = useOutfitRunwayClip();
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    onStatus('Making the runway clip — about a minute…');
    try {
      const url = await makeClip({ castId: character.id, imageUrl, man });
      const next = saveOutfitRunway(character.id, outfitKey, url, imageUrl);
      if (next) onDone(next);
      onStatus('Runway clip ready.');
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not make the runway clip.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="ui-text-link type-caption"
      disabled={busy}
      data-testid={`cast-wardrobe-${outfitKey}-runway`}
      title="A short clip of the outfit turning around, made from this picture (about a minute)"
      onClick={() => void make()}
    >
      {busy ? 'Making runway…' : 'Runway clip'}
    </button>
  );
}
