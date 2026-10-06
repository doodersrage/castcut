/**
 * Server-only: where is the face on a Cast plate? InsightFace (cubiq's ComfyUI_FaceAnalysis
 * `FaceBoundingBox`) in a small check-priority ComfyUI graph. The Cast face crop (Day / Story
 * Image 1, Face finish conditioning) is cut around this box instead of the top of the plate,
 * which on a plate where she lies down held only hair.
 *
 * A face turned on its side (lying with the head sideways) is looked for again in the plate
 * turned a quarter each way, and the box is mapped back.
 */

import {
  castcutFaceBoxes,
  castcutRoutes,
  type CastcutFaceBoxTurn,
} from '@/lib/castcut-routes-server';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import {
  comfyBaseUrl,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyHistoryEntry,
} from '@/lib/comfy-utility-graph-server';
import {
  FACE_LOCATE_ROTATIONS,
  largestFaceBox,
  mapRotatedFaceBox,
  parseFaceBoxLists,
  type FaceLocateResult,
  type FaceLocateRotation,
} from '@/lib/face-locate';

const BOX_NODES = ['fx', 'fy', 'fw', 'fh'] as const;

export function buildFaceLocateGraph(input: {
  imageName: string;
  rotation: FaceLocateRotation;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const source: [string, number] = input.rotation === 'none' ? ['1', 0] : ['r', 0];
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.imageName } },
    ...(input.rotation === 'none'
      ? {}
      : {
          r: { class_type: 'ImageRotate', inputs: { image: ['1', 0], rotation: input.rotation } },
        }),
    '4': { class_type: 'FaceAnalysisModels', inputs: { library: 'insightface', provider: 'CUDA' } },
    b: {
      class_type: 'FaceBoundingBox',
      inputs: {
        analysis_models: ['4', 0],
        image: source,
        padding: 0,
        padding_percent: 0,
        index: -1,
      },
    },
    ...Object.fromEntries(
      BOX_NODES.map((id, index) => [
        id,
        { class_type: 'PreviewAny', inputs: { source: ['b', index + 1] } },
      ])
    ),
  };
}

function readBoxTexts(entry: ComfyHistoryEntry): unknown[][] | undefined {
  const lists = BOX_NODES.map(
    id => (entry.outputs?.[id] as { text?: unknown[] } | undefined)?.text
  );
  return lists.every(Array.isArray) ? (lists as unknown[][]) : undefined;
}

/**
 * The Castcut pack's /castcut/analyze route: the same boxes and turns as the graphs below, read
 * from the plate where it is and without waiting for the render in progress. Null when the route
 * is missing or fails (the graphs run).
 */
async function locateFaceDirect(
  baseUrl: string,
  input: { bytes?: Uint8Array; imageUrl?: string; width: number; height: number }
): Promise<FaceLocateResult | null> {
  const routes = await castcutRoutes(baseUrl);
  if (!routes?.routes.includes('analyze') || !routes.faceAnalysis) return null;
  const ref = !input.bytes && input.imageUrl ? parseComfyViewRef(input.imageUrl) : null;
  if (!input.bytes && !ref) return null;
  let turns: CastcutFaceBoxTurn[];
  try {
    turns = await castcutFaceBoxes(baseUrl, {
      image: input.bytes ? { data: Buffer.from(input.bytes).toString('base64') } : ref!,
      rotations: FACE_LOCATE_ROTATIONS,
    });
  } catch (error) {
    console.warn('Castcut face locate failed; queueing the face graphs instead:', error);
    return null;
  }
  for (const turn of turns) {
    const rotation = FACE_LOCATE_ROTATIONS.find(name => name === turn.rotation);
    if (!rotation) continue;
    const boxes = (turn.boxes ?? []).filter(box => box.width > 0 && box.height > 0);
    const found = largestFaceBox(boxes);
    if (!found) continue;
    return {
      available: true,
      face: mapRotatedFaceBox(found, rotation, input.width, input.height),
      rotation,
      faces: boxes.length,
    };
  }
  return { available: true, face: null, faces: 0 };
}

/**
 * Stage the plate bytes (named by content, so the same plate is staged once) and find its face.
 * `available: false` when ComfyUI or the FaceAnalysis pack is missing — the caller keeps its old
 * crop without flagging the plate.
 */
export async function locateFaceInComfy(input: {
  bytes?: Uint8Array;
  imageUrl?: string;
  mimeType?: string;
  width: number;
  height: number;
  comfyUrl?: string;
}): Promise<FaceLocateResult> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const direct = await locateFaceDirect(baseUrl, input);
  if (direct) return direct;
  const [models, box, preview, rotate] = await Promise.all([
    resolveComfyNode(baseUrl, ['FaceAnalysisModels']),
    resolveComfyNode(baseUrl, ['FaceBoundingBox']),
    resolveComfyNode(baseUrl, ['PreviewAny']),
    resolveComfyNode(baseUrl, ['ImageRotate']),
  ]);
  if (!models || !box || !preview) {
    return {
      available: false,
      reason: 'Finding the face needs ComfyUI_FaceAnalysis (cubiq) with insightface in ComfyUI.',
    };
  }
  let imageName: string;
  if (input.bytes) {
    const staged = await uploadComfyInputContent({
      baseUrl,
      bytes: input.bytes,
      filename: 'face-locate.png',
      mimeType: input.mimeType,
      timeoutMs: 30000,
    });
    imageName = staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;
  } else {
    const ref = input.imageUrl ? parseComfyViewRef(input.imageUrl) : null;
    if (!ref) return { available: false, reason: 'The plate is not a ComfyUI image.' };
    imageName = await stageComfyImageAsInput(baseUrl, ref, 'face-locate');
  }
  const rotations = rotate ? FACE_LOCATE_ROTATIONS : (['none'] as const);
  for (const rotation of rotations) {
    let texts: unknown[][] | undefined;
    try {
      const run = await runComfyUtilityGraph({
        baseUrl,
        label: 'face-locate',
        priority: 'check',
        timeoutMs: 60_000,
        prompt: buildFaceLocateGraph({ imageName, rotation }),
        read: readBoxTexts,
      });
      texts = run.result;
    } catch (error) {
      // FaceBoundingBox raises when it finds no face: try the next turn.
      if (error instanceof Error && /no face|failed in ComfyUI/i.test(error.message)) continue;
      throw error;
    }
    const boxes = parseFaceBoxLists(texts);
    const found = largestFaceBox(boxes);
    if (!found) continue;
    return {
      available: true,
      face: mapRotatedFaceBox(found, rotation, input.width, input.height),
      rotation,
      faces: boxes.length,
    };
  }
  return { available: true, face: null, faces: 0 };
}
