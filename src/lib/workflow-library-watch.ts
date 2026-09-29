/**
 * Background workflow-library check: run the cheap health audit once after startup and again
 * when ComfyUI's model list changes, and surface new errors as one toast. Problems like a video
 * model mapped to a 3D scaffold otherwise stayed invisible until someone opened Settings.
 */
import type { WorkflowLibraryHealthReport } from './workflow-health-audit';

export const WORKFLOW_LIBRARY_WATCH_SEEN_KEY = 'workflow-library-watch-seen-v1';
export const COMFY_MODEL_LIST_FINGERPRINT_KEY = 'comfy-model-list-fingerprint-v1';

/** Order-free fingerprint of ComfyUI's model lists (checkpoints, UNETs, LoRAs …). */
export function comfyModelListFingerprint(
  models: Record<string, unknown> | null | undefined
): string {
  if (!models) return '';
  const parts = Object.entries(models)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => `${key}:${[...(value as unknown[])].map(String).sort().join('|')}`)
    .sort();
  let hash = 2166136261;
  for (const char of parts.join('\n')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The toast for this report, or null when there is nothing new: errors only, and only when the
 * set of errors differs from the one last surfaced (so a known problem is not re-toasted on
 * every page load).
 */
export function workflowLibraryWatchToast(
  report: WorkflowLibraryHealthReport,
  lastSeenSignature: string | null,
  options?: { modelsChanged?: boolean }
): { signature: string; text: string } | null {
  const errors = report.issues.filter(issue => issue.severity === 'error');
  if (errors.length === 0) return null;
  const signature = errors
    .map(issue => `${issue.workflowId}:${issue.message}`)
    .sort()
    .join('\n');
  if (signature === lastSeenSignature) return null;
  const first = errors[0]!;
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
  const lead = options?.modelsChanged ? 'ComfyUI models changed — ' : '';
  return {
    signature,
    text: `${lead}workflow library: ${first.message}${more} Open Settings to fix.`,
  };
}
