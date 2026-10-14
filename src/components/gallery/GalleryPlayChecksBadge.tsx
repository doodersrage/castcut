'use client';

import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { galleryNeedsLookReasons } from '@/lib/gallery-needs-look';

/**
 * "pose 82% · face 64%" from Day / Story checks, and what a clip or marks check found — warning
 * tint when anything needs a look (gallery-needs-look.ts).
 */
export default function GalleryPlayChecksBadge({ entry }: { entry: ComfyGalleryEntry }) {
  const checks = entry.playChecks;
  if (!checks) return null;
  const reasons = galleryNeedsLookReasons(entry);
  const parts = [
    checks.pose != null ? `pose ${Math.round(checks.pose * 100)}%` : null,
    checks.face != null ? `face ${Math.round(checks.face * 100)}%` : null,
    typeof checks.clipCutAt === 'number' ? 'cut' : null,
    checks.clipSilent ? 'silent' : null,
    checks.marksMissing ? 'marks' : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const title = reasons.length
    ? `Needs a look: ${reasons.join('; ')}.`
    : 'Checks from Day, Story or the clip check';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] ${
        reasons.length
          ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)]'
      }`}
      title={title}
      data-testid="gallery-card-play-checks"
    >
      {parts.join(' · ')}
    </span>
  );
}
