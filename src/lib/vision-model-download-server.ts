/**
 * Server-only: download a vision model into LM Studio for still review, the shoe check and the
 * adult check — the one part of setup that sat outside the app (LM Studio's REST API:
 * POST /api/v1/models/download, GET /api/v1/models/download/status/:job_id). Only the curated
 * models below; LM Studio fetches the model and its vision projector (mmproj).
 */

import { getLlmConfig } from '@/lib/llm-client';
import { clearVisionModelCache } from '@/lib/vision-model-auto';

export type VisionModelChoice = {
  id: string;
  label: string;
  /** What LM Studio downloads (a Hugging Face repo URL). */
  model: string;
  quantization: string;
  /** Approximate download, model + vision projector. */
  sizeGb: number;
  note: string;
};

export const VISION_MODEL_CHOICES: readonly VisionModelChoice[] = [
  {
    id: 'nsfwvision-qwen3-vl-8b',
    label: 'NSFWVision Qwen3-VL 8B',
    model: 'https://huggingface.co/GitMylo/nsfwvision-qwen3-vl-8b-v3-gguf',
    quantization: 'Q4_K_M',
    sizeGb: 6.2,
    note: "What Castcut's checks were tuned on; reads adult stills too.",
  },
  {
    id: 'qwen3-vl-8b-instruct',
    label: 'Qwen3-VL 8B Instruct',
    model: 'https://huggingface.co/lmstudio-community/Qwen3-VL-8B-Instruct-GGUF',
    quantization: 'Q4_K_M',
    sizeGb: 6.2,
    note: 'General purpose; may refuse to describe adult stills.',
  },
];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function lmStudioOrigin(baseUrl = getLlmConfig().baseUrl): string | null {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

/** The LLM server is LM Studio (its REST API answers with a model list). */
export async function detectLmStudio(fetchImpl: FetchLike = fetch): Promise<string | null> {
  const origin = lmStudioOrigin();
  if (!origin) return null;
  try {
    const response = await fetchImpl(`${origin}/api/v1/models`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { models?: unknown };
    return Array.isArray(body.models) ? origin : null;
  } catch {
    return null;
  }
}

export type VisionDownloadState = {
  jobId: string | null;
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'already_downloaded' | 'unknown';
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
};

const STATUSES = new Set(['downloading', 'paused', 'completed', 'failed', 'already_downloaded']);

export function parseVisionDownloadState(payload: unknown): VisionDownloadState {
  const body = (payload ?? {}) as Record<string, unknown>;
  const status =
    typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : 'unknown';
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    jobId: typeof body.job_id === 'string' && body.job_id ? body.job_id : null,
    status: status as VisionDownloadState['status'],
    ...(num(body.downloaded_bytes) !== undefined
      ? { downloadedBytes: num(body.downloaded_bytes) }
      : {}),
    ...(num(body.total_size_bytes) !== undefined ? { totalBytes: num(body.total_size_bytes) } : {}),
    ...(num(body.bytes_per_second) !== undefined
      ? { bytesPerSecond: num(body.bytes_per_second) }
      : {}),
  };
}

async function lmStudioJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<unknown> {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message || `LM Studio answered HTTP ${response.status}.`);
  }
  return body;
}

/** Start downloading one of the curated models (or learn it is there already). */
export async function startVisionModelDownload(
  choiceId: string,
  fetchImpl: FetchLike = fetch
): Promise<VisionDownloadState> {
  const choice = VISION_MODEL_CHOICES.find(entry => entry.id === choiceId);
  if (!choice) throw new Error('Unknown vision model.');
  const origin = await detectLmStudio(fetchImpl);
  if (!origin) throw new Error('The LLM server is not LM Studio (or is not running).');
  const state = parseVisionDownloadState(
    await lmStudioJson(
      `${origin}/api/v1/models/download`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: choice.model, quantization: choice.quantization }),
      },
      fetchImpl
    )
  );
  if (state.status === 'already_downloaded' || state.status === 'completed')
    clearVisionModelCache();
  return state;
}

export async function visionModelDownloadStatus(
  jobId: string,
  fetchImpl: FetchLike = fetch
): Promise<VisionDownloadState> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(jobId)) throw new Error('Invalid job id.');
  const origin = await detectLmStudio(fetchImpl);
  if (!origin) throw new Error('The LLM server is not LM Studio (or is not running).');
  const state = parseVisionDownloadState(
    await lmStudioJson(
      `${origin}/api/v1/models/download/status/${encodeURIComponent(jobId)}`,
      { method: 'GET', cache: 'no-store' },
      fetchImpl
    )
  );
  if (state.status === 'completed') clearVisionModelCache();
  return state;
}
