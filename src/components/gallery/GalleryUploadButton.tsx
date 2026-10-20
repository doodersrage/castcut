'use client';

import { useRef, useState, type ReactNode } from 'react';
import { importLocalImagesToGallery } from '@/lib/gallery/local-import';
import { pushAppToast } from '@/lib/app/toast';

export const GALLERY_UPLOAD_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

export function summarizeGalleryImport(result: {
  imported: number;
  failed: number;
  errors: string[];
}): string {
  if (result.imported > 0 && result.failed === 0) {
    return `Added ${result.imported} image${result.imported === 1 ? '' : 's'} to the gallery.`;
  }
  if (result.imported > 0) {
    return `Added ${result.imported}, skipped ${result.failed}.`;
  }
  return result.errors[0] ?? 'Could not import those images.';
}

export async function runGalleryImageImport(files: File[]): Promise<{
  imported: number;
  failed: number;
  errors: string[];
}> {
  const result = await importLocalImagesToGallery(files);
  if (result.imported > 0) {
    pushAppToast({
      text: summarizeGalleryImport(result),
      tone: result.failed > 0 ? 'warning' : 'success',
    });
  } else if (result.failed > 0) {
    pushAppToast({
      text: summarizeGalleryImport(result),
      tone: 'danger',
    });
  }
  return result;
}

export default function GalleryUploadButton({
  className = 'ui-btn-ghost ui-btn-sm text-xs',
  children = 'Upload images',
  onImported,
}: {
  className?: string;
  children?: ReactNode;
  onImported?: (result: { imported: number; failed: number; errors: string[] }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={GALLERY_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length === 0) {
            return;
          }
          setBusy(true);
          void runGalleryImageImport(files)
            .then(result => onImported?.(result))
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
