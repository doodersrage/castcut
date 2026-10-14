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
import {
  buildOutfit3dGraph,
  OUTFIT_3D_FRONT_NODE,
  OUTFIT_3D_MASK_NODE,
  OUTFIT_3D_SAVE_NODE,
} from './outfit-3d-graph';
import { paintOutfitGlb, storeOutfitModel } from './outfit-3d-store-server';

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
  type OutFile = { filename: string; subfolder?: string; type?: string };
  const run = await runComfyUtilityGraph<{ glb: OutFile; front?: OutFile; mask?: OutFile }>({
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
      const pick = (node: string, kind: string) =>
        ((entry.outputs?.[node] as Record<string, OutFile[] | undefined> | undefined)?.[kind] ??
          [])[0];
      const glb = pick(OUTFIT_3D_SAVE_NODE, '3d');
      if (!glb?.filename) return undefined;
      return {
        glb,
        front: pick(OUTFIT_3D_FRONT_NODE, 'images'),
        mask: pick(OUTFIT_3D_MASK_NODE, 'images'),
      };
    },
  });
  const files = run.result;
  if (!files) throw new Error('The 3D model finished without a file — check the ComfyUI log.');
  const viewUrl = (file: OutFile) =>
    `/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type || 'output' }).toString()}`;
  const fetchBytes = async (file: OutFile) => {
    const response = await fetch(`${baseUrl}${viewUrl(file)}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} reading ${file.filename}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  // The picture painted on (outfit-3d-paint.ts); TRELLIS's own colours if that fails.
  if (files.front && files.mask) {
    try {
      const [glb, front, mask] = await Promise.all([
        fetchBytes(files.glb),
        fetchBytes(files.front),
        fetchBytes(files.mask),
      ]);
      const painted = await paintOutfitGlb({ glb, front, mask });
      return { url: await storeOutfitModel(painted) };
    } catch (error) {
      console.warn('Outfit 3D: painting the picture on failed; keeping TRELLIS colours:', error);
    }
  }
  return { url: `/api/comfyui${viewUrl(files.glb)}` };
}
