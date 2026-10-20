import type { MutableRefObject } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { loadSettingsCache } from '@/lib/settings/cache';

export async function tryRelocateIdentityAndRetry(input: {
  message: string;
  model: ComfyImageModel;
  identityRelocateAttemptRef: MutableRefObject<boolean>;
  onRelocating: () => void;
  retry: () => Promise<string | undefined>;
}): Promise<string | undefined | null> {
  const { message, model, identityRelocateAttemptRef, onRelocating, retry } = input;
  const sharedIdentity = loadSettingsCache().shared;
  if (
    identityRelocateAttemptRef.current ||
    !sharedIdentity.ipAdapterImageFilename?.trim() ||
    !sharedIdentity.ipAdapterImageUrl?.trim()
  ) {
    return null;
  }

  const { shouldRelocateIdentityLock } = await import('@/lib/character/identity-lock-host');
  if (!shouldRelocateIdentityLock(message)) {
    return null;
  }

  identityRelocateAttemptRef.current = true;
  onRelocating();
  const { relocateIdentityLockToLiveHost } = await import('@/lib/gallery/identity-lock');
  const relocated = await relocateIdentityLockToLiveHost({
    deadComfyUrl: sharedIdentity.ipAdapterComfyUrl,
    model,
  });
  if (!relocated.ok) {
    return null;
  }

  return retry();
}

export function handleQueueFailure(input: {
  err: unknown;
  prompt: string;
  config: { model: ComfyImageModel; tool: string };
  failedQueueSnapshot: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    tool?: string;
    queueParams?: import('@/lib/comfyui/config').WorkflowParamValues;
    workflowJson?: string;
  } | null;
  setComfyUiStatus: (status: string) => void;
  resetIdentityRelocateAttempt: () => void;
}): void {
  const {
    err,
    prompt,
    config,
    failedQueueSnapshot,
    setComfyUiStatus,
    resetIdentityRelocateAttempt,
  } = input;
  resetIdentityRelocateAttempt();
  const message = err instanceof Error ? err.message : 'ComfyUI failed.';
  const hrefFromError = err instanceof Error ? (err as Error & { href?: string }).href : undefined;
  setComfyUiStatus(message);
  void import('@/lib/queue/failure-playbook').then(({ resolveQueueFailureHref }) => {
    const href = hrefFromError || resolveQueueFailureHref(message) || '/queue';
    void import('@/lib/server/local-observability').then(({ noteQueueFailureMetric }) => {
      noteQueueFailureMetric({ message, href });
    });
    void import('@/lib/queue/last-failed-queue').then(
      ({ saveLastFailedQueue, RETRY_LAST_FAILED_QUEUE_EVENT }) => {
        void import('@/lib/app/toast').then(({ toastQueueOutcome }) => {
          saveLastFailedQueue(
            failedQueueSnapshot ?? {
              prompt,
              model: config.model,
              tool: config.tool,
            }
          );
          toastQueueOutcome({
            ok: false,
            text: message,
            href,
            actionLabel: 'Retry',
            actionEvent: RETRY_LAST_FAILED_QUEUE_EVENT,
          });
        });
      }
    );
  });
}
