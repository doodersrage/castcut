/**
 * ComfyUI WebSocket binary preview protocol (big-endian):
 *   type 1 PREVIEW_IMAGE:
 *     bytes 0–3: event type (1)
 *     bytes 4–7: image type (1 = JPEG, 2 = PNG)
 *     bytes 8+:  image payload
 *   type 4 PREVIEW_IMAGE_WITH_METADATA:
 *     bytes 0–3: event type (4)
 *     bytes 4–7: metadata JSON byte length
 *     bytes 8–8+N: UTF-8 metadata JSON (may include image_type / prompt_id)
 *     bytes 8+N+: image payload (JPEG/PNG)
 */

export const COMFY_PREVIEW_EVENT_IMAGE = 1;
export const COMFY_PREVIEW_EVENT_IMAGE_WITH_METADATA = 4;
export const COMFY_PREVIEW_IMAGE_JPEG = 1;
export const COMFY_PREVIEW_IMAGE_PNG = 2;

export type ComfyPreviewBinaryParsed = {
  mimeType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
  promptId?: string;
};

function sniffImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

function mimeFromImageType(imageType: number): 'image/jpeg' | 'image/png' {
  return imageType === COMFY_PREVIEW_IMAGE_PNG ? 'image/png' : 'image/jpeg';
}

export function parseComfyPreviewBinary(
  data: ArrayBuffer | ArrayBufferView
): ComfyPreviewBinaryParsed | null {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength < 9) {
    return null;
  }

  const eventType = view.getUint32(0, false);

  if (eventType === COMFY_PREVIEW_EVENT_IMAGE) {
    const imageType = view.getUint32(4, false);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + 8, view.byteLength - 8);
    if (bytes.byteLength === 0) {
      return null;
    }
    return { mimeType: mimeFromImageType(imageType), bytes };
  }

  if (eventType === COMFY_PREVIEW_EVENT_IMAGE_WITH_METADATA) {
    const metadataLength = view.getUint32(4, false);
    if (
      !Number.isFinite(metadataLength) ||
      metadataLength < 0 ||
      view.byteLength < 8 + metadataLength + 1
    ) {
      return null;
    }
    const metadataBytes = new Uint8Array(view.buffer, view.byteOffset + 8, metadataLength);
    let promptId: string | undefined;
    let mimeType: 'image/jpeg' | 'image/png' | null = null;
    try {
      const metadata = JSON.parse(new TextDecoder().decode(metadataBytes)) as {
        prompt_id?: string;
        image_type?: string;
      };
      if (typeof metadata.prompt_id === 'string' && metadata.prompt_id.trim()) {
        promptId = metadata.prompt_id.trim();
      }
      if (metadata.image_type === 'image/png' || metadata.image_type === 'png') {
        mimeType = 'image/png';
      } else if (
        metadata.image_type === 'image/jpeg' ||
        metadata.image_type === 'jpeg' ||
        metadata.image_type === 'jpg'
      ) {
        mimeType = 'image/jpeg';
      }
    } catch {
      // ignore bad metadata; still try to decode image bytes
    }

    const bytes = new Uint8Array(
      view.buffer,
      view.byteOffset + 8 + metadataLength,
      view.byteLength - 8 - metadataLength
    );
    if (bytes.byteLength === 0) {
      return null;
    }
    mimeType = mimeType ?? sniffImageMime(bytes) ?? 'image/jpeg';
    return { mimeType, bytes, promptId };
  }

  return null;
}

export function comfyPreviewBinaryToObjectUrl(
  data: ArrayBuffer | ArrayBufferView
): { url: string; promptId?: string } | null {
  const parsed = parseComfyPreviewBinary(data);
  if (!parsed) {
    return null;
  }
  const copy = new Uint8Array(parsed.bytes);
  const blob = new Blob([copy], { type: parsed.mimeType });
  return { url: URL.createObjectURL(blob), promptId: parsed.promptId };
}
