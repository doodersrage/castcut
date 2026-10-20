import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { buildGalleryHandoff, type GalleryHandoffPayload } from '../gallery/handoff';

/** Masked inpaint denoise — lower than default inpaint to preserve surrounding context. */
export const DEFAULT_ANATOMY_REPAIR_DENOISE = 0.45;

export const ANATOMY_REPAIR_MASK_DESCRIPTION =
  'the affected arm, hand, leg, foot, or other limb in the masked area';

export const ANATOMY_REPAIR_CHANGE_DESCRIPTION =
  'render anatomically correct anatomy with natural limb count, five distinct fingers per visible hand, clear wrists and elbows, coherent proportions, matching clothing texture and lighting from the surrounding image';

export function galleryAnatomyRepairPath(): string {
  return '/inpaint?from=gallery&anatomy=1';
}

export function buildAnatomyRepairGalleryHandoff(entry: ComfyGalleryEntry): GalleryHandoffPayload {
  return {
    ...buildGalleryHandoff(entry, 'inpaint'),
    model: 'flux-inpaint',
    anatomyRepair: true,
    hints: 'Paint over the broken limb or hand, then queue.',
    queueParams: {
      ...entry.queueParams,
      denoise: DEFAULT_ANATOMY_REPAIR_DENOISE,
    },
  };
}

export function isAnatomyRepairHandoff(payload: GalleryHandoffPayload | null | undefined): boolean {
  return payload?.anatomyRepair === true;
}
