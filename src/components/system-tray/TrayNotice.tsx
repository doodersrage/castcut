'use client';

import Link from 'next/link';
import {
  NOTICE_TONE_CLASS,
  type TrayNoticeTone,
} from '@/components/system-tray/tray-notice-styles';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';

export function TrayNotice({
  text,
  tone,
  href,
  actionLabel,
  actionEvent,
  moreCount = 0,
  onShowMore,
  onDismiss,
}: {
  text: string;
  tone: TrayNoticeTone;
  href?: string;
  actionLabel?: string;
  actionEvent?: string;
  /** Older notices hidden behind this one. */
  moreCount?: number;
  onShowMore?: () => void;
  onDismiss: () => void;
}) {
  const hrefLabel = href && !href.startsWith('http') ? resolveQueueFailureGuideLabel(href) : 'Open';

  return (
    <div role="status" className={`pointer-events-auto ui-tray-notice ${NOTICE_TONE_CLASS[tone]}`}>
      <div className="flex items-start gap-3">
        <p className="type-caption min-w-0 flex-1 leading-relaxed">{text}</p>
        <div className="flex shrink-0 items-center gap-2">
          {moreCount > 0 && onShowMore ? (
            <button
              type="button"
              data-testid="system-tray-more-notices"
              aria-label={`Show ${moreCount} more notice${moreCount === 1 ? '' : 's'}`}
              className="rounded-full border border-[var(--border-subtle)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={onShowMore}
            >
              +{moreCount}
            </button>
          ) : null}
          {href?.startsWith('http') ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={onDismiss}
            >
              Open
            </a>
          ) : href ? (
            <Link
              href={href}
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => {
                if (
                  /settings|workflow-map|model-assets|lora|connection|vram|inference-engine|data/i.test(
                    href
                  )
                ) {
                  void import('@/lib/local-observability').then(
                    ({ notePlaybookCtaClickMetric }) => {
                      notePlaybookCtaClickMetric();
                    }
                  );
                  void Promise.all([
                    import('@/lib/last-failed-queue'),
                    import('@/lib/system-tray-messages'),
                  ]).then(
                    ([
                      { loadLastFailedQueue, RETRY_LAST_FAILED_QUEUE_EVENT },
                      { pushSystemTrayMessage },
                    ]) => {
                      if (!loadLastFailedQueue()) {
                        return;
                      }
                      pushSystemTrayMessage({
                        text: `${hrefLabel} opened — retry the last failed queue when ready.`,
                        tone: 'info',
                        actionLabel: 'Retry',
                        actionEvent: RETRY_LAST_FAILED_QUEUE_EVENT,
                        ttlMs: 20_000,
                      });
                    }
                  );
                }
                onDismiss();
              }}
            >
              {hrefLabel}
            </Link>
          ) : null}
          {actionLabel && actionEvent ? (
            <button
              type="button"
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => {
                window.dispatchEvent(new Event(actionEvent));
                onDismiss();
              }}
            >
              {actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            className="type-caption text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
