/**
 * Lightweight read-only summary of a ComfyUI API-format workflow JSON string.
 * Not a visual editor — node counts, class histogram, and unresolved {{TOKENS}}.
 */

export type WorkflowGraphInspectSummary = {
  ok: boolean;
  error?: string;
  nodeCount: number;
  classCounts: Array<{ classType: string; count: number }>;
  unresolvedTokens: string[];
};

const TOKEN_PATTERN = /\{\{[A-Z0-9_]+\}\}/g;

export function inspectWorkflowGraphJson(workflowJson: string): WorkflowGraphInspectSummary {
  const trimmed = workflowJson.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Empty workflow JSON.',
      nodeCount: 0,
      classCounts: [],
      unresolvedTokens: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON.',
      nodeCount: 0,
      classCounts: [],
      unresolvedTokens: [],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Workflow must be an object of node id → node.',
      nodeCount: 0,
      classCounts: [],
      unresolvedTokens: [],
    };
  }

  const counts = new Map<string, number>();
  let nodeCount = 0;
  for (const node of Object.values(parsed as Record<string, unknown>)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    nodeCount += 1;
    const classType =
      typeof (node as { class_type?: unknown }).class_type === 'string'
        ? (node as { class_type: string }).class_type
        : '(unknown)';
    counts.set(classType, (counts.get(classType) ?? 0) + 1);
  }

  const classCounts = [...counts.entries()]
    .map(([classType, count]) => ({ classType, count }))
    .sort((a, b) => b.count - a.count || a.classType.localeCompare(b.classType));

  const unresolvedTokens = [...new Set(trimmed.match(TOKEN_PATTERN) ?? [])].sort();

  return {
    ok: true,
    nodeCount,
    classCounts,
    unresolvedTokens,
  };
}
