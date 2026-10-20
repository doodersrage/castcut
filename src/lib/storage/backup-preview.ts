/**
 * What a backup file holds, set beside what is here now, before it overwrites anything (roadmap
 * review 2026-10-11: "a guided, verifiable backup and restore"). Restore used to apply a chosen
 * file at once, with no way to see whose Cast or how many renders it carried. Pure.
 */

type BackupLike = {
  version?: number;
  exportedAt?: string;
  history?: unknown[];
  comfyGallery?: Array<{
    derivedKind?: string;
    status?: string;
    durableOriginalPath?: string;
    sourceImageUrl?: string;
  }>;
  comfyWorkflowFiles?: unknown[];
  extras?: { characters?: Array<{ name?: string; deletedAt?: number }> };
};

export type BackupSummary = {
  exportedAt: string | null;
  version: number | null;
  cast: string[];
  renders: number;
  films: number;
  history: number;
  workflows: number;
  /** Finished renders whose file is only in ComfyUI's output folder (no kept copy). */
  rendersNotKept: number;
};

export function summarizeBackup(backup: BackupLike): BackupSummary {
  const gallery = Array.isArray(backup.comfyGallery) ? backup.comfyGallery : [];
  const finished = gallery.filter(entry => entry?.status === 'completed');
  const cast = (backup.extras?.characters ?? [])
    .filter(character => character && !character.deletedAt)
    .map(character => character.name?.trim() || 'Unnamed')
    .slice(0, 50);
  return {
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    version: typeof backup.version === 'number' ? backup.version : null,
    cast,
    renders: finished.filter(entry => entry.derivedKind !== 'film').length,
    films: finished.filter(entry => entry.derivedKind === 'film').length,
    history: Array.isArray(backup.history) ? backup.history.length : 0,
    workflows: Array.isArray(backup.comfyWorkflowFiles) ? backup.comfyWorkflowFiles.length : 0,
    rendersNotKept: finished.filter(
      entry =>
        entry.derivedKind !== 'film' &&
        !entry.durableOriginalPath?.trim() &&
        !/^\/api\/gallery\/media\//.test(entry.sourceImageUrl?.trim() ?? '')
    ).length,
  };
}

export type BackupCompareRow = {
  label: string;
  file: string;
  here: string;
  /** Restoring would leave fewer of these than are here now. */
  fewer: boolean;
};

function names(list: string[]): string {
  if (list.length === 0) return 'none';
  const shown = list.slice(0, 4).join(', ');
  return list.length > 4 ? `${shown} +${list.length - 4}` : shown;
}

/** Side by side: the file against what is here. Rows where the file has fewer are flagged. */
export function compareBackup(file: BackupSummary, here: BackupSummary): BackupCompareRow[] {
  const count = (label: string, a: number, b: number): BackupCompareRow => ({
    label,
    file: String(a),
    here: String(b),
    fewer: a < b,
  });
  return [
    {
      label: 'Cast',
      file: `${file.cast.length} · ${names(file.cast)}`,
      here: `${here.cast.length} · ${names(here.cast)}`,
      fewer: here.cast.some(name => !file.cast.includes(name)),
    },
    count('Films', file.films, here.films),
    count('Renders', file.renders, here.renders),
    count('Prompt history', file.history, here.history),
    count('Workflows', file.workflows, here.workflows),
  ];
}

/** "Saved 3 days ago" / "Saved today" — or null without a date. */
export function backupAgeLabel(exportedAt: string | null, now = Date.now()): string | null {
  if (!exportedAt) return null;
  const at = Date.parse(exportedAt);
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((now - at) / 86_400_000);
  const date = new Date(at).toISOString().slice(0, 10);
  if (days <= 0) return `Saved today (${date})`;
  if (days === 1) return `Saved yesterday (${date})`;
  return `Saved ${days} days ago (${date})`;
}
