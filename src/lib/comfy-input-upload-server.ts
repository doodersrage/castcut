import { createHash } from 'node:crypto';
import { contentAddressedInputName } from './comfy-input-name';

/**
 * One way into ComfyUI's input folder for server code: the file is named by its content
 * (`<prefix>-<sha256[:16]>.<ext>`) and not sent again when ComfyUI already has that name.
 *
 * ComfyUI has no "does this input exist" API, but `HEAD /view?type=input` answers 200 with the
 * file's Content-Length (404 when missing) without sending the body. Names seen recently are
 * remembered per ComfyUI URL so a Day of stills does not HEAD the same pose map every slot.
 */

export type ComfyInputUploadKind = 'image' | 'mask';

export type ComfyInputOriginalRef = {
  filename: string;
  type?: string;
  subfolder?: string;
};

export type ComfyInputUploadResult = {
  name: string;
  subfolder: string;
  type: string;
  /** True when ComfyUI already had the file and nothing was sent. */
  reused: boolean;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** How long a name ComfyUI had stays trusted without asking again. */
export const KNOWN_INPUT_TTL_MS = 10 * 60 * 1000;
const KNOWN_INPUT_MAX_PER_HOST = 5000;

const knownInputs = new Map<string, Map<string, number>>();

function hostKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function rememberInput(baseUrl: string, name: string, now = Date.now()): void {
  const key = hostKey(baseUrl);
  let names = knownInputs.get(key);
  if (!names) {
    names = new Map();
    knownInputs.set(key, names);
  }
  names.delete(name);
  names.set(name, now + KNOWN_INPUT_TTL_MS);
  while (names.size > KNOWN_INPUT_MAX_PER_HOST) {
    const oldest = names.keys().next().value;
    if (oldest === undefined) break;
    names.delete(oldest);
  }
}

function isKnownInput(baseUrl: string, name: string, now = Date.now()): boolean {
  const names = knownInputs.get(hostKey(baseUrl));
  const expires = names?.get(name);
  if (expires === undefined) return false;
  if (expires <= now) {
    names?.delete(name);
    return false;
  }
  return true;
}

/** Drop remembered names (all hosts, or one) — after the input folder was cleaned up. */
export function forgetKnownComfyInputs(baseUrl?: string): void {
  if (baseUrl === undefined) {
    knownInputs.clear();
    return;
  }
  knownInputs.delete(hostKey(baseUrl));
}

export function sha256Hex(bytes: Uint8Array, extra?: string): string {
  const hash = createHash('sha256').update(bytes);
  if (extra) {
    hash.update('\0').update(extra);
  }
  return hash.digest('hex');
}

/**
 * True when ComfyUI's input folder has `name` (and, when `expectedBytes` is given, a file of that
 * size). Any failure answers false — the caller then uploads, which is always safe.
 */
export async function comfyInputExists(
  baseUrl: string,
  name: string,
  expectedBytes?: number,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  const params = new URLSearchParams({ filename: name, type: 'input', subfolder: '' });
  try {
    const response = await fetchImpl(`${hostKey(baseUrl)}/view?${params.toString()}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    if (expectedBytes === undefined) return true;
    const length = Number(response.headers.get('content-length'));
    return Number.isFinite(length) && length === expectedBytes;
  } catch {
    return false;
  }
}

/**
 * Upload `bytes` to ComfyUI's input folder under a content-addressed name, or reuse the copy
 * ComfyUI already has. `keepName` sends the file under `filename` exactly (overwrite on), for a
 * caller that needs a fixed name.
 */
export async function uploadComfyInputContent(input: {
  baseUrl: string;
  bytes: Uint8Array;
  filename: string;
  mimeType?: string;
  kind?: ComfyInputUploadKind;
  originalRef?: ComfyInputOriginalRef;
  keepName?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<ComfyInputUploadResult> {
  const baseUrl = hostKey(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const isMask = input.kind === 'mask' && Boolean(input.originalRef?.filename);
  const originalRef = isMask
    ? {
        filename: input.originalRef!.filename,
        type: input.originalRef!.type?.trim() || 'input',
        subfolder: input.originalRef!.subfolder?.trim() || '',
      }
    : undefined;

  const name = input.keepName
    ? input.filename.trim().split(/[\\/]/).pop() || 'upload.png'
    : contentAddressedInputName(
        input.filename,
        // A mask upload saves the original with this mask as alpha: the result depends on both.
        sha256Hex(input.bytes, originalRef ? JSON.stringify(originalRef) : undefined)
      );

  if (!input.keepName) {
    if (isKnownInput(baseUrl, name)) {
      return { name, subfolder: '', type: 'input', reused: true };
    }
    // An image is stored byte for byte, so its size must match too; a mask's result differs.
    if (
      await comfyInputExists(baseUrl, name, isMask ? undefined : input.bytes.byteLength, fetchImpl)
    ) {
      rememberInput(baseUrl, name);
      return { name, subfolder: '', type: 'input', reused: true };
    }
  }

  const body = new Uint8Array(input.bytes.byteLength);
  body.set(input.bytes);
  const form = new FormData();
  form.append('image', new Blob([body], { type: input.mimeType || 'image/png' }), name);
  form.append('overwrite', 'true');
  if (originalRef) {
    form.append('original_ref', JSON.stringify(originalRef));
  }
  const response = await fetchImpl(`${baseUrl}${isMask ? '/upload/mask' : '/upload/image'}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(input.timeoutMs ?? 60000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw Object.assign(
      new Error(text.trim() || `ComfyUI upload returned HTTP ${response.status}`),
      { status: response.status }
    );
  }
  const data = (await response.json()) as { name?: string; subfolder?: string; type?: string };
  const savedName = data.name?.trim();
  if (!savedName) {
    throw new Error('ComfyUI upload did not return a filename.');
  }
  const subfolder = data.subfolder?.trim() || '';
  if (!subfolder && !input.keepName) {
    rememberInput(baseUrl, savedName);
  }
  return { name: savedName, subfolder, type: data.type?.trim() || 'input', reused: false };
}
