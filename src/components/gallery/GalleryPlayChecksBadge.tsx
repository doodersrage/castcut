'use client';

import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

/** "pose 82% · face 64%" from Day / Story checks — warning tint when either missed. */
export default function GalleryPlayChecksBadge({ entry }: { entry: ComfyGalleryEntry }) {
  const checks = entry.playChecks;
  if (!checks || (checks.pose == null && checks.face == null)) return null;
  const miss = checks.poseMiss === true || checks.faceMiss === true;
  const parts = [
    checks.pose != null ? `pose ${Math.round(checks.pose * 100)}%` : null,
    checks.face != null ? `face ${Math.round(checks.face * 100)}%` : null,
  ].filter(Boolean);
  const title = [
    checks.poseMiss ? "Didn't follow its pose guide." : null,
    checks.faceMiss ? "Doesn't look like the Cast." : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] ${
        miss
          ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)]'
      }`}
      title={title || 'Pose / face check from Day or Story'}
      data-testid="gallery-card-play-checks"
    >
      {parts.join(' · ')}
    </span>
  );
}
