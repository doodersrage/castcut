import { randomUUID } from 'node:crypto';
import { loadSharedProjects, saveSharedProjects } from '@/lib/sqlite/tables';

export type SharedProject = {
  id: string;
  name: string;
  groupIds: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
};

export function listSharedProjects(): SharedProject[] {
  return loadSharedProjects();
}

export function listSharedProjectsForGroups(groupIds: string[]): SharedProject[] {
  const set = new Set(groupIds);
  return loadSharedProjects().filter(project => project.groupIds.some(groupId => set.has(groupId)));
}

export function upsertSharedProject(input: {
  id?: string;
  name: string;
  groupIds: string[];
  notes?: string;
  createdBy?: string;
}): SharedProject {
  const projects = loadSharedProjects();
  const now = Date.now();
  const existingIndex = input.id ? projects.findIndex(project => project.id === input.id) : -1;
  const next: SharedProject = {
    id: input.id ?? randomUUID(),
    name: input.name.trim(),
    groupIds: input.groupIds,
    notes: input.notes?.trim() || undefined,
    createdAt: existingIndex >= 0 ? projects[existingIndex].createdAt : now,
    updatedAt: now,
    createdBy: input.createdBy ?? projects[existingIndex]?.createdBy,
  };
  if (existingIndex >= 0) {
    projects[existingIndex] = next;
  } else {
    projects.unshift(next);
  }
  saveSharedProjects(projects);
  return next;
}

export function deleteSharedProject(id: string): boolean {
  const projects = loadSharedProjects();
  const next = projects.filter(project => project.id !== id);
  if (next.length === projects.length) {
    return false;
  }
  saveSharedProjects(next);
  return true;
}
