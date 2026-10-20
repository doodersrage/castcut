export type StorageNamespace =
  | 'settings-cache'
  | 'prompt-history'
  | 'comfy-gallery'
  | 'gallery-deleted-ids'
  | 'studio-extras'
  /** @deprecated Prefer studio-extras; kept for legacy server files. */
  | 'scheduled-batch'
  /** @deprecated Prefer studio-extras; kept for legacy server files. */
  | 'webhook-settings'
  /** @deprecated Prefer studio-extras; kept for legacy server files. */
  | 'avoided-tokens'
  /** @deprecated Prefer studio-extras; kept for legacy server files. */
  | 'prompt-projects';

/** Namespaces actively pushed/pulled by auto-sync. */
export const SYNC_STORAGE_NAMESPACES: StorageNamespace[] = [
  'settings-cache',
  'prompt-history',
  'comfy-gallery',
  'gallery-deleted-ids',
  'studio-extras',
];

export const STORAGE_NAMESPACES: StorageNamespace[] = [
  ...SYNC_STORAGE_NAMESPACES,
  'scheduled-batch',
  'webhook-settings',
  'avoided-tokens',
  'prompt-projects',
];

export function isStorageNamespace(value: unknown): value is StorageNamespace {
  return typeof value === 'string' && STORAGE_NAMESPACES.includes(value as StorageNamespace);
}
