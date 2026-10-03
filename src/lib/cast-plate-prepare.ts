/**
 * Cast home "Prepare plate": one edit that turns the look plate into the simplest picture to pose
 * from — standing upright facing the camera, in the plain base layer every Cast plate is meant to
 * wear (see buildLookCastPlatePrompt), on plain white. Each part can be left out (keep the outfit,
 * keep the scene). Replaces "Remove clothing", which was the base-layer part alone.
 */

import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { setLookPlateStance, type CharacterRecord } from '@/lib/character-os';
import type { DayPartnerNoun } from '@/lib/day-partner';
import { STILL_MIN_FACE_MATCH } from '@/lib/face-match';
import { measureStillFaceMatch } from '@/lib/face-match-client';
import { resolveFittingGarmentPackshotModel } from '@/lib/fitting-kit-previews';
import { resolveFittingPlateFromCharacter, type FittingPlate } from '@/lib/fitting-room';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { applyCastLookPlateFromSource } from '@/lib/look-outfit-plate';
import { plateStanceKey } from '@/lib/plate-stance';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { isSystemWorkflowSupportedModel } from '@/lib/system-workflow-runtime';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export type CastPlatePrepareOptions = {
  /** Standing upright, facing the camera, full body head to feet. */
  stand: boolean;
  /** The plain base layer instead of the photo's outfit (barefoot). */
  baseLayer: boolean;
  /** Plain white instead of the photo's scene. */
  whiteBackground: boolean;
};

export const DEFAULT_CAST_PLATE_PREPARE_OPTIONS: CastPlatePrepareOptions = {
  stand: true,
  baseLayer: true,
  whiteBackground: true,
};

export function hasCastPlatePrepareStep(options: CastPlatePrepareOptions): boolean {
  return options.stand || options.baseLayer || options.whiteBackground;
}

/** The base layer, said for who wears it (a man's plate isn't put in a bra). */
function baseLayerWords(noun: DayPartnerNoun): string {
  if (noun === 'man') {
    return 'plain light-grey fitted boxer briefs and a plain white fitted tank top, no pattern, no logo';
  }
  if (noun === 'woman') {
    return 'plain light-beige fitted underwear — a simple bra and briefs, no pattern, no logo';
  }
  return 'plain light-beige fitted underwear, no pattern, no logo';
}

/**
 * Short on purpose — distilled edit stacks (Lightning, CFG 1) drift on long briefs.
 * Live (2026-10-03, Edit 2511 Lightning-8 at 1104×1472, lying / kneeling / seated Day stills):
 * all three steps 8 of 8 (standing, beige bra + briefs, barefoot, clean white — no isolate pass
 * needed); outfit kept 8 of 8 (same dress and shoes, a held bag dropped by "no props"). Faces
 * scored 0.33–0.56 distance from a frontal source; a profile source scores ~0.8 (InsightFace
 * can't compare a side face), so the drift warning is a hint, not a verdict. "Keep the
 * background" let a white cutout drift grey on the base-layer-only edit (Rapid AIO,
 * 2026-09-27), so white is named whenever it is wanted.
 */
export function buildCastPlatePreparePrompt(input: {
  options: CastPlatePrepareOptions;
  noun?: DayPartnerNoun;
  /** The plate is already a cutout on white. */
  onWhite?: boolean;
}): string {
  const { stand, baseLayer, whiteBackground } = input.options;
  const noun = input.noun ?? 'woman';
  const possessive = noun === 'man' ? 'his' : noun === 'woman' ? 'her' : 'their';
  const white = whiteBackground || input.onWhite === true;
  const parts: string[] = ['Edit Image 1:'];
  if (stand) {
    parts.push(
      baseLayer
        ? 'the same person, now standing upright facing the camera, relaxed arms, full body head to feet in frame.'
        : 'the same person in exactly the same clothes and shoes, now standing upright facing the camera, relaxed arms, full body head to feet in frame.'
    );
  } else if (baseLayer) {
    parts.push(
      whiteBackground && !input.onWhite
        ? 'change the clothing and the background.'
        : 'change only the clothing.'
    );
  } else {
    parts.push('change only the background.');
  }
  if (baseLayer) {
    parts.push(
      `Replace every garment, shoe and accessory with ${baseLayerWords(noun)} — barefoot.`
    );
  }
  if (white) {
    parts.push('Plain pure white background, no props.');
  }
  if (stand) {
    parts.push(
      `Keep ${possessive} face, hair, skin tone and body shape${baseLayer ? '' : ' and the outfit'} exactly.${white ? '' : ' Same place and light as Image 1.'}`
    );
  } else {
    parts.push(
      `Keep the exact same person, face, hair, skin tone, body shape, pose, framing${baseLayer ? '' : ', clothing'} and lighting${white ? '' : ' and background'}.`
    );
  }
  parts.push('One person. Photoreal.');
  return parts.join(' ');
}

export function buildCastPlatePrepareNegative(
  options: CastPlatePrepareOptions,
  noun: DayPartnerNoun = 'woman'
): string {
  return [
    'different person, different face, changed hairstyle, extra people',
    options.stand
      ? 'sitting, kneeling, lying down, crouching, cropped body, cut-off feet'
      : 'changed pose, cropped body',
    options.baseLayer
      ? // A man's base layer is a tank top — "top" can't be negative for him.
        `original outfit, dress, shirt, ${noun === 'man' ? '' : 'top, '}jacket, coat, pants, jeans, skirt, shorts, shoes, boots, heels, socks, jewelry, bag, hat, lace, busy pattern, nude, bare breasts, nipples, genitals`
      : 'different outfit, changed clothes, nude',
    options.whiteBackground ? 'scenery, room, furniture, props, grey backdrop' : null,
    'text, logo, blurry',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Edit 2511 first (tested live); else whatever the Outfit packshot edits use. */
const PREPARE_MODEL_CANDIDATES: ComfyImageModel[] = [
  'qwen-image-edit-2511-lightning-8',
  'qwen-image-edit-2511-lightning-4',
  'qwen-image-edit-2511',
];

export function resolveCastPlatePrepareModel(preferredModel?: string): ComfyImageModel | undefined {
  const preferred = String(preferredModel ?? '').trim();
  if (preferred && PREPARE_MODEL_CANDIDATES.includes(preferred as ComfyImageModel)) {
    return preferred as ComfyImageModel;
  }
  for (const id of PREPARE_MODEL_CANDIDATES) {
    if (isSystemWorkflowSupportedModel(id)) {
      return id;
    }
  }
  return resolveFittingGarmentPackshotModel(preferredModel);
}

/**
 * A standing plate renders on the 3:4 portrait canvas Play plates use — a seated or lying
 * photo's own (often landscape) shape has no room for her head to feet.
 */
export const CAST_PLATE_PREPARE_STANDING_CANVAS = { width: 1104, height: 1472 } as const;

export type CastPlateSnapshot = {
  filename: string;
  imageUrl: string;
  isolated: boolean;
  /** Pixel size, so the edit renders at the plate's shape (null when the browser can't read it). */
  size?: { width: number; height: number } | null;
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
  const name = `cast-plate-before-prepare-${Date.now()}.png`;
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
  let size: CastPlateSnapshot['size'] = null;
  try {
    const bitmap = await createImageBitmap(blob);
    size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  } catch {
    size = null;
  }
  return { filename, imageUrl, isolated: plate.isolated === true, size };
}

/**
 * Face similarity of the prepared plate to the one before (null when it can't be measured —
 * no face-match nodes, no face found, ComfyUI busy). Best-effort.
 */
async function measurePrepareFaceMatch(before: string, after: string): Promise<number | null> {
  if (!before || !after.includes('/api/comfyui/view?')) {
    return null;
  }
  try {
    const measured = await measureStillFaceMatch({ referenceUrl: before, imageUrl: after });
    return measured?.available ? measured.similarity : null;
  } catch {
    return null;
  }
}

export async function prepareCastPlate(input: {
  characterId: string;
  lookId?: string;
  plate: FittingPlate;
  options: CastPlatePrepareOptions;
  noun?: DayPartnerNoun;
  model?: string;
  sendComfyUi: SendComfyUi;
  onStatus?: (message: string) => void;
}): Promise<{ character: CharacterRecord; before: CastPlateSnapshot; faceDrift: boolean }> {
  if (!hasCastPlatePrepareStep(input.options)) {
    throw new Error('Pick at least one change.');
  }
  input.onStatus?.('Preparing the look plate…');
  let before: CastPlateSnapshot;
  try {
    before = await snapshotPlate(input.plate, input.model);
  } catch (err) {
    const detail =
      err instanceof Error && err.message !== 'fetch failed' ? ` (${err.message})` : '';
    throw new Error(`Could not send the look plate to ComfyUI — is it running?${detail}`);
  }

  input.onStatus?.('Editing the look plate…');
  const { stand, whiteBackground } = input.options;
  const prompt = buildCastPlatePreparePrompt({
    options: input.options,
    noun: input.noun,
    onWhite: before.isolated,
  });
  const canvas = stand ? CAST_PLATE_PREPARE_STANDING_CANVAS : before.size;
  const promptId = await input.sendComfyUi(prompt, null, undefined, {
    inputImageFilename: before.filename,
    inputImageUrl: before.imageUrl,
    identityLock: false,
    queueModel: resolveCastPlatePrepareModel(input.model),
    queueTool: 'fitting',
    // "Edit Image 1: … Keep facial identity and camera framing." — strong's opener lets the
    // wardrobe change, which the keep-outfit edit must not.
    turboEditStrength: 'balanced',
    preserveInputAspect: true,
    // Render at a fitted shape: the sidebar's square latent padded tall plates with white side
    // bars that then stayed in the new plate (live, 1104×1472 → 1328²).
    ...(canvas ? { castPlateReference: true, figurePixelSize: { ...canvas } } : {}),
    explicitNegative: buildCastPlatePrepareNegative(input.options, input.noun),
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

  input.onStatus?.('Checking the face…');
  const similarity = await measurePrepareFaceMatch(before.imageUrl, resultUrl);
  const faceDrift = similarity !== null && similarity < STILL_MIN_FACE_MATCH;

  input.onStatus?.('Saving the new look plate…');
  const blob = await loadImageBlobFromUrls([resultUrl]);
  const file = new File([blob], `cast-plate-prepared-${Date.now()}.png`, {
    type: blob.type || 'image/png',
    lastModified: Date.now(),
  });
  // The edit paints the white itself (6 of 6 live) — no second cut-out.
  const onWhite = whiteBackground || before.isolated;
  const result = await applyCastLookPlateFromSource({
    characterId: input.characterId,
    file,
    isolate: false,
    alreadyIsolated: onWhite,
    model: input.model,
  });
  let character = result.character;
  if (stand) {
    const key = plateStanceKey(resolveFittingPlateFromCharacter(character));
    character =
      setLookPlateStance(input.characterId, character.activeLookId ?? input.lookId ?? '', {
        standing: true,
        reason: 'prepared',
        checkedAt: Date.now(),
        ...(key ? { plate: key } : {}),
      }) ?? character;
  }
  return { character, before, faceDrift };
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
