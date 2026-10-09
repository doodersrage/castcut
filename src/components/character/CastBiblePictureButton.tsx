'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import {
  buildCastBiblePictureNegative,
  buildCastBiblePicturePrompt,
} from '@/lib/character-bible-picture';
import {
  activeLook,
  getCharacter,
  saveCharacterBiblePicture,
  type CharacterRecord,
} from '@/lib/character-os';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { dayPartnerNoun } from '@/lib/day-partner';
import { withCastIdentityQueueFields } from '@/lib/look-outfit-plate';
import { PLAY_FACE_CROP_CANVAS } from '@/lib/plate-render-size';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { isRoleplayAdultContent, normalizeRoleplayContent, type RoleplayBio } from '@/lib/roleplay';
import { loadSettingsCache } from '@/lib/settings-cache';
import { resolveStoryNudeFaceFilename } from '@/lib/story-nude-face';

type Phase = 'idle' | 'preparing' | 'rendering';

/**
 * "Picture this bible" on Cast → Bible. Loaded lazily — it owns a ComfyUI queue hook the rest of
 * Cast home never needs. Queues the way Story queues a clean-rated still with no outfit image:
 * the Cast's face crop as Image 1 (the underwear plate as Image 1 kept the underwear on however
 * the prompt dressed her), identity lock pinned to that face, the Cast's LoRAs, Story's engine.
 */
export default function CastBiblePictureButton({
  character,
  bio,
  pictureUrl,
  onPictured,
  onError,
}: {
  character: CharacterRecord;
  bio: RoleplayBio;
  /** The Cast's own picture (face lock or reference photo). */
  pictureUrl: { filename: string; imageUrl: string };
  onPictured: (character: CharacterRecord) => void;
  onError: (message: string | null) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'roleplay', model });
  const [phase, setPhase] = useState<Phase>('idle');

  const picture = async () => {
    onError(null);
    setPhase('preparing');
    try {
      const cast = getCharacter(character.id) ?? character;
      const shared = loadSettingsCache().shared;
      const look = activeLook(cast);
      const adult = isRoleplayAdultContent(normalizeRoleplayContent(cast.content));
      const face = await resolveStoryNudeFaceFilename({
        character: cast,
        referenceFilename: pictureUrl.filename,
        referenceUrl: pictureUrl.imageUrl,
        model: shared.model,
        comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
      }).catch(() => null);
      const stillOpts = buildRoleplayQueueStillOptions({
        photoMode: true,
        isolateSubject: false,
        referenceIsolated: false,
        // No face crop: the full picture (its own clothes may then leak — the prompt still says).
        filename: face || pictureUrl.filename,
        imageUrl: face ? undefined : pictureUrl.imageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
        model: shared.model,
      });
      if (!stillOpts) {
        throw new Error('Add a look plate first — the picture keeps the face from it.');
      }
      const identity = withCastIdentityQueueFields(
        cast,
        shared.ipAdapterStrength ?? 0.75,
        stillOpts.queueParamsBase
      );
      const descriptor = look.descriptor?.trim() || cast.descriptor?.trim() || '';
      const prompt = buildCastBiblePicturePrompt({
        name: bio.name || cast.name,
        descriptor,
        bibleLook: bio.look,
        setting: cast.setting,
        adult,
        lead: dayPartnerNoun({ descriptor, hints: cast.hints, traits: cast.traits }),
      });
      setPhase('rendering');
      const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
        ...stillOpts,
        castPlateReference: true,
        // A face crop has no size to probe — render at the Cast plate's 3:4 portrait shape.
        ...(face ? { figurePixelSize: { ...PLAY_FACE_CROP_CANVAS } } : {}),
        explicitNegative: buildCastBiblePictureNegative(adult),
        queueHints: '',
        characterId: cast.id,
        lookId: cast.activeLookId,
        ...(identity.sessionActiveLoraIds
          ? { sessionActiveLoraIds: identity.sessionActiveLoraIds }
          : {}),
        queueParamsBase: {
          ...identity.queueParamsBase,
          // The identity lock reads the same face crop as Image 1, not the body plate.
          ...(face ? { ipAdapterImageFilename: face, ipAdapterImageFilenames: [face] } : {}),
        },
      });
      const id = typeof promptId === 'string' ? promptId.trim() : '';
      if (!id) {
        throw new Error('ComfyUI did not accept the picture — is it running?');
      }
      const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 6 * 60_000, pollMs: 2_500 });
      const imageUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
      if (!imageUrl) {
        throw new Error('The picture did not finish — it may still land in the gallery.');
      }
      const saved = saveCharacterBiblePicture(cast.id, {
        imageUrl,
        promptId: id,
        at: Date.now(),
      });
      if (saved) {
        onPictured(saved);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not picture the bible.');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={phase !== 'idle'}
      loadingLabel={phase === 'preparing' ? 'Preparing the face' : 'Rendering the picture'}
      data-testid="character-bible-picture"
      title="One full-body still of this Cast as the bible describes them"
      onClick={() => void picture()}
    >
      Picture this bible
    </Button>
  );
}
