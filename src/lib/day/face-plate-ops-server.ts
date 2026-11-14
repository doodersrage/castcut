/**
 * A face plate's steps on the server (FINISHING_PLAN Phase 3): the pictures fetched from ComfyUI
 * (its /view, else the app's kept copy, as /api/comfyui/view answers), the face found by ComfyUI
 * directly, the cut-out matted on the server and uploaded as /api/comfyui/upload does. Passed to
 * resolveDayVacationFaceBreakPlate as `ops`; the crop itself is drawn on the off-page canvas.
 */
import '@/lib/media/off-page-canvas-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import { readComfyInputCopy } from '@/lib/comfyui/input-store-server';
import { isolateSubjectOnWhiteBuffer } from '@/lib/edit/isolate-subject-server';
import { locateFaceInComfy } from '@/lib/face/locate-server';
import { orientedImageSize } from '@/lib/media/image-size-server';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from '@/lib/server/url-safety';
import type { DayFacePlateOps } from './vacation-face-crop';

type Fetch = typeof fetch;

/** The bytes behind one of the page's picture URLs, read without the page. */
export async function loadPictureOnServer(
  url: string,
  options: { comfyUrl?: string; fetchImpl?: Fetch } = {}
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
  if (parsed.pathname.replace(/\/$/, '') !== '/api/comfyui/view') return null;
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

/** The face plate's steps for a run on the server, against `comfyUrl` (else the configured one). */
export function serverFacePlateOps(
  options: { comfyUrl?: string; fetchImpl?: Fetch } = {}
): DayFacePlateOps {
  const base = () =>
    getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: options.comfyUrl })).replace(/\/+$/, '');
  return {
    loadBlob: async urls => {
      for (const url of urls) {
        const blob = await loadPictureOnServer(url, options).catch(() => null);
        if (blob && blob.size > 0) return blob;
      }
      throw new Error('Could not load the picture for the face plate.');
    },
    locate: async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const size = await orientedImageSize(bytes);
      if (!size) return null;
      return locateFaceInComfy({
        bytes,
        mimeType: blob.type || 'image/png',
        width: size.width,
        height: size.height,
        comfyUrl: base(),
      });
    },
    isolateOnWhite: async file => {
      try {
        const png = await isolateSubjectOnWhiteBuffer(file, { comfyUrl: base() });
        return new File([new Uint8Array(png)], file.name, { type: 'image/png' });
      } catch {
        return file;
      }
    },
    upload: async (file, _model, comfyUrl) => {
      const uploaded = await uploadComfyInputContent({
        baseUrl: comfyUrl?.trim() || base(),
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        mimeType: file.type,
        keepCopy: true,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl as never } : {}),
      });
      return uploaded.name;
    },
  };
}
