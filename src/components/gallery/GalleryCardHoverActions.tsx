'use client';

import { useRouter } from 'next/navigation';
import { startImproveFromGalleryEntry, startInpaintFromGalleryEntry } from '@/lib/improve-output';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHrefForEntry } from '@/lib/gallery-tool-href';

type Props = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  playbackIndex: number;
  isVideoHero: boolean;
  leanHoverActions: boolean;
  onOpenImage: (index: number) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
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
        <button
          type="button"
          onClick={() => onOpenImage(playbackIndex)}
          className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-default)]/80 bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-primary)] backdrop-blur transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Open
        </button>
        {entry.status === 'completed' && !isVideoHero ? (
          <>
            {leanHoverActions ? null : (
              <>
                <button
                  type="button"
                  onClick={() => startImproveFromGalleryEntry(entry)}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-success-text)] backdrop-blur transition hover:bg-[var(--tint-success-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)]"
                >
                  Improve
                </button>
                {layout !== 'dense' ? (
                  <button
                    type="button"
                    onClick={() => startInpaintFromGalleryEntry(entry)}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)] backdrop-blur transition hover:bg-[var(--tint-warning-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Inpaint
                  </button>
                ) : null}
                {entry.hasStoredWorkflow || entry.workflowJson ? (
                  <button
                    type="button"
                    onClick={() => onRequeue(false, undefined, { exactGraph: true })}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)] backdrop-blur transition hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Exact
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequeue(false)}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Requeue
                  </button>
                )}
              </>
            )}
            {galleryEntryHasRestorableStack(entry) ? (
              <button
                type="button"
                data-testid="gallery-use-stack"
                onClick={() => {
                  applyGalleryStackToSession(entry);
                  router.push(galleryToolHrefForEntry(entry));
                }}
                className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  (entry.reviewRating ?? 0) >= 4
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/70 text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                }`}
              >
                Stack
              </button>
            ) : null}
            {leanHoverActions ? null : galleryEntryHasRestorableStack(entry) &&
              entry.prompt?.trim() ? (
              <button
                type="button"
                data-testid="gallery-use-prompt-stack"
                onClick={() => {
                  applyGalleryPromptAndStackToSession(entry);
                  router.push(galleryToolHrefForEntry(entry));
                }}
                className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Prompt+
              </button>
            ) : null}
            {galleryEntryCanLockFace(entry) ? (
              <button
                type="button"
                data-testid="gallery-lock-face"
                onClick={() => {
                  void applyGalleryFaceToSession(entry).then(result => {
                    if (result.ok) {
                      router.push(galleryToolHrefForEntry(entry));
                    }
                  });
                }}
                className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Lock
              </button>
            ) : null}
            {leanHoverActions ? null : (
              <>
                {galleryEntryCanSaveLook(entry) ? (
                  <button
                    type="button"
                    data-testid="gallery-save-look"
                    onClick={() => {
                      saveGalleryLookFromEntry(entry);
                    }}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Look
                  </button>
                ) : null}
                {showFaceDetailAction && onFaceDetail ? (
                  <button
                    type="button"
                    onClick={() => onFaceDetail()}
                    className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] backdrop-blur transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Face
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void downloadGalleryImage(entry, playbackIndex).catch(error => {
                      onDownloadError(error instanceof Error ? error.message : 'Download failed');
                    });
                  }}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  ↓
                </button>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
