'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { peekCollapsibleOpen, saveCollapsibleOpen } from '@/lib/collapsible-persist';
import { engineSummary, formatEngineSummary } from '@/lib/engine-summary';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { toolEffectiveModel } from '@/lib/tool-effective-model';

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

/** Wide enough for the docked Engine column (Tailwind `xl`). */
const WIDE_ENGINE_QUERY = '(min-width: 1280px)';

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_ENGINE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** True on screens that dock the Engine column; false on the server and on narrow screens. */
export function useWideEngineLayout(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_ENGINE_QUERY).matches,
    () => false
  );
}

function subscribeSettings(onChange: () => void): () => void {
  window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onChange);
}

/** "Qwen-Image-2512 · Good · 2 LoRAs" for the active settings, kept current. */
export function useEngineSummaryText(toolId?: string): string {
  return useSyncExternalStore(
    subscribeSettings,
    () => {
      const shared = loadSettingsCache().shared;
      // Same model the tool's Engine panel shows — remembered per tool, image-only on still tools.
      const model = toolEffectiveModel(shared.model, toolId) ?? shared.model;
      return formatEngineSummary(engineSummary({ ...shared, model }, toolId));
    },
    () => ''
  );
}

function EngineGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  );
}

/**
 * Header chip: what this tool will run (model · quality · LoRAs), and the way into the Engine
 * controls — a docked column on wide screens, a bottom sheet otherwise.
 */
export function ToolEngineChip({
  open,
  onClick,
  toolId,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  toolId?: string;
  /** id of the column or sheet the chip opens. */
  controls?: string;
}) {
  const summary = useEngineSummaryText(toolId);
  return (
    <button
      type="button"
      data-testid="tool-engine-chip"
      aria-expanded={open}
      aria-controls={controls}
      title={open ? 'Hide the Engine controls' : 'Model, quality, LoRAs and workflow'}
      onClick={onClick}
      className={`tool-engine-chip ${open ? 'tool-engine-chip-open' : ''}`.trim()}
    >
      <EngineGlyph />
      <span className="tool-engine-chip-label">Engine</span>
      {summary ? <span className="tool-engine-chip-summary">{summary}</span> : null}
      <svg
        viewBox="0 0 12 12"
        width="10"
        height="10"
        aria-hidden
        className="tool-engine-chip-caret"
      >
        <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

/** Bottom sheet for the Engine controls on phones and tablets. */
export function ToolEngineSheet({
  open,
  onClose,
  title = 'Engine',
  description,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  id?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') {
    return null;
  }
  return createPortal(
    <div className="tool-engine-sheet-root">
      <button
        type="button"
        aria-label="Close Engine"
        className="tool-engine-sheet-backdrop"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tool-engine-sheet"
        className="tool-engine-sheet"
      >
        <div className="tool-engine-sheet-handle" aria-hidden />
        <div className="tool-engine-sheet-header">
          <div className="min-w-0">
            <p id={titleId} className="tool-engine-sheet-title">
              {title}
            </p>
            {description ? <p className="tool-engine-sheet-desc">{description}</p> : null}
          </div>
          <button type="button" className="tool-engine-sheet-done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="tool-engine-sheet-body ui-sidebar-dense">{children}</div>
      </div>
    </div>,
    document.body
  );
}
