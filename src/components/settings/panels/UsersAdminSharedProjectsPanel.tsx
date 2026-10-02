'use client';

import type { AuthGroup } from '@/lib/auth/types';
import type { SharedProject } from '@/lib/shared-projects-store';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';

export type UsersAdminSharedProjectsPanelProps = {
  groups: AuthGroup[];
  sharedProjects: SharedProject[];
  sharedProjectDraft: { name: string; notes: string; groupIds: string[] };
  setSharedProjectDraft: React.Dispatch<
    React.SetStateAction<{ name: string; notes: string; groupIds: string[] }>
  >;
  onPublishProject: () => void | Promise<void>;
  onDeleteProject: (id: string) => void | Promise<void>;
};

export default function UsersAdminSharedProjectsPanel({
  groups,
  sharedProjects,
  sharedProjectDraft,
  setSharedProjectDraft,
  onPublishProject,
  onDeleteProject,
}: UsersAdminSharedProjectsPanelProps) {
  return (
    <ToolSection title="Shared projects">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Assign group-scoped campaign projects. Members see these in Studio → Projects.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <TextInput
          value={sharedProjectDraft.name}
          onChange={event => setSharedProjectDraft(prev => ({ ...prev, name: event.target.value }))}
          placeholder="Project name"
        />
        <TextInput
          value={sharedProjectDraft.notes}
          onChange={event =>
            setSharedProjectDraft(prev => ({ ...prev, notes: event.target.value }))
          }
          placeholder="Notes (optional)"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {groups.map(group => {
          const active = sharedProjectDraft.groupIds.includes(group.id);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() =>
                setSharedProjectDraft(prev => ({
                  ...prev,
                  groupIds: active
                    ? prev.groupIds.filter(id => id !== group.id)
                    : [...prev.groupIds, group.id],
                }))
              }
              className={`rounded-full border px-3 py-1 text-xs transition max-md:min-h-8 ${
                active
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-default)]/80 text-[var(--text-muted)] hover:border-[var(--border-default)]'
              }`}
            >
              {group.name}
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        className="mb-4"
        disabled={!sharedProjectDraft.name.trim()}
        onClick={() => void onPublishProject()}
      >
        Publish project
      </Button>
      <ul className="space-y-2">
        {sharedProjects.map(project => (
          <li
            key={project.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-[var(--text-primary)]">{project.name}</p>
              {project.notes ? (
                <p className="text-xs text-[var(--text-muted)]">{project.notes}</p>
              ) : null}
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Groups:{' '}
                {project.groupIds.length > 0
                  ? project.groupIds
                      .map(groupId => groups.find(group => group.id === groupId)?.name ?? groupId)
                      .join(', ')
                  : 'all (none selected)'}
              </p>
            </div>
            <button
              type="button"
              className="text-xs ui-status-danger"
              onClick={() => void onDeleteProject(project.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </ToolSection>
  );
}
