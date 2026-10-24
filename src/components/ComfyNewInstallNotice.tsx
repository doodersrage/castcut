'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { settingsComfyUiSectionHref } from '@/lib/settings/comfyui-nav';
import type { ComfyInstallReport } from '@/lib/comfyui/install-report';

const DISMISSED_KEY = 'castcut-comfy-install-notice-dismissed';
/** Asked once, a little after the app opens (not on the first paint). */
const ASK_AFTER_MS = 6_000;

/**
 * "This is a new ComfyUI install": shown when the install answering is not the one set up last,
 * or when model downloads would land in a folder this ComfyUI never reads — both what a switch
 * left behind (2026-10-24). Links to Settings → ComfyUI → Switching ComfyUI. Dismissed for the
 * session, per install.
 */
export default function ComfyNewInstallNotice() {
  const [report, setReport] = useState<ComfyInstallReport | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim();
      const query = `brief=1${comfyUrl ? `&comfyUrl=${encodeURIComponent(comfyUrl)}` : ''}`;
      void fetch(`/api/comfyui/install?${query}`, { cache: 'no-store' })
        .then(response => (response.ok ? (response.json() as Promise<ComfyInstallReport>) : null))
        .then(data => {
          if (cancelled || !data?.reachable) return;
          let gone = false;
          try {
            gone = window.sessionStorage.getItem(DISMISSED_KEY) === (data.identity ?? '');
          } catch {
            /* storage blocked: shown */
          }
          setDismissed(gone);
          setReport(data);
        })
        .catch(() => {
          // ComfyUI or the server unreachable: the offline banner says so.
        });
    }, ASK_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!report || dismissed) return null;
  const wrongFolder = report.downloads.matches === false;
  if (!report.isNew && !wrongFolder) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, report.identity ?? '');
    } catch {
      /* this page only */
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      data-testid="comfy-new-install-notice"
      className="mx-auto mb-3 mt-2 flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-64">
        <p className="type-body font-medium text-[var(--text-primary)]">
          {report.isNew
            ? `New ComfyUI install found (${report.label ?? 'ComfyUI'})`
            : 'Model downloads go to the wrong folder'}
        </p>
        <p className="type-caption text-[var(--text-secondary)]">
          {report.isNew
            ? 'Bring your pictures over, point model downloads at it and check its node packs — a few clicks.'
            : 'A model downloaded now would land where this ComfyUI never looks. One click fixes it.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={settingsComfyUiSectionHref('comfy-setup')}
          className="ui-btn-secondary px-3 py-1.5 text-xs"
          onClick={dismiss}
          data-testid="comfy-new-install-open"
        >
          Set it up
        </Link>
        <button type="button" className="ui-btn-ghost px-3 py-1.5 text-xs" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
