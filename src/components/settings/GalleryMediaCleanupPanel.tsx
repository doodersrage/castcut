'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatBytes } from '@/lib/model/files';
import {
  clearThumbnailCache,
  removeGalleryMediaCleanup,
  scanGalleryMediaCleanup,
  type GalleryMediaCleanupScan,
} from '@/lib/gallery/media-cleanup-client';

/**
 * The server's kept copies of renders that are no longer in the Gallery (deleting entries did not
 * remove them before), and the thumbnail cache (gallery-media-cleanup-server.ts).
 */
export default function GalleryMediaCleanupPanel() {
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<GalleryMediaCleanupScan | null>(null);
  const [line, setLine] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setLine(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const find = () =>
    run(async () => {
      setLine(null);
      setScan(await scanGalleryMediaCleanup());
    });

  const remove = () =>
    run(async () => {
      if (!scan || scan.removable.length === 0) return;
      const ok = window.confirm(
        `Remove ${scan.removable.length.toLocaleString()} kept copies (${formatBytes(scan.removableBytes)}) of renders no longer in the Gallery?\n\n` +
          `Copies a Gallery, a Day or Story still or a Cast plate still uses, and copies newer than ${scan.minAgeDays} days, stay. ` +
          'The originals in ComfyUI’s output folder are not touched. This cannot be undone.'
      );
      if (!ok) return;
      const result = await removeGalleryMediaCleanup(scan.removable);
      setLine(
        `Removed ${result.removed.toLocaleString()} copies, ${formatBytes(result.freedBytes)} freed.`
      );
      setScan(await scanGalleryMediaCleanup());
    });

  const clearCache = () =>
    run(async () => {
      const result = await clearThumbnailCache();
      setLine(`Thumbnail cache cleared, ${formatBytes(result.freedBytes)} freed.`);
      setScan(current => (current ? { ...current, viewCacheBytes: 0 } : current));
    });

  return (
    <div className="space-y-2" data-testid="settings-gallery-media-cleanup">
      <p className="text-sm text-[var(--text-secondary)]">
        Deleting or purging Gallery entries now removes their kept copies too. Copies left behind by
        earlier deletes can be found and removed here.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Button type="button" onClick={() => void find()} disabled={busy}>
          Find old copies
        </Button>
        {scan && scan.removable.length > 0 ? (
          <Button type="button" variant="danger" onClick={() => void remove()} disabled={busy}>
            Remove {scan.removable.length.toLocaleString()} ({formatBytes(scan.removableBytes)})
          </Button>
        ) : null}
        {scan?.canClearViewCache && scan.viewCacheBytes > 0 ? (
          <Button type="button" onClick={() => void clearCache()} disabled={busy}>
            Clear thumbnail cache ({formatBytes(scan.viewCacheBytes)})
          </Button>
        ) : null}
      </div>
      {scan ? (
        <p className="text-sm text-[var(--text-primary)]" role="status">
          {scan.removable.length > 0
            ? `${scan.removable.length.toLocaleString()} copies of renders no longer in the Gallery (${formatBytes(scan.removableBytes)}).`
            : 'No old copies to remove.'}{' '}
          Kept: {scan.keptInUse.toLocaleString()} in use
          {scan.keptRecent > 0
            ? `, ${scan.keptRecent.toLocaleString()} newer than ${scan.minAgeDays} days`
            : ''}{' '}
          ({formatBytes(scan.keptBytes)}). The thumbnail cache clears itself (24 h, 1 GB cap).
        </p>
      ) : null}
      {line ? <p className="text-sm text-[var(--text-primary)]">{line}</p> : null}
    </div>
  );
}
