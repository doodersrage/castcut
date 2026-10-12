'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { probeImageUrlDimensions } from '@/lib/browser-image-dimensions';
import { resolveCastPlatePrepareModel } from '@/lib/cast-plate-prepare';
import {
  buildCastBibleGenderSwapNegative,
  buildCastBibleGenderSwapPrompt,
} from '@/lib/character-bible-picture';
import { saveCharacterBiblePictureSwap, type CharacterRecord } from '@/lib/character-os';
import { galleryEntryPrimaryViewUrl, loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadSettingsCache } from '@/lib/settings-cache';

/**
 * "Gender swap" under the bible picture: an Edit 2511 edit of the rendered picture (scene, pose,
 * outfit and camera kept), the lead as the other gender. Kept beside the picture on the Cast.
 */
export default function CastBibleGenderSwapButton({
  character,
  pictureUrl,
  from,
  onSwapped,
  onError,
}: {
  character: CharacterRecord;
  /** The rendered bible picture. */
  pictureUrl: string;
  /** Who the bible picture shows. */
  from: 'woman' | 'man';
  onSwapped: (character: CharacterRecord) => void;
  onError: (message: string | null) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const [busy, setBusy] = useState(false);

  const swap = async () => {
    onError(null);
    setBusy(true);
    try {
      // The edit renders at the picture's own shape (a square latent padded and reframed it).
      const size = await probeImageUrlDimensions(pictureUrl).catch(() => null);
      const parent = character.biblePicture?.promptId
        ? loadComfyGallery().find(entry => entry.promptId === character.biblePicture?.promptId)
        : undefined;
      const promptId = await actions.sendComfyUi(
        buildCastBibleGenderSwapPrompt(from),
        undefined,
        undefined,
        {
          inputImageUrl: pictureUrl,
          identityLock: false,
          queueModel: resolveCastPlatePrepareModel(loadSettingsCache().shared.model),
          queueTool: 'fitting',
          turboEditStrength: 'balanced',
          preserveInputAspect: true,
          ...(size ? { castPlateReference: true, figurePixelSize: size } : {}),
          explicitNegative: buildCastBibleGenderSwapNegative(from),
          queueHints: '',
          parentGalleryEntryId: parent?.id,
          characterId: character.id,
          sourceImageUrl: pictureUrl,
        }
      );
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) throw new Error('ComfyUI did not accept the swap — is it running?');
      const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 5 * 60_000, pollMs: 2_500 });
      const imageUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!imageUrl) throw new Error('The swap did not finish — it may still land in the gallery.');
      const saved = saveCharacterBiblePictureSwap(character.id, {
        imageUrl,
        promptId: id,
        at: Date.now(),
        as: from === 'woman' ? 'man' : 'woman',
      });
      if (saved) onSwapped(saved);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not swap the picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={busy}
      loadingLabel="Swapping"
      data-testid="character-bible-gender-swap"
      title={`The same picture with ${character.name || 'them'} as a ${from === 'woman' ? 'man' : 'woman'}`}
      onClick={() => void swap()}
    >
      Gender swap
    </Button>
  );
}
