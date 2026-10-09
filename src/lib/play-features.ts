/**
 * Castcut's Play features plugging into the shared app (docs/architecture-boundaries.md). Imported
 * once by the Castcut app's composition root (components/PlayFeatures.tsx); the classic Studio
 * app does not, so the shared code never imports Play.
 */

import { scrubPlayToolCachesOnCastChange } from './play-cast-change';
import { registerCastChangeScrubber } from './settings-cache';
import { registerJobCompletedHook } from './comfyui-gallery';

registerCastChangeScrubber(scrubPlayToolCachesOnCastChange);

// Lightning Day face-break → auto Edit face-restore (deduped inside; loaded on first use).
registerJobCompletedHook(entry => {
  void import('./day-vacation-face-restore').then(({ maybeScheduleDayVacationFaceRestore }) =>
    maybeScheduleDayVacationFaceRestore(entry)
  );
});
