import type { MergeChoice, StorageNamespaceConflict } from './merge';

export type MergeDryRunPreview = {
  namespace: string;
  choice: MergeChoice;
  /** Short label for the conflict row. */
  summary: string;
  keepCount: number;
  overwriteCount: number;
};

/**
 * Estimate what Apply merge would do from conflict counts (no payload fetch).
 * Merge unions are bounded by local+server and floored by max(local, server).
 */
export function previewMergeChoice(
  conflict: Pick<StorageNamespaceConflict, 'namespace' | 'localCount' | 'serverCount'>,
  choice: MergeChoice
): MergeDryRunPreview {
  const localCount = Math.max(0, conflict.localCount ?? 0);
  const serverCount = Math.max(0, conflict.serverCount ?? 0);

  if (choice === 'local') {
    return {
      namespace: conflict.namespace,
      choice,
      summary: `Keep ${localCount} local · discard ${serverCount} server`,
      keepCount: localCount,
      overwriteCount: serverCount,
    };
  }
  if (choice === 'server') {
    return {
      namespace: conflict.namespace,
      choice,
      summary: `Keep ${serverCount} server · overwrite ${localCount} local`,
      keepCount: serverCount,
      overwriteCount: localCount,
    };
  }

  const keepLow = Math.max(localCount, serverCount);
  const keepHigh = localCount + serverCount;
  const keepCount = keepHigh === keepLow ? keepLow : keepHigh;
  const overlapHint =
    keepHigh > keepLow
      ? `Union ≈ ${keepLow}–${keepHigh} (overlap unknown)`
      : `Union ≈ ${keepCount}`;
  return {
    namespace: conflict.namespace,
    choice,
    summary: `${overlapHint} · local wins on key overlap`,
    keepCount,
    overwriteCount: 0,
  };
}

export function previewMergeChoices(
  conflicts: StorageNamespaceConflict[],
  choices: Partial<Record<string, MergeChoice>>
): MergeDryRunPreview[] {
  return conflicts
    .map(conflict => {
      const choice = choices[conflict.namespace];
      if (!choice) {
        return null;
      }
      return previewMergeChoice(conflict, choice);
    })
    .filter((row): row is MergeDryRunPreview => Boolean(row));
}
