import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export const IDENTITY_MEDIA_URL = '/api/gallery/media/identity';

export function isIdentityMediaUrl(url: string): boolean {
  const path = url.trim().split('?')[0] ?? '';
  return path === IDENTITY_MEDIA_URL || path.endsWith('/api/gallery/media/identity');
}

/** Identity persist always rewrites one lock file — bust so <img> does not keep the previous decode. */
export function cacheBustIdentityMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  const [path, query = ''] = trimmed.split('?');
  if (!isIdentityMediaUrl(path)) {
    return trimmed;
  }
  const params = new URLSearchParams(query);
  params.set('v', String(Date.now()));
  return `${path}?${params.toString()}`;
}

/** `index` addresses one output within a multi-image batch entry; omit/0 for the primary output. */
export function durableGalleryThumbUrl(entryId: string, index?: number): string {
  const base = `/api/gallery/media/${encodeURIComponent(entryId)}`;
  return index ? `${base}?index=${index}` : base;
}

export function durableGalleryOriginalUrl(entryId: string, index?: number): string {
  const base = `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`;
  return index ? `${base}&index=${index}` : base;
}

export function isDurableGalleryMediaUrl(url: string): boolean {
  const path = url.trim().split('?')[0] ?? '';
  if (isIdentityMediaUrl(path)) {
    return false;
  }
  return /\/api\/gallery\/media\/[^/]+$/.test(path);
}

/** Uploaded stills live in Studio storage, not Comfy `/view`. */
export function resolveDurableGalleryStillUrl(entry: {
  id?: string;
  durableOriginalPath?: string;
  sourceImageUrl?: string;
}): string | undefined {
  const id = entry.id?.trim();
  if (entry.durableOriginalPath?.trim() && id) {
    return durableGalleryOriginalUrl(id);
  }
  const source = entry.sourceImageUrl?.trim();
  if (source && isDurableGalleryMediaUrl(source)) {
    return source;
  }
  return undefined;
}

type PersistResponse = {
  skipped?: boolean;
  url?: string;
  originalUrl?: string;
  path?: string;
  originalPath?: string;
  error?: string;
};

async function readPersistResponse(response: Response): Promise<PersistResponse | null> {
  if (!response.ok) {
    return null;
  }
  try {
    return (await response.json()) as PersistResponse;
  } catch {
    return null;
  }
}

type PersistedImageResult = {
  thumbUrl: string | null;
  originalUrl: string | null;
  /** Server-relative storage path (e.g. `gallery-media/{owner}/{id}/original-2`) — accurate per index. */
  thumbPath: string | null;
  originalPath: string | null;
};

async function persistGalleryMediaImage(
  entry: Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'comfyUrl' | 'engineId'>,
  image: { filename: string; subfolder?: string; type?: string; format?: string },
  index: number
): Promise<PersistedImageResult | null> {
  try {
    const response = await fetch('/api/gallery/media/persist', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'auto',
        galleryEntryId: entry.id,
        index,
        promptId: entry.promptId,
        comfyUrl: entry.comfyUrl,
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type ?? 'output',
        format: image.format,
        engineId: entry.engineId,
      }),
    });
    const data = await readPersistResponse(response);
    if (!data || data.skipped || !data.originalPath) {
      return null;
    }
    return {
      thumbUrl: data.url ?? null,
      originalUrl: data.originalUrl ?? null,
      thumbPath: data.path ?? null,
      originalPath: data.originalPath ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort: pull every output in the entry (image or video, any engine)
 * into durable storage under PROMPT_DATA_DIR so the gallery survives the
 * source engine cleaning up its own output history — including every frame
 * of a multi-image batch, not just the first. Stills also get a small webp
 * thumb; video, audio, and mesh output is stored as-is (sharp can't resize
 * those). Called once, right after a job completes — see comfyui-gallery-client.ts.
 *
 * Returns arrays parallel to `entry.images` (`null` at an index means that
 * output wasn't persisted — the gallery keeps using the live engine proxy
 * for it). `thumbPaths`/`originalPaths` are the accurate server-relative
 * storage paths (for `ComfyGalleryEntry.durableThumbPaths`/
 * `durableOriginalPaths`); `thumbUrls`/`originalUrls` are ready-to-render
 * URLs. Each image is persisted independently so one failure/skip doesn't
 * block the rest of the batch.
 */
export async function persistGalleryMedia(
  entry: Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'comfyUrl' | 'engineId' | 'images'>
): Promise<{
  thumbUrls: (string | null)[];
  originalUrls: (string | null)[];
  thumbPaths: (string | null)[];
  originalPaths: (string | null)[];
} | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  const images = entry.images ?? [];
  if (images.length === 0 || !images[0]?.filename?.trim()) {
    return null;
  }
  const results = await Promise.all(
    images.map((image, index) =>
      image?.filename?.trim() ? persistGalleryMediaImage(entry, image, index) : null
    )
  );
  if (results.every(result => !result)) {
    return null;
  }
  return {
    thumbUrls: results.map(result => result?.thumbUrl ?? null),
    originalUrls: results.map(result => result?.originalUrl ?? null),
    thumbPaths: results.map(result => result?.thumbPath ?? null),
    originalPaths: results.map(result => result?.originalPath ?? null),
  };
}

/** Persist a user-picked still as the durable original + thumb for a gallery id. */
export async function persistGalleryOriginal(
  entryId: string,
  file: File
): Promise<{
  skipped?: boolean;
  thumbUrl?: string;
  originalUrl?: string;
  thumbPath?: string;
  originalPath?: string;
} | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  const id = entryId.trim();
  if (!id || file.size === 0) {
    return null;
  }
  try {
    const form = new FormData();
    form.append('kind', 'original');
    form.append('galleryEntryId', id);
    form.append('file', file, file.name || 'upload.png');
    const response = await fetch('/api/gallery/media/persist', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const data = await readPersistResponse(response);
    if (!data) {
      return null;
    }
    if (data.skipped) {
      return { skipped: true };
    }
    if (!data.url) {
      return null;
    }
    return {
      thumbUrl: durableGalleryThumbUrl(id),
      originalUrl: data.originalUrl || durableGalleryOriginalUrl(id),
      thumbPath: data.path,
      originalPath: data.originalPath,
    };
  } catch {
    return null;
  }
}

const OWNED_PLATE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Per-Cast look plate file. Replaces only this character, never the identity lock. */
export function castPlateMediaId(characterId: string): string | null {
  const id = `cast-plate-${characterId.trim()}`;
  if (!OWNED_PLATE_ID.test(id) || id === '.' || id === '..') {
    return null;
  }
  return id;
}

/** Session plate for one tool. Separate from the face-lock file and from Cast plates. */
export function sessionPlateMediaId(slot: 'fitting' | 'day' | 'story'): string {
  return `session-plate-${slot}`;
}

function cacheBustOwnedPlateUrl(url: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('v', String(Date.now()));
  return `${path}?${params.toString()}`;
}

/**
 * Store plate bytes under their own gallery id.
 * The identity lock is one file for the face pin — look plates must not use it,
 * or saving one Cast replaces every other Cast still pointing at that URL.
 */
export async function persistOwnedPlateImage(input: {
  mediaId: string;
  file: Blob;
  filename?: string;
}): Promise<string | null> {
  const id = input.mediaId.trim();
  if (!OWNED_PLATE_ID.test(id) || id === '.' || id === '..') {
    return null;
  }
  const filename = input.filename?.trim() || 'plate.png';
  const file =
    input.file instanceof File
      ? input.file
      : new File([input.file], filename, { type: input.file.type || 'image/png' });
  const stored = await persistGalleryOriginal(id, file);
  const url = stored?.originalUrl?.trim();
  return url ? cacheBustOwnedPlateUrl(url) : null;
}

/** Best-effort: store the locked-face bytes under PROMPT_DATA_DIR. */
export async function persistIdentityImage(input: {
  file?: Blob;
  filename?: string;
  galleryEntryId?: string;
  comfyUrl?: string;
  imageFilename?: string;
  subfolder?: string;
  type?: string;
}): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    let response: Response;
    if (input.file) {
      const body = new FormData();
      body.set('kind', 'identity');
      const name = input.filename?.trim() || 'identity.png';
      body.set('file', input.file, name);
      body.set('filename', name);
      response = await fetch('/api/gallery/media/persist', {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
    } else {
      response = await fetch('/api/gallery/media/persist', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'identity',
          galleryEntryId: input.galleryEntryId,
          comfyUrl: input.comfyUrl,
          filename: input.imageFilename,
          subfolder: input.subfolder ?? '',
          type: input.type ?? 'output',
        }),
      });
    }
    const data = await readPersistResponse(response);
    if (!data || data.skipped || !data.url) {
      return null;
    }
    return cacheBustIdentityMediaUrl(data.url);
  } catch {
    return null;
  }
}
