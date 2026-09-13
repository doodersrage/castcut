import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import {
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from './comfy-models';
import {
  isBooguEditModel,
  isBooguEditTurboModel,
  isBooguImageModel,
  isBooguImageTurboModel,
  isEditCapableModel,
  isFluxKleinModel,
  isQwenEditModel,
  isZImageImg2imgQueueTool,
  isZImageModel,
} from './model-denoise-defaults';
import { isQwenLightningModel, isWanLightningModel } from './model-sampling-patch';
import { DEFAULT_UNET_TOKEN } from './model-checkpoint-map';
import { defaultLoaderPrecisionTier, qwenDualClipFilename } from './model-loader-precision';
import { applyWorkflowNodeBindings } from './workflow-apply-bindings';
import { prepareWorkflowJsonImport } from './workflow-import';
import { suggestWorkflowNodeMappings } from './workflow-node-mapper';
import {
  qwenScaffold,
  qwenCheckpointScaffold,
  qwenLightningScaffold,
  usesQwenCheckpointLoader,
  qwenEditComposeScaffold,
  qwenEditImg2imgScaffold,
} from './workflow-scaffold-qwen';
import {
  fluxScaffold,
  fluxInpaintScaffold,
  fluxImg2imgScaffold,
  fluxKleinEditScaffold,
} from './workflow-scaffold-flux';
import {
  zImageScaffold,
  zImageImg2imgScaffold,
  booguImageScaffold,
  booguImageTurboScaffold,
  booguEditScaffold,
} from './workflow-scaffold-zimage-boogu';
import {
  isAuraFlowModel,
  isHiDreamModel,
  isOmniGen2Model,
  isPixartModel,
  isInstructPix2pixModel,
  sd3Scaffold,
  instructPix2pixScaffold,
  omnigen2Scaffold,
  pixartScaffold,
  lumina2Scaffold,
  sdxlScaffold,
  hunyuanImageScaffold,
  genericScaffold,
  hidreamScaffold,
  resolveVideoLatentClass,
  videoScaffold,
  audioScaffold,
  meshScaffold,
} from './workflow-scaffold-dit';

// FLUX model-family scaffolds live in workflow-scaffold-flux.ts; re-exported
// here so existing importers of fluxKleinDualClipFilename are unaffected.
export { fluxKleinDualClipFilename } from './workflow-scaffold-flux';

export type WorkflowScaffoldSource = 'template' | 'clone';

export type WorkflowScaffoldResult = {
  json: string;
  source: WorkflowScaffoldSource;
  model: ComfyImageModel | string;
  category: ComfyModelCategory | 'generic';
  bindingChanges: number;
  notes: string[];
};

export type WorkflowScaffoldOptions = {
  /** Active queue tool — Compose + Klein uses img2img scaffold. */
  tool?: string;
};

/** Klein text encoder — official Comfy uses Qwen3 CLIPLoader type flux2 (not DualCLIP type flux). */

function resolveBindingTokens(
  tokens?: Partial<WorkflowPlaceholderTokens>
): WorkflowPlaceholderTokens {
  return {
    positive: tokens?.positive?.trim() || DEFAULT_POSITIVE_TOKEN,
    negative: tokens?.negative?.trim() || DEFAULT_NEGATIVE_TOKEN,
    seed: tokens?.seed?.trim() || DEFAULT_SEED_TOKEN,
    width: tokens?.width?.trim() || DEFAULT_WIDTH_TOKEN,
    height: tokens?.height?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: tokens?.cfg?.trim() || DEFAULT_CFG_TOKEN,
    steps: tokens?.steps?.trim() || DEFAULT_STEPS_TOKEN,
    sampler: tokens?.sampler?.trim() || DEFAULT_SAMPLER_TOKEN,
    scheduler: tokens?.scheduler?.trim() || DEFAULT_SCHEDULER_TOKEN,
    shift: tokens?.shift?.trim() || DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: tokens?.fluxMaxShift?.trim() || DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: tokens?.fluxBaseShift?.trim() || DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: tokens?.denoise?.trim() || DEFAULT_DENOISE_TOKEN,
    inputImage: tokens?.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: tokens?.maskImage?.trim() || DEFAULT_MASK_IMAGE_TOKEN,
    initImage: tokens?.initImage?.trim() || DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: tokens?.videoFrames?.trim() || DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: tokens?.videoFps?.trim() || DEFAULT_VIDEO_FPS_TOKEN,
  };
}

function bindScaffoldJson(
  workflowJson: string,
  tokens: WorkflowPlaceholderTokens
): { json: string; bindingChanges: number } {
  const mappings = suggestWorkflowNodeMappings(workflowJson);
  const bound = applyWorkflowNodeBindings(workflowJson, mappings, tokens);
  return { json: bound.json, bindingChanges: bound.changes.length };
}

export function qwenLoaderFilenames(): {
  unetToken: string;
  clipName: string;
  vaeName: string;
} {
  const tier = defaultLoaderPrecisionTier();
  return {
    unetToken: DEFAULT_UNET_TOKEN,
    clipName: qwenDualClipFilename(tier),
    vaeName: 'qwen_image_vae.safetensors',
  };
}

// Qwen Image model-family scaffolds live in workflow-scaffold-qwen.ts;
// re-exported here unchanged (no external importers today, kept for
// symmetry with the other extracted scaffold modules).
export {
  qwenScaffold,
  qwenCheckpointScaffold,
  qwenLightningScaffold,
  resolveQwenEditEncoderClass,
  usesQwenCheckpointLoader,
  buildQwenEditEncoderInputs,
  qwenEditLightningScaffold,
  qwenEditComposeScaffold,
  qwenEditImg2imgScaffold,
  LIGHTNING_LORA_TOKEN,
} from './workflow-scaffold-qwen';

function editScaffold(
  tokens: WorkflowPlaceholderTokens,
  category: ComfyModelCategory | 'generic',
  model: ComfyImageModel | string
): Record<string, unknown> {
  if (isBooguEditModel(model)) {
    return booguEditScaffold(tokens, { turbo: isBooguEditTurboModel(model) });
  }
  if (isQwenEditModel(model)) {
    return qwenEditImg2imgScaffold(tokens, model);
  }
  if (model === 'flux-inpaint') {
    return fluxInpaintScaffold(tokens, model);
  }
  if (category === 'flux') {
    return fluxImg2imgScaffold(tokens, model);
  }

  const base = category === 'qwen' ? qwenScaffold(tokens) : genericScaffold(tokens);

  return {
    ...base,
    '900': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Input Image' },
    },
  };
}

function controlNetScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'ControlNetLoader',
      inputs: { control_net_name: '{{CONTROLNET_MODEL}}' },
      _meta: { title: 'ControlNet Loader' },
    },
    '5': {
      class_type: 'LoadImage',
      inputs: { image: '{{CONTROL_IMAGE}}' },
      _meta: { title: 'Control Image' },
    },
    '6': {
      class_type: 'ControlNetApply',
      inputs: {
        strength: 1,
        start_percent: 0,
        end_percent: 1,
        positive: ['2', 0],
        negative: ['3', 0],
        control_net: ['4', 0],
        image: ['5', 0],
      },
      _meta: { title: 'Apply ControlNet' },
    },
    '7': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['6', 1],
        latent_image: ['7', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function buildControlNetWorkflowScaffold(
  tokens?: Partial<WorkflowPlaceholderTokens>
): WorkflowScaffoldResult {
  const resolvedTokens = resolveBindingTokens(tokens);
  const bound = bindScaffoldJson(
    JSON.stringify(controlNetScaffold(resolvedTokens), null, 2),
    resolvedTokens
  );
  return {
    json: bound.json,
    source: 'template',
    model: 'sdxl-base',
    category: 'sdxl',
    bindingChanges: bound.bindingChanges,
    notes: [
      'ControlNet scaffold with {{CONTROLNET_MODEL}} and {{CONTROL_IMAGE}} placeholders.',
      'Map ControlNet filenames in Settings → ControlNet model map, upload a control image from the ControlNet tool before queueing.',
    ],
  };
}

/**
 * FaceDetailer-ready scaffold: checkpoint + encode + LoadImage + SaveImage with
 * portable tokens. Insert Impact FaceDetailer / ReActor between image load and
 * save (bbox detector + FaceDetailer node), then pin `faceDetailer=<workflowId>`.
 */
export function buildFaceDetailerWorkflowScaffold(): WorkflowScaffoldResult {
  const workflow = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint (face detail)' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{POSITIVE}}', clip: ['1', 1] },
      _meta: { title: 'Positive (optional FaceDetailer guide)' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{NEGATIVE}}', clip: ['1', 1] },
      _meta: { title: 'Negative (optional FaceDetailer guide)' },
    },
    '4': {
      class_type: 'LoadImage',
      inputs: { image: '{{FACE_DETAIL_IMAGE}}' },
      _meta: { title: 'Face detail input' },
    },
    '5': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'Castcut-face-detail',
        images: ['4', 0],
      },
      _meta: {
        title:
          'Save — insert Impact FaceDetailer/ReActor before this; keep {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}}',
      },
    },
  };
  return {
    json: JSON.stringify(workflow, null, 2),
    source: 'template',
    model: 'sdxl-base',
    category: 'sdxl',
    bindingChanges: 0,
    notes: [
      'FaceDetailer scaffold: Checkpoint + CLIP encodes + {{FACE_DETAIL_IMAGE}} + SaveImage.',
      'In ComfyUI, insert UltralyticsDetectorProvider (or bbox) + FaceDetailer between LoadImage and SaveImage; wire model/clip/vae from node 1 and denoise from {{FACE_DETAIL_DENOISE}}.',
      'Pin faceDetailer=<workflowId> in Settings → model workflow map after saving.',
    ],
  };
}

/**
 * InstantID / PuLID first-class scaffold — identity ref, apply chain, KSampler, save.
 * Queue-time auto-insert still runs when nodes are installed; this graph is import-ready.
 */
export function buildIdentityWorkflowScaffold(
  kind: 'instantid' | 'pulid' = 'instantid'
): WorkflowScaffoldResult {
  const label = kind === 'pulid' ? 'PuLID' : 'InstantID';
  const workflow =
    kind === 'pulid'
      ? {
          '1': {
            class_type: 'CheckpointLoaderSimple',
            inputs: { ckpt_name: '{{CHECKPOINT}}' },
            _meta: { title: 'Load Checkpoint (PuLID)' },
          },
          '2': {
            class_type: 'LoadImage',
            inputs: { image: '{{IPADAPTER_IMAGE}}' },
            _meta: { title: 'PuLID identity reference' },
          },
          '3': {
            class_type: 'CLIPTextEncode',
            inputs: { text: '{{POSITIVE}}', clip: ['1', 1] },
            _meta: { title: 'Positive Prompt' },
          },
          '4': {
            class_type: 'CLIPTextEncode',
            inputs: { text: '{{NEGATIVE}}', clip: ['1', 1] },
            _meta: { title: 'Negative Prompt' },
          },
          '5': {
            class_type: 'EmptyLatentImage',
            inputs: {
              width: '{{WIDTH}}',
              height: '{{HEIGHT}}',
              batch_size: 1,
            },
            _meta: { title: 'Empty Latent' },
          },
          '6': {
            class_type: 'PulidEvaClipLoader',
            inputs: {},
            _meta: { title: 'PuLID EVA CLIP' },
          },
          '7': {
            class_type: 'PulidModelLoader',
            inputs: { pulid_file: 'pulid_v1.1.safetensors' },
            _meta: { title: 'PuLID model' },
          },
          '8': {
            class_type: 'ApplyPulid',
            inputs: {
              model: ['1', 0],
              pulid: ['7', 0],
              eva_clip: ['6', 0],
              image: ['2', 0],
              weight: '{{IPADAPTER_STRENGTH}}',
              start_at: 0,
              end_at: 1,
            },
            _meta: { title: 'Apply PuLID' },
          },
          '9': {
            class_type: 'KSampler',
            inputs: {
              seed: '{{SEED}}',
              steps: '{{STEPS}}',
              cfg: '{{CFG}}',
              sampler_name: '{{SAMPLER}}',
              scheduler: '{{SCHEDULER}}',
              denoise: '{{DENOISE}}',
              model: ['8', 0],
              positive: ['3', 0],
              negative: ['4', 0],
              latent_image: ['5', 0],
            },
            _meta: { title: 'KSampler' },
          },
          '10': {
            class_type: 'VAEDecode',
            inputs: { samples: ['9', 0], vae: ['1', 2] },
            _meta: { title: 'VAE Decode' },
          },
          '11': {
            class_type: 'SaveImage',
            inputs: {
              filename_prefix: 'Castcut-pulid',
              images: ['10', 0],
            },
            _meta: { title: 'Save Image' },
          },
        }
      : {
          '1': {
            class_type: 'CheckpointLoaderSimple',
            inputs: { ckpt_name: '{{CHECKPOINT}}' },
            _meta: { title: 'Load Checkpoint (InstantID)' },
          },
          '2': {
            class_type: 'LoadImage',
            inputs: { image: '{{IPADAPTER_IMAGE}}' },
            _meta: { title: 'InstantID identity reference' },
          },
          '3': {
            class_type: 'CLIPTextEncode',
            inputs: { text: '{{POSITIVE}}', clip: ['1', 1] },
            _meta: { title: 'Positive Prompt' },
          },
          '4': {
            class_type: 'CLIPTextEncode',
            inputs: { text: '{{NEGATIVE}}', clip: ['1', 1] },
            _meta: { title: 'Negative Prompt' },
          },
          '5': {
            class_type: 'EmptyLatentImage',
            inputs: {
              width: '{{WIDTH}}',
              height: '{{HEIGHT}}',
              batch_size: 1,
            },
            _meta: { title: 'Empty Latent' },
          },
          '6': {
            class_type: 'InstantIDFaceAnalysis',
            inputs: { provider: 'CPU' },
            _meta: { title: 'InstantID face analysis' },
          },
          '7': {
            class_type: 'InstantIDModelLoader',
            inputs: { instantid_file: 'ip-adapter.bin' },
            _meta: { title: 'InstantID model' },
          },
          '8': {
            class_type: 'ApplyInstantID',
            inputs: {
              model: ['1', 0],
              instantid: ['7', 0],
              insightface: ['6', 0],
              image: ['2', 0],
              weight: '{{IPADAPTER_STRENGTH}}',
              start_at: 0,
              end_at: 1,
            },
            _meta: { title: 'Apply InstantID' },
          },
          '9': {
            class_type: 'KSampler',
            inputs: {
              seed: '{{SEED}}',
              steps: '{{STEPS}}',
              cfg: '{{CFG}}',
              sampler_name: '{{SAMPLER}}',
              scheduler: '{{SCHEDULER}}',
              denoise: '{{DENOISE}}',
              model: ['8', 0],
              positive: ['3', 0],
              negative: ['4', 0],
              latent_image: ['5', 0],
            },
            _meta: { title: 'KSampler' },
          },
          '10': {
            class_type: 'VAEDecode',
            inputs: { samples: ['9', 0], vae: ['1', 2] },
            _meta: { title: 'VAE Decode' },
          },
          '11': {
            class_type: 'SaveImage',
            inputs: {
              filename_prefix: 'Castcut-instantid',
              images: ['10', 0],
            },
            _meta: { title: 'Save Image' },
          },
        };
  return {
    json: JSON.stringify(workflow, null, 2),
    source: 'template',
    model: 'sdxl-base',
    category: 'sdxl',
    bindingChanges: 0,
    notes: [
      `${label} scaffold with Apply${label === 'PuLID' ? 'Pulid' : 'InstantID'} wired between checkpoint and KSampler.`,
      `Identity image uses {{IPADAPTER_IMAGE}}; strength uses {{IPADAPTER_STRENGTH}}. Adjust model loader filenames for your ComfyUI install, then import into the workflow library.`,
    ],
  };
}

function resolveScaffoldCategory(model: ComfyImageModel | string): ComfyModelCategory | 'generic' {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return 'generic';
  }
  if (def.category === 'flux') {
    return 'flux';
  }
  if (def.category === 'qwen') {
    return 'qwen';
  }
  return def.category;
}

export function buildWorkflowScaffoldForModel(
  model: ComfyImageModel | string,
  tokens?: Partial<WorkflowPlaceholderTokens>,
  options?: WorkflowScaffoldOptions
): WorkflowScaffoldResult {
  const resolvedTokens = resolveBindingTokens(tokens);
  const category = resolveScaffoldCategory(model);
  const useKleinEditScaffold =
    isFluxKleinModel(model) &&
    (options?.tool === 'compose' || options?.tool === 'refine' || options?.tool === 'imagePrompt');
  const useBooguComposeScaffold = options?.tool === 'compose' && isBooguEditModel(model);
  const useZImageImg2imgScaffold = isZImageModel(model) && isZImageImg2imgQueueTool(options?.tool);
  const useQwenComposeScaffold =
    options?.tool === 'compose' &&
    isQwenEditModel(model) &&
    !isQwenLightningModel(model) &&
    !usesQwenCheckpointLoader(model);
  const useEditScaffold = isEditCapableModel(model) && !isInstructPix2pixModel(model);
  const useInstructPix2pixScaffold = isInstructPix2pixModel(model);
  const useLightningScaffold = category === 'qwen' && isQwenLightningModel(model);
  const useCheckpointScaffold =
    category === 'qwen' && usesQwenCheckpointLoader(model) && !useLightningScaffold;
  const graph = useKleinEditScaffold
    ? fluxKleinEditScaffold(resolvedTokens, model)
    : useBooguComposeScaffold
      ? booguEditScaffold(resolvedTokens, {
          compose: true,
          turbo: isBooguEditTurboModel(model),
        })
      : useZImageImg2imgScaffold
        ? zImageImg2imgScaffold(resolvedTokens)
        : useQwenComposeScaffold
          ? qwenEditComposeScaffold(resolvedTokens, model)
          : useInstructPix2pixScaffold
            ? instructPix2pixScaffold(resolvedTokens)
            : useEditScaffold
              ? editScaffold(resolvedTokens, category, model)
              : isBooguEditModel(model)
                ? booguEditScaffold(resolvedTokens, { turbo: isBooguEditTurboModel(model) })
                : isBooguImageTurboModel(model)
                  ? booguImageTurboScaffold(resolvedTokens)
                  : isBooguImageModel(model)
                    ? booguImageScaffold(resolvedTokens)
                    : isZImageModel(model)
                      ? zImageScaffold(resolvedTokens)
                      : category === 'flux'
                        ? fluxScaffold(resolvedTokens, model)
                        : useLightningScaffold
                          ? qwenLightningScaffold(resolvedTokens)
                          : useCheckpointScaffold
                            ? qwenCheckpointScaffold(resolvedTokens)
                            : category === 'qwen'
                              ? qwenScaffold(resolvedTokens)
                              : category === 'video'
                                ? videoScaffold(resolvedTokens, model)
                                : category === 'sd3'
                                  ? sd3Scaffold(resolvedTokens, model)
                                  : category === 'sdxl'
                                    ? sdxlScaffold(resolvedTokens)
                                    : category === 'hunyuan'
                                      ? isHiDreamModel(model)
                                        ? hidreamScaffold(resolvedTokens, model)
                                        : hunyuanImageScaffold(resolvedTokens, model)
                                      : category === 'audio'
                                        ? audioScaffold(resolvedTokens)
                                        : category === 'mesh'
                                          ? meshScaffold(resolvedTokens)
                                          : isOmniGen2Model(model)
                                            ? omnigen2Scaffold(resolvedTokens)
                                            : isPixartModel(model)
                                              ? pixartScaffold(resolvedTokens)
                                              : model === 'lumina2'
                                                ? lumina2Scaffold(resolvedTokens)
                                                : genericScaffold(resolvedTokens);
  const videoLatentClass = category === 'video' ? resolveVideoLatentClass(model) : null;
  const notes = [
    'Starter graph with app placeholders — verify loader filenames match your ComfyUI models folder.',
    useKleinEditScaffold
      ? options?.tool === 'compose'
        ? 'Klein Compose scaffold uses EmptyFlux2LatentImage + ReferenceLatent (instruction edit, denoise 1). Extra figures attach via ReferenceLatent at queue time — not soft img2img.'
        : 'Klein Refine / Image→Prompt scaffold uses EmptyFlux2LatentImage + ReferenceLatent (instruction edit, denoise 1) — not soft img2img.'
      : useBooguComposeScaffold
        ? 'Boogu Edit Compose uses TextEncodeBooguEdit + EmptyLatentImage (denoise 1). Figure 1–4 wire to images.image_1…images.image_4 — vision + reference latents.'
        : useZImageImg2imgScaffold
          ? options?.tool === 'compose'
            ? 'Z-Image Compose uses Figure 1 img2img (VAEEncode → KSampler, Turbo denoise from Gentle / Balanced / Strong). Extra figures are prompt-only — no unused LoadImage nodes.'
            : 'Z-Image Refine uses VAEEncode img2img (Turbo denoise from Gentle / Balanced / Strong). Upload a reference image — instruction edits in text, not ReferenceLatent.'
          : useQwenComposeScaffold
            ? 'Qwen Edit Compose scaffold uses EmptySD3LatentImage + TextEncodeQwenImageEditPlus (no encode VAE). Figure 1–4 attach via ReferenceLatent + external VAEEncode at queue time — denoise 1.'
            : useEditScaffold
              ? isBooguEditModel(model)
                ? isBooguEditTurboModel(model)
                  ? 'Boogu Edit Turbo uses TextEncodeBooguEdit (empty negative) — UNET-only, no AuraFlow (CFG 1, 4 steps). Do not stack Lightning or turbo-distillation LoRAs; the Edit Turbo weights are already distilled.'
                  : 'Boogu Edit scaffold uses TextEncodeBooguEdit + EmptyLatentImage (denoise 1). Figure 1 soft-wires to images.image_1 — reference latents preserve identity under CFG.'
                : isQwenEditModel(model)
                  ? isQwenLightningModel(model)
                    ? 'Lightning edit scaffold uses TextEncodeQwenImageEditPlus + EmptyLatent + Lightning LoRA (denoise 1). Figure 1–4 LoadImages use {{INPUT_IMAGE}}…{{INPUT_IMAGE_4}} but encode slots stay empty for Generate; Compose/Refine queue wires refs when you upload sources.'
                    : useQwenComposeScaffold
                      ? 'Qwen Edit Compose scaffold uses EmptySD3LatentImage — ReferenceLatent wiring applied at queue time.'
                      : 'Qwen Edit scaffold wires LoadImage → VAEEncode → KSampler with denoise — upload an image from Refine, Compose, or Image → Prompt before queueing.'
                  : model === 'flux-inpaint'
                    ? 'FLUX inpaint scaffold wires LoadImage + LoadImageMask → InpaintModelConditioning — upload source image and mask before queueing.'
                    : 'Edit scaffold includes LoadImage + denoise — wire VAEEncode in ComfyUI if you use the generic edit template.'
              : category === 'qwen'
                ? useLightningScaffold
                  ? 'Lightning scaffold uses UNETLoader + Lightning LoRA ({{LORA_LIGHTNING}}) + ModelSamplingAuraFlow (shift ~3). Map your 4/8-step bf16 Lightning LoRA in Settings → LoRA library.'
                  : useCheckpointScaffold
                    ? 'Rapid AIO / checkpoint Qwen scaffold uses CheckpointLoaderSimple ({{CHECKPOINT}}) — no separate UNET. Map the merge under Settings → checkpoint map if your filename differs.'
                    : 'Qwen scaffold uses UNETLoader + CLIPLoader (type qwen_image, bf16 by default) + VAELoader with {{UNET}}; edit clip/vae names if your pack differs.'
                : category === 'flux'
                  ? isFluxKleinModel(model)
                    ? 'FLUX Klein scaffold uses UNETLoader + CLIPLoader (type flux2, Qwen3-8B for 9B / Qwen3-4B for 4B) + VAELoader with {{UNET}} — soft-bound from Comfy inventory when available.'
                    : 'FLUX scaffold uses UNETLoader + DualCLIPLoader (clip_l + t5xxl) + VAELoader with {{UNET}} — soft-bound from Comfy inventory when available.'
                  : category === 'video'
                    ? isWanLightningModel(model)
                      ? 'WAN Lightning scaffold uses CheckpointLoader + LoraLoaderModelOnly ({{LORA_LIGHTNING}} → Wan2.2-Lightning-low_noise_model) + EmptyHunyuanLatentVideo + SaveAnimatedWEBP. Map the low-noise Lightning LoRA in Settings → LoRA library or keep it in ComfyUI’s loras folder.'
                      : `Video scaffold uses ${videoLatentClass} ({{VIDEO_FRAMES}} length) + SaveAnimatedWEBP ({{VIDEO_FPS}}). Prefer importing a pack-accurate WAN/Hunyuan/LTX workflow when you have one. {{INIT_IMAGE}} is optional — queues with an init image auto-wire WanImageToVideo, HunyuanImageToVideo, or LTXVImgToVideo.`
                    : category === 'sd3'
                      ? isAuraFlowModel(model)
                        ? 'AuraFlow scaffold uses UNETLoader + TripleCLIP + ModelSamplingAuraFlow + EmptySD3LatentImage — map {{UNET}} under Settings.'
                        : 'SD3 scaffold uses UNETLoader + TripleCLIP + ModelSamplingSD3 + EmptySD3LatentImage — map {{UNET}} and clip filenames under Settings.'
                      : category === 'sdxl'
                        ? 'SDXL scaffold uses CheckpointLoaderSimple + dual CLIPTextEncode + EmptyLatentImage + KSampler — map {{CHECKPOINT}} under Settings → model checkpoint map.'
                        : category === 'hunyuan'
                          ? isHiDreamModel(model)
                            ? 'HiDream scaffold — import pack-accurate HiDream / HiDream-O1 graphs when available.'
                            : 'Hunyuan still-image scaffold uses CheckpointLoader + EmptyLatentImage — import pack-accurate HyDiT / Hunyuan Image 2.1 graphs when available.'
                          : category === 'audio'
                            ? 'Audio scaffold is a Stable-Audio-oriented starter (Checkpoint + CLIP + KSampler + SaveAudio) with {{AUDIO_SECONDS}} on the Note node. Prefer importing your pack’s Stable Audio / music graph when you have one — then map it under Settings → model→workflow.'
                            : category === 'mesh'
                              ? 'Mesh scaffold wires {{INPUT_IMAGE}} + Checkpoint + CLIP + KSampler + SaveImage with {{MESH_RESOLUTION}} on the Note node. Prefer importing Hunyuan3D / image-to-mesh pack graphs when available.'
                              : isBooguImageTurboModel(model)
                                ? 'Boogu Image Turbo uses UNETLoader + ConditioningZeroOut (CFG 1, no negative encode, no AuraFlow). Native 4-step distilled weights — no Lightning LoRA required.'
                                : isBooguImageModel(model)
                                  ? 'Boogu Image Base scaffold uses UNETLoader + CLIPLoader (type boogu, qwen3vl_8b) + flux1_vae_bf16 + ModelSamplingAuraFlow — ~25–50 steps, cfg ~4.'
                                  : isZImageModel(model)
                                    ? 'Z-Image scaffold uses UNETLoader + CLIPLoader (type lumina2, qwen_3_4b) + ae.safetensors VAE + ModelSamplingAuraFlow. Turbo: 6–8 steps, cfg 1; Base: ~30–50 steps, cfg 3–5.'
                                    : isOmniGen2Model(model)
                                      ? 'OmniGen2 scaffold includes reference LoadImage slots — wire pack-accurate OmniGen2 encode nodes when available.'
                                      : isPixartModel(model)
                                        ? 'PixArt starter uses CheckpointLoader — import pack-accurate PixArt DiT graph when available.'
                                        : model === 'lumina2'
                                          ? 'Lumina2 scaffold uses UNETLoader + CLIPLoader (type lumina2) + ModelSamplingAuraFlow + EmptySD3LatentImage.'
                                          : 'Use Settings → model checkpoint map so Send to ComfyUI can patch loader nodes automatically.',
  ];

  return {
    json: JSON.stringify(graph, null, 2),
    source: 'template',
    model,
    category,
    bindingChanges: 0,
    notes,
  };
}

export function cloneWorkflowWithBindings(
  sourceJson: string,
  tokens?: Partial<WorkflowPlaceholderTokens>
): WorkflowScaffoldResult {
  const resolvedTokens = resolveBindingTokens(tokens);
  const prepared = prepareWorkflowJsonImport(sourceJson, resolvedTokens);
  if (!prepared.ok || !prepared.workflowJson) {
    return {
      json: sourceJson,
      source: 'clone',
      model: 'generic',
      category: 'generic',
      bindingChanges: 0,
      notes: [prepared.error ?? 'Could not parse workflow JSON for cloning.'],
    };
  }
  const bound = bindScaffoldJson(prepared.workflowJson, resolvedTokens);

  return {
    json: bound.json,
    source: 'clone',
    model: 'generic',
    category: 'generic',
    bindingChanges: bound.bindingChanges + (prepared.autoAppliedBindings ?? 0),
    notes: prepared.notice ? [prepared.notice] : [],
  };
}

export function scaffoldWorkflowForModel(
  model: ComfyImageModel | string,
  options?: {
    sourceJson?: string;
    tokens?: Partial<WorkflowPlaceholderTokens>;
  }
): WorkflowScaffoldResult {
  if (options?.sourceJson?.trim()) {
    const cloned = cloneWorkflowWithBindings(options.sourceJson, options.tokens);
    return { ...cloned, model, category: resolveScaffoldCategory(model) };
  }
  return buildWorkflowScaffoldForModel(model, options?.tokens);
}

export function suggestedScaffoldName(
  model: ComfyImageModel | string,
  source: WorkflowScaffoldSource
): string {
  const def = getComfyModelDefinition(model);
  const label = def?.label ?? model;
  return source === 'clone' ? `${label} (bound clone)` : `${label} scaffold`;
}
