import { apiError, apiJson } from '@/lib/api/response';
import { appendAuditLog } from '@/lib/auth/audit-log';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import {
  deleteSharedPreset,
  listSharedPresets,
  upsertSharedPreset,
} from '@/lib/storage/shared-preset-store';

export const runtime = 'nodejs';

export async function GET() {
  return apiJson({ presets: listSharedPresets() });
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== 'admin' || !user.enabled) {
    return apiError('Admin access required.', 403);
  }

  let body: {
    id?: string;
    label?: string;
    hints?: string;
    category?: string;
    model?: string;
    notes?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  if (!body.label?.trim() || !body.hints?.trim()) {
    return apiError('label and hints are required.', 400);
  }

  const preset = upsertSharedPreset({
    id: body.id,
    label: body.label,
    hints: body.hints,
    category: body.category,
    model: body.model,
    notes: body.notes,
    publishedBy: user.username,
  });

  appendAuditLog({
    actorUserId: user.id,
    actorUsername: user.username,
    action: 'shared-preset.upsert',
    target: preset.id,
    details: preset.label,
  });

  return apiJson({ preset });
}

export async function DELETE(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== 'admin' || !user.enabled) {
    return apiError('Admin access required.', 403);
  }

  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) {
    return apiError('Preset id is required.', 400);
  }

  deleteSharedPreset(id);
  appendAuditLog({
    actorUserId: user.id,
    actorUsername: user.username,
    action: 'shared-preset.delete',
    target: id,
  });

  return apiJson({ ok: true });
}
