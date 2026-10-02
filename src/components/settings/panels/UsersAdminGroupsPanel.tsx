'use client';

import type { AuthGroup } from '@/lib/auth/types';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import FeaturePicker from '@/components/settings/panels/FeaturePicker';
import type { GroupFormState } from '@/hooks/useUsersAdminState';

export type UsersAdminGroupsPanelProps = {
  groups: AuthGroup[];
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  selectedGroup: AuthGroup | null;
  groupForm: GroupFormState;
  setGroupForm: React.Dispatch<React.SetStateAction<GroupFormState>>;
  onSaveGroup: () => void | Promise<void>;
  onDeleteGroup: (id: string) => void | Promise<void>;
};

export default function UsersAdminGroupsPanel({
  groups,
  selectedGroupId,
  setSelectedGroupId,
  selectedGroup,
  groupForm,
  setGroupForm,
  onSaveGroup,
  onDeleteGroup,
}: UsersAdminGroupsPanelProps) {
  return (
    <ToolSection title="Groups">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Block features for everyone in a group. User-specific blocks stack on top of group blocks.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {groups.map(group => (
          <button
            key={group.id}
            type="button"
            onClick={() => setSelectedGroupId(group.id)}
            className={`rounded-full border px-3 py-1 text-xs transition max-md:min-h-8 ${
              selectedGroupId === group.id
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
            }`}
          >
            {group.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedGroupId('__new__')}
          className="rounded-full border border-dashed border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-muted)]"
        >
          + New group
        </button>
      </div>

      {selectedGroupId ? (
        <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="type-caption text-[var(--text-muted)]">Name</span>
              <TextInput
                value={groupForm.name}
                onChange={event => setGroupForm(prev => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="type-caption text-[var(--text-muted)]">Description</span>
              <TextInput
                value={groupForm.description}
                onChange={event =>
                  setGroupForm(prev => ({ ...prev, description: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="type-caption text-[var(--text-muted)]">Quota (req/min)</span>
              <TextInput
                type="number"
                value={groupForm.quotaMaxPerMinute}
                onChange={event =>
                  setGroupForm(prev => ({ ...prev, quotaMaxPerMinute: event.target.value }))
                }
                placeholder="Default"
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="type-caption text-[var(--text-muted)]">Blocked features for this group</p>
            <FeaturePicker
              value={groupForm.blockedFeatures}
              onChange={blockedFeatures => setGroupForm(prev => ({ ...prev, blockedFeatures }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSaveGroup()}>
              Save group
            </Button>
            {selectedGroup ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void onDeleteGroup(selectedGroup.id)}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToolSection>
  );
}
