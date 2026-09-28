/**
 * Server-only: one "Check on Cast" render (lora-check.ts) — replay a Day still with a LoRA at
 * one strength and face-score the result against the Cast plate.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  readComfyImageGraph,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import { FaceMatchNoFaceError, measureFaceMatchInComfy } from '@/lib/face-match-server';
import { graphWithLoraAt } from '@/lib/lora-check';

export type LoraCheckRenderResult =
  | { available: true; imageUrl: string; similarity: number | null }
  | { available: false; reason: string };

function viewUrl(ref: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder ?? '',
    type: ref.type || 'output',
  });
  return `/api/comfyui/view?${params.toString()}`;
}

export async function runLoraCheckRender(input: {
  stillUrl: string;
  referenceUrl: string;
  loraFilename: string;
  strength: number;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<LoraCheckRenderResult> {
  const stillRef = parseComfyViewRef(input.stillUrl);
  if (!stillRef) {
    return { available: false, reason: 'The still is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const graph = await readComfyImageGraph(baseUrl, stillRef);
  if (!graph) {
    return { available: false, reason: 'The still has no embedded ComfyUI graph to replay.' };
  }
  const prompt = graphWithLoraAt(graph, input.loraFilename, input.strength);
  const saveIds = Object.entries(prompt)
    .filter(([, node]) => (node as { class_type?: string })?.class_type === 'SaveImage')
    .map(([id]) => id);
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'lora-check',
    timeoutMs: input.timeoutMs ?? 300_000,
    prompt,
    read: entry => {
      for (const id of saveIds.length > 0 ? saveIds : Object.keys(entry.outputs ?? {})) {
        const image = (entry.outputs?.[id] as { images?: ComfyImageRef[] } | undefined)
          ?.images?.[0];
        if (image?.filename) return image;
      }
      return undefined;
    },
  });
  if (!run.result) {
    return { available: false, reason: 'The replayed still produced no image.' };
  }
  const imageUrl = viewUrl({
    filename: run.result.filename,
    subfolder: run.result.subfolder ?? '',
    type: run.result.type ?? 'output',
  });
  try {
    const match = await measureFaceMatchInComfy({
      referenceUrl: input.referenceUrl,
      imageUrl,
      comfyUrl: input.comfyUrl,
    });
    if (!match.available) {
      return { available: false, reason: match.reason };
    }
    return { available: true, imageUrl, similarity: match.similarity };
  } catch (error) {
    if (error instanceof FaceMatchNoFaceError) {
      return { available: true, imageUrl, similarity: null };
    }
    throw error;
  }
}
