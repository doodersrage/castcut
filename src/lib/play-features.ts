/**
 * Castcut's Play features plugging into the shared app (docs/architecture-boundaries.md). Imported
 * once by the Castcut app's composition root (components/PlayFeatures.tsx); the classic Studio
 * app does not, so the shared code never imports Play.
 */

import { scrubPlayToolCachesOnCastChange } from './play-cast-change';
import { registerCastChangeScrubber } from './settings-cache';

registerCastChangeScrubber(scrubPlayToolCachesOnCastChange);
