'use client';

/**
 * Restoring a deleted Gallery entry from the trash (M10 T2). It comes back under a new id — the
 * old id's deletion is a synced tombstone every device keeps — with its kept media copied to that
 * id on the server and its links moved to it.
 */
import { addComfyGalleryEntry, type ComfyGalleryEntry } from './comfyui-gallery';
import { addToTrash, restoredGalleryEntry, takeFromTrash } from './trash';

export async function restoreGalleryTrashItem(trashId: string): Promise<ComfyGalleryEntry | null> {
  const item = takeFromTrash(trashId);
  if (!item?.entry) {
    if (item) addToTrash([item]);
    return null;
  }
  const newId = crypto.randomUUID();
  const copied = await fetch('/api/gallery/media/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: item.entry.id, to: newId }),
  })
    .then(response => (response.ok ? (response.json() as Promise<{ copied?: boolean }>) : null))
    .then(body => body?.copied === true)
    .catch(() => false);
  // Media not copied (server storage off, or none kept): the old links still lead to what there
  // is — ComfyUI's outputs — so only the id changes.
  const entry = copied ? restoredGalleryEntry(item.entry, newId) : { ...item.entry, id: newId };
  return addComfyGalleryEntry(entry);
}
