import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';

export function GalleryLineageSection({
  hasDerivatives,
  onShowDerivatives,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  if (!hasDerivatives || !onShowDerivatives) {
    return null;
  }

  return (
    <GalleryMenuGroup label="Lineage" collapsible>
      <GalleryMenuButton
        label="Show derivatives"
        onClick={() => {
          onShowDerivatives();
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}
