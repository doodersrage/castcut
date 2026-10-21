'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { GalleryLineageGroup } from '@/lib/gallery/lineage-groups';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import { buildGalleryLineageTimeline } from '@/lib/gallery/lineage-timeline';

type GalleryLineageBlockProps = {
  group: GalleryLineageGroup;
  collapsed: boolean;
  onToggle: () => void;
  layout: GalleryLayoutMode;
  columns?: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry, options?: { derivativeIndex?: number }) => ReactNode;
};

export default function GalleryLineageBlock({
  group,
  collapsed,
  onToggle,
  layout,
  columns,
  gridClassName,
  renderCard,
}: GalleryLineageBlockProps) {
  const gridStyle: CSSProperties | undefined =
    layout !== 'list' && columns
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : undefined;
  const timeline = collapsed ? [] : buildGalleryLineageTimeline(group.root, group.derivatives);

  return (
    <div
      className={
        layout === 'list'
          ? 'space-y-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-3'
          : 'col-span-full space-y-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-3'
      }
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-3xs font-medium uppercase tracking-wide text-[var(--accent-text)]">
          Lineage · {group.derivatives.length + 1} outputs
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.6 text-3xs font-medium text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      {timeline.length > 0 ? (
        <ol
          data-testid="gallery-lineage-timeline"
          className="space-y-1 px-1 text-3xs text-[var(--text-secondary)]"
        >
          {timeline.map(step => (
            <li key={step.entry.id} className="truncate">
              {step.entry.derivedKind ?? 'derivative'}
              {step.diffs.length > 0
                ? ` · ${step.diffs.map(diff => `${diff.label} ${diff.values[1] ?? ''}`).join(' · ')}`
                : ' · same params'}
            </li>
          ))}
        </ol>
      ) : null}
      <div className={layout === 'list' ? 'space-y-3' : gridClassName} style={gridStyle}>
        {renderCard(group.root)}
        {!collapsed
          ? group.derivatives.map((derivative, index) => (
              <div
                key={derivative.id}
                className={
                  layout === 'list'
                    ? `ml-3 border-l border-[var(--accent-border)] pl-3${index === 0 ? '' : ' opacity-65 transition group-hover/card:opacity-100'}`
                    : undefined
                }
              >
                {renderCard(derivative, { derivativeIndex: index })}
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
