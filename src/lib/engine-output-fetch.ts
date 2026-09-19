import 'server-only';

/**
 * Fetch engine output bytes in-process (ComfyUI / Diffusers / cloud).
 * Shared by gallery media persist and archive jobs.
 */

import { getComfyUiBaseUrl } from './comfyui-client';
import { stripEmptyComfyUiRuntime } from './comfyui-config';

export type FetchedEngineBuffer = { buffer: Buffer; contentType: string };

export async function fetchEngineOutputBuffer(input: {
  engineId?: string;
  engineUrl?: string;
  promptId?: string;
  filename: string;
  subfolder: string;
  type: 'output' | 'input' | 'temp';
}): Promise<FetchedEngineBuffer | null> {
  const engineId = input.engineId?.trim() || 'comfyui';

  if (engineId === 'fal' || engineId === 'replicate') {
    const file =
      engineId === 'fal'
        ? await (
            await import('@/lib/fal-client')
          ).ensureFalOutput({
            promptId: input.promptId,
            filename: input.filename,
            subfolder: input.subfolder,
          })
        : await (
            await import('@/lib/replicate-client')
          ).ensureReplicateOutput({
            promptId: input.promptId,
            filename: input.filename,
            subfolder: input.subfolder,
          });
    if (!file) {
      return null;
    }
    return { buffer: Buffer.from(file.bytes), contentType: file.mimeType };
  }

  if (engineId === 'openai' || engineId === 'gemini' || engineId === 'grok') {
    const { ensureLlmImageOutput } = await import('@/lib/llm-image-client');
    const file = await ensureLlmImageOutput({
      engineId,
      filename: input.filename,
      subfolder: input.subfolder,
    });
    if (!file) {
      return null;
    }
    return { buffer: Buffer.from(file.bytes), contentType: file.mimeType };
  }

  if (engineId === 'diffusers') {
    const { getDiffusersBaseUrl } = await import('@/lib/diffusers-client');
    const engineUrl = getDiffusersBaseUrl(input.engineUrl);
    const upstream = new URL(`${engineUrl}/v1/view`);
    upstream.searchParams.set('filename', input.filename);
    upstream.searchParams.set('subfolder', input.subfolder);
    upstream.searchParams.set('type', input.type);
    const response = await fetch(upstream.toString(), { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Diffusers view returned HTTP ${response.status}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: input.engineUrl });
  const comfyUrl = getComfyUiBaseUrl(runtime);
  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set('filename', input.filename);
  viewUrl.searchParams.set('subfolder', input.subfolder);
  viewUrl.searchParams.set('type', input.type);
  const response = await fetch(viewUrl.toString(), {
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new Error(`ComfyUI view returned HTTP ${response.status}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}
