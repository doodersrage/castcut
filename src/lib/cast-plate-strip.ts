/**
 * Cast home "Remove clothing": edit the look plate down to the plain base layer every Cast plate
 * is meant to wear (see buildLookCastPlatePrompt), so a street outfit on an uploaded photo stops
 * leaking into Outfit / Day / Story kits. Same person, pose, framing and background.
 */

import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { CharacterRecord } from '@/lib/character-os';
import { resolveFittingGarmentPackshotModel } from '@/lib/fitting-kit-previews';
import type { FittingPlate } from '@/lib/fitting-room';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { applyCastLookPlateFromSource } from '@/lib/look-outfit-plate';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

/**
 * Short on purpose — distilled edit stacks (Rapid / Lightning, CFG 1) drift on long briefs.
 * Live on Rapid AIO (a floral-dress plate, 7 seeds): plain beige set every time, same pose, face
 * distance 0.31–0.37 — but "keep the background" let a white cutout drift grey 2/3, so an
 * isolated plate names the white instead (4/4 white).
 */
export function buildCastPlateStripPrompt(input: { onWhite: boolean }): string {
  return [
    'Edit Image 1: change only the clothing.',
    'Replace every garment, shoe and accessory with plain light-beige fitted underwear — a simple bra and briefs, no pattern, no logo.',
    input.onWhite
      ? 'Keep the exact same person, face, hair, skin tone, body shape, pose, framing and lighting. Plain pure white background.'
      : 'Keep the exact same person, face, hair, skin tone, body shape, pose, framing, lighting and background.',
    'Photoreal.',
  ].join(' ');
}

export const CAST_PLATE_STRIP_NEGATIVE =
  'original outfit, dress, shirt, top, jacket, coat, pants, jeans, skirt, shorts, shoes, boots, heels, socks, jewelry, bag, hat, lace, busy pattern, text, logo, nude, bare breasts, nipples, genitals, different person, different face, changed hairstyle, changed pose, cropped body, extra people, blurry';

export type CastPlateSnapshot = {
  filename: string;
  imageUrl: string;
  isolated: boolean;
};

type SendComfyUi = (
  prompt: string,
  sport?: null,
  historyId?: undefined,
  options?: SendComfyUiOptions
) => Promise<string | undefined | void>;

/** Upload the current plate to Comfy input so the edit (and Undo) have a stable filename. */
async function snapshotPlate(
  plate: FittingPlate,
  model: string | undefined
): Promise<CastPlateSnapshot> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const blob = await loadImageBlobFromUrls(
    collectIsolateSourceUrls({
      imageUrl: plate.imageUrl,
      filename: plate.filename,
      comfyUrl,
    })
  );
  const name = `cast-plate-before-strip-${Date.now()}.png`;
  const uploaded = await resolveQueueInputImage({
    file: new File([blob], name, { type: blob.type || 'image/png', lastModified: Date.now() }),
    filename: name,
    model,
  });
  const filename = uploaded?.filename?.trim();
  if (!filename) {
    throw new Error('Could not upload the look plate to ComfyUI.');
  }
  const imageUrl =
    collectIsolateSourceUrls({ filename, comfyUrl }).find(url =>
      url.includes('/api/comfyui/view?')
    ) ?? '';
  return { filename, imageUrl, isolated: plate.isolated === true };
}

export async function stripCastPlateClothing(input: {
  characterId: string;
  lookId?: string;
  plate: FittingPlate;
  model?: string;
  sendComfyUi: SendComfyUi;
  onStatus?: (message: string) => void;
}): Promise<{ character: CharacterRecord; before: CastPlateSnapshot }> {
  input.onStatus?.('Preparing the look plate…');
  let before: CastPlateSnapshot;
  try {
    before = await snapshotPlate(input.plate, input.model);
  } catch (err) {
    const detail =
      err instanceof Error && err.message !== 'fetch failed' ? ` (${err.message})` : '';
    throw new Error(`Could not send the look plate to ComfyUI — is it running?${detail}`);
  }

  input.onStatus?.('Removing clothing from the look plate…');
  const prompt = buildCastPlateStripPrompt({ onWhite: before.isolated });
  const promptId = await input.sendComfyUi(prompt, null, undefined, {
    inputImageFilename: before.filename,
    inputImageUrl: before.imageUrl,
    identityLock: false,
    queueModel: resolveFittingGarmentPackshotModel(input.model),
    queueTool: 'fitting',
    turboEditStrength: 'strong',
    preserveInputAspect: true,
    explicitNegative: CAST_PLATE_STRIP_NEGATIVE,
    queueHints: '',
    characterId: input.characterId,
    lookId: input.lookId,
    sourceImageUrl: before.imageUrl,
  });
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    throw new Error('ComfyUI did not accept the edit — is it running?');
  }
  const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 4 * 60_000, pollMs: 2_500 });
  const resultUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!resultUrl) {
    throw new Error('The edit did not finish — the plate is unchanged.');
  }

  input.onStatus?.('Saving the new look plate…');
  const blob = await loadImageBlobFromUrls([resultUrl]);
  const file = new File([blob], `cast-plate-base-${Date.now()}.png`, {
    type: blob.type || 'image/png',
    lastModified: Date.now(),
  });
  const result = await applyCastLookPlateFromSource({
    characterId: input.characterId,
    file,
    // An isolated plate comes back on the same white — don't cut it out twice.
    isolate: !before.isolated,
    alreadyIsolated: before.isolated,
    model: input.model,
  });
  return { character: result.character, before };
}

/** Put the pre-edit plate back (Undo). */
export async function restoreCastPlateSnapshot(input: {
  characterId: string;
  snapshot: CastPlateSnapshot;
  model?: string;
}): Promise<CharacterRecord> {
  const result = await applyCastLookPlateFromSource({
    characterId: input.characterId,
    imageUrl: input.snapshot.imageUrl,
    filename: input.snapshot.filename,
    isolate: false,
    alreadyIsolated: input.snapshot.isolated,
    model: input.model,
  });
  return result.character;
}
