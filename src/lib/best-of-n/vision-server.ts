import 'server-only';

import { rankImagesWithVision } from './rank-server';
import { getComfyUiBaseUrl } from '../comfyui/client';
import { buildComfyViewPath, type ComfyOutputImage } from '../comfyui/outputs';
import { getComfyUiPromptStatus } from '../comfyui/status';
import { mapWithConcurrency } from '../queue/concurrency';

export type ServerVisionCandidate = {
  id: string;
  promptId: string;
  prompt: string;
  imageDataUrl: string;
};

async function fetchComfyImageDataUrl(
  comfyUrl: string,
  image: ComfyOutputImage
): Promise<string | null> {
  try {
    const url = buildComfyViewPath(comfyUrl, image);
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function waitForServerComfyPrompts(input: {
  promptIds: string[];
  prompts: string[];
  comfyUrl?: string;
  timeoutMs?: number;
  pollMs?: number;
  onProgress?: (completed: number, total: number) => void;
}): Promise<ServerVisionCandidate[]> {
  const comfyUrl = (input.comfyUrl ?? getComfyUiBaseUrl()).replace(/\/+$/, '');
  const wanted = input.promptIds.map(id => id.trim()).filter(Boolean);
  if (wanted.length === 0) {
    return [];
  }

  const promptById = new Map(
    wanted.map((promptId, index) => [promptId, input.prompts[index]?.trim() ?? ''])
  );
  const timeoutMs = input.timeoutMs ?? 20 * 60_000;
  const pollMs = input.pollMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const completed = new Map<string, ServerVisionCandidate>();

  while (Date.now() < deadline && completed.size < wanted.length) {
    // Each pending prompt's status/image check is independent of the others — was previously
    // checked one at a time per tick, which meant a tick's wall-clock cost scaled with however
    // many prompts were still outstanding. Bounded concurrency here keeps a single slow/stalled
    // ComfyUI request from serializing behind the rest.
    const pending = wanted.filter(promptId => !completed.has(promptId));
    const results = await mapWithConcurrency(pending, 8, async promptId => {
      const status = await getComfyUiPromptStatus(promptId, { apiUrl: comfyUrl });
      if (status.status !== 'completed' || !status.images?.length) {
        return null;
      }
      const imageDataUrl = await fetchComfyImageDataUrl(comfyUrl, status.images[0]);
      if (!imageDataUrl) {
        return null;
      }
      const candidate: ServerVisionCandidate = {
        id: promptId,
        promptId,
        prompt: promptById.get(promptId) ?? '',
        imageDataUrl,
      };
      return candidate;
    });
    let newlyCompleted = 0;
    for (const candidate of results) {
      if (candidate) {
        completed.set(candidate.promptId, candidate);
        newlyCompleted += 1;
      }
    }
    if (newlyCompleted > 0) {
      input.onProgress?.(completed.size, wanted.length);
    }
    if (completed.size >= wanted.length) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  return wanted
    .map(promptId => completed.get(promptId))
    .filter((entry): entry is ServerVisionCandidate => Boolean(entry));
}

export async function runServerPostQueueVisionCull(input: {
  promptIds: string[];
  prompts: string[];
  keep: number;
  comfyUrl?: string;
  onProgress?: (phase: 'waiting' | 'ranking' | 'done', detail?: string) => void;
}): Promise<{
  keptPromptIds: string[];
  keptCandidates: ServerVisionCandidate[];
  culledPromptIds: string[];
}> {
  const keep = Math.max(1, Math.floor(input.keep));
  input.onProgress?.('waiting');
  const candidates = await waitForServerComfyPrompts({
    promptIds: input.promptIds,
    prompts: input.prompts,
    comfyUrl: input.comfyUrl,
    onProgress: (completed, total) =>
      input.onProgress?.('waiting', `${completed}/${total} outputs ready`),
  });

  if (candidates.length <= keep) {
    return {
      keptPromptIds: candidates.map(entry => entry.promptId),
      keptCandidates: candidates,
      culledPromptIds: [],
    };
  }

  input.onProgress?.('ranking');
  const ranked = await rankImagesWithVision(candidates, keep);
  const keptIds = new Set(ranked.map(entry => entry.id));
  const keptCandidates = candidates.filter(entry => keptIds.has(entry.id));
  const culledPromptIds = candidates
    .filter(entry => !keptIds.has(entry.id))
    .map(entry => entry.promptId);

  input.onProgress?.('done', `kept ${keptCandidates.length}, culled ${culledPromptIds.length}`);
  return {
    keptPromptIds: keptCandidates.map(entry => entry.promptId),
    keptCandidates,
    culledPromptIds,
  };
}
