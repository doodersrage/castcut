'use client';

import type { AuthUserPublic } from '@/lib/auth/types';
import { ToolSection } from '@/components/ui/ToolPageShell';

export type UsersAdminUserListPanelProps = {
  users: AuthUserPublic[];
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
};

export default function UsersAdminUserListPanel({
  users,
  selectedUserId,
  setSelectedUserId,
}: UsersAdminUserListPanelProps) {
  return (
    <ToolSection title="Users">
      <div className="mb-4 flex flex-wrap gap-2">
        {users.map(user => (
          <button
            key={user.id}
            type="button"
            onClick={() => setSelectedUserId(user.id)}
            className={`rounded-full border px-3 py-1 text-xs transition max-md:min-h-8 ${
              selectedUserId === user.id
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
            }`}
          >
            {user.username}
            {user.role === 'admin' ? ' · admin' : ''}
            {!user.enabled ? ' · disabled' : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedUserId('__new__')}
          className="rounded-full border border-dashed border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)]"
        >
          + New user
        </button>
      </div>
    </ToolSection>
  );
}
