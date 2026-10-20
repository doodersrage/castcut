/** Documented native video model ids — keep in sync with live xAI / Gemini docs. */
export const DEFAULT_GROK_VIDEO_MODEL = 'grok-imagine-video-1.5';
/** Grok Imagine Video (base) supports `/v1/videos/extensions`; 1.5 is I2V-oriented. */
export const DEFAULT_GROK_EXTEND_MODEL = 'grok-imagine-video';
export const DEFAULT_GEMINI_VIDEO_MODEL = 'veo-3.1-generate-preview';

export function isCloudVideoModelId(modelId: string | undefined): boolean {
  const id = String(modelId ?? '');
  return /video|veo/i.test(id);
}
