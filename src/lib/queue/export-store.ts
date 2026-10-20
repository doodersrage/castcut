import path from 'node:path';
import type { PublicQueueExportConfig, StoredQueueExportConfig } from './export-types';
import { isServerStorageEnabled } from '../storage/server-storage';
import { readKv, writeKv } from '../sqlite/kv';

export type { PublicQueueExportConfig, StoredQueueExportConfig } from './export-types';

const BLOCKED_PREFIXES = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/root',
];

export function assertSafeQueueExportDir(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Export directory is empty.');
  }
  if (trimmed.includes('\0')) {
    throw new Error('Export directory is invalid.');
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error('Export directory must be an absolute path.');
  }
  const resolved = path.resolve(trimmed);
  const blocked = BLOCKED_PREFIXES.some(
    prefix => resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`)
  );
  if (blocked) {
    throw new Error('Export directory cannot be a system path.');
  }
  return resolved;
}

export function readStoredQueueExportConfig(): StoredQueueExportConfig | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  return readKv<StoredQueueExportConfig>('global', 'queue-export');
}

export function writeStoredQueueExportConfig(input: StoredQueueExportConfig): {
  persisted: boolean;
  config: StoredQueueExportConfig;
} {
  const next: StoredQueueExportConfig = { ...readStoredQueueExportConfig(), ...input };
  if (typeof next.dir === 'string' && next.dir.trim()) {
    next.dir = assertSafeQueueExportDir(next.dir);
  } else {
    next.dir = undefined;
  }
  if (!isServerStorageEnabled()) {
    return { persisted: false, config: next };
  }
  writeKv('global', 'queue-export', next);
  return { persisted: true, config: next };
}

export function resolveQueueExportDir(
  stored: StoredQueueExportConfig | null = readStoredQueueExportConfig()
): string | null {
  const envDir = process.env.COMFYUI_QUEUE_EXPORT_DIR?.trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  if (stored?.enabled === false) {
    return null;
  }
  const overlayDir = stored?.dir?.trim();
  if (!overlayDir) {
    return null;
  }
  return assertSafeQueueExportDir(overlayDir);
}

export function toPublicQueueExportConfig(
  stored: StoredQueueExportConfig | null,
  persisted: boolean
): PublicQueueExportConfig {
  const envDir = process.env.COMFYUI_QUEUE_EXPORT_DIR?.trim() ?? '';
  const resolved = (() => {
    try {
      return resolveQueueExportDir(stored) ?? '';
    } catch {
      return stored?.dir?.trim() ?? '';
    }
  })();
  return {
    persisted,
    enabled: Boolean(resolved),
    dir: resolved,
    envDir,
    envWins: Boolean(envDir),
  };
}
