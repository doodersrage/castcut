'use client';

import { buildGalleryFocusUrl } from '@/lib/use-as-hints-url';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { ButtonLink } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { galleryCardCaption } from '@/lib/gallery-card-caption';
import { engineFamilyLabel } from '@/lib/model-files';

export default function QueueCompletedRow({ entry }: { entry: ComfyGalleryEntry }) {
  const galleryHref = buildGalleryFocusUrl(entry.id);
  // Every row opened with the same "Carry out this change on Image 1…" boilerplate — show the beat.
  const caption = galleryCardCaption(entry.prompt) || entry.prompt;
  return (
    <li className="ui-list-row items-center gap-3">
      <GalleryEntryPreview entry={entry} className="h-12 w-12 shrink-0 rounded object-cover" />
      <div className="ui-list-primary min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--text-secondary)]" title={entry.prompt}>
          {caption}
        </p>
        {/* Under "Recent completed" the status said nothing; the engine by name, the id on hover. */}
        {entry.model ? (
          <p className="type-caption" title={entry.model}>
            {engineFamilyLabel(entry.model)}
          </p>
        ) : null}
      </div>
      {/* One line — in the narrow list column the label wrapped into a three-line button. */}
      <ButtonLink
        href={galleryHref}
        size="sm"
        variant="secondary"
        className="shrink-0 whitespace-nowrap"
      >
        Open in Gallery
      </ButtonLink>
    </li>
  );
}
