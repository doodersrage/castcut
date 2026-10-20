'use client';

import { useState } from 'react';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { galleryNeedsLookReasons } from '@/lib/gallery/needs-look';

/** At most this many re-queued in one go (each is a render). */
const REDO_MAX = 24;

/**
 * "Redo these" beside the Needs a look filter: every finished still or clip that needs a look
 * (in the Cast filter, when one is picked) goes back to the queue on a new seed, once each.
 */
export default function GalleryRedoNeedsLook({ castId }: { castId?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done] = useState(() => new Set<string>());

  const redo = async () => {
    const wanted = castId?.trim();
    const entries = loadComfyGallery()
      .filter(
        entry =>
          entry.status === 'completed' &&
          (!wanted || entry.characterId === wanted) &&
          !done.has(entry.promptId) &&
          galleryNeedsLookReasons(entry).length > 0
      )
      .slice(0, REDO_MAX);
    if (!entries.length) {
      setStatus('Nothing left to redo here.');
      return;
    }
    setBusy(true);
    const { requeueComfyJobFromEntry } = await import('@/lib/comfyui/requeue');
    let queued = 0;
    for (const [index, entry] of entries.entries()) {
      setStatus(`Re-queueing ${index + 1} of ${entries.length}…`);
      const result = await requeueComfyJobFromEntry(entry, { newSeed: true }).catch(() => null);
      if (result?.ok) {
        queued += 1;
        done.add(entry.promptId);
      }
    }
    setBusy(false);
    setStatus(`${queued} of ${entries.length} back in the queue on a new seed.`);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="ui-text-link type-caption"
        disabled={busy}
        data-testid="gallery-redo-needs-look"
        title="Re-queue every still or clip that needs a look, on a new seed (up to 24 at a time)"
        onClick={() => void redo()}
      >
        Redo these
      </button>
      {status ? <span className="type-caption text-[var(--text-muted)]">{status}</span> : null}
    </span>
  );
}
