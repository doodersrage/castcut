'use client';

import type { UserAnalyticsSnapshot } from '@/lib/user/analytics';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { formatCapturedAt } from '@/hooks/useUsersAdminState';

export type UsersAdminAnalyticsPanelProps = {
  analyticsSnapshots: UserAnalyticsSnapshot[];
  analyticsHistory: Record<string, UserAnalyticsSnapshot[]>;
  selectedUserId: string | null;
  selectedUserAnalytics: UserAnalyticsSnapshot | null;
};

export default function UsersAdminAnalyticsPanel({
  analyticsSnapshots,
  analyticsHistory,
  selectedUserId,
  selectedUserAnalytics,
}: UsersAdminAnalyticsPanelProps) {
  return (
    <ToolSection title="User analytics">
      {analyticsSnapshots.length === 0 ? (
        <EmptyState
          compact
          icon="compare"
          title="No analytics synced yet"
          description="Users need to sign in and use Studio or Gallery on their device before snapshots appear here."
        />
      ) : (
        <div className="ui-table-shell overflow-x-auto">
          <table className="ui-table text-sm">
            <thead>
              <tr>
                <th>User</th>
                <th>History</th>
                <th className="px-3 py-2 font-medium">Gallery</th>
                <th className="px-3 py-2 font-medium">Rated</th>
                <th className="px-3 py-2 font-medium">Favorites</th>
                <th className="px-3 py-2 font-medium">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {analyticsSnapshots.map(snapshot => (
                <tr
                  key={snapshot.userId}
                  className={`border-b border-[var(--border-subtle)]/50 transition hover:bg-[var(--bg-muted)]/40 ${
                    selectedUserId === snapshot.userId ? 'bg-[var(--accent-muted)]' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-[var(--text-primary)]">{snapshot.username}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                    {snapshot.historyTotal}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                    {snapshot.galleryTotal}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                    {snapshot.historyRated + snapshot.galleryRated}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                    {snapshot.historyFavorites + snapshot.galleryFavorites}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                    {formatCapturedAt(snapshot.capturedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUserAnalytics ? (
        <div className="mt-4 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 text-sm text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--accent-text)]">{selectedUserAnalytics.username}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Synced {formatCapturedAt(selectedUserAnalytics.capturedAt)}
          </p>
          {(analyticsHistory[selectedUserAnalytics.userId] ?? []).length > 1 ? (
            <div className="mt-4 flex h-16 items-end gap-1">
              {[...(analyticsHistory[selectedUserAnalytics.userId] ?? [])]
                .slice(0, 20)
                .reverse()
                .map(point => {
                  const max = Math.max(
                    ...(analyticsHistory[selectedUserAnalytics.userId] ?? []).map(
                      entry => entry.historyTotal
                    ),
                    1
                  );
                  const height = Math.max(8, Math.round((point.historyTotal / max) * 100));
                  return (
                    <div
                      key={point.capturedAt}
                      title={`${point.historyTotal} history · ${new Date(point.capturedAt).toLocaleDateString()}`}
                      className="flex-1 rounded-t bg-[var(--accent)]/40"
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedUserAnalytics.topPositiveTokens.slice(0, 5).map(token => (
              <span
                key={`pos-${token}`}
                className="rounded-full border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-2 py-0.5 text-xs text-[var(--tint-success-text)]"
              >
                + {token}
              </span>
            ))}
            {selectedUserAnalytics.topNegativeTokens.slice(0, 5).map(token => (
              <span
                key={`neg-${token}`}
                className="rounded-full border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-2 py-0.5 text-xs text-[var(--tint-danger-text)]"
              >
                − {token}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </ToolSection>
  );
}
