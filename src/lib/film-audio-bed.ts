import { persistGalleryOriginal } from './gallery-media-client';

/** Browser file picker accept list for Cut audio beds. */
export const FILM_AUDIO_BED_ACCEPT =
  'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.flac,.ogg,.m4a,.aac';

/** Prefer durable gallery storage; data-URL fallback stays under this size for JSON assemble. */
export const FILM_AUDIO_BED_MAX_BYTES = 40 * 1024 * 1024;
export const FILM_AUDIO_BED_DATA_URL_MAX_BYTES = 8 * 1024 * 1024;

const AUDIO_EXTENSION = /\.(mp3|wav|flac|ogg|m4a|aac)$/i;

export function isFilmAudioBedFile(file: { type?: string; name?: string; size?: number }): boolean {
  const size = typeof file.size === 'number' ? file.size : 0;
  if (size <= 0 || size > FILM_AUDIO_BED_MAX_BYTES) {
    return false;
  }
  const type = file.type?.trim().toLowerCase() ?? '';
  if (type.startsWith('audio/')) {
    return true;
  }
  return AUDIO_EXTENSION.test(file.name ?? '');
}

export function filmAudioBedRejectReason(file: {
  type?: string;
  name?: string;
  size?: number;
}): string | null {
  const size = typeof file.size === 'number' ? file.size : 0;
  const label = (file.name ?? 'audio').trim() || 'audio';
  if (size <= 0) {
    return `${label}: empty file.`;
  }
  if (size > FILM_AUDIO_BED_MAX_BYTES) {
    return `${label}: too large (max ${Math.round(FILM_AUDIO_BED_MAX_BYTES / (1024 * 1024))}MB).`;
  }
  if (!isFilmAudioBedFile(file)) {
    return `${label}: use MP3, WAV, FLAC, OGG, M4A, or AAC.`;
  }
  return null;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:')) {
        reject(new Error('Could not read that audio file.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read that audio file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Turn a local audio pick into a Cut-ready audioBedUrl.
 * Prefers durable `/api/gallery/media/…` storage; falls back to a data URL when
 * PROMPT_DATA_DIR persist is unavailable and the file is small enough.
 */
export async function resolveFilmAudioBedFromFile(file: File): Promise<{
  url: string;
  label: string;
}> {
  const reject = filmAudioBedRejectReason(file);
  if (reject) {
    throw new Error(reject);
  }
  const label = (file.name || 'audio-bed').trim() || 'audio-bed';
  const entryId = crypto.randomUUID();
  const persisted = await persistGalleryOriginal(entryId, file);
  if (persisted && !persisted.skipped && persisted.originalUrl) {
    return { url: persisted.originalUrl, label };
  }
  if (file.size > FILM_AUDIO_BED_DATA_URL_MAX_BYTES) {
    throw new Error(
      'Could not store that audio bed on the server. Set PROMPT_DATA_DIR, or pick a file under 8MB.'
    );
  }
  const url = await fileToDataUrl(file);
  return { url, label };
}
