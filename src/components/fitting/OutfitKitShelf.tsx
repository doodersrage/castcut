'use client';

import { Button } from '@/components/ui/Button';

export type OutfitShelfKit = { id: string; label: string; thumb: string | null };

/**
 * Above Outfit's kit picker (2026-11-05): clothing types as chips (a dropdown of 12,000 kits hid
 * them), and the kits you starred (★) or tried last, first — one click puts one on.
 */
export default function OutfitKitShelf({
  categories,
  category,
  onCategory,
  shelf,
  selectedId,
  favorite,
  disabled,
  onSelect,
  onToggleFavorite,
}: {
  categories: Array<{ value: string; label: string }>;
  category: string;
  onCategory: (value: string) => void;
  /** Starred kits first, then recently tried. */
  shelf: Array<OutfitShelfKit & { starred: boolean }>;
  selectedId?: string;
  /** Whether the kit on now is starred (null: no kit on). */
  favorite: boolean | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="space-y-2" data-testid="outfit-kit-shelf">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Clothing type">
        {categories.map(option => (
          <Button
            key={option.value}
            variant="chip"
            selected={option.value === category}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              option.value === category
                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
            role="radio"
            aria-checked={option.value === category}
            disabled={disabled}
            data-testid={`outfit-kit-type-${option.value}`}
            onClick={() => onCategory(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {favorite !== null ? (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={favorite}
            disabled={disabled}
            title={favorite ? 'Starred — click to unstar' : 'Star this kit: it stays first here'}
            data-testid="outfit-kit-star"
            onClick={onToggleFavorite}
          >
            {favorite ? '★ Starred' : '☆ Star this kit'}
          </Button>
        ) : null}
        {shelf.length ? (
          <span className="type-caption text-[var(--text-muted)]">Starred and recently tried</span>
        ) : null}
      </div>
      {shelf.length ? (
        <ol className="flex gap-1.5 overflow-x-auto pb-1" data-testid="outfit-kit-shelf-row">
          {shelf.map(kit => (
            <li key={kit.id} className="shrink-0">
              <Button
                variant="plain"
                disabled={disabled}
                title={`${kit.label}${kit.starred ? ' · starred' : ''}`}
                aria-label={`Wear ${kit.label}`}
                aria-pressed={kit.id === selectedId}
                data-testid={`outfit-kit-shelf-${kit.id}`}
                className={`relative block h-16 w-12 overflow-hidden rounded-md border-2 ${
                  kit.id === selectedId ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]'
                }`}
                onClick={() => onSelect(kit.id)}
              >
                {kit.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a kit's packshot
                  <img
                    src={kit.thumb}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="type-caption flex h-full items-center justify-center px-0.5 text-center leading-tight">
                    {kit.label.slice(0, 18)}
                  </span>
                )}
                {kit.starred ? (
                  <span
                    aria-hidden
                    className="absolute right-0.5 top-0 text-xs text-amber-400 drop-shadow"
                  >
                    ★
                  </span>
                ) : null}
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
