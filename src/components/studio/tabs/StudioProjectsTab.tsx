'use client';

import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { PromptProject } from '@/lib/prompt-projects';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadScenePresets } from '@/lib/scene-presets';
import { downloadTextFile } from '@/lib/history-export-formats';
import { importProjectBundle } from '@/lib/project-bundle-import';
import {
  deletePromptProject,
  loadPromptProjects,
  setActiveProjectId,
  upsertPromptProject,
} from '@/lib/prompt-projects';
import {
  ToolBlockGroup,
  ToolContentPanel,
  ToolSection,
  accentButtonClass,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { Button, PrimaryButton } from '@/components/ui/Button';
import type { StudioTabId } from '@/lib/studio-nav';

export type SharedProject = {
  id: string;
  name: string;
  notes?: string;
};

export type StudioProjectsTabProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  projects: PromptProject[];
  activeProjectId?: string;
  sharedProjects: SharedProject[];
  projectName: string;
  projectNotes: string;
  onProjectNameChange: (name: string) => void;
  onProjectNotesChange: (notes: string) => void;
  onProjectsChange: (projects: PromptProject[]) => void;
  onActiveProjectChange: (projectId: string | undefined) => void;
  onBackupStatusChange: (status: string) => void;
  onGalleryRevision: () => void;
  onSelectTab: (tab: StudioTabId) => void;
};

export default function StudioProjectsTab({
  accent,
  entries,
  projects,
  activeProjectId,
  sharedProjects,
  projectName,
  projectNotes,
  onProjectNameChange,
  onProjectNotesChange,
  onProjectsChange,
  onActiveProjectChange,
  onBackupStatusChange,
  onGalleryRevision,
  onSelectTab,
}: StudioProjectsTabProps) {
  return (
    <ToolSection title="Prompt projects">
      <p className="text-sm text-[var(--text-secondary)]">
        Group history and gallery jobs under named campaigns. Set an active project to filter Studio
        history.
      </p>
      {sharedProjects.length > 0 ? (
        <div className="mb-4 space-y-2 ui-panel-accent p-4">
          <p className="type-caption text-[var(--accent-text)]">Shared team projects</p>
          <ul className="space-y-2">
            {sharedProjects.map(project => (
              <li
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)]/60 bg-[var(--bg-muted)]/30 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{project.name}</p>
                  {project.notes ? (
                    <p className="text-xs text-[var(--text-muted)]">{project.notes}</p>
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const local = upsertPromptProject({
                      id: `shared-${project.id}`,
                      name: project.name,
                      notes: project.notes,
                    });
                    onProjectsChange(loadPromptProjects());
                    onActiveProjectChange(local.id);
                    setActiveProjectId(local.id);
                    onBackupStatusChange(`Adopted shared project “${project.name}”.`);
                  }}
                >
                  Adopt as local
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={projectName}
          onChange={event => onProjectNameChange(event.target.value)}
          placeholder="Project name"
          className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <input
          value={projectNotes}
          onChange={event => onProjectNotesChange(event.target.value)}
          placeholder="Notes (optional)"
          className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
      </div>
      <PrimaryButton
        accentClassName={accentButtonClass(accent)}
        disabled={!projectName.trim()}
        onClick={() => {
          const project = upsertPromptProject({
            id: `project-${Date.now().toString(36)}`,
            name: projectName,
            notes: projectNotes,
          });
          onProjectsChange(loadPromptProjects());
          onActiveProjectChange(project.id);
          setActiveProjectId(project.id);
          onProjectNameChange('');
          onProjectNotesChange('');
          onBackupStatusChange(`Created project “${project.name}”.`);
        }}
      >
        Create project
      </PrimaryButton>
      <ToolBlockGroup className="mt-[var(--block-gap)]">
        {projects.map(project => (
          <ToolContentPanel key={project.id} className="ui-block-group">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="type-heading">{project.name}</p>
                {project.notes ? (
                  <p className="type-caption text-[var(--text-muted)]">{project.notes}</p>
                ) : null}
              </div>
              <div className="ui-list-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    onActiveProjectChange(project.id);
                    setActiveProjectId(project.id);
                    onSelectTab('history');
                  }}
                >
                  {activeProjectId === project.id ? 'Active' : 'Set active'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    deletePromptProject(project.id);
                    onProjectsChange(loadPromptProjects());
                    if (activeProjectId === project.id) {
                      onActiveProjectChange(undefined);
                    }
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => {
                    void (async () => {
                      const { buildProjectBundle, exportProjectBundleJson } =
                        await import('@/lib/project-bundle');
                      const bundle = buildProjectBundle({
                        project,
                        history: entries,
                        gallery: loadComfyGallery(),
                        scenePresets: loadScenePresets(),
                      });
                      downloadTextFile(
                        exportProjectBundleJson(bundle),
                        `${project.name.replace(/\s+/g, '-').toLowerCase()}-bundle.json`,
                        'application/json'
                      );
                      onBackupStatusChange(`Exported bundle for “${project.name}”.`);
                    })();
                  }}
                >
                  Export bundle
                </Button>
              </div>
            </div>
          </ToolContentPanel>
        ))}
      </ToolBlockGroup>
      <div className="mt-4">
        <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
          Import project bundle
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Choose a JSON file"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then(async raw => {
                try {
                  const { parseProjectBundle } = await import('@/lib/project-bundle');
                  const bundle = parseProjectBundle(raw);
                  const result = importProjectBundle(bundle);
                  onProjectsChange(loadPromptProjects());
                  onActiveProjectChange(bundle.project.id);
                  setActiveProjectId(bundle.project.id);
                  onGalleryRevision();
                  onBackupStatusChange(
                    `Imported “${bundle.project.name}” · +${result.historyAdded} history · +${result.galleryAdded} gallery`
                  );
                } catch (err) {
                  onBackupStatusChange(err instanceof Error ? err.message : 'Import failed.');
                }
                event.target.value = '';
              });
            }}
          />
        </label>
      </div>
    </ToolSection>
  );
}
