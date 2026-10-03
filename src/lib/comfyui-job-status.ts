import type { ComfyGalleryJobStatus } from './comfyui-gallery';

import { engineDisplayName } from './engine/capabilities';

export type ComfyUiJobTrackerState = {
  promptId: string;
  status: ComfyGalleryJobStatus;
  statusMessage?: string;
  comfyUrl?: string;
  /** Which backend queued this job (drives status copy). */
  engineId?: import('./engine/types').EngineId;
  /** 1-based position in ComfyUI pending queue; 0 means running now. */
  queuePosition?: number | null;
  imageCount?: number;
  /** Current sampler/node progress value from ComfyUI WebSocket. */
  progressValue?: number;
  /** Progress denominator (e.g. total steps). */
  progressMax?: number;
  /** Active ComfyUI node id when known. */
  progressNode?: string | null;
  /** Object URL for the latest live latent preview frame. */
  previewUrl?: string | null;
};

export function comfyUiJobEngineLabel(
  job: Pick<ComfyUiJobTrackerState, 'engineId' | 'statusMessage'>
): string {
  if (job.engineId) {
    return engineDisplayName(job.engineId);
  }
  if (job.statusMessage?.toLowerCase().includes('diffusers')) {
    return 'Diffusers';
  }
  if (job.statusMessage?.toLowerCase().includes('fal')) {
    return 'Fal';
  }
  if (job.statusMessage?.toLowerCase().includes('replicate')) {
    return 'Replicate';
  }
  if (
    job.statusMessage?.toLowerCase().includes('openai') ||
    job.statusMessage?.toLowerCase().includes('chatgpt')
  ) {
    return 'ChatGPT';
  }
  if (job.statusMessage?.toLowerCase().includes('gemini')) {
    return 'Gemini';
  }
  if (job.statusMessage?.toLowerCase().includes('grok')) {
    return 'Grok';
  }
  return 'ComfyUI';
}

export function isComfyUiJobProcessing(job: ComfyUiJobTrackerState | null | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'running';
}

export function comfyUiJobProgressPercent(
  job: Pick<ComfyUiJobTrackerState, 'progressValue' | 'progressMax'> | null | undefined
): number | null {
  const value = job?.progressValue;
  const max = job?.progressMax;
  if (value == null || max == null || !(max > 0)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function formatComfyUiJobProgressLabel(
  job:
    | Pick<ComfyUiJobTrackerState, 'progressValue' | 'progressMax' | 'progressNode'>
    | null
    | undefined
): string | null {
  const value = job?.progressValue;
  const max = job?.progressMax;
  if (value == null || max == null || !(max > 0)) {
    return null;
  }
  const safeMax = Math.max(1, Math.floor(max));
  const safeValue = Math.max(0, Math.min(Math.floor(value), safeMax));
  const step = `${safeValue}/${safeMax}`;
  return job?.progressNode ? `${step} · node ${job.progressNode}` : step;
}

export function formatComfyUiJobStatusLine(job: ComfyUiJobTrackerState): string {
  const parts: string[] = [];

  if (job.status === 'running') {
    const progress = formatComfyUiJobProgressLabel(job);
    const engine = comfyUiJobEngineLabel(job);
    // "Loading Qwen Edit 2511…" (the live bridge saw a loader node run) says it all.
    parts.push(
      progress
        ? `Running · ${progress}`
        : isLoadingStatusMessage(job.statusMessage)
          ? job.statusMessage!.trim()
          : `Running in ${engine}`
    );
  } else if (job.status === 'pending') {
    if (job.queuePosition != null && job.queuePosition > 0) {
      parts.push(`Queued · position ${job.queuePosition}`);
    } else {
      parts.push('Queued');
    }
  } else if (job.status === 'completed') {
    parts.push('Completed');
    if (job.imageCount != null && job.imageCount > 0) {
      parts.push(`${job.imageCount} image(s)`);
    }
  } else if (job.status === 'error') {
    if (job.statusMessage?.toLowerCase().includes('cancel')) {
      parts.push('Cancelled');
    } else {
      parts.push('Error');
    }
  }

  if (job.statusMessage?.trim()) {
    const normalized = job.statusMessage.trim();
    if (!parts.some(part => normalized.toLowerCase().includes(part.toLowerCase()))) {
      parts.push(normalized);
    }
  }

  parts.push(`prompt_id ${job.promptId}`);
  if (job.comfyUrl?.trim()) {
    parts.push(job.comfyUrl.trim());
  }

  return parts.filter(Boolean).join(' · ');
}

/** The live bridge's "Loading <engine>…" message (a loader node is executing). */
export function isLoadingStatusMessage(message: string | null | undefined): boolean {
  return /^Loading .+…$/.test(message?.trim() ?? '');
}

export function comfyUiJobStatusLabel(job: ComfyUiJobTrackerState): string {
  if (job.status === 'running') {
    const percent = comfyUiJobProgressPercent(job);
    if (percent != null) {
      return `Running · ${percent}%`;
    }
    if (job.progressValue != null && job.progressMax != null && job.progressMax > 0) {
      return `Running · ${job.progressValue}/${job.progressMax}`;
    }
    if (isLoadingStatusMessage(job.statusMessage)) {
      return job.statusMessage!.trim();
    }
    return 'Running';
  }
  if (job.status === 'pending') {
    if (job.queuePosition != null && job.queuePosition > 0) {
      return `Queued · #${job.queuePosition}`;
    }
    return 'Queued';
  }
  if (job.status === 'completed') {
    return 'Completed';
  }
  if (job.statusMessage?.toLowerCase().includes('cancel')) {
    return 'Cancelled';
  }
  return 'Failed';
}
