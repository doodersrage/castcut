import BrandStudioIllustration from '@/components/BrandStudioIllustration';
import { isNavFavorite, toggleNavFavorite } from '@/lib/app/nav-favorites';
import type { CommandItem } from '@/components/command-palette/types';
import { Button } from '@/components/ui/Button';

type CommandPaletteResultsProps = {
  filtered: CommandItem[];
  activeIndex: number;
  favorites: string[];
  listRef: React.RefObject<HTMLUListElement | null>;
  onSetActiveIndex: (index: number) => void;
  onRunItem: (item: CommandItem) => void;
  onSetFavorites: (favorites: string[]) => void;
};

export default function CommandPaletteResults({
  filtered,
  activeIndex,
  favorites,
  listRef,
  onSetActiveIndex,
  onRunItem,
  onSetFavorites,
}: CommandPaletteResultsProps) {
  return (
    <ul ref={listRef} className="ui-scroll-region max-h-[50vh] overflow-y-auto py-2">
      {filtered.length === 0 ? (
        <li className="px-4 py-6 text-center">
          <BrandStudioIllustration size={72} className="mx-auto mb-3 opacity-80" />
          <p className="text-sm text-[var(--text-muted)]">No matches.</p>
        </li>
      ) : (
        filtered.map((item, index) => {
          const favorited = item.href ? isNavFavorite(item.href, favorites) : false;
          return (
            <li key={item.id}>
              <div
                data-command-index={index}
                data-active={index === activeIndex ? 'true' : 'false'}
                className="ui-command-item flex w-full items-center gap-1 px-2"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between rounded-[var(--radius-md)] px-2 py-2.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onMouseEnter={() => onSetActiveIndex(index)}
                  onClick={() => onRunItem(item)}
                >
                  <span className="min-w-0">
                    <span className="ui-command-item-label block truncate font-medium">
                      {favorited ? '★ ' : ''}
                      {item.label}
                    </span>
                    {item.subtitle ? (
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{item.group}</span>
                </button>
                {item.href ? (
                  <Button
                    variant="quiet"
                    type="button"
                    aria-label={favorited ? 'Unpin from sidebar' : 'Pin to sidebar'}
                    title={favorited ? 'Unpin' : 'Pin'}
                    className="shrink-0 rounded-[var(--radius-md)] px-2 py-2 text-sm transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    onClick={event => {
                      event.stopPropagation();
                      onSetFavorites(toggleNavFavorite(item.href!));
                    }}
                  >
                    {favorited ? '★' : '☆'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })
      )}
    </ul>
  );
}
