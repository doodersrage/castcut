import {
  comfyUiJobProgressPercent,
  comfyUiJobStatusLabel,
  formatComfyUiJobProgressLabel,
} from '@/lib/comfyui/job-status';
import { galleryCardCaption } from '@/lib/gallery/card-caption';
import { clipJobPercent, clipJobProgressText } from '@/lib/clip/clip-jobs';
import type { TrackedClipJob } from '@/lib/clip/clip-jobs-tracker';
import type { SystemTrayAssetJob, SystemTrayPrimary } from '@/hooks/useSystemTrayState';

export function assetStatusLabel(job: SystemTrayAssetJob): string {
  if (job.status === 'verifying') {
    return 'Verifying model';
  }
  if (job.status === 'queued') {
    return 'Queued download';
  }
  const percent = Math.round(job.progress * 100);
  return `Downloading · ${percent}%`;
}

export function primaryTitle(primary: SystemTrayPrimary): string {
  switch (primary.kind) {
    case 'gallery':
      // Day / Story prompts open with the same "Edit Image 1…" boilerplate — show the beat.
      return galleryCardCaption(primary.entry.prompt) || primary.entry.model || 'Generation job';
    case 'asset':
      return primary.job.label;
    case 'held':
      return `${primary.count} held Best job${primary.count === 1 ? '' : 's'}`;
    case 'queue':
      return `${primary.running} running · ${primary.pending} queued on ComfyUI`;
    case 'clip':
      return primary.job.label;
  }
}

export function primarySubtitle(primary: SystemTrayPrimary): string | null {
  switch (primary.kind) {
    case 'gallery':
      return comfyUiJobStatusLabel({
        promptId: primary.entry.promptId,
        status: primary.entry.status,
        statusMessage: primary.entry.statusMessage,
        queuePosition: primary.entry.queuePosition,
        progressValue: primary.entry.progressValue,
        progressMax: primary.entry.progressMax,
        progressNode: primary.entry.progressNode,
      });
    case 'asset':
      return assetStatusLabel(primary.job);
    case 'held':
      return primary.label;
    case 'queue':
      return 'ComfyUI server queue';
    case 'clip':
      return clipTrayStatus(primary.job);
  }
}

export function primaryPercent(primary: SystemTrayPrimary): number | null {
  if (primary.kind === 'gallery') {
    return primary.percent;
  }
  if (primary.kind === 'asset') {
    return Math.round(primary.job.progress * 100);
  }
  if (primary.kind === 'clip' && primary.job.state === 'running') {
    return clipJobPercent(primary.job.job);
  }
  return null;
}

/** A clip job's line in the tray: its progress, or why it failed. */
export function clipTrayStatus(job: TrackedClipJob): string {
  if (job.state === 'failed') {
    return job.missing?.length
      ? `Needs ${job.missing.join(', ')} in ComfyUI`
      : `Failed — ${job.error ?? 'it did not finish'}`;
  }
  return clipJobProgressText(job.job);
}

export function galleryJobProgressLabel(
  entry: Parameters<typeof formatComfyUiJobProgressLabel>[0]
) {
  return formatComfyUiJobProgressLabel(entry);
}

export function galleryJobPercent(entry: Parameters<typeof comfyUiJobProgressPercent>[0]) {
  return comfyUiJobProgressPercent(entry);
}

export function galleryJobStatusLabel(entry: Parameters<typeof comfyUiJobStatusLabel>[0]) {
  return comfyUiJobStatusLabel(entry);
}
