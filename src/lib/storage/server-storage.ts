import {
  countNamespaceGallery,
  listSqliteStorageNamespaces,
  readNamespaceStorage,
  writeNamespaceStorage,
} from '../sqlite/namespace-storage';
import type { StorageNamespace } from './namespaces';

export type { StorageNamespace } from './namespaces';

export function isServerStorageEnabled(): boolean {
  return Boolean(process.env.PROMPT_DATA_DIR?.trim());
}

export function readServerStorage<T>(namespace: StorageNamespace): T | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  return readNamespaceStorage<T>(namespace);
}

export function writeServerStorage<T>(namespace: StorageNamespace, data: T): void {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled. Set PROMPT_DATA_DIR.');
  }
  writeNamespaceStorage(namespace, data);
}

export function listServerStorageNamespaces(): StorageNamespace[] {
  return listSqliteStorageNamespaces();
}

export function countServerGalleryEntries(): number {
  if (!isServerStorageEnabled()) {
    return 0;
  }
  return countNamespaceGallery();
}
