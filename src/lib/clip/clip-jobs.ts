/**
 * Finishing jobs (Sharpen & smooth, Make more realistic, Copy moves, Dance to music, Lip-sync,
 * Upscale to 4K): minutes-long GPU passes the server runs in the background — one request each
 * was cut off by Node's 5-minute request timeout, and the result was lost. Client-safe: the job's shape, its progress words, and the HTTP calls.
 * The server side is clip-jobs-server.ts; the browser's record of jobs it is waiting on (so a
 * reload picks them back up) is clip-jobs-tracker.ts.
 */

export type ClipJobTool = 'finish' | 'realism' | 'moves' | 'dance' | 'lip-sync' | 'upscale';

export type ClipJobStatus = 'running' | 'completed' | 'error' | 'cancelled';

export type ClipJob = {
  id: string;
  tool: ClipJobTool;
  status: ClipJobStatus;
  /** Steps finished, of `total` (Make more realistic: one per chunk, then the join). */
  done: number;
  total: number;
  /** What it is doing now ("Re-rendering part 2 of 4"). */
  note: string;
  startedAt: number;
  /** Seconds left, once a step has been timed. */
  etaSec?: number;
  /** The new clip (ComfyUI view URL), when completed. */
  url?: string;
  error?: string;
  /** Model files the tool needs that ComfyUI doesn't have. */
  missing?: string[];
};

export const CLIP_JOB_LABEL: Record<ClipJobTool, string> = {
  finish: 'Sharpen & smooth',
  realism: 'Make more realistic',
  moves: 'Copy moves',
  dance: 'Dance to music',
  'lip-sync': 'Lip-sync',
  upscale: 'Upscale to 4K',
};

export const CLIP_JOB_ENDPOINT: Record<ClipJobTool, string> = {
  finish: '/api/clip/finish',
  realism: '/api/clip/realism',
  moves: '/api/clip/moves',
  dance: '/api/clip/dance',
  'lip-sync': '/api/clip/lip-sync',
  upscale: '/api/still/upscale',
};

/** Thrown when another clip job holds the GPU (the server runs one at a time). */
export class ClipJobBusyError extends Error {
  constructor(readonly running?: ClipJob) {
    super(
      running
        ? `${CLIP_JOB_LABEL[running.tool]} is still running — one clip job at a time.`
        : 'Another clip job is running — one at a time.'
    );
  }
}

/** Thrown when the server no longer knows the job (it restarted). */
export class ClipJobLostError extends Error {}

/** Thrown when the tool's models aren't installed in ComfyUI. */
export class ClipJobMissingModelsError extends Error {
  constructor(
    message: string,
    readonly missing: string[]
  ) {
    super(message);
  }
}

/** 0–100, for a progress bar. */
export function clipJobPercent(job: Pick<ClipJob, 'done' | 'total' | 'status'>): number {
  if (job.status === 'completed') return 100;
  if (!job.total) return 0;
  return Math.max(0, Math.min(100, Math.round((job.done / job.total) * 100)));
}

export function formatClipJobEta(seconds: number): string {
  if (seconds < 60) return 'under a minute left';
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} min left`;
}

/** One line for a running job: what it's doing and, once known, how long is left. */
export function clipJobProgressText(job: Pick<ClipJob, 'note' | 'etaSec'>): string {
  return job.etaSec != null && job.etaSec > 0
    ? `${job.note} · ${formatClipJobEta(job.etaSec)}`
    : job.note;
}

async function readJob(response: Response, fallback: string): Promise<ClipJob> {
  const body = (await response.json().catch(() => ({}))) as {
    job?: ClipJob;
    running?: ClipJob;
    error?: string;
    missing?: string[];
  };
  if (response.status === 409 && body.running) throw new ClipJobBusyError(body.running);
  if (response.status === 424) {
    throw new ClipJobMissingModelsError(body.error ?? fallback, body.missing ?? []);
  }
  if (!response.ok || !body.job) throw new Error(body.error ?? fallback);
  return body.job;
}

/** Start a clip job (client): the job, at once. A FormData body goes up as a multipart form. */
export async function startClipJob(
  tool: ClipJobTool,
  body: Record<string, unknown> | FormData,
  fetchImpl: typeof fetch = fetch
): Promise<ClipJob> {
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetchImpl(CLIP_JOB_ENDPOINT[tool], {
    method: 'POST',
    ...(form ? {} : { headers: { 'Content-Type': 'application/json' } }),
    credentials: 'same-origin',
    body: form ? body : JSON.stringify(body),
  });
  return readJob(response, `${CLIP_JOB_LABEL[tool]} failed.`);
}

/** How a job is doing now (client). */
export async function fetchClipJob(
  jobId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ClipJob> {
  const response = await fetchImpl(`/api/clip/jobs?jobId=${encodeURIComponent(jobId)}`, {
    credentials: 'same-origin',
  });
  if (response.status === 404) {
    throw new ClipJobLostError(
      'The server restarted while this clip was being worked on — try again.'
    );
  }
  return readJob(response, 'Lost track of the clip job.');
}

/** Stop a job (client). Resolves once the server has it marked cancelled. */
export async function cancelClipJob(jobId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`/api/clip/jobs?jobId=${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
}

/**
 * A short reason from ffmpeg's log for the person (the whole log goes to the server log): its
 * last line that names an error, without the "[h264 @ 0x…]" prefix.
 */
export function ffmpegFailureMessage(stderr: string, code: number | null): string {
  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.replace(/^\[[^\]]*@\s*0x[0-9a-f]+\]\s*/i, '').trim())
    .filter(Boolean);
  const reason =
    [...lines]
      .reverse()
      .find(line => /error|invalid|could not|cannot|no such|failed/i.test(line)) ?? lines.at(-1);
  const short = reason && reason.length > 160 ? `${reason.slice(0, 157)}…` : reason;
  return short
    ? `ffmpeg could not process the clip (${short}).`
    : `ffmpeg could not process the clip (exit ${code ?? '?'}).`;
}
