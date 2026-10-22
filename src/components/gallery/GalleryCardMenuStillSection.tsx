'use client';

import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';
import { resolveGalleryOutputImageUrl } from '@/lib/gallery/output-upscale';
import { galleryStillTools } from '@/lib/gallery/still-tools';

/** ⋯ → Make it move: the registered still tools (still-tools.ts) on a finished still. */
export function GalleryStillSection({
  entry,
  isVideoHero,
  primaryMediaKind,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const tools = galleryStillTools();
  if (isVideoHero || primaryMediaKind !== 'image' || entry.status !== 'completed') return null;
  if (tools.length === 0) return null;
  const stillUrl = resolveGalleryOutputImageUrl(entry);
  if (!stillUrl) return null;
  return (
    <GalleryMenuGroup label="Make it move" collapsible>
      {tools.map(tool => (
        <GalleryMenuButton
          key={tool.id}
          label={tool.label}
          data-testid={`gallery-still-tool-${tool.id}`}
          onClick={() => {
            setMenuOpen(false);
            tool.run({ entry, stillUrl });
          }}
        />
      ))}
    </GalleryMenuGroup>
  );
}
