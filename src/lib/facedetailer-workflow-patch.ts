/**
 * Impact-Pack FaceDetailer auto-insert for gallery face-detail when no
 * library workflow is pinned.
 */

import {
  DEFAULT_FACE_DETAIL_DENOISE,
  FACE_DETAIL_DENOISE_TOKEN,
  FACE_DETAIL_IMAGE_TOKEN,
} from './gallery-output-face-detail';
import { getComfyModelDefinition } from './comfy-models/client';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { isQwenLightningModel } from './model-sampling-patch';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type FaceDetailerInsertOptions = {
  availableNodeTypes?: Iterable<string> | null;
  /** Queued/source model — drives CFG/steps (avoid SD1.5 CFG7 defaults on Flux/Qwen). */
  model?: string;
};

export type FaceDetailerInsertResult = {
  workflow: Record<string, unknown>;
  inserted: boolean;
  reason?: string;
};

const FACE_DETAILER = 'FaceDetailer';
const BBOX_DETECTOR = 'UltralyticsDetectorProvider';

export type FaceDetailerSamplerDefaults = {
  steps: number;
  cfg: number;
  sampler_name: string;
  scheduler: string;
  guide_size: number;
  max_size: number;
};

/**
 * Model-aware FaceDetailer sampler defaults — SD-ish CFG 7 warps Flux/Qwen faces.
 */
export function resolveFaceDetailerSamplerDefaults(model?: string): FaceDetailerSamplerDefaults {
  const id = String(model ?? '').trim();
  const category = id ? getComfyModelDefinition(id)?.category : undefined;

  if (isQwenLightningModel(id) || isQwenRapidAioModel(id) || /lightning-(4|8)\b/i.test(id)) {
    return {
      steps: 8,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'simple',
      guide_size: 512,
      max_size: 1024,
    };
  }

  if (category === 'qwen' || /qwen/i.test(id)) {
    return {
      steps: 16,
      cfg: 2.5,
      sampler_name: 'euler',
      scheduler: 'beta',
      guide_size: 768,
      max_size: 1280,
    };
  }

  if (category === 'flux' || /flux|klein/i.test(id)) {
    return {
      steps: 16,
      cfg: 3.5,
      sampler_name: 'euler',
      scheduler: 'simple',
      guide_size: 768,
      max_size: 1280,
    };
  }

  if (category === 'sdxl' || /sdxl/i.test(id)) {
    return {
      steps: 20,
      cfg: 5,
      sampler_name: 'dpmpp_2m',
      scheduler: 'karras',
      guide_size: 512,
      max_size: 1024,
    };
  }

  // Generic / SD1.5 fallback
  return {
    steps: 20,
    cfg: 7,
    sampler_name: 'euler',
    scheduler: 'normal',
    guide_size: 512,
    max_size: 1024,
  };
}

function toTypeSet(available?: Iterable<string> | null): Set<string> | undefined {
  if (!available) {
    return undefined;
  }
  return available instanceof Set ? available : new Set(available);
}

export function canAutoInsertFaceDetailer(availableNodeTypes?: Iterable<string> | null): boolean {
  const available = toTypeSet(availableNodeTypes);
  if (!available) {
    return false;
  }
  return available.has(FACE_DETAILER);
}

/**
 * Build a minimal FaceDetailer graph when Impact Pack FaceDetailer is installed.
 * Uses {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}} tokens.
 */
export function buildAutoFaceDetailerWorkflow(
  options?: FaceDetailerInsertOptions
): FaceDetailerInsertResult {
  const available = toTypeSet(options?.availableNodeTypes);
  if (!available || !available.has(FACE_DETAILER)) {
    return {
      workflow: {},
      inserted: false,
      reason: 'FaceDetailer node not installed in ComfyUI.',
    };
  }

  const sampler = resolveFaceDetailerSamplerDefaults(options?.model);
  const workflow: Record<string, WorkflowNode> = {};
  const loadId = '1';
  workflow[loadId] = {
    class_type: 'LoadImage',
    inputs: { image: FACE_DETAIL_IMAGE_TOKEN },
    _meta: { title: 'Castcut — face detail source' },
  };

  let imageLink: [string, number] = [loadId, 0];
  let nextId = 2;

  const detailInputs: Record<string, unknown> = {
    image: imageLink,
    denoise: FACE_DETAIL_DENOISE_TOKEN,
    guide_size: sampler.guide_size,
    guide_size_for: true,
    max_size: sampler.max_size,
    seed: 0,
    steps: sampler.steps,
    cfg: sampler.cfg,
    sampler_name: sampler.sampler_name,
    scheduler: sampler.scheduler,
    force_inpaint: true,
  };

  if (!available || available.has(BBOX_DETECTOR)) {
    const bboxId = String(nextId++);
    workflow[bboxId] = {
      class_type: BBOX_DETECTOR,
      inputs: { model_name: 'bbox/face_yolov8m.pt' },
      _meta: { title: 'Castcut — face bbox detector' },
    };
    const detailId = String(nextId++);
    workflow[detailId] = {
      class_type: FACE_DETAILER,
      inputs: {
        ...detailInputs,
        image: imageLink,
        bbox_detector: [bboxId, 0],
      },
      _meta: { title: 'Castcut — FaceDetailer' },
    };
    imageLink = [detailId, 0];
  } else {
    const detailId = String(nextId++);
    workflow[detailId] = {
      class_type: FACE_DETAILER,
      inputs: {
        ...detailInputs,
        image: imageLink,
      },
      _meta: { title: 'Castcut — FaceDetailer' },
    };
    imageLink = [detailId, 0];
  }

  const saveId = String(nextId);
  workflow[saveId] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'Castcut-face-detail',
      images: imageLink,
    },
    _meta: { title: 'Castcut — face detail save' },
  };

  return { workflow, inserted: true };
}

export { DEFAULT_FACE_DETAIL_DENOISE };
