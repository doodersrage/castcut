'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { peekCollapsibleOpen, saveCollapsibleOpen } from '@/lib/collapsible-persist';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const STORAGE_PREFIX = 'tool-engine-sidebar:';
/** Legacy Play-only keys — still read so preferences survive the rename. */
const LEGACY_PLAY_PREFIX = 'play-engine-sidebar:';

/** Persist whether the Engine/Settings column is open (default closed). */
export function useToolEngineSidebar(persistKey: string, defaultOpen = false) {
  const storageId = `${STORAGE_PREFIX}${persistKey}`;
  const legacyId = `${LEGACY_PLAY_PREFIX}${persistKey}`;
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      const stored = peekCollapsibleOpen(storageId) ?? peekCollapsibleOpen(legacyId);
      setOpen(stored ?? defaultOpen);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultOpen, legacyId, storageId]);

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

/** @deprecated Prefer useToolEngineSidebar */
export const usePlayEngineSidebar = useToolEngineSidebar;

type ToolEngineToggleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  panelId?: string;
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

/** Prominent control to show/hide the Engine Settings popover. */
export default function ToolEngineToggle({
  open,
  onOpenChange,
  className = '',
  panelId,
}: ToolEngineToggleProps) {
  return (
    <button
      type="button"
      data-testid="play-engine-toggle"
      aria-pressed={open}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={panelId}
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
          {open ? 'Close when done' : 'Model & workflow'}
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

type ToolEnginePopoverProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
};

/** Header-anchored Engine panel — full page stays wide; settings open on demand. */
export function ToolEnginePopover({
  children,
  title = 'Engine',
  description = 'Model, detail, and workflow for this tool.',
  className = '',
}: ToolEnginePopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`play-engine-popover-root ${className}`.trim()}>
      <ToolEngineToggle open={open} onOpenChange={setOpen} panelId={panelId} />
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={title}
          data-testid="play-engine-popover"
          className="play-engine-popover"
        >
          <div className="play-engine-popover-header">
            <div className="min-w-0">
              <p className="play-engine-popover-title">{title}</p>
              <p className="play-engine-popover-desc">{description}</p>
            </div>
            <button
              type="button"
              className="play-engine-popover-close"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
          <div className="play-engine-popover-body ui-sidebar-dense">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer ToolEngineToggle */
export { ToolEngineToggle as PlayEngineToggle };
