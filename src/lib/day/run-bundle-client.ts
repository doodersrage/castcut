/**
 * A run's bundle and its takes' shadow reports, sent to the server (run-bundle.ts) — best effort:
 * a take never waits for them, and without server storage they go nowhere.
 */
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { loadComfyWorkflowFiles } from '@/lib/comfyui/workflow-files';
import { loadModelSamplerMemory } from '@/lib/history/sampler-memory';
import { loadQueueParamsSettings } from '@/lib/queue/params-settings';
import type { ServerQueueSettings } from '@/lib/queue/queue-request-server';
import { loadSettingsCache } from '@/lib/settings/cache';
import { sharedWithoutSecrets } from '@/lib/settings/secret-fields';
import type { RunBundle, TakeShadowReport } from './run-bundle';

/**
 * What this page's queue reads from the browser, for the run's bundle (RunBundle.queue): the
 * same loaders sendComfyUi's steps call, the shared settings without credentials (as every copy
 * that leaves the browser is, secret-fields.ts).
 */
export function captureRunQueueSettings(): ServerQueueSettings {
  return {
    shared: sharedWithoutSecrets(loadSettingsCache().shared),
    comfyUi: loadComfyUiSettings(),
    workflowFiles: loadComfyWorkflowFiles(),
    queueParams: loadQueueParamsSettings(),
    samplerMemory: loadModelSamplerMemory(),
  };
}

export function postRunBundle(bundle: RunBundle): void {
  void fetch('/api/scene-runs/bundle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bundle }),
  }).catch(() => undefined);
}

export function postTakeShadow(report: TakeShadowReport): void {
  void fetch('/api/scene-runs/shadow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ report }),
  }).catch(() => undefined);
}
