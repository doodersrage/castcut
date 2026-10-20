export type WorkflowDiffLine = {
  type: 'add' | 'remove' | 'same';
  text: string;
};

export function diffWorkflowJson(
  left: string,
  right: string
): { lines: WorkflowDiffLine[]; changed: number } {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const max = Math.max(leftLines.length, rightLines.length);
  const lines: WorkflowDiffLine[] = [];
  let changed = 0;

  for (let index = 0; index < max; index += 1) {
    const leftLine = leftLines[index];
    const rightLine = rightLines[index];
    if (leftLine === rightLine) {
      if (leftLine !== undefined) {
        lines.push({ type: 'same', text: leftLine });
      }
      continue;
    }
    if (leftLine !== undefined) {
      lines.push({ type: 'remove', text: leftLine });
      changed += 1;
    }
    if (rightLine !== undefined) {
      lines.push({ type: 'add', text: rightLine });
      changed += 1;
    }
  }

  return { lines, changed };
}

export function formatWorkflowForDiff(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export type WorkflowNodeDiffEntry = {
  nodeId: string;
  classType: string;
  title?: string;
  change: 'added' | 'removed' | 'modified';
  fields?: string[];
};

export function diffWorkflowNodes(leftJson: string, rightJson: string): WorkflowNodeDiffEntry[] {
  const parse = (
    raw: string
  ): Record<
    string,
    { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }
  > => {
    try {
      return JSON.parse(raw) as Record<
        string,
        { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }
      >;
    } catch {
      return {};
    }
  };

  const left = parse(leftJson);
  const right = parse(rightJson);
  const entries: WorkflowNodeDiffEntry[] = [];
  const allIds = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const nodeId of allIds) {
    const leftNode = left[nodeId];
    const rightNode = right[nodeId];
    if (!leftNode && rightNode) {
      entries.push({
        nodeId,
        classType: rightNode.class_type ?? 'unknown',
        title: rightNode._meta?.title,
        change: 'added',
      });
      continue;
    }
    if (leftNode && !rightNode) {
      entries.push({
        nodeId,
        classType: leftNode.class_type ?? 'unknown',
        title: leftNode._meta?.title,
        change: 'removed',
      });
      continue;
    }
    if (!leftNode || !rightNode) {
      continue;
    }

    const leftInputs = JSON.stringify(leftNode.inputs ?? {});
    const rightInputs = JSON.stringify(rightNode.inputs ?? {});
    const classChanged = (leftNode.class_type ?? '') !== (rightNode.class_type ?? '');
    if (classChanged || leftInputs !== rightInputs) {
      const fields = new Set<string>();
      for (const key of new Set([
        ...Object.keys(leftNode.inputs ?? {}),
        ...Object.keys(rightNode.inputs ?? {}),
      ])) {
        if (JSON.stringify(leftNode.inputs?.[key]) !== JSON.stringify(rightNode.inputs?.[key])) {
          fields.add(key);
        }
      }
      entries.push({
        nodeId,
        classType: rightNode.class_type ?? leftNode.class_type ?? 'unknown',
        title: rightNode._meta?.title ?? leftNode._meta?.title,
        change: 'modified',
        fields: [...fields],
      });
    }
  }

  return entries.sort((a, b) => a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true }));
}
