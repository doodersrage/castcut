'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
} from '@/lib/edit/improve-output';
import { downloadGalleryImage } from '@/lib/gallery/comfyui-gallery-export';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery/stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery/identity-lock';
import { galleryToolHrefForEntry } from '@/lib/gallery/tool-href';

type Props = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  playbackIndex: number;
  isVideoHero: boolean;
  leanHoverActions: boolean;
  onOpenImage: (index: number) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue/quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onDownloadError: (message: string | null) => void;
  onFaceDetail?: () => void;
  showFaceDetailAction?: boolean;
};

export function GalleryCardHoverActions({
  entry,
  layout,
  playbackIndex,
  isVideoHero,
  leanHoverActions,
  onOpenImage,
  onRequeue,
  onDownloadError,
  onFaceDetail,
  showFaceDetailAction = false,
}: Props) {
  const router = useRouter();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--bg-base)]/95 via-[var(--bg-base)]/40 to-transparent px-2 pb-2.5 pt-8 opacity-0 transition duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5">
        <Button
          onClick={() => onOpenImage(playbackIndex)}
          variant="overlay"
          tone="strong"
          className="max-md:min-h-7"
        >
          Open
        </Button>
        {entry.status === 'completed' && !isVideoHero ? (
          <>
            {leanHoverActions ? null : (
              <>
                <Button
                  onClick={() => startImproveFromGalleryEntry(entry)}
                  variant="overlay"
                  tone="success"
                  className="max-md:min-h-7"
                >
                  Improve
                </Button>
                {layout !== 'dense' ? (
                  <Button
                    onClick={() => startInpaintFromGalleryEntry(entry)}
                    variant="overlay"
                    tone="warning"
                    className="max-md:min-h-7"
                  >
                    Inpaint
                  </Button>
                ) : null}
                {entry.hasStoredWorkflow || entry.workflowJson ? (
                  <Button
                    onClick={() => onRequeue(false, undefined, { exactGraph: true })}
                    variant="overlay"
                    className="max-md:min-h-7"
                  >
                    Exact
                  </Button>
                ) : (
                  <Button
                    onClick={() => onRequeue(false)}
                    variant="overlay"
                    className="max-md:min-h-7"
                  >
                    Requeue
                  </Button>
                )}
              </>
            )}
            {galleryEntryHasRestorableStack(entry) ? (
              <Button
                data-testid="gallery-use-stack"
                onClick={() => {
                  applyGalleryStackToSession(entry);
                  router.push(galleryToolHrefForEntry(entry));
                }}
                variant="overlay"
                tone={(entry.reviewRating ?? 0) >= 4 ? 'accent' : 'default'}
                className="max-md:min-h-7"
              >
                Stack
              </Button>
            ) : null}
            {leanHoverActions ? null : galleryEntryHasRestorableStack(entry) &&
              entry.prompt?.trim() ? (
              <Button
                data-testid="gallery-use-prompt-stack"
                onClick={() => {
                  applyGalleryPromptAndStackToSession(entry);
                  router.push(galleryToolHrefForEntry(entry));
                }}
                variant="overlay"
                className="max-md:min-h-7"
              >
                Prompt+
              </Button>
            ) : null}
            {galleryEntryCanLockFace(entry) ? (
              <Button
                data-testid="gallery-lock-face"
                onClick={() => {
                  void applyGalleryFaceToSession(entry).then(result => {
                    if (result.ok) {
                      router.push(galleryToolHrefForEntry(entry));
                    }
                  });
                }}
                variant="overlay"
                className="max-md:min-h-7"
              >
                Lock
              </Button>
            ) : null}
            {leanHoverActions ? null : (
              <>
                {galleryEntryCanSaveLook(entry) ? (
                  <Button
                    data-testid="gallery-save-look"
                    onClick={() => {
                      saveGalleryLookFromEntry(entry);
                    }}
                    variant="overlay"
                    className="max-md:min-h-7"
                  >
                    Look
                  </Button>
                ) : null}
                {showFaceDetailAction && onFaceDetail ? (
                  <Button
                    onClick={() => onFaceDetail()}
                    variant="overlay"
                    tone="accent"
                    className="max-md:min-h-7"
                  >
                    Face
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    void downloadGalleryImage(entry, playbackIndex).catch(error => {
                      onDownloadError(error instanceof Error ? error.message : 'Download failed');
                    });
                  }}
                  variant="overlay"
                  className="max-md:min-h-7"
                >
                  ↓
                </Button>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
