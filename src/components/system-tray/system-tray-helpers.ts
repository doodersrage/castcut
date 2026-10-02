import {
  comfyUiJobProgressPercent,
  comfyUiJobStatusLabel,
  formatComfyUiJobProgressLabel,
} from '@/lib/comfyui-job-status';
import { galleryCardCaption } from '@/lib/gallery-card-caption';
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
  }
}

export function primaryPercent(primary: SystemTrayPrimary): number | null {
  if (primary.kind === 'gallery') {
    return primary.percent;
  }
  if (primary.kind === 'asset') {
    return Math.round(primary.job.progress * 100);
  }
  return null;
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
