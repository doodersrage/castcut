/**
 * Server-only: measure a reference picture that is about to go out with a still (a ComfyUI
 * input file, or any ComfyUI view URL) — its pixel size (from the file header, no decoder),
 * the faces InsightFace finds on it (face-locate-server.ts) and, for a partner's face, its
 * similarity to the partner's plate and to the lead's (face-match-server.ts). The verdict is
 * `judgeReference` (reference-check.ts). `available: false` when the pixels could not be read;
 * the name-only part of the verdict still applies.
 *
 * Cached per picture (name + byte size, so a file replaced under the same name is read again)
 * and per comparison for an hour: the same face crop goes out with every still of a Day.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import { locateFaceInComfy } from '@/lib/face-locate-server';
import { FaceMatchNoFaceError, measureFaceMatchInComfy } from '@/lib/face-match-server';
import { IMAGE_SIZE_HEADER_BYTES, readImageSize, type ImageSize } from '@/lib/image-size';
import {
  judgeReference,
  type ReferenceCheckResponse,
  type ReferenceFacts,
  type ReferenceRole,
} from '@/lib/reference-check';

export type { ReferenceCheckResponse };

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; facts: ReferenceFacts }>();

export function clearReferenceCheckServerCache(): void {
  cache.clear();
}

function viewUrlFor(ref: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return `/api/comfyui/view?${params.toString()}`;
}

/** Size and byte count of a ComfyUI image: HEAD for the length, then only the header bytes. */
async function readComfyImageHeader(
  baseUrl: string,
  ref: ComfyImageRef
): Promise<{ size: ImageSize; bytes: number } | null> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const url = `${baseUrl}/view?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) return null;
  const length = Number(response.headers.get('content-length'));
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let size: ImageSize | null = null;
  try {
    while (total < IMAGE_SIZE_HEADER_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      const joined = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        joined.set(chunk, at);
        at += chunk.byteLength;
      }
      size = readImageSize(joined);
      if (size) break;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (!size) return null;
  return { size, bytes: Number.isFinite(length) && length > 0 ? length : total };
}

async function similarityTo(
  referenceUrl: string | undefined,
  imageUrl: string,
  comfyUrl: string | undefined
): Promise<number | null | undefined> {
  const reference = referenceUrl?.trim();
  if (!reference) return undefined;
  try {
    const match = await measureFaceMatchInComfy({
      referenceUrl: reference,
      imageUrl,
      comfyUrl,
      timeoutMs: 60_000,
    });
    return match.available ? match.similarity : null;
  } catch (error) {
    if (!(error instanceof FaceMatchNoFaceError)) {
      console.warn(
        'Reference check: face match did not run:',
        error instanceof Error ? error.message : error
      );
    }
    return null;
  }
}

export async function checkReferenceInComfy(input: {
  role: ReferenceRole;
  filename?: string;
  imageUrl?: string;
  comfyUrl?: string;
  partnerReferenceUrl?: string;
  leadReferenceUrl?: string;
  subject?: string;
}): Promise<ReferenceCheckResponse> {
  const started = Date.now();
  const filename = input.filename?.trim();
  const ref: ComfyImageRef | null = filename
    ? {
        filename: filename.split('/').pop() ?? filename,
        subfolder: filename.includes('/') ? filename.slice(0, filename.lastIndexOf('/')) : '',
        type: 'input',
      }
    : input.imageUrl
      ? parseComfyViewRef(input.imageUrl)
      : null;
  const nameForVerdict = filename || input.imageUrl || '';
  const unavailable = (reason: string): ReferenceCheckResponse => ({
    available: false,
    reason,
    verdict: judgeReference(input.role, null, {
      filename: nameForVerdict,
      subject: input.subject,
      unavailableReason: reason,
    }),
    ms: Date.now() - started,
  });
  if (!ref) return unavailable('Not a ComfyUI picture.');
  // A `cast-plate-…` file is never a face: no need to read the pixels for that answer.
  const byName = judgeReference(input.role, null, {
    filename: nameForVerdict,
    subject: input.subject,
  });
  if (byName.status === 'mismatch') {
    return { available: true, verdict: byName, ms: Date.now() - started };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  let header: { size: ImageSize; bytes: number } | null;
  try {
    header = await readComfyImageHeader(baseUrl, ref);
  } catch (error) {
    return unavailable(
      error instanceof Error && /abort|timeout/i.test(error.message)
        ? 'ComfyUI did not answer.'
        : 'ComfyUI is offline.'
    );
  }
  if (!header) return unavailable('The picture could not be read from ComfyUI.');
  const viewUrl = viewUrlFor(ref);
  const partnerRef = input.role === 'partner-face' ? input.partnerReferenceUrl?.trim() || '' : '';
  const leadRef = input.role === 'partner-face' ? input.leadReferenceUrl?.trim() || '' : '';
  const key = [
    baseUrl,
    ref.type,
    ref.subfolder,
    ref.filename,
    header.bytes,
    partnerRef,
    leadRef,
  ].join('\u0000');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return {
      available: true,
      facts: hit.facts,
      verdict: judgeReference(input.role, hit.facts, {
        filename: nameForVerdict,
        subject: input.subject,
      }),
      ms: Date.now() - started,
      cached: true,
    };
  }
  const located = await locateFaceInComfy({
    imageUrl: viewUrl,
    width: header.size.width,
    height: header.size.height,
    comfyUrl: input.comfyUrl,
  });
  if (!located.available) return unavailable(located.reason);
  const facts: ReferenceFacts = {
    width: header.size.width,
    height: header.size.height,
    faces: located.face ? (located.faces ?? 1) : 0,
    face: located.face,
  };
  if (input.role === 'partner-face' && located.face && (partnerRef || leadRef)) {
    const [partner, lead] = await Promise.all([
      similarityTo(partnerRef || undefined, viewUrl, input.comfyUrl),
      similarityTo(leadRef || undefined, viewUrl, input.comfyUrl),
    ]);
    facts.similarity = {
      ...(partner !== undefined ? { partner } : {}),
      ...(lead !== undefined ? { lead } : {}),
    };
  }
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), facts });
  return {
    available: true,
    facts,
    verdict: judgeReference(input.role, facts, {
      filename: nameForVerdict,
      subject: input.subject,
    }),
    ms: Date.now() - started,
  };
}
