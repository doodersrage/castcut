'use client';

import type { AuthGroup, AuthUserPublic } from '@/lib/auth/types';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import FeaturePicker from '@/components/settings/panels/FeaturePicker';
import type { UserFormState } from '@/hooks/useUsersAdminState';

export type UsersAdminUserFormPanelProps = {
  selectedUserId: string | null;
  selectedUser: AuthUserPublic | null;
  groups: AuthGroup[];
  userForm: UserFormState;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  onSaveUser: () => void | Promise<void>;
  onInviteUser: () => void | Promise<void>;
  onDeleteUser: (id: string) => void | Promise<void>;
};

export default function UsersAdminUserFormPanel({
  selectedUserId,
  selectedUser,
  groups,
  userForm,
  setUserForm,
  onSaveUser,
  onInviteUser,
  onDeleteUser,
}: UsersAdminUserFormPanelProps) {
  if (!selectedUserId) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Username</span>
          <TextInput
            value={userForm.username}
            onChange={event => setUserForm(prev => ({ ...prev, username: event.target.value }))}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">
            Password{' '}
            {selectedUser
              ? '(leave blank to keep current)'
              : '(required to save, or use Invite by email)'}
          </span>
          <TextInput
            type="password"
            value={userForm.password}
            onChange={event => setUserForm(prev => ({ ...prev, password: event.target.value }))}
          />
        </label>
        <label className="space-y-2 text-sm sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Email</span>
          <TextInput
            type="email"
            value={userForm.email}
            onChange={event => setUserForm(prev => ({ ...prev, email: event.target.value }))}
            placeholder="Required for invite / reset email"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={userForm.emailNotifyBatch}
            onChange={event =>
              setUserForm(prev => ({ ...prev, emailNotifyBatch: event.target.checked }))
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Email on batch completion
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={userForm.emailNotifySecurity}
            onChange={event =>
              setUserForm(prev => ({ ...prev, emailNotifySecurity: event.target.checked }))
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Email on password change
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Role</span>
          <select
            value={userForm.role}
            onChange={event =>
              setUserForm(prev => ({
                ...prev,
                role: event.target.value as 'admin' | 'user' | 'viewer',
              }))
            }
            className="ui-input w-full"
          >
            <option value="user">User</option>
            <option value="viewer">Viewer (read-only)</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={userForm.enabled}
            onChange={event => setUserForm(prev => ({ ...prev, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Account enabled
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">API quota (req/min)</span>
          <TextInput
            type="number"
            value={userForm.quotaMaxPerMinute}
            onChange={event =>
              setUserForm(prev => ({ ...prev, quotaMaxPerMinute: event.target.value }))
            }
            placeholder="Inherit default / group"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={userForm.exportEnabled}
            onChange={event =>
              setUserForm(prev => ({ ...prev, exportEnabled: event.target.checked }))
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Nightly server export
        </label>
      </div>

      {groups.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Groups</p>
          <div className="flex flex-wrap gap-2">
            {groups.map(group => {
              const checked = userForm.groupIds.includes(group.id);
              return (
                <label
                  key={group.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setUserForm(prev => ({
                        ...prev,
                        groupIds: checked
                          ? prev.groupIds.filter(id => id !== group.id)
                          : [...prev.groupIds, group.id],
                      }))
                    }
                    className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
                  />
                  {group.name}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {userForm.role === 'admin' ? (
        <p className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--accent-text)]">
          Admin accounts always have access to every section. Feature blocks apply only to regular
          users.
        </p>
      ) : userForm.role === 'viewer' ? (
        <p className="rounded-xl border border-[var(--border-default)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-sm text-[var(--text-muted)]">
          Viewers can browse Dashboard, Gallery, and Studio only.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Section access</p>
          <FeaturePicker
            value={userForm.blockedFeatures}
            onChange={blockedFeatures => setUserForm(prev => ({ ...prev, blockedFeatures }))}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSaveUser()}>
          Save user
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!userForm.email.trim() && !selectedUser?.email}
          onClick={() => void onInviteUser()}
        >
          {selectedUser ? 'Send invite / reset email' : 'Invite by email'}
        </Button>
        {selectedUser && selectedUser.role !== 'admin' ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void fetch('/api/auth/impersonate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: selectedUser.id }),
                }).then(() => {
                  // Full reload on purpose: the session is now the impersonated user.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = '/';
                });
              }}
            >
              Impersonate
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void onDeleteUser(selectedUser.id)}
            >
              Delete
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
