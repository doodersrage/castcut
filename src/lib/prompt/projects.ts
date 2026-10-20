import {
  readBrowserString,
  readBrowserValue,
  removeBrowserKey,
  writeBrowserString,
  writeBrowserValue,
} from '../storage/browser-storage';

export const PROMPT_PROJECTS_KEY = 'comfy-prompt-projects-v1';
export const ACTIVE_PROJECT_KEY = 'comfy-prompt-active-project-v1';

export type PromptProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  /** Shared project id from server when assigned to a group. */
  sharedProjectId?: string;
  groupIds?: string[];
};

export function loadPromptProjects(): PromptProject[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readBrowserValue<PromptProject[]>(PROMPT_PROJECTS_KEY) ?? [];
  } catch {
    return [];
  }
}

export function savePromptProjects(projects: PromptProject[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(PROMPT_PROJECTS_KEY, projects.slice(0, 50));
}

export function upsertPromptProject(
  project: Omit<PromptProject, 'createdAt' | 'updatedAt'> &
    Partial<Pick<PromptProject, 'createdAt'>>
): PromptProject {
  const existing = loadPromptProjects();
  const now = Date.now();
  const next: PromptProject = {
    id: project.id,
    name: project.name.trim(),
    notes: project.notes?.trim() || undefined,
    createdAt: project.createdAt ?? now,
    updatedAt: now,
  };
  savePromptProjects([next, ...existing.filter(entry => entry.id !== project.id)]);
  return next;
}

export function deletePromptProject(id: string): void {
  savePromptProjects(loadPromptProjects().filter(entry => entry.id !== id));
  if (loadActiveProjectId() === id) {
    setActiveProjectId(undefined);
  }
}

export function loadActiveProjectId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return readBrowserString(ACTIVE_PROJECT_KEY)?.trim() || undefined;
}

export function setActiveProjectId(id: string | undefined): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!id) {
    removeBrowserKey(ACTIVE_PROJECT_KEY);
    return;
  }
  writeBrowserString(ACTIVE_PROJECT_KEY, id);
}

export function itemMatchesProject(
  projectId: string | undefined,
  metadata?: Record<string, unknown>
): boolean {
  if (!projectId) {
    return true;
  }
  return metadata?.projectId === projectId;
}
