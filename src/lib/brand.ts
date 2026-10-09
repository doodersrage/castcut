import { APP_HAS_PLAY } from './app-profile';

/**
 * Product display brand (per app — app-profile.ts). Package and GitHub repo are `castcut`.
 */
export const PRODUCT_NAME = APP_HAS_PLAY ? 'Castcut' : 'Prompt Studio';

/** Short pitch for metadata, PWA, and desktop. */
export const PRODUCT_TAGLINE = APP_HAS_PLAY
  ? 'Local character films with ComfyUI — Cast → Look → Outfit → Day → Cut.'
  : 'Prompt, image, video and audio tools for ComfyUI.';

/** Comfy SaveImage / output folder prefix (no spaces). */
export const PRODUCT_OUTPUT_PREFIX = 'Castcut';
