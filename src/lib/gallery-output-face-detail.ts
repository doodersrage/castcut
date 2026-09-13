import type { CustomWorkflowToken, WorkflowParamValues } from './comfyui-config';
import { DEFAULT_INPUT_IMAGE_TOKEN } from './comfyui-config';

/**
 * Portable face-detailer tokens — mirrors {{INPUT_IMAGE}}/{{DENOISE}} but scoped
 * so a library workflow can tell a face-detail pass apart from a plain refine
 * pass when both tokens are present in the same graph (e.g. a combined
 * FaceDetailer + ReActor pipeline).
 */
export const FACE_DETAIL_IMAGE_TOKEN = '{{FACE_DETAIL_IMAGE}}';
export const FACE_DETAIL_DENOISE_TOKEN = '{{FACE_DETAIL_DENOISE}}';

/** Low-moderate denoise keeps identity/likeness while still fixing warped faces. */
export const DEFAULT_FACE_DETAIL_DENOISE = 0.35;

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

export function normalizeFaceDetailDenoise(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FACE_DETAIL_DENOISE;
  }
  return Math.min(1, Math.max(0.05, parsed));
}

/** Custom tokens forwarded alongside the standard inputImageFilename/denoise params. */
export function faceDetailCustomTokens(input: {
  inputImageFilename: string;
  denoise: number;
}): CustomWorkflowToken[] {
  const tokens: CustomWorkflowToken[] = [];
  if (input.inputImageFilename.trim()) {
    tokens.push({ token: FACE_DETAIL_IMAGE_TOKEN, value: input.inputImageFilename.trim() });
  }
  tokens.push({
    token: FACE_DETAIL_DENOISE_TOKEN,
    value: String(normalizeFaceDetailDenoise(input.denoise)),
  });
  return tokens;
}

/** Standard params so a library workflow using {{INPUT_IMAGE}}/{{DENOISE}} also works. */
export function faceDetailQueueParams(input: {
  inputImageFilename: string;
  denoise: number;
  queueParams?: Pick<WorkflowParamValues, 'seed' | 'width' | 'height'>;
}): Record<string, string> {
  const params: Record<string, string> = {
    inputImageFilename: input.inputImageFilename,
    denoise: String(normalizeFaceDetailDenoise(input.denoise)),
  };
  const source = input.queueParams;
  if (source?.seed != null && String(source.seed).trim()) {
    params.seed = String(source.seed).trim();
  }
  if (source?.width != null && String(source.width).trim()) {
    params.width = String(source.width).trim();
  }
  if (source?.height != null && String(source.height).trim()) {
    params.height = String(source.height).trim();
  }
  return params;
}

/**
 * Pass-through fallback used only when no dedicated FaceDetailer/ReActor
 * workflow exists in the library. It does not perform any face restoration —
 * FaceDetailer / ReActor / Impact-Pack nodes vary by ComfyUI install and can't
 * be synthesized generically. Add a workflow to the library containing
 * {{FACE_DETAIL_IMAGE}} (and optionally {{FACE_DETAIL_DENOISE}}) — or the
 * portable {{INPUT_IMAGE}}/{{DENOISE}} tokens — to get real face detailing.
 */
export function buildGalleryFaceDetailFallbackWorkflow(): Record<string, WorkflowNode> {
  return {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
    '2': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'Castcut-face-detail',
        images: ['1', 0],
      },
      _meta: { title: 'Castcut — save (pass-through, no library face-detailer found)' },
    },
  };
}
