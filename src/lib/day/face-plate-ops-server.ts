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
import { isolateSubjectOnWhiteBuffer } from '@/lib/edit/isolate-subject-server';
import { locateFaceInComfy } from '@/lib/face/locate-server';
import { orientedImageSize } from '@/lib/media/image-size-server';
import { loadPictureOnServer } from '@/lib/media/picture-io-server';
import type { DayFacePlateOps } from './vacation-face-crop';

type Fetch = typeof fetch;

export { loadPictureOnServer };

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
