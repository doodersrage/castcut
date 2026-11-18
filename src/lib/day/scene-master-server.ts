/** A shot cut from its scene's master and given its detail back (scene-master.ts), in ComfyUI. */

import 'server-only';

import { randomInt } from 'node:crypto';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  readComfyImageGraph,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';
import { locateFacesInComfy } from '../face/locate-server';
import {
  buildShotReframeGraph,
  reframeSourceOf,
  SHOT_REFRAME_SAVE_NODE,
  shotReframeRect,
  shotReframeRectForFaces,
} from '../pose/shot-reframe';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { buildMasterCutDetailGraph, type MasterCut } from './scene-master';

export type MasterCutResult =
  { available: true; image: ComfyImageRef; plain?: true } | { available: false; reason: string };

const firstImage = (entry: { outputs?: Record<string, unknown> }) => {
  for (const output of Object.values(entry.outputs ?? {})) {
    const image = (output as { images?: ComfyImageRef[] }).images?.[0];
    if (image?.filename) return image;
  }
  return undefined;
};

export async function cutShotFromMaster(input: {
  masterUrl: string;
  masterEntryId?: string;
  cut: MasterCut;
  comfyUrl?: string;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<MasterCutResult> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const fetched = await fetchFilmShotBytes({
    url: input.masterUrl,
    entryId: input.masterEntryId,
    userId: input.userId,
    requestOrigin: input.requestOrigin,
  }).catch(() => null);
  if (!fetched?.buffer.byteLength)
    return { available: false, reason: 'The master could not be read.' };
  const staged = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(fetched.buffer),
    filename: 'castcut-scene-master.png',
    mimeType: 'image/png',
  });
  const stagedName = staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;
  const ref: ComfyImageRef = { filename: staged.name, subfolder: staged.subfolder, type: 'input' };
  const graph = await readComfyImageGraph(baseUrl, ref);
  const source = reframeSourceOf(graph);
  if (!graph || !source?.size) {
    return { available: false, reason: 'The master is not a Qwen-Image 2.1 still.' };
  }
  // She is on the left, the other on the right (script-shots.ts poseLead).
  const faces = (await locateFacesInComfy({ imageName: stagedName, comfyUrl: input.comfyUrl }))
    .filter(face => face.width > 0 && face.height > 0)
    .sort((a, b) => a.x - b.x);
  if (!faces.length) return { available: false, reason: 'No face was found in the master.' };
  const face = input.cut.who === 'partner' ? faces[faces.length - 1]! : faces[0]!;
  const rect =
    input.cut.who === 'both'
      ? faces.length >= 2
        ? shotReframeRectForFaces(source.size, faces, input.cut.shot)
        : null
      : shotReframeRect(source.size, face, input.cut.shot);
  let cutName = stagedName;
  let plainCut: ComfyImageRef | undefined;
  if (rect) {
    const cropped = await runComfyUtilityGraph({
      baseUrl,
      label: 'scene-master-cut',
      timeoutMs: 120_000,
      prompt: buildShotReframeGraph({ stillName: stagedName, rect, size: source.size }),
      read: entry =>
        (entry.outputs?.[SHOT_REFRAME_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
          ?.images?.[0],
    });
    const image = cropped.result;
    if (!image?.filename) return { available: false, reason: 'The cut made no picture.' };
    plainCut = image;
    // The crop, as an input the detail pass loads.
    const view = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const bytes = await fetch(`${baseUrl}/view?${view.toString()}`)
      .then(async response => (response.ok ? new Uint8Array(await response.arrayBuffer()) : null))
      .catch(() => null);
    if (!bytes) return { available: false, reason: 'The cut could not be read back.' };
    const up = await uploadComfyInputContent({
      baseUrl,
      bytes,
      filename: 'castcut-scene-master-cut.png',
      mimeType: 'image/png',
    });
    cutName = up.subfolder ? `${up.subfolder}/${up.name}` : up.name;
  }
  const detail = buildMasterCutDetailGraph(graph, cutName, randomInt(1, 2 ** 31 - 1));
  if (!detail) {
    // A master last finished on another model (Edit 2511's face finish) has no Qwen-Image 2.1
    // graph to give the detail back with: the plain cut — softer, but the same room and people.
    return plainCut
      ? { available: true, image: plainCut, plain: true }
      : { available: false, reason: 'The master is not a Qwen-Image 2.1 still.' };
  }
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'scene-master-detail',
    timeoutMs: 10 * 60_000,
    priority: 'queue',
    prompt: detail,
    read: firstImage,
  });
  if (!run.result) return { available: false, reason: 'The detail pass made no picture.' };
  return { available: true, image: run.result };
}
