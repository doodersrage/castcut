import type { ComfyUiModelLists } from '../comfyui/object-info';

export type WorkflowDualClipAuditIssue = {
  severity: 'error' | 'warn';
  message: string;
};

function filenameInList(filename: string, list: string[]): boolean {
  const trimmed = filename.trim();
  return Boolean(trimmed && list.length > 0 && list.includes(trimmed));
}

export function auditDualClipNodesInWorkflow(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  models: ComfyUiModelLists;
}): WorkflowDualClipAuditIssue[] {
  let workflow = input.workflow ?? null;
  if (!workflow) {
    if (!input.workflowJson?.trim()) {
      return [];
    }
    try {
      workflow = JSON.parse(input.workflowJson) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  const issues: WorkflowDualClipAuditIssue[] = [];
  const allowedTypes = new Set(input.models.dualClipTypes);

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    if (record.class_type !== 'DualCLIPLoader' || !record.inputs) {
      continue;
    }

    const clipType = typeof record.inputs.type === 'string' ? record.inputs.type.trim() : '';
    if (clipType === 'qwen_image') {
      issues.push({
        severity: 'error',
        message:
          'Qwen Image must use CLIPLoader (type qwen_image), not DualCLIPLoader — run Optimize all or queue again to auto-repair this workflow.',
      });
      continue;
    }
    if (clipType && allowedTypes.size > 0 && !allowedTypes.has(clipType)) {
      issues.push({
        severity: 'error',
        message: `DualCLIPLoader type “${clipType}” is not supported by your ComfyUI install — update ComfyUI and install the Qwen-Image / ComfyUI-Qwen-Image custom node pack. Supported types on this server: ${[...allowedTypes].slice(0, 8).join(', ')}${allowedTypes.size > 8 ? '…' : ''}.`,
      });
    }

    if (input.models.clips.length === 0) {
      continue;
    }

    for (const field of ['clip_name1', 'clip_name2'] as const) {
      const filename = typeof record.inputs[field] === 'string' ? record.inputs[field].trim() : '';
      if (filename && !filenameInList(filename, input.models.clips)) {
        issues.push({
          severity: 'error',
          message: `DualCLIPLoader ${field} “${filename}” not found in ComfyUI — use Settings → Optimize all or map clip filenames to ${input.models.clips.slice(0, 3).join(', ')}${input.models.clips.length > 3 ? '…' : ''}.`,
        });
      }
    }
  }

  return issues;
}
