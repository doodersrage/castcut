import type { DetailLevel, FewShotExample } from '../prompt/detail-level';

export type ComfyModelCategory =
  | 'stable-diffusion'
  | 'sdxl'
  | 'sd3'
  | 'flux'
  | 'qwen'
  | 'hunyuan'
  | 'other-dit'
  | 'instruct-edit'
  | 'video'
  | 'audio'
  | 'mesh';

export type PromptProfileId =
  | 'sd15_weighted'
  | 'sdxl_nlp'
  | 'sd3_nlp'
  | 'flux_prose'
  | 'flux_klein'
  | 'flux_schnell'
  | 'qwen_edit'
  | 'qwen_edit_instruction'
  | 'qwen_t2i_factual'
  | 'qwen_t2i_rich'
  | 'hunyuan_nlp'
  | 'pixart_nlp'
  | 'lumina_nlp'
  | 'cascade_nlp'
  | 'instruct_pix2pix'
  | 'omnigen_instruction'
  | 'generic_nlp'
  | 'video_motion'
  | 'audio_sound'
  | 'mesh_3d';

export type PromptLimits = {
  minSentences: number;
  maxSentences: number;
  minChars?: number;
  maxChars: number;
  maxTokens: number;
};

export type ComfyImageModelDefinition = {
  id: string;
  label: string;
  category: ComfyModelCategory;
  comfyNode: string;
  description: string;
  profile: PromptProfileId;
  referenceTokenLimit: number;
  limitsByDetail: Record<DetailLevel, PromptLimits>;
  /** ComfyUI supported_models.py class name, when applicable */
  comfyClass?: string;
  /** Suggested checkpoint filename for loader patching (override in Settings → model checkpoint map). */
  checkpointHint?: string;
  /** Suggested UNET filename when workflows use UNETLoader instead of CheckpointLoaderSimple. */
  unetHint?: string;
  /** Other UNET files that also make this engine installed (the model picker's check). */
  unetAlternates?: string[];
  /** Suggested CLIP / text-encoder filename when workflows use CLIPLoader. */
  clipHint?: string;
  /** Suggested VAE filename when workflows use VAELoader. */
  vaeHint?: string;
};

export type ComfyImageModel = string;

export type { DetailLevel, FewShotExample };
