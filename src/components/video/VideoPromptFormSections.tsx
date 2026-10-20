'use client';

import { ChipButton, FieldLabel, TextArea } from '@/components/ui/Field';
import {
  canFalExtendFromParentUrl,
  continueClipActionLabel,
  engineCanQueueClips,
  FAL_VIDEO_DURATION_SECONDS,
  snapFalVideoDurationSec,
  type VideoClipMode,
} from '@/lib/video/clip-mode';
import { engineDisplayName } from '@/lib/engine/capabilities';
import type { EngineId } from '@/lib/engine/types';

type VideoPromptClipModeSectionProps = {
  clipMode: VideoClipMode;
  inferenceEngine: EngineId;
  parentVideoUrl: string;
  onClipModeChange: (mode: VideoClipMode) => void;
  onParentVideoUrlChange: (value: string) => void;
};

export default function VideoPromptClipModeSection({
  clipMode,
  inferenceEngine,
  parentVideoUrl,
  onClipModeChange,
  onParentVideoUrlChange,
}: VideoPromptClipModeSectionProps) {
  return (
    <>
      <div className="mb-4 space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--text-primary)]">Clip mode</p>
          <div className="flex flex-wrap gap-1.5">
            <ChipButton
              active={clipMode === 't2v'}
              title="Text-to-video — no first frame"
              onClick={() => onClipModeChange('t2v')}
            >
              Text to video
            </ChipButton>
            <ChipButton
              active={clipMode === 'i2v'}
              title="Image-to-video — first frame required"
              onClick={() => onClipModeChange('i2v')}
            >
              Image to video
            </ChipButton>
            <ChipButton
              active={clipMode === 'extend'}
              title="Extend a parent clip — Fal LTX extend-video when the URL is public, otherwise last-frame I2V"
              onClick={() => onClipModeChange('extend')}
            >
              Extend clip
            </ChipButton>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          {clipMode === 'extend'
            ? 'Needs a parent clip. Labels: Extend clip (Fal LTX / Grok extensions), Continue from last frame (Replicate or Fal upload soft-fail), Stitch continue (Gemini last-frame I2V + server concat).'
            : clipMode === 'i2v'
              ? 'Needs a first frame. Scan with vision fills Subject and Motion from that still. Local WAN / Hunyuan / LTX wire I2V nodes; Fal uses the I2V model in Settings.'
              : 'No still required. Local graphs stay T2V; Fal uses the T2V model in Settings.'}
        </p>
        {!engineCanQueueClips(inferenceEngine) && inferenceEngine !== 'comfyui' ? (
          <p className="text-xs text-[var(--tint-warning-text)]">
            {engineDisplayName(inferenceEngine)} cannot queue clips. Switch Settings → Inference
            engine to Fal, Replicate, Grok, Gemini, Runway, or local WAN (ComfyUI).
          </p>
        ) : null}
      </div>

      {clipMode === 'extend' ? (
        <div className="mb-4 space-y-2">
          <FieldLabel
            htmlFor="video-parent-clip"
            hint="Public Fal clip URL, or a local / Gallery view URL (uploaded to Fal CDN when you queue)."
          >
            Parent clip (required, extend)
          </FieldLabel>
          <input
            id="video-parent-clip"
            value={parentVideoUrl}
            onChange={event => onParentVideoUrlChange(event.target.value)}
            placeholder="https://v3.fal.media/… or /api/comfyui/view?…"
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
          <p className="type-caption text-[var(--text-muted)]">
            {inferenceEngine === 'fal' && canFalExtendFromParentUrl(parentVideoUrl)
              ? 'Fal can extend this URL directly.'
              : parentVideoUrl.trim()
                ? continueClipActionLabel({
                    engine: inferenceEngine,
                    parentUrl: parentVideoUrl,
                  }) === 'Extend clip'
                  ? 'Will queue native Extend (Fal upload if needed, or Grok extensions).'
                  : continueClipActionLabel({
                        engine: inferenceEngine,
                        parentUrl: parentVideoUrl,
                      }) === 'Stitch continue'
                    ? 'Will queue last-frame I2V then Stitch continue when the take finishes.'
                    : 'Will Continue from last frame (I2V).'
                : 'Continue from Gallery to fill this, or paste a clip URL.'}
          </p>
        </div>
      ) : null}
    </>
  );
}

type VideoPromptPromptFieldsSectionProps = {
  accentFocusClassName: string;
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSec: number;
  falDurationPicker: boolean;
  onSubjectChange: (value: string) => void;
  onMotionChange: (value: string) => void;
  onCameraChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onDurationSecChange: (value: number) => void;
};

export function VideoPromptPromptFieldsSection({
  accentFocusClassName,
  subject,
  motion,
  camera,
  style,
  durationSec,
  falDurationPicker,
  onSubjectChange,
  onMotionChange,
  onCameraChange,
  onStyleChange,
  onDurationSecChange,
}: VideoPromptPromptFieldsSectionProps) {
  return (
    <>
      <FieldLabel htmlFor="video-subject">Subject / action</FieldLabel>
      <TextArea
        id="video-subject"
        rows={3}
        value={subject}
        onChange={event => onSubjectChange(event.target.value)}
        placeholder="A cyclist crests a foggy hill at dawn, pedaling steadily uphill…"
        className={accentFocusClassName}
      />

      <FieldLabel htmlFor="video-motion">Motion (optional)</FieldLabel>
      <TextArea
        id="video-motion"
        rows={2}
        value={motion}
        onChange={event => onMotionChange(event.target.value)}
        placeholder="Slow forward tracking, wheels spinning, jacket fluttering in wind…"
        className={accentFocusClassName}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="video-camera">Camera (optional)</FieldLabel>
          <input
            id="video-camera"
            value={camera}
            onChange={event => onCameraChange(event.target.value)}
            placeholder="Low-angle follow shot, gentle dolly in"
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
        <div>
          <FieldLabel htmlFor="video-duration">Duration (seconds)</FieldLabel>
          {falDurationPicker ? (
            <div className="flex flex-wrap gap-1.5">
              {FAL_VIDEO_DURATION_SECONDS.map(seconds => (
                <ChipButton
                  key={seconds}
                  active={snapFalVideoDurationSec(durationSec) === seconds}
                  onClick={() => onDurationSecChange(seconds)}
                >
                  {seconds}s
                </ChipButton>
              ))}
            </div>
          ) : (
            <input
              id="video-duration"
              type="number"
              min={1}
              max={16}
              value={durationSec}
              onChange={event => onDurationSecChange(Number(event.target.value) || 4)}
              placeholder="e.g. 4"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          )}
        </div>
      </div>

      <FieldLabel htmlFor="video-style">Look / style (optional)</FieldLabel>
      <input
        id="video-style"
        value={style}
        onChange={event => onStyleChange(event.target.value)}
        placeholder="Cinematic teal-orange grade, soft morning haze"
        className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
      />
    </>
  );
}

export function VideoPromptTimingFieldsSection({
  frames,
  fps,
  onFramesChange,
  onFpsChange,
}: {
  frames: number | undefined;
  fps: number | undefined;
  onFramesChange: (value: number | undefined) => void;
  onFpsChange: (value: number | undefined) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <FieldLabel
          htmlFor="video-frames"
          hint="Patched into {{VIDEO_FRAMES}}. Leave empty to derive from duration × FPS."
        >
          Frames / length (optional)
        </FieldLabel>
        <input
          id="video-frames"
          type="number"
          min={1}
          max={480}
          value={frames ?? ''}
          onChange={event =>
            onFramesChange(event.target.value ? Number(event.target.value) : undefined)
          }
          placeholder="e.g. 81"
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
      </div>
      <div>
        <FieldLabel
          htmlFor="video-fps"
          hint="Patched into {{VIDEO_FPS}} (e.g. SaveAnimatedWEBP fps)."
        >
          FPS (optional)
        </FieldLabel>
        <input
          id="video-fps"
          type="number"
          min={1}
          max={60}
          value={fps ?? ''}
          onChange={event =>
            onFpsChange(event.target.value ? Number(event.target.value) : undefined)
          }
          placeholder="e.g. 16"
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />
      </div>
    </div>
  );
}
