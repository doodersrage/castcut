import type { ComfyPromptStatus } from './status';
import { extractImagesFromOutputs } from './outputs';

export type ComfyJobListItem = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  statusMessage?: string;
  createTime?: number;
  outputsCount?: number;
  comfyUrl?: string;
};

export type HostOrphanJob = ComfyJobListItem & { comfyUrl?: string };

/** Deduplicate in-flight host jobs across a Comfy pool, stamping each row with its URL. */
export function mergeHostJobLists(
  batches: Array<{ url: string; jobs: ComfyJobListItem[] }>
): HostOrphanJob[] {
  const seen = new Set<string>();
  const merged: HostOrphanJob[] = [];
  for (const batch of batches) {
    const url = batch.url.trim().replace(/\/+$/, '');
    for (const job of batch.jobs) {
      if (!job.id || seen.has(job.id)) {
        continue;
      }
      seen.add(job.id);
      merged.push(url ? { ...job, comfyUrl: url } : { ...job });
    }
  }
  return merged;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mapComfyJobStatusString(
  raw: string | undefined
): ComfyJobListItem['status'] | null {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === 'pending' || value === 'queued') {
    return 'pending';
  }
  if (value === 'in_progress' || value === 'running' || value === 'executing') {
    return 'running';
  }
  if (value === 'completed' || value === 'success') {
    return 'completed';
  }
  if (value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled') {
    return 'error';
  }
  return null;
}

export function parseComfyJobListItem(raw: unknown): ComfyJobListItem | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const id =
    typeof record.id === 'string'
      ? record.id.trim()
      : typeof record.prompt_id === 'string'
        ? record.prompt_id.trim()
        : '';
  if (!id) {
    return null;
  }
  const status = mapComfyJobStatusString(
    typeof record.status === 'string' ? record.status : undefined
  );
  if (!status) {
    return null;
  }
  const createTime =
    typeof record.create_time === 'number' && Number.isFinite(record.create_time)
      ? record.create_time
      : undefined;
  const outputsCount =
    typeof record.outputs_count === 'number' && Number.isFinite(record.outputs_count)
      ? record.outputs_count
      : undefined;
  return {
    id,
    status,
    ...(createTime != null ? { createTime } : {}),
    ...(outputsCount != null ? { outputsCount } : {}),
  };
}

export function parseComfyJobList(raw: unknown): ComfyJobListItem[] {
  const record = asRecord(raw);
  const jobs = Array.isArray(record?.jobs) ? record.jobs : Array.isArray(raw) ? raw : [];
  return jobs.map(parseComfyJobListItem).filter((item): item is ComfyJobListItem => Boolean(item));
}

function executionErrorMessage(record: Record<string, unknown>): string | undefined {
  const error = record.execution_error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  const nested = asRecord(error);
  const message =
    typeof nested?.exception_message === 'string'
      ? nested.exception_message.trim()
      : typeof nested?.message === 'string'
        ? nested.message.trim()
        : '';
  return message || undefined;
}

/** Map a ComfyUI `/api/jobs/{id}` payload onto gallery job status. */
export function interpretComfyJobDetail(
  promptId: string,
  comfyUrl: string,
  raw: unknown
): ComfyPromptStatus | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const status = mapComfyJobStatusString(
    typeof record.status === 'string' ? record.status : undefined
  );
  if (!status) {
    return null;
  }
  const images = extractImagesFromOutputs(asRecord(record.outputs) ?? undefined);
  const errorMessage = executionErrorMessage(record);
  const started =
    typeof record.execution_start_time === 'number' && Number.isFinite(record.execution_start_time)
      ? record.execution_start_time
      : undefined;
  const ended =
    typeof record.execution_end_time === 'number' && Number.isFinite(record.execution_end_time)
      ? record.execution_end_time
      : undefined;
  const renderDurationMs =
    started != null && ended != null && ended >= started ? ended - started : undefined;

  return {
    promptId,
    status,
    comfyUrl,
    statusMessage: errorMessage ?? status,
    ...(images.length > 0 ? { images } : {}),
    ...(renderDurationMs != null ? { renderDurationMs } : {}),
    ...(started != null ? { executionStartedAt: started } : {}),
    ...(ended != null ? { executionEndedAt: ended } : {}),
  };
}
