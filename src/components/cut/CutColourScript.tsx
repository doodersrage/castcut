'use client';

import { Button } from '@/components/ui/Button';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';

/**
 * Cut's colour script: each shot's colour as the film shows it (look, shot colour and LUT on its
 * average), a block as wide as the shot runs, in film order — the film's colour arc at a glance,
 * and the shot that doesn't belong. Click one to pick it.
 */
export default function CutColourScript({
  loaded,
  colours,
  onPick,
}: {
  loaded: CutPreviewLoaded | null;
  colours: ReadonlyArray<[number, number, number] | null>;
  onPick: (key: string) => void;
}) {
  const items = (loaded?.timeline.items ?? []).filter(item => item.shot >= 0);
  if (!loaded || !items.length) return null;
  const total = items.reduce((sum, item) => sum + item.durSec, 0) || 1;
  return (
    <figure className="mb-3 space-y-1" data-testid="cut-colour-script">
      <figcaption className="type-caption text-[var(--text-muted)]">
        Colour script — each shot&apos;s colour as the film shows it, as long as it runs
      </figcaption>
      <div className="flex h-8 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
        {items.map(item => {
          const colour = colours[item.shot];
          const key = loaded.keys[item.shot];
          const title = loaded.shots[item.shot]?.title ?? 'Shot';
          return (
            <Button
              key={`${item.shot}-${item.startSec}`}
              variant="quiet"
              className="!h-full !min-h-0 min-w-[3px] !rounded-none !p-0"
              style={{
                width: `${(item.durSec / total) * 100}%`,
                background: colour ? `rgb(${colour.join(',')})` : 'var(--bg-muted)',
              }}
              title={colour ? title : `${title} — not read yet`}
              aria-label={`${title} — pick it`}
              data-testid="cut-colour-script-shot"
              onClick={() => key && onPick(key)}
            />
          );
        })}
      </div>
    </figure>
  );
}
