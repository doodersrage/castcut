/**
 * How a take's pictures are fetched, put in ComfyUI's input folder and looked for there
 * (FINISHING_PLAN Phase 3). The page's way by default (its /api routes); the server passes
 * picture-io-server.ts's, the same steps with ComfyUI asked directly.
 */
import { loadImageBlobFromUrls } from '@/lib/edit/isolate-subject';
import { comfyInputViewUrl } from '@/lib/face/match-client';
import { resolveQueueInputImage } from '@/lib/queue/input-image';

export type PictureIo = {
  /** The first of `urls` that loads (the page's URL forms: /api/comfyui/view?…, app paths, http). */
  loadBlob: (urls: string[]) => Promise<Blob>;
  /** Put a picture in ComfyUI's input folder: its name there and its size (when known). */
  upload: (
    file: File,
    model?: string
  ) => Promise<{ filename: string; width?: number; height?: number } | undefined>;
  /** Whether ComfyUI still has an input file (an unreachable ComfyUI answers yes: queue finds out). */
  inputExists: (filename: string) => Promise<boolean>;
};

export const PAGE_PICTURE_IO: PictureIo = {
  loadBlob: urls => loadImageBlobFromUrls(urls),
  upload: async (file, model) => {
    const uploaded = await resolveQueueInputImage({ file, filename: file.name, model });
    const filename = uploaded?.filename?.trim();
    return filename
      ? {
          filename,
          ...(uploaded?.width ? { width: uploaded.width } : {}),
          ...(uploaded?.height ? { height: uploaded.height } : {}),
        }
      : undefined;
  },
  inputExists: async filename => {
    const url = comfyInputViewUrl(filename);
    if (!url) return false;
    try {
      // HEAD: the status is all that is needed, not the picture.
      const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
      return response.ok;
    } catch {
      // Offline or blocked: let the queue find out rather than re-render on a guess.
      return true;
    }
  },
};
