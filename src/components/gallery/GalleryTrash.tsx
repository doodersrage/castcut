'use client';

import { TrashRecentlyDeleted, useTrash } from '@/components/trash/TrashRecentlyDeleted';
import { pushAppToast } from '@/lib/app/toast';
import { restoreGalleryTrashItem } from '@/lib/gallery/trash-restore';

/** Gallery entries deleted in the last 14 days, each with Restore (M10 T2). */
export default function GalleryTrash() {
  const items = useTrash().filter(item => item.kind === 'gallery-entry');
  return (
    <TrashRecentlyDeleted
      items={items}
      what="renders"
      testId="gallery-trash"
      onRestore={async item => {
        const restored = await restoreGalleryTrashItem(item.id);
        if (!restored) pushAppToast({ text: 'That render could not be put back.', tone: 'danger' });
      }}
    />
  );
}
