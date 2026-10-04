/**
 * Save or share an assembled film. Kept apart from the assembler (`character-film-assemble.ts`)
 * so a page that only downloads does not pull the encoder in.
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadFilmBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}

/**
 * Prefer Web Share when the browser can share a file; otherwise download.
 * Returns true when the share sheet was used.
 */
export async function shareFilmBlob(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    downloadFilmBlob(blob, filename);
    return false;
  }
  const type = blob.type || 'video/mp4';
  const file = new File([blob], filename, { type });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
        text: 'My Castcut film',
      });
      return true;
    }
  } catch (err) {
    // User cancel should not fall through to a duplicate download.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return false;
    }
  }
  downloadFilmBlob(blob, filename);
  return false;
}
