import type { EngineId } from './types';

export const FAL_QUEUE_HOST = 'https://queue.fal.run';
export const REPLICATE_API_HOST = 'https://api.replicate.com';
export const OPENAI_API_HOST = 'https://api.openai.com';
export const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
export const GROK_API_HOST = 'https://api.x.ai';
export const RUNWAY_API_HOST = 'https://api.dev.runwayml.com';
export const LUMA_API_HOST = 'https://api.lumalabs.ai';

export const DEFAULT_FAL_TXT2IMG_MODEL = 'fal-ai/flux/schnell';
export const DEFAULT_FAL_IMG2IMG_MODEL = 'fal-ai/flux/dev/image-to-image';
export const DEFAULT_FAL_I2V_MODEL = 'fal-ai/kling-video/v2.1/standard/image-to-video';
export const DEFAULT_FAL_T2V_MODEL = 'fal-ai/kling-video/v2.1/standard/text-to-video';
export const DEFAULT_FAL_EXTEND_MODEL = 'fal-ai/ltx-2.3/extend-video';
export const DEFAULT_REPLICATE_TXT2IMG_MODEL = 'black-forest-labs/flux-schnell';
export const DEFAULT_REPLICATE_IMG2IMG_MODEL = 'black-forest-labs/flux-dev';
export const DEFAULT_REPLICATE_I2V_MODEL = 'kwaivgi/kling-v3-video';
export const DEFAULT_REPLICATE_T2V_MODEL = 'kwaivgi/kling-v3-video';
export const DEFAULT_OPENAI_TXT2IMG_MODEL = 'gpt-image-2';
export const DEFAULT_OPENAI_IMG2IMG_MODEL = 'gpt-image-2';
export const DEFAULT_GEMINI_TXT2IMG_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_GEMINI_IMG2IMG_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_GROK_TXT2IMG_MODEL = 'grok-imagine-image-2.0';
export const DEFAULT_GROK_IMG2IMG_MODEL = 'grok-imagine-image-2.0';
export const DEFAULT_RUNWAY_TXT2IMG_MODEL = 'gen4_image';
export const DEFAULT_RUNWAY_IMG2IMG_MODEL = 'gen4_image';
export const DEFAULT_RUNWAY_I2V_MODEL = 'gen4.5';
export const DEFAULT_RUNWAY_T2V_MODEL = 'gen4.5';
export const DEFAULT_RUNWAY_EXTEND_MODEL = 'aleph2';
export const DEFAULT_LUMA_TXT2IMG_MODEL = 'ray-2';
export const DEFAULT_LUMA_IMG2IMG_MODEL = 'ray-2';
export const DEFAULT_LUMA_I2V_MODEL = 'ray-2';
export const DEFAULT_LUMA_T2V_MODEL = 'ray-2';

export const CLOUD_ENGINE_IDS = [
  'fal',
  'replicate',
  'openai',
  'gemini',
  'grok',
  'runway',
  'luma',
] as const;
export type CloudEngineId = (typeof CLOUD_ENGINE_IDS)[number];

export const FAL_MODEL_PRESETS = [
  { id: 'fal-ai/flux/schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'fal-ai/flux/dev', label: 'FLUX Dev (quality txt2img)' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX Pro 1.1' },
  { id: 'fal-ai/flux-2', label: 'FLUX.2 txt2img' },
  { id: 'fal-ai/flux-2/flash', label: 'FLUX.2 Flash (fast txt2img)' },
  { id: 'fal-ai/flux-2-pro', label: 'FLUX.2 Pro txt2img' },
  { id: 'fal-ai/flux-2-flex', label: 'FLUX.2 Flex txt2img' },
  { id: 'fal-ai/flux-2-max', label: 'FLUX.2 Max txt2img' },
  { id: 'fal-ai/flux-2/klein/4b', label: 'FLUX.2 Klein 4B distilled txt2img' },
  { id: 'fal-ai/flux-2/klein/4b/base', label: 'FLUX.2 Klein 4B Base txt2img' },
  { id: 'fal-ai/flux-2/klein/9b', label: 'FLUX.2 Klein 9B distilled txt2img' },
  { id: 'fal-ai/flux-2/klein/9b/base', label: 'FLUX.2 Klein 9B Base txt2img' },
  { id: 'fal-ai/flux/dev/image-to-image', label: 'FLUX Dev image-to-image' },
  { id: 'fal-ai/flux-pro/kontext', label: 'FLUX Kontext edit' },
  { id: 'fal-ai/flux-pro/kontext/max', label: 'FLUX Kontext Max edit' },
  { id: 'fal-ai/flux-pro/kontext/multi', label: 'FLUX Kontext multi-ref edit' },
  { id: 'fal-ai/flux-pro/kontext/max/multi', label: 'FLUX Kontext Max multi-ref edit' },
  { id: 'fal-ai/flux-2/edit', label: 'FLUX.2 edit (multi-ref)' },
  { id: 'fal-ai/flux-2-pro/edit', label: 'FLUX.2 Pro edit (multi-ref)' },
  { id: 'fal-ai/flux-2-flex/edit', label: 'FLUX.2 Flex edit (multi-ref)' },
  { id: 'fal-ai/flux-2-max/edit', label: 'FLUX.2 Max edit (multi-ref)' },
  { id: 'fal-ai/nano-banana/edit', label: 'Nano Banana edit (multi-ref)' },
  { id: 'fal-ai/nano-banana-pro/edit', label: 'Nano Banana Pro edit (multi-ref)' },
  { id: 'fal-ai/nano-banana-2/edit', label: 'Nano Banana 2 edit (multi-ref)' },
  { id: 'fal-ai/hidream-i1-fast', label: 'HiDream I1 Fast txt2img' },
  { id: 'fal-ai/hidream-i1-dev', label: 'HiDream I1 Dev txt2img' },
  { id: 'fal-ai/hidream-i1-full', label: 'HiDream I1 Full txt2img' },
  { id: 'fal-ai/hidream-i1-full/image-to-image', label: 'HiDream I1 Full image-to-image' },
  { id: 'fal-ai/bytedance/seedream/v4/text-to-image', label: 'Seedream 4.0 txt2img' },
  { id: 'fal-ai/bytedance/seedream/v4/edit', label: 'Seedream 4.0 edit' },
  { id: 'fal-ai/recraft/v3/text-to-image', label: 'Recraft V3 txt2img' },
  { id: 'fal-ai/ideogram/v3', label: 'Ideogram V3 txt2img' },
  { id: 'fal-ai/qwen-image', label: 'Qwen Image txt2img' },
  { id: 'fal-ai/qwen-image-edit', label: 'Qwen Image Edit' },
  { id: 'fal-ai/imagen4/preview', label: 'Imagen 4 Preview txt2img' },
] as const;

export const FAL_I2V_MODEL_PRESETS = [
  { id: 'fal-ai/kling-video/v2.1/standard/image-to-video', label: 'Kling 2.1 image-to-video' },
  { id: 'fal-ai/kling-video/v2.1/pro/image-to-video', label: 'Kling 2.1 Pro image-to-video' },
  { id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling 2.5 Turbo Pro I2V' },
  { id: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3.0 image-to-video' },
  { id: 'fal-ai/kling-video/o3/standard/image-to-video', label: 'Kling O3 image-to-video' },
  { id: 'fal-ai/wan/v2.2-a14b/image-to-video', label: 'WAN 2.2 image-to-video' },
  { id: 'fal-ai/wan/v2.6/image-to-video', label: 'WAN 2.6 image-to-video' },
  { id: 'fal-ai/wan/v2.7/image-to-video', label: 'WAN 2.7 image-to-video' },
  { id: 'fal-ai/ltx-2.3/image-to-video', label: 'LTX 2.3 image-to-video' },
  { id: 'fal-ai/minimax/video-01/image-to-video', label: 'MiniMax Video-01 image-to-video' },
  { id: 'fal-ai/minimax/hailuo-02/standard/image-to-video', label: 'Hailuo 02 image-to-video' },
  { id: 'bytedance/seedance-2.0/image-to-video', label: 'Seedance 2.0 image-to-video' },
  { id: 'bytedance/seedance-2.5/image-to-video', label: 'Seedance 2.5 image-to-video' },
  { id: 'xai/grok-imagine-video/v1.5/image-to-video', label: 'Grok Imagine 1.5 image-to-video' },
  { id: 'fal-ai/veo3.1/image-to-video', label: 'Veo 3.1 image-to-video' },
  { id: 'fal-ai/veo3.1/fast/image-to-video', label: 'Veo 3.1 Fast image-to-video' },
] as const;

export const FAL_T2V_MODEL_PRESETS = [
  { id: 'fal-ai/kling-video/v2.1/standard/text-to-video', label: 'Kling 2.1 text-to-video' },
  { id: 'fal-ai/kling-video/v2.1/pro/text-to-video', label: 'Kling 2.1 Pro text-to-video' },
  { id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', label: 'Kling 2.5 Turbo Pro T2V' },
  { id: 'fal-ai/kling-video/v3/standard/text-to-video', label: 'Kling 3.0 text-to-video' },
  { id: 'fal-ai/kling-video/o3/standard/text-to-video', label: 'Kling O3 text-to-video' },
  { id: 'fal-ai/wan/v2.2-a14b/text-to-video', label: 'WAN 2.2 text-to-video' },
  { id: 'fal-ai/wan/v2.6/text-to-video', label: 'WAN 2.6 text-to-video' },
  { id: 'fal-ai/wan/v2.7/text-to-video', label: 'WAN 2.7 text-to-video' },
  { id: 'fal-ai/ltx-2.3/text-to-video', label: 'LTX 2.3 text-to-video' },
  { id: 'fal-ai/minimax/video-01', label: 'MiniMax Video-01 text-to-video' },
  { id: 'fal-ai/minimax/hailuo-02/standard/text-to-video', label: 'Hailuo 02 text-to-video' },
  { id: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 text-to-video' },
  { id: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 text-to-video' },
  { id: 'xai/grok-imagine-video/v1.5/text-to-video', label: 'Grok Imagine 1.5 text-to-video' },
  { id: 'fal-ai/veo3.1', label: 'Veo 3.1 text-to-video' },
  { id: 'fal-ai/veo3.1/fast', label: 'Veo 3.1 Fast text-to-video' },
] as const;

export const FAL_EXTEND_MODEL_PRESETS = [
  { id: 'fal-ai/ltx-2.3/extend-video', label: 'LTX 2.3 extend video' },
] as const;

export const REPLICATE_MODEL_PRESETS = [
  { id: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'black-forest-labs/flux-dev', label: 'FLUX Dev (txt2img / img2img)' },
  { id: 'black-forest-labs/flux-1.1-pro', label: 'FLUX 1.1 Pro' },
  { id: 'black-forest-labs/flux-2-dev', label: 'FLUX.2 Dev txt2img' },
  { id: 'black-forest-labs/flux-2-pro', label: 'FLUX.2 Pro txt2img' },
  { id: 'black-forest-labs/flux-2-klein-9b', label: 'FLUX.2 Klein 9B txt2img' },
  { id: 'black-forest-labs/flux-kontext-pro', label: 'FLUX Kontext Pro edit' },
  { id: 'black-forest-labs/flux-kontext-max', label: 'FLUX Kontext Max edit' },
  { id: 'stability-ai/sdxl', label: 'Stable Diffusion XL' },
  { id: 'stability-ai/stable-diffusion-3.5-large', label: 'SD 3.5 Large' },
  { id: 'ideogram-ai/ideogram-v3-turbo', label: 'Ideogram V3 Turbo' },
  { id: 'recraft-ai/recraft-v3', label: 'Recraft V3' },
  { id: 'google/imagen-4', label: 'Imagen 4' },
  { id: 'qwen/qwen-image', label: 'Qwen Image' },
  {
    id: 'flux-kontext-apps/multi-image-kontext-pro',
    label: 'Kontext multi-image Pro (2 refs)',
  },
  {
    id: 'flux-kontext-apps/multi-image-kontext-max',
    label: 'Kontext multi-image Max (2 refs)',
  },
] as const;

export const REPLICATE_I2V_MODEL_PRESETS = [
  { id: 'kwaivgi/kling-v2.1', label: 'Kling 2.1 (T2V / I2V)' },
  { id: 'kwaivgi/kling-v3-video', label: 'Kling 3.0 (T2V / I2V)' },
  { id: 'wan-video/wan-2.2-i2v-fast', label: 'WAN 2.2 image-to-video (fast)' },
  { id: 'wan-video/wan-2.2-i2v-a14b', label: 'WAN 2.2 image-to-video A14B' },
  { id: 'wan-video/wan-2.5-i2v-fast', label: 'WAN 2.5 image-to-video (fast)' },
  { id: 'wan-video/wan-2.6-i2v', label: 'WAN 2.6 image-to-video' },
  { id: 'lightricks/ltx-2.3-fast', label: 'LTX 2.3 image-to-video (fast)' },
  { id: 'minimax/video-01', label: 'MiniMax Video-01' },
  { id: 'bytedance/seedance-1-pro', label: 'Seedance 1 Pro (T2V / I2V)' },
  { id: 'bytedance/seedance-2.0', label: 'Seedance 2.0 (T2V / I2V)' },
  { id: 'google/veo-3.1', label: 'Veo 3.1 (T2V / I2V)' },
] as const;

export const REPLICATE_T2V_MODEL_PRESETS = [
  { id: 'kwaivgi/kling-v2.1', label: 'Kling 2.1 (T2V / I2V)' },
  { id: 'kwaivgi/kling-v3-video', label: 'Kling 3.0 (T2V / I2V)' },
  { id: 'wan-video/wan-2.2-t2v-fast', label: 'WAN 2.2 text-to-video (fast)' },
  { id: 'wan-video/wan-2.5-t2v-fast', label: 'WAN 2.5 text-to-video (fast)' },
  { id: 'wan-video/wan-2.6-t2v', label: 'WAN 2.6 text-to-video' },
  { id: 'lightricks/ltx-2.3-fast', label: 'LTX 2.3 text-to-video (fast)' },
  { id: 'minimax/video-01', label: 'MiniMax Video-01' },
  { id: 'bytedance/seedance-1-pro', label: 'Seedance 1 Pro (T2V / I2V)' },
  { id: 'bytedance/seedance-2.0', label: 'Seedance 2.0 (T2V / I2V)' },
  { id: 'google/veo-3.1', label: 'Veo 3.1 (T2V / I2V)' },
] as const;

export const OPENAI_MODEL_PRESETS = [
  { id: 'gpt-image-2', label: 'GPT Image 2 (ChatGPT Images)' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-1', label: 'GPT Image 1' },
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { id: 'dall-e-3', label: 'DALL·E 3' },
] as const;

export const GEMINI_MODEL_PRESETS = [
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image (Nano Banana 2)' },
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image' },
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
  { id: 'gemini-2.0-flash-preview-image-generation', label: 'Gemini 2.0 Flash Image Preview' },
  { id: 'imagen-4.0-generate-001', label: 'Imagen 4.0 Generate' },
  { id: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra' },
  { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' },
] as const;

export const GROK_MODEL_PRESETS = [
  { id: 'grok-imagine-image-2.0', label: 'Grok Imagine Image 2.0' },
  { id: 'grok-imagine-image', label: 'Grok Imagine Image' },
  { id: 'grok-2-image', label: 'Grok 2 Image' },
] as const;

export const RUNWAY_MODEL_PRESETS = [
  { id: 'gen4_image', label: 'Gen-4 Image' },
  { id: 'gen4_image_turbo', label: 'Gen-4 Image Turbo' },
  { id: 'gen4', label: 'Gen-4 (legacy stills)' },
] as const;

export const RUNWAY_I2V_MODEL_PRESETS = [
  { id: 'gen4.5', label: 'Gen-4.5 image-to-video' },
  { id: 'gen4_turbo', label: 'Gen-4 Turbo image-to-video' },
  { id: 'gen3a_turbo', label: 'Gen-3 Alpha Turbo image-to-video' },
] as const;

export const RUNWAY_T2V_MODEL_PRESETS = [
  { id: 'gen4.5', label: 'Gen-4.5 text-to-video' },
  { id: 'gen4_turbo', label: 'Gen-4 Turbo text-to-video' },
] as const;

export const RUNWAY_EXTEND_MODEL_PRESETS = [
  { id: 'aleph2', label: 'Aleph 2 video-to-video' },
] as const;

export const LUMA_MODEL_PRESETS = [
  { id: 'ray-2', label: 'Ray 2 (clips — pick Video tool)' },
  { id: 'ray-flash-2', label: 'Ray 2 Flash (clips — pick Video tool)' },
] as const;

export const LUMA_I2V_MODEL_PRESETS = [
  { id: 'ray-2', label: 'Ray 2 image-to-video' },
  { id: 'ray-flash-2', label: 'Ray 2 Flash image-to-video' },
] as const;

export const LUMA_T2V_MODEL_PRESETS = [
  { id: 'ray-2', label: 'Ray 2 text-to-video' },
  { id: 'ray-flash-2', label: 'Ray 2 Flash text-to-video' },
] as const;

export type CloudSessionTokenField =
  | 'sessionFalApiKey'
  | 'sessionReplicateApiToken'
  | 'sessionOpenaiApiKey'
  | 'sessionGeminiApiKey'
  | 'sessionGrokApiKey'
  | 'sessionRunwayApiKey'
  | 'sessionLumaApiKey';

export type CloudModelField =
  | 'falModel'
  | 'replicateModel'
  | 'openaiModel'
  | 'geminiModel'
  | 'grokModel'
  | 'runwayModel'
  | 'lumaModel';

export type CloudImg2ImgField =
  | 'falImg2ImgModel'
  | 'replicateImg2ImgModel'
  | 'openaiImg2ImgModel'
  | 'geminiImg2ImgModel'
  | 'grokImg2ImgModel'
  | 'runwayImg2ImgModel'
  | 'lumaImg2ImgModel';

export type CloudTokenBodyKey =
  | 'falApiKey'
  | 'replicateApiToken'
  | 'openaiApiKey'
  | 'geminiApiKey'
  | 'grokApiKey'
  | 'runwayApiKey'
  | 'lumaApiKey';

export type CloudEngineOption = {
  id: CloudEngineId;
  label: string;
  shortLabel: string;
  host: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  envTokenName: string;
  envTokenKeys: readonly string[];
  sessionTokenField: CloudSessionTokenField;
  modelField: CloudModelField;
  img2imgField: CloudImg2ImgField;
  tokenBodyKey: CloudTokenBodyKey;
  defaultTxt2Img: string;
  defaultImg2Img: string;
  presets: readonly { id: string; label: string }[];
};

export const CLOUD_ENGINE_OPTIONS: CloudEngineOption[] = [
  {
    id: 'fal',
    label: 'Fal (cloud stills + clips)',
    shortLabel: 'Fal',
    host: FAL_QUEUE_HOST,
    tokenLabel: 'Fal API key',
    tokenPlaceholder: 'Server FAL_KEY is used when this is empty',
    envTokenName: 'FAL_KEY',
    envTokenKeys: ['FAL_KEY', 'FAL_API_KEY'],
    sessionTokenField: 'sessionFalApiKey',
    modelField: 'falModel',
    img2imgField: 'falImg2ImgModel',
    tokenBodyKey: 'falApiKey',
    defaultTxt2Img: DEFAULT_FAL_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_FAL_IMG2IMG_MODEL,
    presets: FAL_MODEL_PRESETS,
  },
  {
    id: 'replicate',
    label: 'Replicate (cloud stills + clips)',
    shortLabel: 'Replicate',
    host: REPLICATE_API_HOST,
    tokenLabel: 'Replicate API token',
    tokenPlaceholder: 'Server REPLICATE_API_TOKEN is used when this is empty',
    envTokenName: 'REPLICATE_API_TOKEN',
    envTokenKeys: ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY'],
    sessionTokenField: 'sessionReplicateApiToken',
    modelField: 'replicateModel',
    img2imgField: 'replicateImg2ImgModel',
    tokenBodyKey: 'replicateApiToken',
    defaultTxt2Img: DEFAULT_REPLICATE_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_REPLICATE_IMG2IMG_MODEL,
    presets: REPLICATE_MODEL_PRESETS,
  },
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI Images',
    shortLabel: 'ChatGPT',
    host: OPENAI_API_HOST,
    tokenLabel: 'OpenAI API key',
    tokenPlaceholder: 'Server OPENAI_API_KEY is used when this is empty',
    envTokenName: 'OPENAI_API_KEY',
    envTokenKeys: ['OPENAI_API_KEY'],
    sessionTokenField: 'sessionOpenaiApiKey',
    modelField: 'openaiModel',
    img2imgField: 'openaiImg2ImgModel',
    tokenBodyKey: 'openaiApiKey',
    defaultTxt2Img: DEFAULT_OPENAI_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_OPENAI_IMG2IMG_MODEL,
    presets: OPENAI_MODEL_PRESETS,
  },
  {
    id: 'gemini',
    label: 'Google Gemini (stills + Veo)',
    shortLabel: 'Gemini',
    host: GEMINI_API_HOST,
    tokenLabel: 'Gemini API key',
    tokenPlaceholder: 'Server GEMINI_API_KEY is used when this is empty',
    envTokenName: 'GEMINI_API_KEY',
    envTokenKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GEMINI_API_KEY'],
    sessionTokenField: 'sessionGeminiApiKey',
    modelField: 'geminiModel',
    img2imgField: 'geminiImg2ImgModel',
    tokenBodyKey: 'geminiApiKey',
    defaultTxt2Img: DEFAULT_GEMINI_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_GEMINI_IMG2IMG_MODEL,
    presets: GEMINI_MODEL_PRESETS,
  },
  {
    id: 'grok',
    label: 'Grok (xAI Imagine + video)',
    shortLabel: 'Grok',
    host: GROK_API_HOST,
    tokenLabel: 'xAI API key',
    tokenPlaceholder: 'Server XAI_API_KEY is used when this is empty',
    envTokenName: 'XAI_API_KEY',
    envTokenKeys: ['XAI_API_KEY', 'GROK_API_KEY'],
    sessionTokenField: 'sessionGrokApiKey',
    modelField: 'grokModel',
    img2imgField: 'grokImg2ImgModel',
    tokenBodyKey: 'grokApiKey',
    defaultTxt2Img: DEFAULT_GROK_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_GROK_IMG2IMG_MODEL,
    presets: GROK_MODEL_PRESETS,
  },
  {
    id: 'runway',
    label: 'Runway (Gen-4 stills + clips)',
    shortLabel: 'Runway',
    host: RUNWAY_API_HOST,
    tokenLabel: 'Runway API key',
    tokenPlaceholder: 'Server RUNWAY_API_KEY is used when this is empty',
    envTokenName: 'RUNWAY_API_KEY',
    envTokenKeys: ['RUNWAY_API_KEY', 'RUNWAYML_API_SECRET'],
    sessionTokenField: 'sessionRunwayApiKey',
    modelField: 'runwayModel',
    img2imgField: 'runwayImg2ImgModel',
    tokenBodyKey: 'runwayApiKey',
    defaultTxt2Img: DEFAULT_RUNWAY_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_RUNWAY_IMG2IMG_MODEL,
    presets: RUNWAY_MODEL_PRESETS,
  },
  {
    id: 'luma',
    label: 'Luma (Ray clips — T2V / I2V)',
    shortLabel: 'Luma',
    host: LUMA_API_HOST,
    tokenLabel: 'Luma API key',
    tokenPlaceholder: 'Server LUMA_API_KEY is used when this is empty',
    envTokenName: 'LUMA_API_KEY',
    envTokenKeys: ['LUMA_API_KEY'],
    sessionTokenField: 'sessionLumaApiKey',
    modelField: 'lumaModel',
    img2imgField: 'lumaImg2ImgModel',
    tokenBodyKey: 'lumaApiKey',
    defaultTxt2Img: DEFAULT_LUMA_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_LUMA_IMG2IMG_MODEL,
    presets: LUMA_MODEL_PRESETS,
  },
];

const CLOUD_ENGINE_BY_ID = new Map(CLOUD_ENGINE_OPTIONS.map(option => [option.id, option]));

export function cloudEngineOption(id: EngineId | undefined): CloudEngineOption | undefined {
  if (!id) {
    return undefined;
  }
  return CLOUD_ENGINE_BY_ID.get(id as CloudEngineId);
}

export function parseEngineId(value: unknown): EngineId | undefined {
  if (value === 'comfyui' || value === 'diffusers') {
    return value;
  }
  if (typeof value === 'string' && CLOUD_ENGINE_BY_ID.has(value as CloudEngineId)) {
    return value as CloudEngineId;
  }
  return undefined;
}

export function normalizeEngineId(value: unknown): EngineId {
  return parseEngineId(value) ?? 'comfyui';
}

/** Cloud APIs with no Comfy graph (prompt + optional reference image). */
export function isCloudEngine(id: EngineId | undefined): id is CloudEngineId {
  return typeof id === 'string' && CLOUD_ENGINE_BY_ID.has(id as CloudEngineId);
}

/** Backends that still queue a Comfy-shaped workflow (or Diffusers classify). */
export function engineUsesComfyGraph(id: EngineId | undefined): boolean {
  return !isCloudEngine(id);
}

export function engineDisplayName(id: EngineId | undefined): string {
  if (id === 'diffusers') {
    return 'Diffusers (stills only)';
  }
  return cloudEngineOption(id)?.shortLabel ?? 'ComfyUI';
}

export function cloudEngineHost(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.host ?? FAL_QUEUE_HOST;
}

export function defaultCloudTxt2ImgModel(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.defaultTxt2Img ?? DEFAULT_FAL_TXT2IMG_MODEL;
}

export function defaultCloudImg2ImgModel(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.defaultImg2Img ?? DEFAULT_FAL_IMG2IMG_MODEL;
}

export function cloudSettingsHref(): string {
  return '/settings?tab=comfyui&section=inference-engine';
}
