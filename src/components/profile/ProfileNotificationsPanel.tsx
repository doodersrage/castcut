'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_UPDATED,
  unreadNotificationCount,
  type AppNotification,
} from '@/lib/app/notification-center';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';

function NotificationRows({ items, onRead }: { items: AppNotification[]; onRead: () => void }) {
  if (items.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        Queue completions, review tips, and sync notices will show up here.
      </p>
    );
  }

  return (
    <ul className="ui-scroll-region max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
      {items.slice(0, 20).map(item => (
        <li key={item.id}>
          {item.href ? (
            <Link
              href={item.href}
              onClick={() => {
                markNotificationRead(item.id);
                onRead();
              }}
              className={`block px-3 py-2.5 text-sm transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)] ${
                item.read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
              }`}
            >
              <p className="font-medium">{item.title}</p>
              {item.body ? (
                <p className="type-caption mt-0.5 text-[var(--text-muted)]">{item.body}</p>
              ) : null}
            </Link>
          ) : (
            <div
              className={`px-3 py-2.5 text-sm ${item.read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
            >
              <p className="font-medium">{item.title}</p>
              {item.body ? (
                <p className="type-caption mt-0.5 text-[var(--text-muted)]">{item.body}</p>
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ProfileNotificationsPanel() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

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

  return (
    <ToolSection title="In-app alerts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption text-[var(--text-muted)]">
          {unread > 0 ? `${unread} unread` : 'All caught up'}
        </p>
        {items.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              markAllNotificationsRead();
              refresh();
            }}
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="mt-3">
        <NotificationRows items={items} onRead={refresh} />
      </div>
    </ToolSection>
  );
}
