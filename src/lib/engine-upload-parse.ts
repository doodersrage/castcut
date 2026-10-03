import { splitImageDataUrl } from '@/lib/vision-image-prepare';

export type ComfyUploadOriginalRef = {
  filename: string;
  type?: string;
  subfolder?: string;
};

export type ParsedEngineUpload = {
  file: File;
  comfyUrl?: string;
  engineUrl?: string;
  kind?: 'image' | 'mask';
  originalRef?: ComfyUploadOriginalRef;
  /** Upload under the given filename (overwriting) instead of a content-addressed name. */
  keepName?: boolean;
};

const MAX_JSON_IMAGE_CHARS = 35_000_000;
const MAX_MULTIPART_BYTES = 25 * 1024 * 1024;

function normalizeImageDataUrl(value: string, mimeType = 'image/png'): string {
  if (value.startsWith('data:image/')) {
    return value;
  }
  return `data:${mimeType};base64,${value.replace(/^data:.*;base64,/, '')}`;
}

function filenameFromMime(mimeType: string, fallback = 'prompt-studio-upload.png'): string {
  const ext =
    mimeType === 'image/jpeg' || mimeType === 'image/jpg'
      ? 'jpg'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'png';
  const base = fallback.replace(/\.[^.]+$/, '') || 'prompt-studio-upload';
  return `${base}.${ext}`;
}

function fileFromDataUrl(image: string, mimeTypeHint?: string, filenameHint?: string): File {
  const dataUrl = normalizeImageDataUrl(image.trim(), mimeTypeHint?.trim() || 'image/png');
  const { mimeType, base64 } = splitImageDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) {
    throw new Error('Image file is required.');
  }
  if (bytes.length > MAX_MULTIPART_BYTES) {
    throw new Error('Image must be 25MB or smaller.');
  }
  const filename = filenameHint?.trim() || filenameFromMime(mimeType, 'prompt-studio-upload.png');
  return new File([new Uint8Array(bytes)], filename, { type: mimeType });
}

function parseOriginalRef(raw: unknown): ComfyUploadOriginalRef | undefined {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseOriginalRef(JSON.parse(raw) as unknown);
    } catch {
      return undefined;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const filename =
    typeof (raw as { filename?: unknown }).filename === 'string'
      ? (raw as { filename: string }).filename.trim()
      : '';
  if (!filename) {
    return undefined;
  }
  const type =
    typeof (raw as { type?: unknown }).type === 'string'
      ? (raw as { type: string }).type.trim()
      : undefined;
  const subfolder =
    typeof (raw as { subfolder?: unknown }).subfolder === 'string'
      ? (raw as { subfolder: string }).subfolder.trim()
      : undefined;
  return { filename, ...(type ? { type } : {}), ...(subfolder ? { subfolder } : {}) };
}

async function parseMultipartUpload(request: Request): Promise<ParsedEngineUpload> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Failed to parse body as FormData.';
    throw new Error(
      `Could not read the uploaded image (${detail}). Re-upload the figure and try again.`
    );
  }

  const image = formData.get('image');
  if (!(image instanceof File) || image.size === 0) {
    throw new Error('Image file is required.');
  }
  if (image.size > MAX_MULTIPART_BYTES) {
    throw new Error('Image must be 25MB or smaller.');
  }
  if (image.type && !image.type.startsWith('image/') && image.type !== 'application/octet-stream') {
    throw new Error('Upload must be an image file.');
  }

  const comfyUrl = formData.get('comfyUrl')?.toString().trim() || undefined;
  const engineUrl = formData.get('engineUrl')?.toString().trim() || comfyUrl || undefined;
  const kind = formData.get('kind')?.toString().trim() === 'mask' ? 'mask' : undefined;
  const originalRef = parseOriginalRef(formData.get('originalRef')?.toString());
  const keepName = formData.get('keepName')?.toString().trim() === 'true' || undefined;

  return { file: image, comfyUrl, engineUrl, kind, originalRef, ...(keepName ? { keepName } : {}) };
}

async function parseJsonUpload(request: Request): Promise<ParsedEngineUpload> {
  const body = (await request.json()) as {
    image?: string;
    mimeType?: string;
    filename?: string;
    comfyUrl?: string;
    engineUrl?: string;
    kind?: string;
    originalRef?: unknown;
    keepName?: unknown;
  };

  if (!body.image?.trim()) {
    throw new Error('Image data is required.');
  }
  if (body.image.length > MAX_JSON_IMAGE_CHARS) {
    throw new Error('Image payload is too large.');
  }

  const file = fileFromDataUrl(body.image, body.mimeType, body.filename);
  const comfyUrl = body.comfyUrl?.trim() || undefined;
  const engineUrl = body.engineUrl?.trim() || comfyUrl || undefined;
  const kind = body.kind?.trim() === 'mask' ? 'mask' : undefined;
  const originalRef = parseOriginalRef(body.originalRef);
  const keepName = body.keepName === true || undefined;
  return { file, comfyUrl, engineUrl, kind, originalRef, ...(keepName ? { keepName } : {}) };
}

/**
 * Accept JSON data-URL uploads (preferred — avoids Next/undici FormData parse
 * failures) or multipart FormData for older clients.
 */
export async function parseEngineUploadRequest(request: Request): Promise<ParsedEngineUpload> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return parseJsonUpload(request);
  }
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartUpload(request);
  }
  // Some proxies strip Content-Type; try JSON first, then multipart.
  try {
    return await parseJsonUpload(request.clone());
  } catch {
    return parseMultipartUpload(request);
  }
}
