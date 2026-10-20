import { useEffect } from 'react';
import { markOnboardingDiscoverPalette } from '@/lib/app/onboarding-hooks';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import type { CommandItem } from '@/components/command-palette/types';

type UseCommandPaletteKeyboardOptions = {
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setQuery: (value: string) => void;
  filtered: CommandItem[];
  activeIndex: number;
  setActiveIndex: (value: number | ((prev: number) => number)) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
  onRunItem: (item: CommandItem) => void;
};

export function useCommandPaletteGlobalShortcut(
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void,
  setQuery: (value: string) => void
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.shiftKey) {
        event.preventDefault();
        setOpen(value => {
          const next = !value;
          if (next) {
            markOnboardingDiscoverPalette();
          }
          return next;
        });
        setQuery('');
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        setQuery('');
        markOnboardingDiscoverPalette();
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen, setQuery]);
}

export function useCommandPaletteActiveIndexReset(
  open: boolean,
  query: string,
  filteredLength: number,
  setActiveIndex: (value: number) => void
) {
  useEffect(() => {
    scheduleAfterCommit(() => {
      setActiveIndex(0);
    });
  }, [filteredLength, query, open, setActiveIndex]);
}

export function useCommandPaletteScrollActiveItem(
  open: boolean,
  activeIndex: number,
  listRef: React.RefObject<HTMLUListElement | null>
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listRef, open]);
}

export function createCommandPaletteInputKeyDown({
  filtered,
  activeIndex,
  setActiveIndex,
  onRunItem,
}: Pick<
  UseCommandPaletteKeyboardOptions,
  'filtered' | 'activeIndex' | 'setActiveIndex' | 'onRunItem'
>) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index =>
        filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) {
        onRunItem(item);
      }
    }
  };
}
