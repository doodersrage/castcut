/** Server: render an outfit picture as a 3D model with TRELLIS.2 (outfit-3d-graph.ts); its GLB view URL. */

import { createHash } from 'node:crypto';
import {
  comfyBaseUrl,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyHistoryEntry,
} from './comfy-utility-graph-server';
import { buildOutfit3dGraph, OUTFIT_3D_SAVE_NODE } from './outfit-3d-graph';

export const OUTFIT_3D_MODEL_FILE = 'trellis_2_int8_convrot.safetensors';
const REQUIRED_NODES = [
  'Trellis2ShapeStage',
  'Trellis2TextureStage',
  'RemoveBackground',
  'SaveGLB',
];

function listed(spec: unknown): string[] {
  if (!Array.isArray(spec)) return [];
  const first = spec[0];
  if (Array.isArray(first)) return first.map(String);
  const options = (spec[1] as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.map(String) : [];
}

export async function renderOutfit3d(input: {
  imageUrl: string;
  comfyUrl?: string;
}): Promise<{ url: string }> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  for (const node of REQUIRED_NODES) {
    if (!(await resolveComfyNode(baseUrl, [node]))) {
      throw new Error(
        '3D view needs a newer ComfyUI (the TRELLIS.2 and 3D nodes) — update ComfyUI.'
      );
    }
  }
  const loader = await resolveComfyNode(baseUrl, ['UNETLoader']);
  const models = listed(loader?.info.input?.required?.unet_name);
  if (models.length && !models.some(name => name.split(/[\\/]/).pop() === OUTFIT_3D_MODEL_FILE)) {
    throw new Error(
      '3D view needs the TRELLIS.2 models — download “TRELLIS.2 (outfit 3D view)” under Settings → ComfyUI → Models.'
    );
  }
  const ref = parseComfyViewRef(input.imageUrl);
  if (!ref) throw new Error('That picture is not in ComfyUI.');
  const image = await stageComfyImageAsInput(
    baseUrl,
    ref,
    `outfit-3d-${createHash('sha1').update(`${ref.subfolder}/${ref.filename}`).digest('hex').slice(0, 12)}`
  );
  const run = await runComfyUtilityGraph<{ filename: string; subfolder?: string; type?: string }>({
    baseUrl,
    label: 'outfit-3d',
    timeoutMs: 12 * 60_000,
    // A few minutes of GPU: behind what is already queued.
    priority: 'queue',
    prompt: buildOutfit3dGraph({
      image,
      prefix: 'castcut-outfit',
      seed: Math.floor(Math.random() * 1_000_000_000),
    }),
    read: (entry: ComfyHistoryEntry) => {
      const outputs = entry.outputs?.[OUTFIT_3D_SAVE_NODE] as
        { '3d'?: Array<{ filename: string; subfolder?: string; type?: string }> } | undefined;
      const file = outputs?.['3d']?.[0];
      return file?.filename ? file : undefined;
    },
  });
  const file = run.result;
  if (!file) throw new Error('The 3D model finished without a file — check the ComfyUI log.');
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? '',
    type: file.type || 'output',
  });
  return { url: `/api/comfyui/view?${params.toString()}` };
}
