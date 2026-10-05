/**
 * Server-only: "Fix an area" (fix-area.ts) in ComfyUI — prepare the masks and the grey-filled
 * still, queue one masked re-render per seed on the still's own graph, and read the results.
 */

import sharp from 'sharp';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import {
  comfyBaseUrl,
  comfyRunErrorMessage,
  parseComfyViewRef,
  readComfyImageGraph,
  stageComfyImageAsInput,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import { deleteComfyUiHistoryItems } from '@/lib/comfyui-status';
import {
  buildFixAreaGraph,
  FIX_AREA_CANDIDATES,
  fixAreaSeeds,
  normalizeFixAreaDenoise,
  normalizeFixAreaReference,
  type FixAreaReference,
} from '@/lib/fix-area';
import { buildFixAreaMasks, fillMaskedGrey } from '@/lib/fix-area-mask';

/** ComfyUI client id of fix jobs (the queue shows them as the app's). */
export const FIX_AREA_CLIENT_ID = 'castcut-fix-area';

/** A painted area smaller than this (pixels at the still's size) is treated as no paint. */
const MIN_PAINTED_PIXELS = 16;

export type FixAreaQueueResult =
  | {
      available: true;
      jobs: Array<{ promptId: string; seed: number }>;
      reference: FixAreaReference;
      denoise: number;
      /** Painted share of the picture (0–1). */
      coverage: number;
    }
  | { available: false; reason: string };

async function fetchComfyBytes(baseUrl: string, ref: ComfyImageRef): Promise<Uint8Array> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const response = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`Could not read the still from ComfyUI (HTTP ${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** A `data:image/…;base64,` URL's bytes, or null. */
export function decodeImageDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[1]!.replace(/\s+/g, ''), 'base64');
  return bytes.length > 0 ? bytes : null;
}

async function pngFromRaw(pixels: Uint8Array, width: number, height: number, channels: 1 | 3) {
  return new Uint8Array(
    await sharp(Buffer.from(pixels), { raw: { width, height, channels } })
      .png({ compressionLevel: 6 })
      .toBuffer()
  );
}

/**
 * Prepare and queue the candidates. The still (`imageUrl`, a ComfyUI view URL) is the picture
 * as shown — the composite's base; its graph comes from `graphUrl` (the render the shown picture
 * came from, when that differs — a face-finished Day still) or the still itself, or `workflow`.
 */
export async function queueFixAreaInComfy(input: {
  imageUrl: string;
  graphUrl?: string;
  workflow?: unknown;
  /** The painted mask (white = fix) as a PNG data URL, any size — scaled to the still. */
  mask: string;
  text?: string;
  reference?: unknown;
  denoise?: unknown;
  seeds?: number[];
  candidates?: number;
  comfyUrl?: string;
  /** ComfyUI client id (harnesses tag their jobs). */
  clientId?: string;
}): Promise<FixAreaQueueResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  if (!stillRef) return { available: false, reason: 'This picture is not a ComfyUI image.' };
  const maskBytes = decodeImageDataUrl(input.mask);
  if (!maskBytes) return { available: false, reason: 'Paint the area to fix first.' };
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const graphRef = input.graphUrl ? parseComfyViewRef(input.graphUrl) : null;
  // The graph ComfyUI embedded in the render first (exactly what ran), then the stored workflow.
  let graph: unknown = graphRef ? await readComfyImageGraph(baseUrl, graphRef) : null;
  if (!graph) graph = await readComfyImageGraph(baseUrl, stillRef);
  if (!graph && input.workflow && typeof input.workflow === 'object') {
    // The API graph itself, or wrapped as { prompt } (an object or ComfyUI's PNG text).
    let wrapped = (input.workflow as { prompt?: unknown }).prompt;
    if (typeof wrapped === 'string') {
      try {
        wrapped = JSON.parse(wrapped) as unknown;
      } catch {
        wrapped = undefined;
      }
    }
    graph = wrapped && typeof wrapped === 'object' ? wrapped : input.workflow;
  }
  if (!graph) {
    return {
      available: false,
      reason: 'ComfyUI kept no graph for this picture, so it cannot be re-rendered.',
    };
  }

  const stillBytes = await fetchComfyBytes(baseUrl, stillRef);
  const still = await sharp(Buffer.from(stillBytes))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = still.info;
  const painted = await sharp(maskBytes)
    .flatten({ background: '#000000' })
    .resize(width, height, { fit: 'fill', kernel: 'nearest' })
    .greyscale()
    .raw()
    .toBuffer();
  const masks = buildFixAreaMasks(new Uint8Array(painted), { width, height });
  if (masks.area < MIN_PAINTED_PIXELS) {
    return { available: false, reason: 'Paint the area to fix first.' };
  }
  const reference = normalizeFixAreaReference(input.reference);
  // A grey patch is only repainted at full denoise: at 0.75 the distilled engines left it grey
  // (4 of 4 in the live A/B).
  const denoise = reference === 'grey' ? 1 : normalizeFixAreaDenoise(input.denoise);
  const fill = fillMaskedGrey(new Uint8Array(still.data), masks.hard, 3);

  const upload = async (bytes: Uint8Array, filename: string) => {
    const staged = await uploadComfyInputContent({
      baseUrl,
      bytes,
      filename,
      mimeType: 'image/png',
      timeoutMs: 30000,
    });
    return staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;
  };
  const [stillName, fillName, hardMaskName, softMaskName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'fix-area-still'),
    upload(await pngFromRaw(fill, width, height, 3), 'fix-area-fill.png'),
    upload(await pngFromRaw(masks.hard, width, height, 1), 'fix-area-mask-hard.png'),
    upload(await pngFromRaw(masks.soft, width, height, 1), 'fix-area-mask-soft.png'),
  ]);

  const count = Math.min(4, Math.max(1, Math.round(input.candidates ?? FIX_AREA_CANDIDATES)));
  const seeds =
    Array.isArray(input.seeds) && input.seeds.length > 0
      ? input.seeds.filter(seed => Number.isFinite(seed)).map(seed => Math.floor(seed) >>> 0)
      : fixAreaSeeds(count);
  const jobs: Array<{ promptId: string; seed: number }> = [];
  for (const seed of seeds) {
    const built = buildFixAreaGraph(graph, {
      stillName,
      fillName,
      hardMaskName,
      softMaskName,
      seed,
      denoise,
      reference,
      text: input.text,
    });
    if (!built) {
      return {
        available: false,
        reason:
          "This picture's graph has no sampler to re-render (a clip, an upload or a finishing pass).",
      };
    }
    // Back to back at the front: the player is waiting on these.
    const queued = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: built.graph,
        client_id: input.clientId?.trim() || FIX_AREA_CLIENT_ID,
        front: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!queued.ok) {
      const text = await queued.text().catch(() => '');
      throw new Error(`Fix queue failed (HTTP ${queued.status}) ${text.slice(0, 200)}`);
    }
    const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
    if (!promptId) throw new Error('Fix queue returned no prompt id.');
    jobs.push({ promptId, seed });
  }
  return {
    available: true,
    jobs,
    reference,
    denoise,
    coverage: masks.area / (width * height),
  };
}

export type FixAreaJobStatus =
  | { status: 'pending' | 'running' }
  | { status: 'done'; image: ComfyImageRef }
  | { status: 'error'; message: string }
  /** Not in history nor the queue (cancelled, or ComfyUI restarted). */
  | { status: 'missing' };

/** Where one fix job is. A finished job's history entry is removed once read. */
export async function readFixAreaJob(input: {
  promptId: string;
  comfyUrl?: string;
}): Promise<FixAreaJobStatus> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const promptId = input.promptId.trim();
  const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (response.ok) {
    const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const entry = payload[promptId];
    if (entry) {
      if (entry.status?.status_str === 'error') {
        const detail = comfyRunErrorMessage(entry);
        return {
          status: 'error',
          message: `The fix failed in ComfyUI${detail ? ` — ${detail}` : ''}.`,
        };
      }
      for (const output of Object.values(entry.outputs ?? {})) {
        const image = (output as { images?: ComfyImageRef[] }).images?.[0];
        if (image?.filename) {
          void deleteComfyUiHistoryItems(baseUrl, [promptId]);
          return {
            status: 'done',
            image: {
              filename: image.filename,
              subfolder: image.subfolder ?? '',
              type: image.type ?? 'output',
            },
          };
        }
      }
      if (entry.status?.completed) {
        return { status: 'error', message: 'The fix produced no image.' };
      }
    }
  }
  const queue = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(8000) });
  if (queue.ok) {
    const data = (await queue.json()) as {
      queue_running?: unknown[][];
      queue_pending?: unknown[][];
    };
    if ((data.queue_running ?? []).some(item => item?.[1] === promptId)) {
      return { status: 'running' };
    }
    if ((data.queue_pending ?? []).some(item => item?.[1] === promptId)) {
      return { status: 'pending' };
    }
  }
  return { status: 'missing' };
}

/** Drop fix jobs that have not started (Keep original before they ran). Never interrupts. */
export async function cancelFixAreaJobs(input: {
  promptIds: string[];
  comfyUrl?: string;
}): Promise<void> {
  const ids = input.promptIds.map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return;
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  await fetch(`${baseUrl}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: ids }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
}
