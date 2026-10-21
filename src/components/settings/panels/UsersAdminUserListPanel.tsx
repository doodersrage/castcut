'use client';

import type { AuthUserPublic } from '@/lib/auth/types';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';

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
          <Button
            key={user.id}
            onClick={() => setSelectedUserId(user.id)}
            variant="pill"
            data-active={selectedUserId === user.id ? 'true' : undefined}
            className="max-md:min-h-8"
          >
            {user.username}
            {user.role === 'admin' ? ' · admin' : ''}
            {!user.enabled ? ' · disabled' : ''}
          </Button>
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
