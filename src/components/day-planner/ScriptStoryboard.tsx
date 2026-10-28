'use client';

import { Button } from '@/components/ui/Button';
import type { StoryboardCard, StoryboardRow } from '@/lib/day/storyboard';

/**
 * A script as a storyboard (M9 T3): its planned shots in order, scene by scene — each with its kept
 * take, a take, or a card saying what it is. A card opens its Scene, or makes it.
 */
export default function ScriptStoryboard({
  rows,
  onOpenScene,
  onMake,
}: {
  rows: readonly StoryboardRow[];
  onOpenScene: (sceneId: string) => void;
  onMake: (card: StoryboardCard) => void;
}) {
  if (!rows.length) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="storyboard-empty">
        No shots planned yet — draft a scene&apos;s shots and they appear here.
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid="storyboard">
      {rows.map(row => (
        <section key={row.scene.id} aria-label={row.scene.heading || row.scene.place}>
          <h4 className="type-caption mb-1.5 font-medium uppercase tracking-wide">
            {row.scene.heading || row.scene.place}
          </h4>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {row.cards.map(card => (
              <li key={card.shot.id}>
                <Button
                  variant="plain"
                  className="flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-left hover:border-[var(--accent-border)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  data-testid={`storyboard-card-${card.shot.id}`}
                  data-picture={card.picture ?? 'none'}
                  title={card.sceneId ? 'Open its Scene' : 'Make it a Scene'}
                  onClick={() => (card.sceneId ? onOpenScene(card.sceneId) : onMake(card))}
                >
                  {card.pictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a take's picture
                    <img
                      src={card.pictureUrl}
                      alt={`Shot ${card.label}`}
                      className="aspect-[3/4] w-full bg-[var(--bg-muted)] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex aspect-[3/4] w-full items-center justify-center bg-[var(--bg-muted)] p-3 text-center text-sm text-[var(--text-muted)]">
                      {card.text || card.kind}
                    </span>
                  )}
                  <span className="space-y-0.5 p-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">{card.label}</span>
                      <span className="type-caption text-[var(--text-muted)]">
                        {card.picture === 'kept'
                          ? 'Kept take'
                          : card.picture === 'take'
                            ? 'A take'
                            : card.sceneId
                              ? 'Scene made'
                              : 'Planned'}
                      </span>
                    </span>
                    <span className="type-caption block text-[var(--text-muted)]">
                      {card.kind} · {card.shot.seconds}s
                    </span>
                    {card.pictureUrl && card.text ? (
                      <span className="type-caption line-clamp-2 block">{card.text}</span>
                    ) : null}
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
