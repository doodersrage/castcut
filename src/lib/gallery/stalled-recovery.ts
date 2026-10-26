/**
 * Jobs Castcut gave up on that ComfyUI may still have (R8, M0 audit G6). A render whose poll ran
 * out ("Timed out waiting for ComfyUI") or whose prompt id the engine didn't know for a moment
 * ("Job not found (engine restarted)") is marked failed, and nothing looked at it again — even
 * when ComfyUI finished it a minute later, its picture sat in ComfyUI's history and the take
 * never landed.
 *
 * Now each app start asks the engine once about the recent ones: still running or finished →
 * the entry goes back to running and the normal poll takes it from there (the completed path:
 * the durable copy, the take landing on its card). Still unknown → left as it is.
 */
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** What became of a job, for the Queue: a cancel is not a failure, and lost ≠ broken. */
export type GalleryJobOutcome =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  /** The engine didn't know the job (restarted, or it went to another host). */
  | 'lost'
  /** Castcut stopped waiting; the job may have finished since. */
  | 'timed-out'
  | 'failed';

const LOST_RE = /not found|unknown prompt|engine restarted|id lost/i;
const TIMED_OUT_RE = /^timed out waiting for/i;

export function galleryJobOutcome(
  entry: Pick<ComfyGalleryEntry, 'status' | 'statusMessage'>
): GalleryJobOutcome {
  if (entry.status !== 'error') return entry.status;
  const message = entry.statusMessage?.trim() ?? '';
  if (message.toLowerCase() === 'cancelled') return 'cancelled';
  if (TIMED_OUT_RE.test(message)) return 'timed-out';
  if (LOST_RE.test(message)) return 'lost';
  return 'failed';
}

/** A Queue row's word for it. */
export const GALLERY_JOB_OUTCOME_LABELS: Record<GalleryJobOutcome, string> = {
  pending: 'Waiting',
  running: 'Running',
  completed: 'Done',
  cancelled: 'Cancelled',
  lost: 'Lost',
  'timed-out': 'Timed out',
  failed: 'Failed',
};

/** How far back an app start looks, and how many it asks about. */
export const STALLED_RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;
export const STALLED_RECOVERY_MAX = 20;

/** The jobs worth asking the engine about again: recent, timed out or lost, newest first. */
export function stalledRecoveryCandidates<
  E extends Pick<ComfyGalleryEntry, 'promptId' | 'status' | 'statusMessage' | 'queuedAt'>,
>(entries: readonly E[], options: { now?: number; asked?: ReadonlySet<string> } = {}): E[] {
  const now = options.now ?? Date.now();
  return entries
    .filter(entry => {
      const outcome = galleryJobOutcome(entry);
      return (
        (outcome === 'timed-out' || outcome === 'lost') &&
        Boolean(entry.promptId?.trim()) &&
        !options.asked?.has(entry.promptId.trim()) &&
        now - (entry.queuedAt ?? 0) < STALLED_RECOVERY_WINDOW_MS
      );
    })
    .sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0))
    .slice(0, STALLED_RECOVERY_MAX);
}

/** Prompt ids asked about in this session (one ask each). */
const asked = new Set<string>();

/**
 * Ask the engine about each candidate; a job it still has (running, or finished) is handed back
 * to the normal poll. Returns how many were found again.
 */
export async function recoverStalledGalleryJobs(): Promise<{ asked: number; found: number }> {
  if (typeof window === 'undefined') return { asked: 0, found: 0 };
  const [
    { loadComfyGallery, updateComfyGalleryByPromptId },
    { getEngineAdapterById },
    { awaitFullGalleryHydration },
  ] = await Promise.all([import('./comfyui-gallery'), import('../engine'), import('./db-store')]);
  // Called as a page opens: the whole Gallery, not its first page (nor an empty one).
  await awaitFullGalleryHydration();
  const candidates = stalledRecoveryCandidates(loadComfyGallery(), { asked });
  let found = 0;
  for (const entry of candidates) {
    const promptId = entry.promptId.trim();
    asked.add(promptId);
    try {
      const status = await getEngineAdapterById(entry.engineId).fetchJobStatus(
        promptId,
        entry.comfyUrl
      );
      const back =
        status &&
        (status.status === 'running' ||
          status.status === 'pending' ||
          (status.status === 'completed' && (status.images?.length ?? 0) > 0));
      if (!back) continue;
      updateComfyGalleryByPromptId(promptId, {
        status: 'running',
        statusMessage: 'Found again — ComfyUI still had it',
      });
      const { scheduleComfyGalleryPoll } = await import('./comfyui-gallery-poller');
      void scheduleComfyGalleryPoll(promptId, { comfyUrl: status.engineUrl || entry.comfyUrl });
      found += 1;
    } catch {
      // The engine unreachable: the next app start asks again.
      asked.delete(promptId);
    }
  }
  return { asked: candidates.length, found };
}
