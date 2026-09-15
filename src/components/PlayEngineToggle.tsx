'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { loadCollapsibleOpen, saveCollapsibleOpen } from '@/lib/collapsible-persist';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

/** Persist whether the Play Engine/Settings column is open (default closed). */
export function usePlayEngineSidebar(persistKey: string, defaultOpen = false) {
  const storageId = `play-engine-sidebar:${persistKey}`;
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      setOpen(loadCollapsibleOpen(storageId, defaultOpen));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultOpen, storageId]);

  const setEngineOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setOpen(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (hydrated || typeof window !== 'undefined') {
        saveCollapsibleOpen(storageId, value);
      }
      return value;
    });
  };

  return { engineOpen: open, setEngineOpen } as const;
}

type PlayEngineToggleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
};

/** Compact control to show/hide the Play Engine Settings column. */
export default function PlayEngineToggle({
  open,
  onOpenChange,
  className = '',
}: PlayEngineToggleProps) {
  return (
    <Button
      size="sm"
      variant={open ? 'secondary' : 'ghost'}
      className={className}
      data-testid="play-engine-toggle"
      aria-pressed={open}
      onClick={() => onOpenChange(!open)}
    >
      {open ? 'Hide Engine' : 'Engine'}
    </Button>
  );
}
