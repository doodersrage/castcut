import { formatQueuePipelineStatusNotes, type QueueQualityProfile } from './quality-profile';

/** Short host:port label for status / gallery meta (falls back to trimmed URL). */
export function formatComfyHostLabel(comfyUrl?: string | null): string | null {
  const raw = comfyUrl?.trim();
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const host = url.hostname;
    const port = url.port;
    if (port) {
      return `${host}:${port}`;
    }
    return host || raw.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

/** Join base status parts with model/profile pipeline notes. */
export function joinQueueStatusNotes(
  parts: Array<string | null | undefined>,
  pipeline?: {
    model?: string;
    qualityProfile?: QueueQualityProfile;
    tool?: string;
    vramDowngraded?: boolean;
    samplerMemory?: boolean;
    systemWorkflowSource?: 'pack' | 'scaffold';
    systemWorkflowLabel?: string;
    hasInputImage?: boolean;
    /** ComfyUI host used for this queue — surfaced as a short host:port label. */
    comfyUrl?: string;
  }
): string {
  const fromPipeline = pipeline ? formatQueuePipelineStatusNotes(pipeline) : [];
  const hostLabel = formatComfyHostLabel(pipeline?.comfyUrl);
  return [...parts, hostLabel ? `host ${hostLabel}` : null, ...fromPipeline]
    .filter(Boolean)
    .join(' · ');
}
