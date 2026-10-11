'use client';

import Link from 'next/link';
import { settingsTabHref } from '@/lib/settings-nav';
import {
  recheckRenderBackend,
  RENDER_BACKEND_OFFLINE_MESSAGE,
  useRenderBackend,
} from '@/lib/render-backend-status';

/**
 * Top-of-page notice while nothing can render (ComfyUI unreachable): says so in plain words and
 * that the work is kept, with a way to fix it. Queue / Animate buttons are disabled meanwhile.
 */
export default function RenderOfflineBanner() {
  const { state } = useRenderBackend();
  if (state !== 'offline') return null;
  return (
    <div
      role="status"
      data-testid="render-offline-banner"
      className="mx-auto mb-3 mt-2 flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="type-body font-medium text-[var(--tint-danger-text)]">ComfyUI is offline</p>
        <p className="type-caption text-[var(--text-secondary)]">
          {RENDER_BACKEND_OFFLINE_MESSAGE}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="ui-btn-secondary px-3 py-1.5 text-xs"
          data-testid="render-offline-retry"
          onClick={recheckRenderBackend}
        >
          Check again
        </button>
        <Link href={settingsTabHref('overview')} className="ui-btn-ghost px-3 py-1.5 text-xs">
          Connection settings
        </Link>
      </div>
    </div>
  );
}
