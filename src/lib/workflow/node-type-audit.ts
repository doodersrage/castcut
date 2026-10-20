import { KNOWN_COMFY_NODE_PACK_BY_CLASS } from '../comfyui/custom-node-registry';
import { settingsComfyUiSectionHref } from '../settings-comfyui-nav';

export type WorkflowNodeTypeIssue = {
  severity: 'error' | 'warn';
  message: string;
  /** Optional deep-link for queue-failure playbooks / toasts. */
  href?: string;
  classType?: string;
};

/**
 * Frontend / canvas-only class types. They often omit `/object_info` (so Manager
 * has nothing to install) and never produce outputs. `Note` is the sticky on the
 * graph, not a custom node pack.
 */
export const COMFY_UI_ONLY_NODE_TYPES = new Set(['Note', 'MarkdownNote', 'Reroute']);

export function isComfyUiOnlyNodeType(classType: string | undefined): boolean {
  const name = classType?.trim();
  return Boolean(name && COMFY_UI_ONLY_NODE_TYPES.has(name));
}

/** Drop canvas notes before submit — ComfyUI rejects `Note` when it is not in object_info. */
export function stripComfyUiOnlyNodes(workflow: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [nodeId, node] of Object.entries(workflow)) {
    const classType =
      node && typeof node === 'object'
        ? (node as { class_type?: string }).class_type?.trim()
        : undefined;
    if (classType === 'Note' || classType === 'MarkdownNote') {
      changed = true;
      continue;
    }
    next[nodeId] = node;
  }
  return changed ? next : workflow;
}

export function listWorkflowClassTypes(
  workflowJson?: string,
  workflow?: Record<string, unknown> | null
): string[] {
  let graph = workflow ?? null;
  if (!graph) {
    if (!workflowJson?.trim()) {
      return [];
    }
    try {
      graph = JSON.parse(workflowJson) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  const types = new Set<string>();
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const classType = (node as { class_type?: string }).class_type?.trim();
    if (classType) {
      types.add(classType);
    }
  }
  return [...types];
}

export function auditWorkflowNodeTypes(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  knownNodeTypes?: Set<string> | string[];
}): WorkflowNodeTypeIssue[] {
  const known =
    input.knownNodeTypes instanceof Set
      ? input.knownNodeTypes
      : new Set(input.knownNodeTypes ?? []);

  if (known.size === 0) {
    return [];
  }

  const issues: WorkflowNodeTypeIssue[] = [];
  for (const classType of listWorkflowClassTypes(input.workflowJson, input.workflow)) {
    if (isComfyUiOnlyNodeType(classType) || known.has(classType)) {
      continue;
    }
    issues.push({
      severity: 'error',
      message: `Workflow node type “${classType}” is not installed in ComfyUI — install the custom node pack or pick a different workflow.`,
      href: settingsComfyUiSectionHref('workflow-map'),
      classType,
    });
  }

  return issues;
}

/** Unique class_type values that object_info does not know about. */
export function collectMissingWorkflowNodeTypes(
  workflows: Array<{ workflowJson?: string; workflow?: Record<string, unknown> | null }>,
  knownNodeTypes?: Set<string> | string[]
): string[] {
  const known = knownNodeTypes instanceof Set ? knownNodeTypes : new Set(knownNodeTypes ?? []);
  if (known.size === 0) {
    return [];
  }
  const missing = new Set<string>();
  for (const workflow of workflows) {
    for (const classType of listWorkflowClassTypes(workflow.workflowJson, workflow.workflow)) {
      if (!isComfyUiOnlyNodeType(classType) && !known.has(classType)) {
        missing.add(classType);
      }
    }
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}

const MISSING_NODE_FAILURE =
  /not installed in ComfyUI|custom node pack|unknown node type|missing node type|node type .* not found|object_info.*(missing|unknown|not found)/i;

export function isMissingCustomNodeFailure(message: string): boolean {
  return MISSING_NODE_FAILURE.test(message.trim());
}

/** Pull class_type names from preflight / execution error text. */
export function extractMissingNodeTypesFromMessage(message: string): string[] {
  const text = message.trim();
  if (!text) {
    return [];
  }
  const found = new Set<string>();
  for (const match of text.matchAll(/[“"']([A-Za-z][\w.]+)[”"']/g)) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  for (const match of text.matchAll(/unknown node type[:\s]+([A-Za-z][\w.]+)/gi)) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  for (const match of text.matchAll(/missing node type[:\s]+([A-Za-z][\w.]+)/gi)) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  const hashed = text.match(/^([A-Za-z][\w.]+)\s+#\d+/);
  if (hashed?.[1] && /not (installed|found)|unknown|missing/i.test(text)) {
    found.add(hashed[1]);
  }
  for (const classType of Object.keys(KNOWN_COMFY_NODE_PACK_BY_CLASS)) {
    if (text.includes(classType)) {
      found.add(classType);
    }
  }
  return [...found];
}

export function collectMissingNodeTypesFromIssues(
  issues: Array<{ message?: string; classType?: string }>
): string[] {
  const found = new Set<string>();
  for (const issue of issues) {
    const typed = issue.classType?.trim();
    if (typed) {
      found.add(typed);
    }
    for (const classType of extractMissingNodeTypesFromMessage(issue.message ?? '')) {
      found.add(classType);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}
