import { getComfyUiBaseUrl } from './client';
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from './config';
export { extractParamsFromWorkflow } from '../workflow/param-extract';
import { extractParamsFromWorkflow } from '../workflow/param-extract';

type ComfyHistoryEntry = {
  prompt?: unknown[];
};

export type ComfyHistoryWorkflowResult = {
  ok: boolean;
  error?: string;
  promptId: string;
  comfyUrl: string;
  workflow?: Record<string, unknown>;
  workflowJson?: string;
  extractedParams?: WorkflowParamValues;
  /** All scalar inputs keyed by `nodeId.inputName`. */
  nodeInputs?: Array<{
    nodeId: string;
    classType?: string;
    input: string;
    value: string | number | boolean;
  }>;
  truncated?: boolean;
  /** Where the graph came from: Castcut's own record of what it submitted (M7 T4), or ComfyUI. */
  source?: 'castcut' | 'comfyui';
};

const MAX_WORKFLOW_CHARS = 12000;

/** A found graph as the history route answers it (the JSON trimmed for display). */
export function workflowLookupResult(
  promptId: string,
  comfyUrl: string,
  workflow: Record<string, unknown>,
  source: 'castcut' | 'comfyui'
): ComfyHistoryWorkflowResult {
  const workflowJson = JSON.stringify(workflow, null, 2);
  const truncated = workflowJson.length > MAX_WORKFLOW_CHARS;
  return {
    ok: true,
    promptId,
    comfyUrl,
    workflow,
    workflowJson: truncated ? `${workflowJson.slice(0, MAX_WORKFLOW_CHARS)}\n…` : workflowJson,
    extractedParams: extractParamsFromWorkflow(workflow),
    nodeInputs: listWorkflowNodeInputs(workflow),
    truncated,
    source,
  };
}

function extractWorkflowFromHistoryEntry(entry: ComfyHistoryEntry): Record<string, unknown> | null {
  const promptField = entry.prompt;
  if (!Array.isArray(promptField) || promptField.length < 3) {
    return null;
  }

  const workflow = promptField[2];
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    return null;
  }

  return workflow as Record<string, unknown>;
}

export function listWorkflowNodeInputs(
  workflow: Record<string, unknown>,
  limit = 80
): ComfyHistoryWorkflowResult['nodeInputs'] {
  const rows: NonNullable<ComfyHistoryWorkflowResult['nodeInputs']> = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    for (const [input, value] of Object.entries(inputs)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        rows.push({
          nodeId,
          classType: record.class_type,
          input,
          value,
        });
        if (rows.length >= limit) {
          return rows;
        }
      }
    }
  }

  return rows;
}

export async function fetchComfyUiHistoryWorkflow(
  promptId: string,
  runtime?: ComfyUiRuntimeConfig
): Promise<ComfyHistoryWorkflowResult> {
  const trimmedId = promptId.trim();
  if (!trimmedId) {
    return { ok: false, error: 'promptId is required.', promptId: '', comfyUrl: '' };
  }

  let comfyUrl: string;
  try {
    comfyUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid ComfyUI URL.',
      promptId: trimmedId,
      comfyUrl: '',
    };
  }

  try {
    const response = await fetch(`${comfyUrl}/history/${encodeURIComponent(trimmedId)}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `ComfyUI history returned HTTP ${response.status}.`,
        promptId: trimmedId,
        comfyUrl,
      };
    }

    const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const entry = payload[trimmedId];
    if (!entry) {
      return {
        ok: false,
        error: 'Job not found in ComfyUI history.',
        promptId: trimmedId,
        comfyUrl,
      };
    }

    const workflow = extractWorkflowFromHistoryEntry(entry);
    if (!workflow) {
      return {
        ok: false,
        error: 'No workflow payload in ComfyUI history entry.',
        promptId: trimmedId,
        comfyUrl,
      };
    }

    return workflowLookupResult(trimmedId, comfyUrl, workflow, 'comfyui');
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch ComfyUI history.',
      promptId: trimmedId,
      comfyUrl,
    };
  }
}
