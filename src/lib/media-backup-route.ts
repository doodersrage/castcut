import 'server-only';

import { resolveRequestUser } from './auth/access';
import { isAuthEnabled } from './auth/store';
import { getComfyUiBaseUrl } from './comfyui-client';
import { stripEmptyComfyUiRuntime } from './comfyui-config';
import { mediaBackupOwner } from './media-backup-server';

/** Whose gallery-media / identity folder a Pictures backup reads or fills; null = not signed in. */
export function mediaBackupRequestOwner(request: Request): string | null {
  if (!isAuthEnabled()) return mediaBackupOwner(null);
  const user = resolveRequestUser(request);
  return user?.enabled ? mediaBackupOwner(user.id) : null;
}

export function mediaBackupComfyUrl(comfyUrl: string | null | undefined): string {
  return getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: comfyUrl ?? undefined }));
}
