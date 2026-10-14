'use client';

import { useState } from 'react';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { runwayClipPrompt, saveOutfitRunway } from '@/lib/cast-wardrobe';
import type { CharacterRecord } from '@/lib/character-os';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { RUNWAY_CLIP_MODEL } from '@/lib/outfit-runway';

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
  const actions = usePromptResultActions({ tool: 'video', model: RUNWAY_CLIP_MODEL });
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    onStatus('Making the runway clip — about a minute…');
    try {
      const promptId = await actions.sendComfyUi(runwayClipPrompt(man), undefined, undefined, {
        queueTool: 'video',
        queueModel: RUNWAY_CLIP_MODEL,
        inputImageUrl: imageUrl,
        derivedKind: 'i2v',
        clipMode: 'i2v',
        qualityProfile: 'final',
        queueParamsBase: { videoFrames: 96, videoFps: 16 },
        characterId: character.id,
      });
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) throw new Error('The clip was not queued.');
      const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 8 * 60_000, pollMs: 3_000 });
      const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!url) throw new Error('The clip did not finish — check the queue.');
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
