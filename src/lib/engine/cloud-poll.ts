import { createComfyUiClientId } from '@/lib/comfyui/websocket';
import type {
  EngineJobStatus,
  EngineOutputImage,
  EngineProgressSubscription,
  EngineStatusResult,
  EngineSubscribeProgressInput,
} from './types';

export function normalizeCloudJobStatus(status: string | undefined): EngineJobStatus {
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error'
  ) {
    return status;
  }
  return 'unknown';
}

export function createNoopProgressSubscription(clientId: string): EngineProgressSubscription {
  return {
    close: () => undefined,
    ready: Promise.resolve(),
    setPromptId: () => undefined,
    clientId,
  };
}

export async function fetchCloudStatusViaProxy(
  statusPath: string,
  promptId: string,
  fallbackHost: string
): Promise<EngineStatusResult | null> {
  const params = new URLSearchParams({ promptId });
  const response = await fetch(`${statusPath}?${params.toString()}`);
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const resolvedUrl = (typeof raw.engineUrl === 'string' && raw.engineUrl.trim()) || fallbackHost;
  if (response.status === 404) {
    return {
      promptId,
      status: 'error',
      statusMessage:
        typeof raw.error === 'string' && raw.error.trim()
          ? raw.error.trim()
          : 'Cloud job not found.',
      engineUrl: resolvedUrl,
    };
  }
  if (!response.ok) {
    return null;
  }
  const images = Array.isArray(raw.images) ? (raw.images as EngineOutputImage[]) : undefined;
  return {
    promptId,
    status: normalizeCloudJobStatus(typeof raw.status === 'string' ? raw.status : undefined),
    statusMessage: typeof raw.statusMessage === 'string' ? raw.statusMessage : undefined,
    engineUrl: resolvedUrl,
    images,
    queuePosition:
      typeof raw.queuePosition === 'number' || raw.queuePosition === null
        ? (raw.queuePosition as number | null)
        : undefined,
    progressValue: typeof raw.progressValue === 'number' ? raw.progressValue : undefined,
    progressMax: typeof raw.progressMax === 'number' ? raw.progressMax : undefined,
  };
}

export function subscribeCloudProgress(input: {
  statusPath: string;
  fallbackHost: string;
  engineLabel: string;
  subscribe: EngineSubscribeProgressInput;
}): EngineProgressSubscription {
  const clientId = input.subscribe.clientId?.trim() || createComfyUiClientId();
  let promptId = input.subscribe.promptId?.trim() || '';
  let closed = false;

  const poll = async () => {
    if (closed || !promptId) {
      return;
    }
    try {
      const status = await fetchCloudStatusViaProxy(input.statusPath, promptId, input.fallbackHost);
      if (!status || closed) {
        return;
      }
      if (status.status === 'running' || status.status === 'pending') {
        input.subscribe.onProgress({
          promptId,
          status: 'progress',
          message: status.statusMessage,
          value: status.progressValue,
          max: status.progressMax,
        });
        return;
      }
      if (status.status === 'completed') {
        input.subscribe.onProgress({
          promptId,
          status: 'finished',
          message: status.statusMessage ?? 'Completed',
        });
        closed = true;
        clearInterval(timer);
        return;
      }
      if (status.status === 'error') {
        const message = status.statusMessage ?? `${input.engineLabel} job failed.`;
        input.subscribe.onProgress({
          promptId,
          status: 'error',
          message,
        });
        input.subscribe.onError?.(message);
        closed = true;
        clearInterval(timer);
      }
    } catch (error) {
      input.subscribe.onError?.(
        error instanceof Error ? error.message : `${input.engineLabel} progress poll failed.`
      );
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, 1200);
  void poll();

  return {
    close: () => {
      closed = true;
      clearInterval(timer);
    },
    ready: Promise.resolve(),
    setPromptId: next => {
      promptId = next.trim();
    },
    clientId,
  };
}
