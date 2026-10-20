/**
 * Resolve a workflow graph from an object and/or JSON string without re-parsing
 * when the caller already has a live object (queue preflight hot path).
 */
export function resolveWorkflowGraphInput(input: {
  workflow?: Record<string, unknown> | null;
  workflowJson?: string | null;
}): {
  workflow: Record<string, unknown> | null;
  workflowJson: string;
} {
  if (input.workflow && typeof input.workflow === 'object') {
    return {
      workflow: input.workflow,
      workflowJson:
        typeof input.workflowJson === 'string' && input.workflowJson.trim()
          ? input.workflowJson
          : JSON.stringify(input.workflow),
    };
  }

  const raw = input.workflowJson?.trim() ?? '';
  if (!raw) {
    return { workflow: null, workflowJson: '' };
  }

  try {
    return {
      workflow: JSON.parse(raw) as Record<string, unknown>,
      workflowJson: raw,
    };
  } catch {
    return { workflow: null, workflowJson: raw };
  }
}
