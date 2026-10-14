'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import SideSheet from '@/components/ui/SideSheet';
import { requestOutfit3d } from '@/lib/outfit-3d-client';

const OutfitModelViewer = dynamic(() => import('@/components/fitting/OutfitModelViewer'), {
  ssr: false,
});

/**
 * Outfit → 3D: builds the picture into a 3D model (TRELLIS.2, outfit-3d-graph.ts) and shows it to
 * turn around. Keeps `modelUrl` when the caller already has one.
 */
export default function Outfit3dSheet({
  open,
  onClose,
  imageUrl,
  title,
  modelUrl,
  onModel,
}: {
  open: boolean;
  onClose: () => void;
  /** A ComfyUI view URL of the outfit picture. */
  imageUrl: string;
  title: string;
  modelUrl?: string;
  onModel?: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(modelUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || url) return;
    let cancelled = false;
    requestOutfit3d(imageUrl)
      .then(next => {
        if (cancelled) return;
        setUrl(next);
        onModel?.(next);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The 3D model failed.');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, onModel, open, url]);

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={`3D · ${title}`}
      description="Drag to turn her around, scroll or pinch to zoom. Made from this picture by TRELLIS.2 — the clothes, shoes and back hold up best; the face is rough."
      size="lg"
      testId="outfit-3d-sheet"
    >
      {error ? (
        <p className="ui-alert-danger type-caption">{error}</p>
      ) : url ? (
        <OutfitModelViewer src={url} alt={title} />
      ) : (
        <p className="type-caption text-[var(--text-muted)]" role="status">
          Building the 3D model — about a minute for a plate, a few for a busy picture…
        </p>
      )}
    </SideSheet>
  );
}
