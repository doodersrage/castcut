import type { WorkflowParamValues } from '../comfyui/config';
import type { ComfyImageModel } from '../comfy-models/client';
import type { DetailLevel } from './detail-level';
import type { GenerationDiagnostics } from '../queue/generation-diagnostics';
import { buildComfyViewPath, type ComfyOutputImage } from '../comfyui/outputs';
import { buildGalleryImageUrlsFromQueueParams } from '../queue/requeue-images';
import { normalizeQueueQualityProfile, type QueueQualityProfile } from '../queue/quality-profile';

export type PromptSidecar = {
  version: 1;
  exportedAt: string;
  positive: string;
  negative?: string;
  model: string;
  detail?: DetailLevel;
  comfyNode?: string;
  hints?: string;
  tool?: string;
  variationSeed?: string;
  diagnostics?: GenerationDiagnostics;
  metadata?: Record<string, unknown>;
};

export function buildPromptSidecar(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  detail?: DetailLevel;
  comfyNode?: string;
  hints?: string;
  tool?: string;
  variationSeed?: string;
  diagnostics?: GenerationDiagnostics | null;
  metadata?: Record<string, unknown>;
}): PromptSidecar {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    positive: input.positive.trim(),
    negative: input.negative?.trim() || undefined,
    model: input.model,
    detail: input.detail,
    comfyNode: input.comfyNode,
    hints: input.hints?.trim() || undefined,
    tool: input.tool,
    variationSeed: input.variationSeed?.trim() || undefined,
    diagnostics: input.diagnostics ?? undefined,
    metadata: input.metadata,
  };
}

export function downloadPromptSidecar(
  sidecar: PromptSidecar,
  filenamePrefix = 'prompt-sidecar'
): void {
  const payload = JSON.stringify(sidecar, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parsePromptSidecar(raw: string): PromptSidecar {
  const parsed = JSON.parse(raw) as Partial<PromptSidecar>;
  if (
    !parsed ||
    parsed.version !== 1 ||
    typeof parsed.positive !== 'string' ||
    !parsed.positive.trim() ||
    typeof parsed.model !== 'string'
  ) {
    throw new Error('Invalid sidecar file. Expected version 1 with positive prompt and model.');
  }

  return {
    version: 1,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    positive: parsed.positive.trim(),
    negative: parsed.negative?.trim() || undefined,
    model: parsed.model,
    detail: parsed.detail,
    comfyNode: parsed.comfyNode,
    hints: parsed.hints?.trim() || undefined,
    tool: parsed.tool,
    variationSeed: parsed.variationSeed?.trim() || undefined,
    diagnostics: parsed.diagnostics,
    metadata: parsed.metadata,
  };
}

export async function readPromptSidecarFile(file: File): Promise<PromptSidecar> {
  return parsePromptSidecar(await file.text());
}

export function sidecarNegativePrompt(sidecar: PromptSidecar): string | undefined {
  return sidecar.negative?.trim() || undefined;
}

export function sidecarQueueParams(sidecar: PromptSidecar): WorkflowParamValues | undefined {
  const raw = sidecar.metadata?.queueParams;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  return raw as WorkflowParamValues;
}

/** Read primary output image from sidecar metadata (export or legacy shapes). */
export function readSidecarOutputImage(sidecar: PromptSidecar): ComfyOutputImage | undefined {
  const rawOutput = sidecar.metadata?.outputImage;
  if (rawOutput && typeof rawOutput === 'object') {
    const candidate = rawOutput as Partial<ComfyOutputImage>;
    if (typeof candidate.filename === 'string' && candidate.filename.trim()) {
      return {
        filename: candidate.filename.trim(),
        subfolder: typeof candidate.subfolder === 'string' ? candidate.subfolder : '',
        type: candidate.type === 'input' || candidate.type === 'temp' ? candidate.type : 'output',
      };
    }
  }

  const rawImages = sidecar.metadata?.images;
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    const first = rawImages[0];
    if (first && typeof first === 'object') {
      const candidate = first as Partial<ComfyOutputImage>;
      if (typeof candidate.filename === 'string' && candidate.filename.trim()) {
        return {
          filename: candidate.filename.trim(),
          subfolder: typeof candidate.subfolder === 'string' ? candidate.subfolder : '',
          type: candidate.type === 'input' || candidate.type === 'temp' ? candidate.type : 'output',
        };
      }
    }
  }

  return undefined;
}

export function sidecarOutputViewUrl(sidecar: PromptSidecar): string | undefined {
  const image = readSidecarOutputImage(sidecar);
  if (!image) {
    return undefined;
  }
  const comfyUrl =
    typeof sidecar.metadata?.comfyUrl === 'string'
      ? sidecar.metadata.comfyUrl.trim().replace(/\/+$/, '')
      : 'http://127.0.0.1:8188';
  return buildComfyViewPath(comfyUrl, image);
}

export function sidecarWorkflowJson(sidecar: PromptSidecar): string | undefined {
  const raw = sidecar.metadata?.workflowJson;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function sidecarRequeueContext(sidecar: PromptSidecar): {
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  queueQualityProfile?: QueueQualityProfile;
  workflowJson?: string;
} {
  const queueParams = sidecarQueueParams(sidecar);
  const workflowJson = sidecarWorkflowJson(sidecar);
  const rawProfile = sidecar.metadata?.queueQualityProfile;
  const queueQualityProfile =
    rawProfile === 'followSettings' ||
    rawProfile === 'draft' ||
    rawProfile === 'final' ||
    rawProfile === 'max'
      ? normalizeQueueQualityProfile(rawProfile)
      : undefined;
  const storedSource =
    typeof sidecar.metadata?.sourceImageUrl === 'string'
      ? sidecar.metadata.sourceImageUrl.trim()
      : undefined;
  const storedMask =
    typeof sidecar.metadata?.maskImageUrl === 'string'
      ? sidecar.metadata.maskImageUrl.trim()
      : undefined;
  const outputViewUrl = sidecarOutputViewUrl(sidecar);
  if (storedSource || storedMask || outputViewUrl) {
    return {
      queueParams,
      sourceImageUrl: storedSource ?? outputViewUrl,
      maskImageUrl: storedMask,
      queueQualityProfile,
      workflowJson,
    };
  }

  const comfyUrl =
    typeof sidecar.metadata?.comfyUrl === 'string' ? sidecar.metadata.comfyUrl.trim() : undefined;
  const derived = buildGalleryImageUrlsFromQueueParams({
    comfyUrl: comfyUrl ?? 'http://127.0.0.1:8188',
    queueParams,
  });
  return {
    queueParams,
    sourceImageUrl: derived.sourceImageUrl,
    maskImageUrl: derived.maskImageUrl,
    queueQualityProfile,
    workflowJson,
  };
}
