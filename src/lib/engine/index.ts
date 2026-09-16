import { loadEngineSettings } from '@/lib/engine-settings';
import { comfyEngineAdapter } from './comfy-adapter';
import { diffusersEngineAdapter } from './diffusers-adapter';
import { falEngineAdapter } from './fal-adapter';
import { replicateEngineAdapter } from './replicate-adapter';
import { lumaEngineAdapter } from './luma-adapter';
import { runwayEngineAdapter } from './runway-adapter';
import { geminiEngineAdapter, grokEngineAdapter, openaiEngineAdapter } from './cloud-adapter';
import type { EngineAdapter, EngineId } from './types';

export type {
  EngineAdapter,
  EngineId,
  EngineJobStatus,
  EngineOutputImage,
  EngineProgressEvent,
  EngineProgressSubscription,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineUploadedImage,
  EngineViewPathOptions,
} from './types';

export {
  CLOUD_ENGINE_OPTIONS,
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
  DEFAULT_GEMINI_IMG2IMG_MODEL,
  DEFAULT_GEMINI_TXT2IMG_MODEL,
  DEFAULT_GROK_IMG2IMG_MODEL,
  DEFAULT_GROK_TXT2IMG_MODEL,
  DEFAULT_OPENAI_IMG2IMG_MODEL,
  DEFAULT_OPENAI_TXT2IMG_MODEL,
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  DEFAULT_LUMA_I2V_MODEL,
  DEFAULT_LUMA_IMG2IMG_MODEL,
  DEFAULT_LUMA_T2V_MODEL,
  DEFAULT_LUMA_TXT2IMG_MODEL,
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_IMG2IMG_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
  DEFAULT_RUNWAY_TXT2IMG_MODEL,
  LUMA_API_HOST,
  LUMA_I2V_MODEL_PRESETS,
  LUMA_MODEL_PRESETS,
  LUMA_T2V_MODEL_PRESETS,
  FAL_EXTEND_MODEL_PRESETS,
  FAL_I2V_MODEL_PRESETS,
  FAL_MODEL_PRESETS,
  FAL_QUEUE_HOST,
  GEMINI_MODEL_PRESETS,
  GROK_MODEL_PRESETS,
  OPENAI_MODEL_PRESETS,
  REPLICATE_API_HOST,
  REPLICATE_MODEL_PRESETS,
  RUNWAY_API_HOST,
  RUNWAY_EXTEND_MODEL_PRESETS,
  RUNWAY_I2V_MODEL_PRESETS,
  RUNWAY_MODEL_PRESETS,
  RUNWAY_T2V_MODEL_PRESETS,
  cloudEngineHost,
  cloudSettingsHref,
  defaultCloudImg2ImgModel,
  defaultCloudTxt2ImgModel,
  engineDisplayName,
  engineUsesComfyGraph,
  isCloudEngine,
  normalizeEngineId,
  parseEngineId,
} from './capabilities';

export { comfyEngineAdapter } from './comfy-adapter';
export { diffusersEngineAdapter } from './diffusers-adapter';
export { falEngineAdapter } from './fal-adapter';
export { replicateEngineAdapter } from './replicate-adapter';
export { lumaEngineAdapter } from './luma-adapter';
export { runwayEngineAdapter } from './runway-adapter';
export { geminiEngineAdapter, grokEngineAdapter, openaiEngineAdapter } from './cloud-adapter';
export {
  buildDiffusersViewPath,
  buildEngineViewPath,
  buildFalViewPath,
  buildNamedCloudViewPath,
  buildReplicateViewPath,
} from './view-paths';

export function getEngineAdapterById(id: EngineId | undefined): EngineAdapter {
  if (id === 'diffusers') {
    return diffusersEngineAdapter;
  }
  if (id === 'fal') {
    return falEngineAdapter;
  }
  if (id === 'replicate') {
    return replicateEngineAdapter;
  }
  if (id === 'openai') {
    return openaiEngineAdapter;
  }
  if (id === 'gemini') {
    return geminiEngineAdapter;
  }
  if (id === 'grok') {
    return grokEngineAdapter;
  }
  if (id === 'runway') {
    return runwayEngineAdapter;
  }
  if (id === 'luma') {
    return lumaEngineAdapter;
  }
  return comfyEngineAdapter;
}

/** Active inference engine (Comfy-primary; Diffusers / cloud APIs optional). */
export function getEngineAdapter(): EngineAdapter {
  return getEngineAdapterById(loadEngineSettings().engine);
}
