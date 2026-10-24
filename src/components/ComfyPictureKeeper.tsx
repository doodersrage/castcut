'use client';

import { useEffect } from 'react';

/** First pass after the app settles, then this often while it stays open. */
const FIRST_MS = 45_000;
const EVERY_MS = 30 * 60_000;

/**
 * Keeps the app's own copy of the ComfyUI pictures this browser's data uses
 * (comfyui/input-store-client.ts): a quiet pass a little after the app opens and every half hour,
 * so a new ComfyUI install or a cleaned input folder loses none of them. Renders nothing.
 */
export default function ComfyPictureKeeper() {
  useEffect(() => {
    let cancelled = false;
    const pass = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      void import('@/lib/comfyui/input-store-client')
        .then(({ keepReferencedComfyFiles }) => keepReferencedComfyFiles())
        .catch(() => {
          // ComfyUI or the server unreachable: the next pass tries again.
        });
    };
    const first = window.setTimeout(pass, FIRST_MS);
    const every = window.setInterval(pass, EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
  return null;
}
