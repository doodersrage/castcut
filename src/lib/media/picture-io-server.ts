/**
 * A take's pictures on the server (FINISHING_PLAN Phase 3; picture-io.ts): fetched from ComfyUI's
 * /view (else the app's kept copy, as /api/comfyui/view answers) or the app's own origin, uploaded
 * as /api/comfyui/upload does (named by content, a copy kept), looked for with HEAD /view.
 */
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import { orientedImageSize } from '@/lib/media/image-size-server';
import { readComfyInputCopy } from '@/lib/comfyui/input-store-server';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from '@/lib/server/url-safety';
import type { PictureIo } from './picture-io';

type Fetch = typeof fetch;

/** The bytes behind one of the page's picture URLs, read without the page. */
export async function loadPictureOnServer(
  url: string,
  /** `appOrigin`: where the app's own paths (/wardrobe-thumbs/…, /api/…) are fetched from. */
  options: { comfyUrl?: string; appOrigin?: string; fetchImpl?: Fetch } = {}
): Promise<Blob | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(?:https?:|data:)/i.test(trimmed)) {
    const response = await fetchImpl(trimmed).catch(() => null);
    return response?.ok ? response.blob() : null;
  }
  // The page's ComfyUI proxy (/api/comfyui/view?filename=…): ComfyUI's own /view.
  const parsed = new URL(trimmed, 'http://castcut.invalid');
  if (parsed.pathname.replace(/\/$/, '') !== '/api/comfyui/view') {
    // Another of the app's own paths: a static file of the app is read from its public folder
    // (behind a proxy the page's origin may not be reachable from here), else fetched.
    if (!trimmed.startsWith('/')) return null;
    if (!parsed.pathname.startsWith('/api/')) {
      const file = await readPublicFile(parsed.pathname);
      if (file) return file;
    }
    if (!options.appOrigin) return null;
    const response = await fetchImpl(new URL(trimmed, options.appOrigin).toString()).catch(
      () => null
    );
    return response?.ok ? response.blob() : null;
  }
  const ref = {
    filename: sanitizeComfyViewFilename(parsed.searchParams.get('filename') ?? ''),
    subfolder: sanitizeComfyViewSubfolder(parsed.searchParams.get('subfolder') ?? ''),
    type: normalizeComfyViewType(parsed.searchParams.get('type')?.trim() || 'output'),
  };
  const base = getComfyUiBaseUrl(
    stripEmptyComfyUiRuntime({
      apiUrl: parsed.searchParams.get('comfyUrl') ?? options.comfyUrl ?? undefined,
    })
  );
  const view = new URL(`${base}/view`);
  view.searchParams.set('filename', ref.filename);
  view.searchParams.set('subfolder', ref.subfolder);
  view.searchParams.set('type', ref.type);
  const response = await fetchImpl(view.toString(), { signal: AbortSignal.timeout(30_000) }).catch(
    () => null
  );
  if (response?.ok) return response.blob();
  // ComfyUI lost it (a restart, a cleaned input folder): the copy the app kept.
  if (ref.type !== 'temp') {
    const copy = readComfyInputCopy(ref);
    if (copy) return new Blob([new Uint8Array(copy)], { type: 'image/png' });
  }
  return null;
}

/**
 * Photos only: the server's canvas does not draw an SVG as a browser does (the app's SVGs are
 * icons, never a plate — e2e fixtures use one as a stand-in plate, fetched as before).
 */
const PUBLIC_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** A picture in the app's public folder by its path (/wardrobe-thumbs/…), or null. */
async function readPublicFile(pathname: string): Promise<Blob | null> {
  const { extname, join, normalize, sep } = await import('node:path');
  const type = PUBLIC_TYPES[extname(pathname).toLowerCase()];
  if (!type) return null;
  const root = join(process.cwd(), 'public');
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const full = normalize(join(root, decoded));
  if (!full.startsWith(root + sep)) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    return new Blob([new Uint8Array(await readFile(full))], { type });
  } catch {
    return null;
  }
}

export function serverPictureIo(
  options: { comfyUrl?: string; appOrigin?: string; fetchImpl?: Fetch } = {}
): PictureIo {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = () =>
    getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: options.comfyUrl })).replace(/\/+$/, '');
  return {
    loadBlob: async urls => {
      for (const url of urls) {
        const blob = await loadPictureOnServer(url, options).catch(() => null);
        if (blob && blob.size > 0) return blob;
      }
      throw new Error('Could not load the picture.');
    },
    upload: async file => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const uploaded = await uploadComfyInputContent({
        baseUrl: base(),
        bytes,
        filename: file.name,
        mimeType: file.type,
        keepCopy: true,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl as never } : {}),
      });
      const size = await orientedImageSize(bytes);
      return { filename: uploaded.name, ...(size ?? {}) };
    },
    inputExists: async filename => {
      const slash = filename.lastIndexOf('/');
      const view = new URL(`${base()}/view`);
      view.searchParams.set('filename', slash >= 0 ? filename.slice(slash + 1) : filename);
      view.searchParams.set('subfolder', slash >= 0 ? filename.slice(0, slash) : '');
      view.searchParams.set('type', 'input');
      try {
        const response = await fetchImpl(view.toString(), {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch {
        return true;
      }
    },
  };
}
