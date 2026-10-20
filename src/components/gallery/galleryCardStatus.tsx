'use client';

import { comfyUiJobProgressPercent } from '@/lib/comfyui/job-status';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { jobStatusTone, type StatusTone } from '@/lib/app/status-tone';

export function statusLabel(
  status: ComfyGalleryEntry['status'],
  entry?: ComfyGalleryEntry
): string {
  if (status === 'completed') return 'Done';
  if (status === 'running') {
    const percent = entry ? comfyUiJobProgressPercent(entry) : null;
    return percent != null ? `Running · ${percent}%` : 'Running';
  }
  if (status === 'pending') return 'Queued';
  return 'Error';
}

/** The job state's chip tone — one colour rule for every status chip (status-tone.ts). */
export function statusTone(status: ComfyGalleryEntry['status']): StatusTone {
  return jobStatusTone(status);
}

export function CustomGroupBadge(props: {
  name: string;
  onClick?: (group: string) => void;
  pointerEvents?: boolean;
}) {
  const className = `${
    props.pointerEvents ? 'pointer-events-auto ' : ''
  }ui-badge !inline-block max-w-[10rem] truncate`;
  if (!props.onClick) {
    return (
      <span
        className={className}
        data-tone="accent"
        data-size="xs"
        data-on-media={props.pointerEvents ? 'true' : undefined}
        data-testid="gallery-card-custom-group"
        title={props.name}
      >
        {props.name}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-tone="accent"
      data-size="xs"
      data-on-media={props.pointerEvents ? 'true' : undefined}
      data-testid="gallery-card-custom-group"
      title={`Show group ${props.name}`}
      className={className}
      onClick={event => {
        event.stopPropagation();
        props.onClick?.(props.name);
      }}
    >
      {props.name}
    </button>
  );
}
