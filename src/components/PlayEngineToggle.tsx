'use client';

import { useEffect, useState } from 'react';
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

function EngineGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h16" />
          <path d="M18 10l3 2-3 2" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
        </>
      )}
    </svg>
  );
}

/** Prominent control to show/hide the Play Engine Settings column. */
export default function PlayEngineToggle({
  open,
  onOpenChange,
  className = '',
}: PlayEngineToggleProps) {
  return (
    <button
      type="button"
      data-testid="play-engine-toggle"
      aria-pressed={open}
      aria-expanded={open}
      title={open ? 'Hide model and workflow settings' : 'Show model and workflow settings'}
      onClick={() => onOpenChange(!open)}
      className={`play-engine-toggle ${open ? 'play-engine-toggle-open' : ''} ${className}`.trim()}
    >
      <span className="play-engine-toggle-icon" aria-hidden>
        <EngineGlyph open={open} />
      </span>
      <span className="play-engine-toggle-copy">
        <span className="play-engine-toggle-label">{open ? 'Hide Engine' : 'Engine'}</span>
        <span className="play-engine-toggle-hint">
          {open ? 'Settings column open' : 'Model & workflow'}
        </span>
      </span>
      {!open ? (
        <span className="play-engine-toggle-cta" aria-hidden>
          Show
        </span>
      ) : null}
    </button>
  );
}
