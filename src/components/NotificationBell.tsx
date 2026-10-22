'use client';

import { Button } from '@/components/ui/Button';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrandBars from '@/components/BrandBars';
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_UPDATED,
  unreadNotificationCount,
  type AppNotification,
} from '@/lib/app/notification-center';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setItems(loadNotifications());
    setUnread(unreadNotificationCount());
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
    });
    window.addEventListener(NOTIFICATIONS_UPDATED, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <Button
        variant="outline"
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        className="relative rounded-full border-[var(--border-default)]/80 bg-[var(--bg-base)]/50 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      >
        Alerts
        {unread > 0 ? (
          <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-3xs text-[var(--on-accent)]">
            {unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          ref={panelRef}
          className="ui-tray-card absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-[var(--text-primary)]">Notifications</p>
              <p className="ui-meta mt-0.5 flex items-center gap-1.5">
                <BrandBars />
                Activity
              </p>
            </div>
            <Button
              variant="quiet"
              type="button"
              className="rounded-md px-1.5 py-0.5 text-3xs text-[var(--accent-text)] underline-offset-auto transition hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => {
                markAllNotificationsRead();
                refresh();
              }}
            >
              Mark all read
            </Button>
          </div>
          <ul className="ui-scroll-region max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-6 text-center">
                <p className="text-xs font-medium text-[var(--text-primary)]">
                  No notifications yet
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-[var(--text-muted)]">
                  Queue completions, review tips, and sync notices will show up here.
                </p>
              </li>
            ) : (
              items.slice(0, 20).map(item => (
                <li
                  key={item.id}
                  className="border-b border-[var(--border-subtle)]/80 last:border-0"
                >
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => {
                        markNotificationRead(item.id);
                        setOpen(false);
                        refresh();
                      }}
                      className={`block px-3 py-2 text-xs transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)] active:bg-[var(--bg-muted)]/80 ${item.read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
                    >
                      <p className="font-medium">{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 text-[var(--text-muted)]">{item.body}</p>
                      ) : null}
                    </Link>
                  ) : (
                    <div
                      className={`px-3 py-2 text-xs ${item.read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
                    >
                      <p className="font-medium">{item.title}</p>
                      {item.body ? (
                        <p className="mt-0.5 text-[var(--text-muted)]">{item.body}</p>
                      ) : null}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
