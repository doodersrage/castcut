/**
 * Day "Face finish": re-render only the face of a finished still, conditioned on the Cast face
 * crop so the detailer knows who she is.
 *
 * Live A/B on 8 real Rapid AIO Day stills (2026-09-28, face distance to the Cast plate, lower =
 * closer): this pass 0.659 → 0.581 mean, closer on 6/8, biggest on small full-body faces
 * (0.748 → 0.550). The same FaceDetailer with a generic text prompt drifted every face further
 * (0.768) and painted speckle freckles; an UltraSharp upscale inked small faces; a hires
 * re-render and a Klein skin pass drifted identity. Only the checkpoint setup it was tested on
 * (a Qwen / Rapid AIO CheckpointLoaderSimple) gets the pass.
 */

export const FACE_FINISH_DENOISE = 0.35;

export const FACE_FINISH_PROMPT =
  'Photorealistic close-up of the same woman as image 1: her exact face, eyes, nose, lips and hairline, natural skin texture, sharp natural detail.';

/** Output node id — the server reads the finished image from here. */
export const FACE_FINISH_SAVE_NODE = '99';

/** The still came from a checkpoint the pass was tested on (Qwen Rapid AIO). */
export function faceFinishSupportsCheckpoint(ckptName: string | null | undefined): boolean {
  return /rapid[-_ ]?aio|qwen/i.test(String(ckptName ?? ''));
}

/** The checkpoint a Castcut still was made with, from its embedded ComfyUI graph. */
export function readStillCheckpoint(graph: unknown): string | null {
  if (!graph || typeof graph !== 'object') return null;
  for (const node of Object.values(graph as Record<string, unknown>)) {
    const record = node as { class_type?: unknown; inputs?: Record<string, unknown> } | null;
    if (record?.class_type === 'CheckpointLoaderSimple') {
      const name = record.inputs?.ckpt_name;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    }
  }
  return null;
}

export function buildFaceFinishGraph(input: {
  /** ComfyUI input filename of the finished still. */
  stillName: string;
  /** ComfyUI input filename of the Cast face crop. */
  faceName: string;
  checkpoint: string;
  seed?: number;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.stillName } },
    '2': { class_type: 'LoadImage', inputs: { image: input.faceName } },
    '10': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: input.checkpoint } },
    '11': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['10', 0], shift: 3.1 } },
    '20': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['10', 1], prompt: FACE_FINISH_PROMPT, vae: ['10', 2], image1: ['2', 0] },
    },
    '21': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['20', 0] } },
    '22': {
      class_type: 'UltralyticsDetectorProvider',
      inputs: { model_name: 'bbox/face_yolov8m.pt' },
    },
    '23': {
      class_type: 'FaceDetailer',
      inputs: {
        image: ['1', 0],
        model: ['11', 0],
        clip: ['10', 1],
        vae: ['10', 2],
        guide_size: 512,
        guide_size_for: true,
        max_size: 1024,
        seed: input.seed ?? 777,
        steps: 6,
        cfg: 1,
        sampler_name: 'euler_ancestral',
        scheduler: 'simple',
        positive: ['20', 0],
        negative: ['21', 0],
        denoise: FACE_FINISH_DENOISE,
        feather: 5,
        noise_mask: true,
        force_inpaint: true,
        bbox_threshold: 0.5,
        bbox_dilation: 10,
        bbox_crop_factor: 3,
        sam_detection_hint: 'center-1',
        sam_dilation: 0,
        sam_threshold: 0.93,
        sam_bbox_expansion: 0,
        sam_mask_hint_threshold: 0.7,
        sam_mask_hint_use_negative: 'False',
        drop_size: 10,
        bbox_detector: ['22', 0],
        wildcard: '',
        cycle: 1,
      },
    },
    [FACE_FINISH_SAVE_NODE]: {
      class_type: 'SaveImage',
      inputs: { images: ['23', 0], filename_prefix: 'Castcut-face-finish' },
    },
  };
}
