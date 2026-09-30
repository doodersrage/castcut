'use client';

import { useEffect, useState } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { computeGalleryStats, type GalleryStats } from '@/lib/gallery-stats';
import { ButtonLink } from '@/components/ui/Button';
import { StatCard, ToolSection } from '@/components/ui/ToolPageShell';

function modelLabel(id: string): string {
  const definition = getComfyModelDefinition(id as never);
  return definition.id === id ? definition.label : id;
}

/**
 * Gallery analytics moved off the Gallery page (its stats bar is four working chips now):
 * average rating, success rate, median render time and the busiest model.
 */
export default function GalleryGlanceCard() {
  const [stats, setStats] = useState<GalleryStats | null>(null);

  useEffect(() => {
    const refresh = () => setStats(computeGalleryStats(loadComfyGallery()));
    refresh();
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refresh);
  }, []);

  if (!stats || stats.total === 0) {
    return null;
  }

  const ratings = ([5, 4, 3, 2, 1] as const)
    .map(star => `${star}★ ${stats.ratingHistogram[star]}`)
    .join(' · ');

  return (
    <ToolSection
      title="Gallery at a glance"
      description={`${stats.total} outputs · ${stats.completed} done · ${stats.unreviewed} unreviewed`}
      data-testid="dashboard-gallery-glance"
    >
      <div className="grid grid-cols-2 gap-[var(--group-gap)] lg:grid-cols-4">
        <StatCard
          label="Average rating"
          value={stats.avgRating != null ? `${stats.avgRating}★` : '—'}
          detail={ratings}
        />
        <StatCard
          label="Success rate"
          value={stats.successRate != null ? `${stats.successRate}%` : '—'}
          detail={stats.topError ? `Top error: ${stats.topError.slice(0, 60)}` : undefined}
        />
        <StatCard
          label="Median render"
          value={
            stats.medianRenderMs != null ? `${Math.round(stats.medianRenderMs / 100) / 10}s` : '—'
          }
        />
        <StatCard
          label="Top model"
          value={stats.topModel ? modelLabel(stats.topModel.id) : '—'}
          detail={stats.topModel ? `${stats.topModel.completed} completed` : undefined}
        />
      </div>
      <div className="mt-3">
        <ButtonLink href="/gallery" variant="ghost" size="sm">
          Open Gallery
        </ButtonLink>
      </div>
    </ToolSection>
  );
}
