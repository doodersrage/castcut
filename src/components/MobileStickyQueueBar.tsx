'use client';

import type { ReactNode } from 'react';
import { useBottomDockRef } from '@/hooks/useBottomDockRef';

type MobileStickyQueueBarProps = {
  disabled?: boolean;
  label?: string;
  onQueue: () => void;
  status?: string | null;
  children?: ReactNode;
  /** When true, Ctrl+Enter hits this CTA (also works while typing). */
  primaryGenerate?: boolean;
};

/** Touch-first sticky queue CTA for phone viewports — uses design tokens. */
export default function MobileStickyQueueBar({
  disabled,
  label = 'Queue',
  onQueue,
  status,
  children,
  primaryGenerate = false,
}: MobileStickyQueueBarProps) {
  const dockRef = useBottomDockRef<HTMLDivElement>();
  return (
    <div ref={dockRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto ui-mobile-dock px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {children}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={Boolean(disabled)}
            suppressHydrationWarning
            data-action={primaryGenerate ? 'primary-generate' : undefined}
            onClick={onQueue}
            className="ui-btn-primary min-h-12 flex-1 px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {label}
          </button>
          {status ? (
            <p className="max-w-[40%] truncate text-[11px] text-[var(--text-muted)]">{status}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
