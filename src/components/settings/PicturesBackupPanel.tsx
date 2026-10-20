'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  downloadPicturesBackup,
  restorePicturesBackup,
  type MediaRestoreProgress,
} from '@/lib/storage/media-backup-client';

function gb(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;
}

function progressLine(progress: MediaRestoreProgress): string {
  if (progress.phase === 'upload') {
    return `Uploading ${gb(progress.sent)} of ${gb(progress.total)}…`;
  }
  const { status } = progress;
  const pct = status.bytesTotal > 0 ? Math.floor((status.bytesDone / status.bytesTotal) * 100) : 0;
  return `Unpacking ${pct}% — ${status.galleryFiles} Gallery files, ${status.comfyUploaded} ComfyUI pictures, ${status.skipped} already here`;
}

/**
 * The files the JSON backup only names: Gallery copies, the identity lock, and the ComfyUI
 * pictures the Cast and plates use (media-backup-server.ts).
 */
export default function PicturesBackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const download = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const { comfyFiles } = await downloadPicturesBackup();
      setLine(
        `Download started: Gallery copies plus ${comfyFiles} ComfyUI pictures from the Cast and plates. A large Gallery takes a while — let it finish.`
      );
    } catch (error) {
      setLine(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    setBusy(true);
    setErrors([]);
    try {
      const status = await restorePicturesBackup(file, progress => setLine(progressLine(progress)));
      if (status.state === 'failed') {
        setLine(`Restore failed: ${status.message ?? 'unknown error'}`);
      } else {
        setLine(
          `Restored ${status.galleryFiles} Gallery files, ${status.identityFiles} identity files and ${status.comfyUploaded} ComfyUI pictures (${status.skipped} were already here). Reload the page.`
        );
      }
      setErrors(status.errors);
    } catch (error) {
      setLine(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-2" data-testid="settings-pictures-backup">
      <p className="text-sm text-[var(--text-secondary)]">
        The backup above holds names, not pictures. This one holds the files: the Gallery&apos;s
        kept copies of your renders and the ComfyUI pictures your Cast and plates use. Moving to a
        new server: import the backup above first, then restore this one there.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Button type="button" onClick={() => void download()} disabled={busy}>
          Download pictures backup
        </Button>
        <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          Restore pictures backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".tar,application/x-tar"
          className="sr-only"
          aria-label="Pictures backup file"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
          }}
        />
      </div>
      {line ? (
        <p className="text-sm text-[var(--text-primary)]" role="status">
          {line}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <details className="text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">{errors.length} files could not be restored</summary>
          <ul className="mt-1 break-words font-mono">
            {errors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
