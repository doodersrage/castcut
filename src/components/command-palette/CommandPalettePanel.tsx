import Link from 'next/link';
import BrandBars from '@/components/BrandBars';
import BrandMark from '@/components/BrandMark';
import CommandPaletteResults from '@/components/command-palette/CommandPaletteResults';
import type { CommandItem } from '@/components/command-palette/types';
import { isLeanWorkspaceMode, loadWorkspaceMode } from '@/lib/workspace-mode';

type CommandPalettePanelProps = {
  query: string;
  filtered: CommandItem[];
  activeIndex: number;
  favorites: string[];
  navReady: boolean;
  listRef: React.RefObject<HTMLUListElement | null>;
  onQueryChange: (value: string) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSetActiveIndex: (index: number) => void;
  onRunItem: (item: CommandItem) => void;
  onSetFavorites: (favorites: string[]) => void;
  onClose: () => void;
  onOpenShortcuts: () => void;
};

export default function CommandPalettePanel({
  query,
  filtered,
  activeIndex,
  favorites,
  navReady,
  listRef,
  onQueryChange,
  onInputKeyDown,
  onSetActiveIndex,
  onRunItem,
  onSetFavorites,
  onClose,
  onOpenShortcuts,
}: CommandPalettePanelProps) {
  return (
    <div className="ui-command-overlay fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[max(4.5rem,10vh)] sm:pt-[12vh]">
      <div
        className="ui-command-panel relative z-10 w-full max-w-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <BrandMark size={28} />
          <div className="min-w-0 flex-1">
            <p className="type-brand type-heading tracking-tight text-[var(--text-primary)]">
              Castcut
            </p>
            <p className="ui-meta flex items-center gap-1.5">
              <BrandBars />
              Jump anywhere
            </p>
          </div>
          <kbd className="ui-kbd shrink-0">esc</kbd>
        </div>
        <input
          autoFocus
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={
            isLeanWorkspaceMode(loadWorkspaceMode())
              ? 'Jump to a tool, Studio tab, or search…'
              : 'Jump to a page, Studio/Settings tab, or search…'
          }
          className="w-full border-b border-[var(--border-subtle)] bg-transparent px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
        />
        <CommandPaletteResults
          filtered={filtered}
          activeIndex={activeIndex}
          favorites={favorites}
          listRef={listRef}
          onSetActiveIndex={onSetActiveIndex}
          onRunItem={onRunItem}
          onSetFavorites={onSetFavorites}
        />
        <div className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          Tip: <kbd className="ui-kbd">⌘/Ctrl+K</kbd> · arrows + Enter · star to pin ·{' '}
          <button type="button" className="ui-text-link" onClick={onOpenShortcuts}>
            Shortcuts
          </button>
          {navReady ? (
            <>
              .{' '}
              <Link href="/settings" className="ui-text-link" onClick={onClose}>
                Settings
              </Link>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 z-0"
        onClick={onClose}
      />
    </div>
  );
}
