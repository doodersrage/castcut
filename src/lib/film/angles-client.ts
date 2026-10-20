'use client';

/**
 * Close-up angles (2026-10-14): a film of one wide still per scene feels static. One Edit 2511
 * pass per angle re-frames the same moment closer — a face close-up and a detail shot (hands,
 * what she holds) — cut in for a beat right after the scene (dayWatchPlaylist). Live on four Day
 * stills (bedroom mirror, night market, terrace, window stretch): 8 of 8 kept her face, hair,
 * dress, place and light; the details found the skewer, the railing, clasped hands.
 */

import { waitForGalleryPromptIds } from '../best-of-n/vision-queue';
import { resolveCastPlatePrepareModel, snapshotPlate } from '../cast/plate-prepare';
import { galleryEntryPrimaryViewUrl } from '../gallery/comfyui-gallery';
import type { FittingPlate } from '../fitting/room';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export type FilmAngleKind = 'face' | 'detail';

/** The edit prompt for one angle; `moment` is the slot's beat ("browsing the stalls"). */
export function filmAnglePrompt(kind: FilmAngleKind, moment: string, manLead = false): string {
  const [her, she] = manLead ? ['his', 'he'] : ['her', 'she'];
  const what = moment.trim().replace(/[.\s]+$/, '') || 'in this moment';
  return kind === 'face'
    ? `Edit Image 1: a close-up of the same moment from closer — ${her} head and shoulders fill the frame, ${her} face and expression as ${she} is ${what}. Keep ${her} face, hair, clothes, place and light exactly. One person. Photoreal.`
    : `Edit Image 1: a close-up detail shot of the same moment — ${her} hands and whatever ${she} is holding or touching, filling the frame, ${her} face out of frame or soft. Keep ${her} clothes, place and light exactly. Photoreal.`;
}

type SendComfyUi = (
  prompt: string,
  sport?: null,
  historyId?: undefined,
  options?: SendComfyUiOptions
) => Promise<string | undefined | void>;

/** Both angles of one still (ComfyUI view URLs); an angle that did not finish is left out. */
export async function makeFilmAngles(input: {
  imageUrl: string;
  moment: string;
  manLead?: boolean;
  sendComfyUi: SendComfyUi;
  model?: string;
  characterId?: string;
}): Promise<Array<{ kind: FilmAngleKind; imageUrl: string }>> {
  const before = await snapshotPlate(
    { imageUrl: input.imageUrl, filename: '' } as FittingPlate,
    input.model
  );
  const kinds: FilmAngleKind[] = ['face', 'detail'];
  const ids: Array<{ kind: FilmAngleKind; id: string }> = [];
  for (const kind of kinds) {
    const promptId = await input.sendComfyUi(
      filmAnglePrompt(kind, input.moment, input.manLead),
      null,
      undefined,
      {
        inputImageFilename: before.filename,
        inputImageUrl: before.imageUrl,
        identityLock: false,
        queueModel: resolveCastPlatePrepareModel(input.model),
        queueTool: 'fitting',
        turboEditStrength: 'balanced',
        castPlateReference: true,
        queueHints: '',
        ...(input.characterId ? { characterId: input.characterId } : {}),
        sourceImageUrl: before.imageUrl,
      }
    );
    const id = typeof promptId === 'string' ? promptId.trim() : '';
    if (id) ids.push({ kind, id });
  }
  if (!ids.length) return [];
  const entries = await waitForGalleryPromptIds(
    ids.map(item => item.id),
    { timeoutMs: 6 * 60_000, pollMs: 2_500 }
  );
  return ids.flatMap(item => {
    const entry = entries.find(candidate => candidate.promptId === item.id);
    const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
    return url ? [{ kind: item.kind, imageUrl: url }] : [];
  });
}
