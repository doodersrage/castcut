/** Fast stable fingerprint for workflow JSON change detection. */
export function workflowContentHash(raw: string): string {
  const text = raw.trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Compact stringify — prefer for mid-flight hashing (pretty is for library display). */
export function stringifyWorkflowCompact(workflow: unknown): string {
  return JSON.stringify(workflow);
}

/** Pretty stringify for persisted library JSON. */
export function stringifyWorkflowPretty(workflow: unknown): string {
  return JSON.stringify(workflow, null, 2);
}

/**
 * Hash a workflow object independent of pretty-print whitespace.
 * Use for lastOptimizedHash / queue skip so re-parse + re-stringify still matches.
 */
export function workflowObjectContentHash(workflow: unknown): string {
  return workflowContentHash(stringifyWorkflowCompact(workflow));
}

/** Hash library JSON by parsing first so formatting drift does not false-flag stale. */
export function workflowJsonContentHash(workflowJson: string): string {
  const trimmed = workflowJson.trim();
  if (!trimmed) {
    return workflowContentHash(trimmed);
  }
  try {
    return workflowObjectContentHash(JSON.parse(trimmed) as unknown);
  } catch {
    return workflowContentHash(trimmed);
  }
}
