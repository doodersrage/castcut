'use client';

import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import { LOCATION_PICTURE_MODEL } from '@/lib/location/picture';
import { imageEditGraph } from '@/lib/wardrobe/clothing-edit';
import { CAST_EXPRESSIONS, CAST_EXPRESSION_SIZE, castExpressionPrompt } from './expression-sheet';

/**
 * Render the expression sheet from a Cast's plate (a ComfyUI input file): six edits queued at once,
 * kept in the Gallery; returns each expression's picture as it finished (null where
 * one failed). About half a minute each on Qwen-Image 2.1 Turbo.
 */
export async function renderCastExpressions(input: {
  plateFilename: string;
  onProgress?: (label: string) => void;
}): Promise<Array<{ label: string; url: string | null }>> {
  const { requeueComfyJob } = await import('@/lib/comfyui/requeue');
  const queued: Array<{ label: string; promptId: string | null }> = [];
  for (const [index, expression] of CAST_EXPRESSIONS.entries()) {
    input.onProgress?.(`Queueing ${index + 1} of ${CAST_EXPRESSIONS.length}…`);
    const prompt = castExpressionPrompt(expression.words);
    const result = await requeueComfyJob({
      prompt,
      negativePrompt: '',
      model: LOCATION_PICTURE_MODEL,
      tool: 'cast',
      workflowJson: JSON.stringify(
        imageEditGraph({
          image: input.plateFilename,
          prompt,
          seed: Math.floor(Math.random() * 2 ** 31),
          size: CAST_EXPRESSION_SIZE,
          filenamePrefix: `Castcut/expression-${expression.id}`,
        })
      ),
      workflowFinal: true,
    });
    queued.push({
      label: expression.label,
      promptId: result.ok ? (result.promptId ?? null) : null,
    });
  }
  const ids = queued.map(entry => entry.promptId).filter((id): id is string => Boolean(id));
  if (!ids.length) throw new Error('ComfyUI did not take the renders — is it running?');
  input.onProgress?.(`Rendering ${ids.length} expressions…`);
  const done = await waitForGalleryPromptIds(ids, { timeoutMs: 12 * 60_000, pollMs: 3_000 });
  const urlOf = new Map(
    done.map(entry => [entry.promptId, galleryEntryPrimaryViewUrl(entry)?.trim() || null])
  );
  return queued.map(entry => ({
    label: entry.label,
    url: entry.promptId ? (urlOf.get(entry.promptId) ?? null) : null,
  }));
}
