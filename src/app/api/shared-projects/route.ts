import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import {
  deleteSharedProject,
  listSharedProjects,
  listSharedProjectsForGroups,
  upsertSharedProject,
} from '@/lib/storage/shared-projects-store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiJson({ projects: listSharedProjects() });
  }
  if (user.role === 'admin') {
    return apiJson({ projects: listSharedProjects() });
  }
  return apiJson({ projects: listSharedProjectsForGroups(user.groupIds) });
}

export async function POST(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin required.', 403);
  }
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    groupIds?: string[];
    notes?: string;
  };
  if (!body.name?.trim()) {
    return apiError('name is required.', 400);
  }
  const project = upsertSharedProject({
    id: body.id,
    name: body.name,
    groupIds: body.groupIds ?? [],
    notes: body.notes,
    createdBy: user.id,
  });
  return apiJson({ project });
}

export async function DELETE(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin required.', 403);
  }
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return apiError('id is required.', 400);
  }
  if (!deleteSharedProject(body.id)) {
    return apiError('Project not found.', 404);
  }
  return apiJson({ ok: true });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET', 'POST', 'DELETE'], '/api/shared-projects');
}
