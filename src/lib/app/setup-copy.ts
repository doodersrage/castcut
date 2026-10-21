/**
 * One set of words for first-run setup, used by every surface that mentions it: the dashboard
 * checklist (the owner), the first-queue modal, the per-tool banner, the welcome and the palette.
 * They used to say "Settings → Heal & ready", "Enable & sync inventory", "Enable system
 * workflows (or Heal & ready)" and "Finish setup before Generate" for the same step.
 */

import { settingsComfyUiSectionHref } from '../settings/comfyui-nav';
import { settingsSearchHref } from '../settings/search-index';

export const HEAL_READY_LABEL = 'Heal & ready';

/** What it does, after "Heal & ready". */
export const HEAL_READY_DOES = 'checks ComfyUI, your models and the system workflows in one click';

/** The step, as a checklist line or a sentence. */
export const HEAL_READY_STEP = `Run ${HEAL_READY_LABEL} — it ${HEAL_READY_DOES}`;

/** Where its button is: Settings → Overview, scrolled to and highlighted. */
export const HEAL_READY_HREF = settingsSearchHref({ tab: 'overview', focus: 'heal-and-ready' });

/** "Settings → Heal & ready", the link text. */
export const HEAL_READY_LINK_TEXT = `Settings → ${HEAL_READY_LABEL}`;

/** Missing weights are downloaded here (the asset catalog's one-click downloads). */
export const MODEL_DOWNLOADS_HREF = settingsComfyUiSectionHref('model-assets');
export const MODEL_DOWNLOADS_LINK_TEXT = 'Settings → Models';

export const COMFY_CONNECTION_HREF = settingsComfyUiSectionHref('connection');
export const COMFY_CONNECTION_LINK_TEXT = 'Settings → Connection';
