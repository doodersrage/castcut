import 'server-only';

/**
 * Server-only: a subject mask from ComfyUI's built-in background removal (BiRefNet via
 * LoadBackgroundRemovalModel → RemoveBackground). It is a matte, not an edit — nothing is
 * redrawn; the mask is read back and the original pixels are composited through it.
 *
 * Returns null when ComfyUI is unreachable or has no background-removal model, so the caller
 * can fall back to the local MODNet matte.
 */

import sharp from 'sharp';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import { readComboOptionList } from '@/lib/comfyui-combo';
import { uploadComfyInputContent } from '@/lib/comfy-input-upload-server';
import {
  buildCastcutCutoutGraph,
  parseCastcutMaskRepairReport,
  type CastcutMaskRepairReport,
} from '@/lib/castcut-nodes';

const LOADER_NODE = 'LoadBackgroundRemovalModel';
const REMOVE_NODE = 'RemoveBackground';

/** Prefer a BiRefNet model (best on clothing and people); otherwise the first one offered. */
export function pickBackgroundRemovalModel(options: readonly string[]): string | null {
  const usable = options.filter(option => option.trim());
  return usable.find(option => /birefnet/i.test(option)) ?? usable[0] ?? null;
}

/** LoadImage → background-removal mask → MaskToImage → PreviewImage (temp, never the gallery). */
export function buildComfyMatteGraph(input: {
  imageName: string;
  modelInput: string;
  modelName: string;
}): Record<string, unknown> {
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.imageName } },
    '2': { class_type: LOADER_NODE, inputs: { [input.modelInput]: input.modelName } },
    '3': {
      class_type: REMOVE_NODE,
      inputs: { bg_removal_model: ['2', 0], image: ['1', 0] },
    },
    '4': { class_type: 'MaskToImage', inputs: { mask: ['3', 0] } },
    '5': { class_type: 'PreviewImage', inputs: { images: ['4', 0] } },
  };
}

async function uploadMatteSource(baseUrl: string, png: Buffer): Promise<string> {
  try {
    // Named by content: one name per source picture, and a re-cut reuses the staged copy.
    const staged = await uploadComfyInputContent({
      baseUrl,
      bytes: png,
      filename: 'castcut-isolate.png',
      mimeType: 'image/png',
      timeoutMs: 30000,
    });
    return staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name;
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      throw new Error(`ComfyUI upload for isolate failed (HTTP ${status}).`);
    }
    throw error;
  }
}

/**
 * The whole cut-out in ComfyUI when the Castcut node pack is installed: BiRefNet matte, the
 * isolate-mask.ts repair (CastcutMaskRepair, a port kept in step by shared test vectors) and the
 * original pixels composited onto `fill` — one job, no mask round trip. Null when the pack (or
 * the matte nodes / a model) is missing, so the caller takes the mask path below. Throws only on
 * a run that started and then failed.
 */
export async function comfyCastcutCutout(input: {
  png: Buffer;
  fill: { r: number; g: number; b: number };
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<{ png: Buffer; model: string; report: CastcutMaskRepairReport } | null> {
  let baseUrl: string;
  try {
    baseUrl = comfyBaseUrl(input.comfyUrl);
  } catch {
    return null;
  }
  const [loader, remove, repair, report] = await Promise.all([
    resolveComfyNode(baseUrl, [LOADER_NODE]),
    resolveComfyNode(baseUrl, [REMOVE_NODE]),
    resolveComfyNode(baseUrl, ['CastcutMaskRepair']),
    resolveComfyNode(baseUrl, ['CastcutReport']),
  ]);
  if (!loader || !remove || !repair || !report) {
    return null;
  }
  const [modelInput, modelSpec] = Object.entries(loader.info.input?.required ?? {})[0] ?? [];
  const modelName = modelInput ? pickBackgroundRemovalModel(readComboOptionList(modelSpec)) : null;
  if (!modelInput || !modelName) {
    return null;
  }
  const imageName = await uploadMatteSource(baseUrl, input.png);
  const run = await runComfyUtilityGraph<{ image: ComfyImageRef; report: CastcutMaskRepairReport }>(
    {
      baseUrl,
      label: 'isolate-cutout',
      priority: 'check',
      timeoutMs: input.timeoutMs ?? 60_000,
      prompt: buildCastcutCutoutGraph({ imageName, modelInput, modelName, fill: input.fill }),
      read: entry => {
        const image = entry.outputs?.['5']?.images?.[0] as Partial<ComfyImageRef> | undefined;
        const repaired = parseCastcutMaskRepairReport(entry.outputs);
        return image?.filename && repaired
          ? {
              image: {
                filename: image.filename,
                subfolder: image.subfolder ?? '',
                type: image.type ?? 'temp',
              },
              report: repaired,
            }
          : undefined;
      },
    }
  );
  if (run.result === undefined) {
    return null;
  }
  const params = new URLSearchParams({ ...run.result.image });
  const view = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!view.ok) {
    throw new Error(`Could not read the cut-out from ComfyUI (HTTP ${view.status}).`);
  }
  // Same PNG shape as the local composite (RGBA, opaque).
  const png = await sharp(Buffer.from(await view.arrayBuffer()))
    .ensureAlpha()
    .png()
    .toBuffer();
  return { png, model: modelName, report: run.result.report };
}

/**
 * One-channel subject mask (0–255) at `width`×`height` for `png`, or null when ComfyUI cannot
 * make one. Throws only on a run that started and then failed.
 */
export async function comfySubjectMask(input: {
  png: Buffer;
  width: number;
  height: number;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<{ mask: Uint8Array; model: string } | null> {
  let baseUrl: string;
  try {
    baseUrl = comfyBaseUrl(input.comfyUrl);
  } catch {
    return null;
  }
  const [loader, remove] = await Promise.all([
    resolveComfyNode(baseUrl, [LOADER_NODE]),
    resolveComfyNode(baseUrl, [REMOVE_NODE]),
  ]);
  if (!loader || !remove) {
    return null;
  }
  const [modelInput, modelSpec] = Object.entries(loader.info.input?.required ?? {})[0] ?? [];
  const modelName = modelInput ? pickBackgroundRemovalModel(readComboOptionList(modelSpec)) : null;
  if (!modelInput || !modelName) {
    return null;
  }
  const imageName = await uploadMatteSource(baseUrl, input.png);
  const run = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'isolate-matte',
    priority: 'check',
    // Runs right after the job in progress (ahead of queued renders); past this, MODNet takes over.
    timeoutMs: input.timeoutMs ?? 60_000,
    prompt: buildComfyMatteGraph({ imageName, modelInput, modelName }),
    read: entry => {
      const image = entry.outputs?.['5']?.images?.[0] as Partial<ComfyImageRef> | undefined;
      return image?.filename
        ? {
            filename: image.filename,
            subfolder: image.subfolder ?? '',
            type: image.type ?? 'temp',
          }
        : undefined;
    },
  });
  if (run.result === undefined) {
    return null;
  }
  const params = new URLSearchParams({ ...run.result });
  const view = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!view.ok) {
    throw new Error(`Could not read the isolate mask from ComfyUI (HTTP ${view.status}).`);
  }
  const maskBytes = Buffer.from(await view.arrayBuffer());
  const mask = await sharp(maskBytes)
    .removeAlpha()
    .greyscale()
    .resize(input.width, input.height, { fit: 'fill' })
    .raw()
    .toBuffer();
  if (mask.length !== input.width * input.height) {
    throw new Error('ComfyUI isolate mask has the wrong size.');
  }
  return { mask: new Uint8Array(mask), model: modelName };
}
