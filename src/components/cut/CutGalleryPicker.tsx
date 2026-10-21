'use client';

/** Add from Gallery: this Cast's finished stills and clips, picked by picture into the cut. */

import SideSheet from '@/components/ui/SideSheet';
import {
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { isGalleryClipEntry } from '@/lib/story/roleplay-film';

export default function CutGalleryPicker({
  open,
  onClose,
  entries,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  entries: ComfyGalleryEntry[];
  onAdd: (entry: ComfyGalleryEntry) => void;
}) {
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Add from Gallery"
      description="Any still or clip of this Cast — it goes in at the end; drag it where you want it."
      size="lg"
      testId="cut-gallery-picker"
    >
      {entries.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          Nothing in the Gallery for this Cast yet.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map(entry => {
            const thumb = galleryEntryPrimaryThumbUrl(entry);
            const clip = isGalleryClipEntry({
              ...entry,
              mediaKind: galleryEntryPrimaryMediaKind(entry),
            });
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="group relative block aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-sm)] bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  title={`Add this ${clip ? 'clip' : 'still'} to the cut`}
                  data-testid={`cut-gallery-add-${entry.id}`}
                  onClick={() => onAdd(entry)}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:opacity-80"
                    />
                  ) : null}
                  {clip ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">
                      ▶ clip
                    </span>
                  ) : null}
                  <span className="absolute right-1 top-1 rounded-full bg-[var(--accent)] px-1.5 text-xs text-[var(--on-accent)] opacity-0 group-hover:opacity-100">
                    +
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SideSheet>
  );
}
