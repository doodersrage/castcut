import { getComfyUiBaseUrl, resolveComfyUiConfig } from './comfyui-client';
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from './comfyui-config';
import { detectWorkflowPlaceholders } from './comfyui-config';
import { extractImagesFromOutputs, type ComfyOutputImage } from './comfyui-outputs';
import { extractParamsFromWorkflow } from './workflow-param-extract';
import { extractComfyExecutionTiming } from './comfyui-render-duration';
import { interpretComfyJobDetail, parseComfyJobList } from './comfyui-jobs';

export type ComfyPromptStatus = {
  promptId: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'unknown';
  statusMessage?: string;
  comfyUrl: string;
  images?: ComfyOutputImage[];
  /** 1-based pending queue position; 0 means running now. */
  queuePosition?: number | null;
  /** ComfyUI execution_start → success/error duration when message timestamps exist. */
  renderDurationMs?: number;
  executionStartedAt?: number;
  executionEndedAt?: number;
};

type ComfyHistoryEntry = {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, Record<string, unknown>]>;
  };
  outputs?: Record<string, unknown>;
  prompt?: unknown[];
};

export type ComfyHistoryImportItem = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  comfyUrl: string;
  images: ComfyOutputImage[];
  statusMessage?: string;
  /** Sampler/latent params extracted from the history workflow graph. */
  queueParams?: WorkflowParamValues;
  model?: string;
  workflowJson?: string;
  renderDurationMs?: number;
  executionStartedAt?: number;
};

type ComfyQueueResponse = {
  queue_running?: Array<[number, string, ...unknown[]]>;
  queue_pending?: Array<[number, string, ...unknown[]]>;
};

type QueueContext = {
  isRunning: boolean;
  pendingPosition: number | null;
};

type ComfyJobListItem = { id?: unknown; status?: unknown; priority?: unknown };

/**
 * Where a job is, from the jobs list (id, status, priority — about 1 KB for a Day queue). `/queue`
 * carries every pending job's whole graph (35 KB with five stills queued) and was fetched for
 * every pending job's status poll. ComfyUI runs the lowest priority (queue number) first.
 * Undefined when there is no jobs API (older ComfyUI): the caller reads `/queue`.
 */
export function queueContextFromJobList(
  promptId: string,
  payload: unknown
): QueueContext | null | undefined {
  const jobs = (payload as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs)) return undefined;
  const items = jobs as ComfyJobListItem[];
  if (items.some(job => job.id === promptId && job.status === 'in_progress')) {
    return { isRunning: true, pendingPosition: null };
  }
  const pending = items
    .filter(job => job.status === 'pending' && typeof job.priority === 'number')
    .sort((left, right) => (left.priority as number) - (right.priority as number));
  const index = pending.findIndex(job => job.id === promptId);
  return index >= 0 ? { isRunning: false, pendingPosition: index + 1 } : null;
}

async function resolveQueueContext(
  promptId: string,
  comfyUrl: string
): Promise<QueueContext | null> {
  try {
    const jobs = await fetch(`${comfyUrl}/api/jobs?status=pending,in_progress`, {
      signal: AbortSignal.timeout(5000),
    });
    if (jobs.ok) {
      const context = queueContextFromJobList(promptId, await jobs.json().catch(() => null));
      if (context !== undefined) return context;
    }
  } catch {
    // Older ComfyUI: read the queue below.
  }
  try {
    const response = await fetch(`${comfyUrl}/queue`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ComfyQueueResponse;
    const running = payload.queue_running ?? [];
    const pending = payload.queue_pending ?? [];

    if (running.some(item => item[1] === promptId)) {
      return { isRunning: true, pendingPosition: null };
    }

    const pendingIndex = pending.findIndex(item => item[1] === promptId);
    if (pendingIndex >= 0) {
      return { isRunning: false, pendingPosition: pendingIndex + 1 };
    }

    return null;
  } catch {
    return null;
  }
}

function applyQueueContext(
  status: ComfyPromptStatus,
  queue: QueueContext | null
): ComfyPromptStatus {
  if (!queue || status.status === 'completed' || status.status === 'error') {
    return status;
  }

  if (queue.isRunning) {
    return {
      ...status,
      status: 'running',
      queuePosition: 0,
      statusMessage: status.statusMessage?.trim() ? status.statusMessage : 'Running now',
    };
  }

  if (queue.pendingPosition != null) {
    return {
      ...status,
      status: 'pending',
      queuePosition: queue.pendingPosition,
      statusMessage: `Queue position ${queue.pendingPosition}`,
    };
  }

  return status;
}

/** Matches the client's lost-job pattern (comfyui-gallery-client: /not found|engine restarted/). */
export const COMFY_PROMPT_LOST_MESSAGE =
  'Job not found — ComfyUI no longer has it (it restarted or its queue was cleared). Queue it again.';

/** Ids ComfyUI is running or holding, or null when the queue can't be read. */
async function fetchQueuedPromptIds(comfyUrl: string): Promise<Set<string> | null> {
  try {
    const response = await fetch(`${comfyUrl}/queue`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const payload = (await response.json()) as ComfyQueueResponse;
    return new Set(
      [...(payload.queue_running ?? []), ...(payload.queue_pending ?? [])].map(item =>
        String(item[1])
      )
    );
  } catch {
    return null;
  }
}

async function historyHasPrompt(comfyUrl: string, promptId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${comfyUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    return Object.keys(payload ?? {}).length > 0;
  } catch {
    return null;
  }
}

/**
 * True only when ComfyUI answers and has the job in neither its queue nor its history — twice,
 * a moment apart (a job finishing between the two reads is in one of them on the second look).
 */
export async function confirmComfyPromptLost(
  promptId: string,
  comfyUrl: string,
  waitMs = 1500
): Promise<boolean> {
  for (let pass = 0; pass < 2; pass += 1) {
    if (pass > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    const queued = await fetchQueuedPromptIds(comfyUrl);
    if (!queued || queued.has(promptId)) return false;
    const inHistory = await historyHasPrompt(comfyUrl, promptId);
    if (inHistory !== false) return false;
  }
  return true;
}

export async function getComfyUiPromptStatus(
  promptId: string,
  runtime?: ComfyUiRuntimeConfig
): Promise<ComfyPromptStatus> {
  const comfyUrl = getComfyUiBaseUrl(runtime);

  try {
    const jobResponse = await fetch(`${comfyUrl}/api/jobs/${encodeURIComponent(promptId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (jobResponse.ok) {
      const mapped = interpretComfyJobDetail(
        promptId,
        comfyUrl,
        await jobResponse.json().catch(() => null)
      );
      if (mapped) {
        if (mapped.status === 'pending' || mapped.status === 'running') {
          const queue = await resolveQueueContext(promptId, comfyUrl);
          return applyQueueContext(mapped, queue);
        }
        if (mapped.status === 'completed' && !(mapped.images && mapped.images.length > 0)) {
          const history = await fetchHistoryEntry(comfyUrl, promptId);
          const fromHistory = history
            ? historyEntryToImportItem(promptId, comfyUrl, history)
            : null;
          if (fromHistory?.images.length) {
            return {
              ...mapped,
              images: fromHistory.images,
              statusMessage: fromHistory.statusMessage ?? mapped.statusMessage,
            };
          }
        }
        return mapped;
      }
    }
  } catch {
    // Older ComfyUI has no jobs API — fall through to history.
  }

  try {
    const response = await fetch(`${comfyUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
      // Neither finished nor waiting: ComfyUI restarted or its queue was cleared. Without this the
      // job read "pending" forever (UI audit 2026-10-11: a week-old job still "Running").
      if (
        Object.keys(payload ?? {}).length === 0 &&
        (await confirmComfyPromptLost(promptId, comfyUrl))
      ) {
        return { promptId, status: 'error', statusMessage: COMFY_PROMPT_LOST_MESSAGE, comfyUrl };
      }
      const entry = payload[promptId] ?? (payload as unknown as ComfyHistoryEntry);
      const status = interpretHistoryEntry(promptId, comfyUrl, entry);
      const queue = await resolveQueueContext(promptId, comfyUrl);
      return applyQueueContext(status, queue);
    }

    const allResponse = await fetch(`${comfyUrl}/history?max_items=80`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!allResponse.ok) {
      return {
        promptId,
        status: 'unknown',
        statusMessage: `HTTP ${allResponse.status}`,
        comfyUrl,
      };
    }

    const history = (await allResponse.json()) as Record<string, ComfyHistoryEntry>;
    const entry = history[promptId];
    const queue = await resolveQueueContext(promptId, comfyUrl);

    if (!entry) {
      return applyQueueContext(
        {
          promptId,
          status: 'pending',
          statusMessage: 'Not in history yet (still queued or running)',
          comfyUrl,
        },
        queue
      );
    }

    return applyQueueContext(interpretHistoryEntry(promptId, comfyUrl, entry), queue);
  } catch (error) {
    return {
      promptId,
      status: 'unknown',
      statusMessage: error instanceof Error ? error.message : 'Status check failed',
      comfyUrl,
    };
  }
}

export async function getComfyUiWorkflowSummary(runtime?: ComfyUiRuntimeConfig) {
  const config = resolveComfyUiConfig(runtime);
  const placeholders = config.workflow
    ? detectWorkflowPlaceholders(JSON.stringify(config.workflow), config.placeholderTokens)
    : { positive: 0, negative: 0 };

  return {
    apiUrl: config.apiUrl,
    workflowSource: config.workflowSource,
    placeholderTokens: config.placeholderTokens,
    placeholders,
    legacyNodeFallback: Boolean(config.legacyPositiveNodeId),
    hasWorkflow: Boolean(config.workflow),
  };
}

export function extractComfyExecutionErrorMessage(entry: ComfyHistoryEntry): string | undefined {
  const messages = entry.status?.messages;
  if (!Array.isArray(messages)) {
    return undefined;
  }

  for (const message of messages) {
    if (!Array.isArray(message) || message[0] !== 'execution_error') {
      continue;
    }
    const payload = message[1];
    if (!payload || typeof payload !== 'object') {
      continue;
    }

    const exceptionMessage =
      typeof payload.exception_message === 'string' ? payload.exception_message.trim() : '';
    const nodeType = typeof payload.node_type === 'string' ? payload.node_type.trim() : '';
    const nodeId =
      typeof payload.node_id === 'string' || typeof payload.node_id === 'number'
        ? String(payload.node_id).trim()
        : '';

    if (exceptionMessage) {
      const prefix = [nodeType, nodeId ? `#${nodeId}` : ''].filter(Boolean).join(' ');
      return prefix ? `${prefix}: ${exceptionMessage}` : exceptionMessage;
    }
  }

  return undefined;
}

function interpretHistoryEntry(
  promptId: string,
  comfyUrl: string,
  entry: ComfyHistoryEntry
): ComfyPromptStatus {
  const statusStr = entry.status?.status_str?.toLowerCase() ?? '';
  const images = extractImagesFromOutputs(entry.outputs);
  const completed = entry.status?.completed === true || images.length > 0;
  const executionError = extractComfyExecutionErrorMessage(entry);
  const timing = extractComfyExecutionTiming({
    messages: entry.status?.messages,
  });
  const timingFields = {
    ...(timing.renderDurationMs != null ? { renderDurationMs: timing.renderDurationMs } : {}),
    ...(timing.executionStartedAt != null ? { executionStartedAt: timing.executionStartedAt } : {}),
    ...(timing.executionEndedAt != null ? { executionEndedAt: timing.executionEndedAt } : {}),
  };

  if (completed) {
    return {
      promptId,
      status: 'completed',
      statusMessage: statusStr || 'completed',
      comfyUrl,
      images,
      ...timingFields,
    };
  }

  if (statusStr.includes('error') || executionError) {
    return {
      promptId,
      status: 'error',
      statusMessage: executionError ?? statusStr,
      comfyUrl,
      images,
      ...timingFields,
    };
  }

  if (statusStr.includes('running') || statusStr.includes('execut')) {
    return {
      promptId,
      status: 'running',
      statusMessage: statusStr,
      comfyUrl,
      ...timingFields,
    };
  }

  return {
    promptId,
    status: 'pending',
    statusMessage: statusStr || 'pending',
    comfyUrl,
    ...timingFields,
  };
}

function extractWorkflowFromHistoryEntry(entry: ComfyHistoryEntry): Record<string, unknown> | null {
  const promptField = entry.prompt;
  if (!Array.isArray(promptField) || promptField.length < 3) {
    return null;
  }
  const workflow = promptField[2];
  if (!workflow || typeof workflow !== 'object') {
    return null;
  }
  return workflow as Record<string, unknown>;
}

function extractPromptFromHistoryEntry(entry: ComfyHistoryEntry): {
  positive?: string;
  negative?: string;
} {
  const workflow = extractWorkflowFromHistoryEntry(entry);
  if (!workflow) {
    return {};
  }

  const texts: string[] = [];
  for (const node of Object.values(
    workflow as Record<string, { inputs?: Record<string, unknown> }>
  )) {
    const text = typeof node.inputs?.text === 'string' ? node.inputs.text.trim() : '';
    if (text) {
      texts.push(text);
    }
  }

  return {
    positive: texts[0],
    negative: texts[1],
  };
}

function extractCheckpointHintFromWorkflow(workflow: Record<string, unknown>): string | undefined {
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    const ckpt =
      typeof inputs?.ckpt_name === 'string'
        ? inputs.ckpt_name.trim()
        : typeof inputs?.unet_name === 'string'
          ? inputs.unet_name.trim()
          : '';
    if (ckpt && !ckpt.includes('{{')) {
      return ckpt;
    }
  }
  return undefined;
}

export function buildComfyHistoryDeletePayload(promptIds: string[]): { delete: string[] } {
  return {
    delete: [...new Set(promptIds.map(id => id.trim()).filter(Boolean))],
  };
}

export async function deleteComfyUiHistoryItems(
  comfyUrl: string,
  promptIds: string[]
): Promise<boolean> {
  const payload = buildComfyHistoryDeletePayload(promptIds);
  if (payload.delete.length === 0) {
    return true;
  }

  try {
    const response = await fetch(`${comfyUrl.replace(/\/+$/, '')}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function buildHistoryImportItem(input: {
  promptId: string;
  comfyUrl: string;
  images: ComfyOutputImage[];
  statusMessage?: string;
  workflow?: Record<string, unknown> | null;
  positive?: string;
  negative?: string;
  renderDurationMs?: number;
  executionStartedAt?: number;
}): ComfyHistoryImportItem {
  const queueParams = input.workflow ? extractParamsFromWorkflow(input.workflow) : undefined;
  const hasParams = queueParams && Object.keys(queueParams).length > 0;
  return {
    promptId: input.promptId,
    prompt: input.positive?.trim() || `Imported ComfyUI job ${input.promptId.slice(0, 8)}`,
    negativePrompt: input.negative,
    comfyUrl: input.comfyUrl,
    images: input.images,
    statusMessage: input.statusMessage,
    queueParams: hasParams ? queueParams : undefined,
    model: input.workflow ? extractCheckpointHintFromWorkflow(input.workflow) : undefined,
    workflowJson: input.workflow ? JSON.stringify(input.workflow) : undefined,
    ...(input.renderDurationMs != null ? { renderDurationMs: input.renderDurationMs } : {}),
    ...(input.executionStartedAt != null ? { executionStartedAt: input.executionStartedAt } : {}),
  };
}

function historyEntryToImportItem(
  promptId: string,
  comfyUrl: string,
  entry: ComfyHistoryEntry
): ComfyHistoryImportItem | null {
  const status = interpretHistoryEntry(promptId, comfyUrl, entry);
  if (status.status !== 'completed' || !status.images?.length) {
    return null;
  }
  const workflow = extractWorkflowFromHistoryEntry(entry);
  const extracted = extractPromptFromHistoryEntry(entry);
  return buildHistoryImportItem({
    promptId,
    comfyUrl,
    images: status.images,
    statusMessage: status.statusMessage,
    workflow,
    positive: extracted.positive,
    negative: extracted.negative,
    renderDurationMs: status.renderDurationMs,
    executionStartedAt: status.executionStartedAt,
  });
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function fetchHistoryEntry(
  comfyUrl: string,
  promptId: string
): Promise<ComfyHistoryEntry | null> {
  const raw = await fetchJson(`${comfyUrl}/history/${encodeURIComponent(promptId)}`, 8000);
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const nested = record[promptId];
  if (nested && typeof nested === 'object') {
    return nested as ComfyHistoryEntry;
  }
  if (record.status || record.outputs || record.prompt) {
    return record as ComfyHistoryEntry;
  }
  return null;
}

function extractWorkflowFromUnknown(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.prompt && typeof record.prompt === 'object' && !Array.isArray(record.prompt)) {
    return record.prompt as Record<string, unknown>;
  }
  const extra = record.extra_data;
  if (extra && typeof extra === 'object') {
    const pnginfo = (extra as { extra_pnginfo?: { workflow?: unknown } }).extra_pnginfo;
    if (pnginfo?.workflow && typeof pnginfo.workflow === 'object') {
      return pnginfo.workflow as Record<string, unknown>;
    }
  }
  return extractWorkflowFromHistoryEntry(record as ComfyHistoryEntry);
}

async function listComfyUiJobImports(
  comfyUrl: string,
  limit: number
): Promise<ComfyHistoryImportItem[] | null> {
  const listRaw = await fetchJson(`${comfyUrl}/api/jobs?status=completed&limit=${limit}`, 8000);
  if (listRaw == null) {
    return null;
  }
  const jobs = parseComfyJobList(listRaw).filter(job => job.status === 'completed');
  if (jobs.length === 0) {
    return [];
  }

  const items: ComfyHistoryImportItem[] = [];
  const chunkSize = 8;
  for (let index = 0; index < jobs.length && items.length < limit; index += chunkSize) {
    const chunk = jobs.slice(index, index + chunkSize);
    const chunkItems = await Promise.all(
      chunk.map(job => fetchComfyJobImportItem(job.id, comfyUrl))
    );
    for (const item of chunkItems) {
      if (item && items.length < limit) {
        items.push(item);
      }
    }
  }
  return items;
}

/** One completed job as a gallery import item (jobs API + history metadata). */
export async function fetchComfyJobImportItem(
  promptId: string,
  comfyUrl: string
): Promise<ComfyHistoryImportItem | null> {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return null;
  }
  const origin = comfyUrl.replace(/\/+$/, '');
  const detailRaw = await fetchJson(`${origin}/api/jobs/${encodeURIComponent(trimmed)}`, 8000);
  const mapped = detailRaw ? interpretComfyJobDetail(trimmed, origin, detailRaw) : null;
  const history = await fetchHistoryEntry(origin, trimmed);
  const fromHistory = history ? historyEntryToImportItem(trimmed, origin, history) : null;

  if (fromHistory?.images.length) {
    return fromHistory;
  }
  if (mapped?.status === 'completed' && mapped.images?.length) {
    const workflow = extractWorkflowFromUnknown(detailRaw) ?? extractWorkflowFromUnknown(history);
    const extracted = history ? extractPromptFromHistoryEntry(history) : {};
    return buildHistoryImportItem({
      promptId: trimmed,
      comfyUrl: origin,
      images: mapped.images,
      statusMessage: mapped.statusMessage,
      workflow,
      positive: extracted.positive,
      negative: extracted.negative,
      renderDurationMs: mapped.renderDurationMs,
      executionStartedAt: mapped.executionStartedAt,
    });
  }
  return fromHistory;
}

export async function listComfyUiHistoryImports(
  runtime?: ComfyUiRuntimeConfig,
  limit = 40
): Promise<ComfyHistoryImportItem[]> {
  const comfyUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  const maxItems = Math.min(80, Math.max(1, limit));

  const fromJobs = await listComfyUiJobImports(comfyUrl, maxItems);
  if (fromJobs && fromJobs.length > 0) {
    return fromJobs
      .sort((left, right) => right.promptId.localeCompare(left.promptId))
      .slice(0, limit);
  }

  try {
    const response = await fetch(`${comfyUrl}/history?max_items=${maxItems}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return fromJobs ?? [];
    }

    const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const items: ComfyHistoryImportItem[] = [];

    for (const [promptId, entry] of Object.entries(history)) {
      const item = historyEntryToImportItem(promptId, comfyUrl, entry);
      if (item) {
        items.push(item);
      }
    }

    return items.sort((left, right) => right.promptId.localeCompare(left.promptId)).slice(0, limit);
  } catch {
    return fromJobs ?? [];
  }
}
