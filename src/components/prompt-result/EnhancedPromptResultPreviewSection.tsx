'use client';

import { Button } from '@/components/ui/Button';
import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { isHtmlVideoViewUrl, isMotionViewUrl, mediaKindFromViewUrl } from '@/lib/comfyui/outputs';

export type EnhancedPromptResultPreviewSectionProps = {
  comfyUiPreviewUrl: string;
  outputPreview?: string;
  onOpenLightbox: () => void;
  onRefine?: () => void;
  onContinueInpaint?: () => void;
  onContinueOutpaint?: () => void;
  onContinueCompose?: () => void;
  onContinueVideo?: () => void;
  onContinueControlNet?: () => void;
  onQueueSeedBatch?: () => void;
  seedBatchLabel?: string;
};

export default function EnhancedPromptResultPreviewSection({
  comfyUiPreviewUrl,
  outputPreview,
  onOpenLightbox,
  onRefine,
  onContinueInpaint,
  onContinueOutpaint,
  onContinueCompose,
  onContinueVideo,
  onContinueControlNet,
  onQueueSeedBatch,
  seedBatchLabel,
}: EnhancedPromptResultPreviewSectionProps) {
  const previewIsMotion = isMotionViewUrl(comfyUiPreviewUrl);
  const previewIsHtmlVideo = isHtmlVideoViewUrl(comfyUiPreviewUrl);
  const previewKind = mediaKindFromViewUrl(comfyUiPreviewUrl);

  return (
    <div className="ui-card overflow-hidden">
      {previewKind === 'audio' || previewKind === 'mesh' ? (
        <GalleryKindPreview
          kind={previewKind}
          src={comfyUiPreviewUrl}
          className="max-h-80 w-full"
          controls
        />
      ) : previewIsMotion ? (
        <div className="relative bg-[var(--bg-subtle)]">
          <GalleryKindPreview
            kind="video"
            src={comfyUiPreviewUrl}
            alt="ComfyUI clip preview"
            className="max-h-80 w-full object-contain"
            controls={previewIsHtmlVideo}
          />
          {previewIsHtmlVideo ? null : (
            <button
              type="button"
              onClick={onOpenLightbox}
              className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
              aria-label="Open clip preview"
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenLightbox}
          className="block w-full cursor-zoom-in"
          aria-label="Open image preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={comfyUiPreviewUrl}
            alt="ComfyUI output preview"
            className="max-h-80 w-full bg-[var(--bg-subtle)] object-contain"
          />
        </button>
      )}
      <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="type-caption text-[var(--tint-success-text)]">ComfyUI output ready</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onOpenLightbox}
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {previewKind === 'audio'
                ? 'View audio'
                : previewKind === 'mesh'
                  ? 'View 3D'
                  : previewIsMotion
                    ? 'View clip'
                    : 'View image'}
            </button>
            <a
              href={comfyUiPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Open in new tab
            </a>
            <a
              href="/gallery"
              className="type-caption transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Gallery
            </a>
          </div>
        </div>
        {onContinueInpaint ||
        onContinueOutpaint ||
        onContinueCompose ||
        onContinueVideo ||
        onContinueControlNet ||
        onRefine ||
        onQueueSeedBatch ? (
          <div data-testid="result-continue-edit" className="flex flex-wrap gap-1.5">
            {onRefine ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onRefine}
              >
                Refine
              </Button>
            ) : null}
            {onContinueInpaint ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onContinueInpaint}
              >
                Inpaint
              </Button>
            ) : null}
            {onContinueOutpaint ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onContinueOutpaint}
              >
                Outpaint
              </Button>
            ) : null}
            {onContinueCompose ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onContinueCompose}
              >
                Compose
              </Button>
            ) : null}
            {onContinueVideo ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onContinueVideo}
              >
                Video
              </Button>
            ) : null}
            {onContinueControlNet ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onContinueControlNet}
              >
                ControlNet
              </Button>
            ) : null}
            {onQueueSeedBatch ? (
              <Button
                variant="secondary"
                className="!min-h-8 px-2.5 text-[11px]"
                onClick={onQueueSeedBatch}
              >
                {seedBatchLabel ?? '3 seeds'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function buildComfyPreviewLightbox(
  comfyUiPreviewUrl: string,
  output?: string
): ImageLightboxState {
  return {
    images: [comfyUiPreviewUrl],
    originalImages: [comfyUiPreviewUrl],
    mediaKinds: [mediaKindFromViewUrl(comfyUiPreviewUrl)],
    index: 0,
    title: output ? output.slice(0, 120) : 'ComfyUI output preview',
  };
}
