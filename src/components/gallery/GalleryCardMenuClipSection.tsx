'use client';

import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';
import {
  galleryClipTools,
  runGalleryClipTool,
  runningGalleryClipTool,
} from '@/lib/gallery/clip-tools';
import { resolveGalleryOutputImageUrl } from '@/lib/gallery/output-upscale';

/** ⋯ → Clip: the registered clip tools (clip-tools.ts) on a finished clip. */
export function GalleryClipSection({
  entry,
  isVideoHero,
  setMenuOpen,
}: GalleryCardMenuSectionProps) {
  const tools = galleryClipTools();
  if (!isVideoHero || entry.status !== 'completed' || tools.length === 0) return null;
  const clipUrl = resolveGalleryOutputImageUrl(entry);
  if (!clipUrl) return null;
  const busy = runningGalleryClipTool();
  return (
    <GalleryMenuGroup label="Clip" collapsible>
      {tools.map(tool => (
        <GalleryMenuButton
          key={tool.id}
          label={busy === tool.id ? tool.busyText : tool.label}
          data-testid={`gallery-clip-tool-${tool.id}`}
          onClick={() => {
            setMenuOpen(false);
            void runGalleryClipTool(tool, entry, clipUrl);
          }}
        />
      ))}
    </GalleryMenuGroup>
  );
}
