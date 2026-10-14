'use client';

import { createElement, useEffect, useState } from 'react';

/**
 * A GLB on screen to turn around (drag), zoom (scroll / pinch) and spin on its own — Google's
 * <model-viewer>, loaded only when a 3D view opens.
 */
export default function OutfitModelViewer({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import('@google/model-viewer').then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) {
    return <p className="type-caption text-[var(--text-muted)]">Loading the 3D viewer…</p>;
  }
  return createElement('model-viewer', {
    src,
    alt,
    'camera-controls': '',
    'auto-rotate': '',
    'touch-action': 'pan-y',
    'shadow-intensity': '0.6',
    exposure: '1.1',
    'data-testid': 'outfit-model-viewer',
    style: {
      width: '100%',
      height: '70vh',
      background: 'var(--bg-muted)',
      borderRadius: 'var(--radius-md)',
    },
  });
}
