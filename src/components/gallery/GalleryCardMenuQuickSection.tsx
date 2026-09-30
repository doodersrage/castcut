import { requestGalleryUsePose } from '@/lib/gallery-pose-event';
import { buildGalleryHandoff, galleryHandoffPath, saveGalleryHandoff } from '@/lib/gallery-handoff';
import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';

/** The everyday actions, always open at the top; the long tail sits in collapsed groups below. */
export function GalleryQuickSection({
  entry,
  previewUrl,
  primaryMediaKind,
  onDownloadError,
  onRequeue,
  router,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const completed = entry.status === 'completed';
  const image = primaryMediaKind === 'image';
  return (
    <GalleryMenuGroup>
      {completed && image ? (
        <GalleryMenuButton
          label="Animate this still"
          onClick={() => {
            saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
            router.push(galleryHandoffPath('video'));
            setMenuOpen(false);
          }}
        />
      ) : null}
      {completed ? (
        <GalleryMenuButton
          label="New seed"
          onClick={() => {
            onRequeue(true, undefined, { exactGraph: false });
            setMenuOpen(false);
          }}
        />
      ) : null}
      {completed && previewUrl && image ? (
        <GalleryMenuButton
          label="Use this pose…"
          onClick={() => {
            requestGalleryUsePose(entry.id);
            setMenuOpen(false);
          }}
        />
      ) : null}
      <GalleryMenuButton
        label="Copy prompt"
        onClick={() => {
          void navigator.clipboard.writeText(entry.prompt).catch(() => {
            onDownloadError('Could not copy prompt.');
          });
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}
