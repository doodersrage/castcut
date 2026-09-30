'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { galleryPickPath } from '@/lib/gallery-handoff';
import type { VideoClipMode } from '@/lib/video-clip-mode';
import { isFetchableImageRef } from '@/hooks/useVideoPromptInitImage';

type VideoPromptInitImageSectionProps = {
  clipMode: VideoClipMode;
  file: File | null;
  previewUrl: string | null;
  pastedInitValue: string;
  hasInitImage: boolean;
  scanning: boolean;
  loading: boolean;
  onInitFileChange: (file: File | null) => void;
  onScanInitWithVision: () => void;
  onClearInitImage: () => void;
  onPastedInitChange: (value: string) => void;
  revokePreviewIfBlob: (url: string | null | undefined) => void;
  setPreviewUrl: Dispatch<SetStateAction<string | null>>;
};

export default function VideoPromptInitImageSection({
  clipMode,
  file,
  previewUrl,
  pastedInitValue,
  hasInitImage,
  scanning,
  loading,
  onInitFileChange,
  onScanInitWithVision,
  onClearInitImage,
  onPastedInitChange,
  revokePreviewIfBlob,
  setPreviewUrl,
}: VideoPromptInitImageSectionProps) {
  return (
    <>
      <FieldLabel
        htmlFor="video-init-image"
        hint={
          clipMode === 'extend'
            ? 'Optional last-frame fallback when Fal extend is not available.'
            : clipMode === 'i2v'
              ? 'Required for I2V. Queue wires WanImageToVideo, HunyuanImageToVideo, or LTXVImgToVideo — or swaps in the built-in video scaffold when the selected graph is stills-only.'
              : 'Ignored in T2V mode. Switch to Image to video to use a first frame.'
        }
      >
        {clipMode === 'i2v' ? 'First frame (required, I2V)' : 'First frame (I2V only)'}
      </FieldLabel>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="video-init-image"
            type="file"
            accept="image/*"
            onChange={event => onInitFileChange(event.target.files?.[0] ?? null)}
            className="ui-file-input min-w-[14rem] flex-1"
          />
          <ButtonLink href={galleryPickPath('video')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasInitImage || scanning || loading}
            loading={scanning}
            loadingLabel="Scanning still"
            onClick={onScanInitWithVision}
          >
            Scan with vision
          </Button>
        </div>
        <p className="type-caption text-[var(--text-muted)]">
          Opens Gallery in pick mode — click a completed still to return here as the I2V init image.
          Scan with vision fills Subject and Motion from the still.
        </p>
        {previewUrl ? (
          <div className="flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Video init preview"
              className="max-h-48 rounded-xl border border-[var(--border-subtle)] object-contain shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            />
            <Button variant="ghost" size="sm" onClick={onClearInitImage}>
              Remove image
            </Button>
          </div>
        ) : null}
        <div>
          <FieldLabel
            htmlFor="video-init-image-url"
            hint="Optional fallback when you already have a ComfyUI input filename or remote URL."
          >
            Or paste URL / Comfy filename
          </FieldLabel>
          <input
            id="video-init-image-url"
            value={pastedInitValue}
            onChange={event => {
              const next = event.target.value;
              onPastedInitChange(next);
              if (!file) {
                setPreviewUrl(current => {
                  revokePreviewIfBlob(current);
                  return isFetchableImageRef(next) ? next.trim() : null;
                });
              }
            }}
            placeholder="https://… or an uploaded ComfyUI filename"
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
        {clipMode === 'i2v' && hasInitImage ? (
          <p className="type-caption text-[var(--tint-success-text)]">
            I2V first frame ready — queue will upload and wire it into the video graph.
          </p>
        ) : null}
        {clipMode === 'i2v' && !hasInitImage ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Add a first frame or pick a still from Gallery before queueing I2V.
          </p>
        ) : null}
      </div>
    </>
  );
}
