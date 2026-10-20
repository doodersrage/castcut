import type { EmailConfig } from './types';
import type { PublicEmailConfig, StoredEmailConfig } from './types';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { readKv, writeKv } from '@/lib/sqlite/kv';

export type { PublicEmailConfig, StoredEmailConfig } from './types';

let memoryOverlay: StoredEmailConfig | null = null;

export function clearEmailConfigMemory(): void {
  memoryOverlay = null;
}

export function readStoredEmailConfig(): StoredEmailConfig | null {
  if (isServerStorageEnabled()) {
    const stored = readKv<StoredEmailConfig>('global', 'email-config');
    if (stored) {
      return stored;
    }
  }
  return memoryOverlay;
}

function mergeStoredEmailConfig(
  current: StoredEmailConfig,
  input: StoredEmailConfig
): StoredEmailConfig {
  const next: StoredEmailConfig = {
    ...current,
    ...input,
    smtp: {
      ...current.smtp,
      ...input.smtp,
    },
  };
  if (input.smtp && input.smtp.pass === '') {
    next.smtp = { ...next.smtp, pass: current.smtp?.pass };
  }
  return next;
}

export function writeStoredEmailConfig(input: StoredEmailConfig): {
  persisted: boolean;
  config: StoredEmailConfig;
} {
  const next = mergeStoredEmailConfig(readStoredEmailConfig() ?? {}, input);
  if (!isServerStorageEnabled()) {
    memoryOverlay = next;
    return { persisted: false, config: next };
  }
  writeKv('global', 'email-config', next);
  memoryOverlay = null;
  return { persisted: true, config: next };
}

export function overlayEmailConfig(
  base: EmailConfig,
  stored: StoredEmailConfig | null
): EmailConfig {
  if (!stored) {
    return base;
  }
  const host = stored.smtp?.host?.trim() || base.smtp.host;
  const from = stored.from?.trim() || base.from;
  const enabled =
    stored.enabled === true || stored.enabled === false
      ? stored.enabled
      : base.enabled || (Boolean(host) && Boolean(from));
  return {
    enabled,
    from,
    adminEmail: stored.adminEmail?.trim() || base.adminEmail,
    smtp: {
      host,
      port:
        typeof stored.smtp?.port === 'number' && Number.isFinite(stored.smtp.port)
          ? stored.smtp.port
          : base.smtp.port,
      secure: stored.smtp?.secure ?? base.smtp.secure,
      user: stored.smtp?.user?.trim() || base.smtp.user,
      pass: stored.smtp?.pass?.trim() || base.smtp.pass,
    },
    notifyBatch: stored.notifyBatch ?? base.notifyBatch,
    notifyPassword: stored.notifyPassword ?? base.notifyPassword,
  };
}

export function toPublicEmailConfig(config: EmailConfig, persisted: boolean): PublicEmailConfig {
  return {
    persisted,
    enabled: config.enabled,
    from: config.from,
    adminEmail: config.adminEmail,
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      hasPassword: Boolean(config.smtp.pass),
    },
    notifyBatch: config.notifyBatch,
    notifyPassword: config.notifyPassword,
  };
}
