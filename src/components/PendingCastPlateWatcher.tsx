'use client';

import { useEffect } from 'react';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';

/**
 * A Cast plate rendered from the description (Day's "Make a plate", Look's extract) used to be
 * attached only when Outfit opened, and a film no longer passes through Outfit. This attaches it
 * wherever the player is, when the gallery says a still landed. Outfit keeps its own attach (it
 * also isolates the picture for try-ons), so this stays out of its way. The plate code loads
 * only when the gallery updates — not in every page's bundle.
 */
export default function PendingCastPlateWatcher() {
  useEffect(() => {
    let cancelled = false;
    const attach = () => {
      if (cancelled || window.location.pathname.startsWith('/fitting')) return;
      void Promise.all([import('@/lib/look-outfit-plate'), import('@/lib/settings-cache')])
        .then(([plate, settings]) => {
          if (cancelled) return;
          plate.tryAttachPendingOutfitPlate(settings.loadSettingsCache().shared.activeCharacterId);
        })
        .catch(() => {
          // Nothing to attach, or the gallery isn't readable yet — the next update tries again.
        });
    };
    attach();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, attach);
    return () => {
      cancelled = true;
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, attach);
    };
  }, []);
  return null;
}
