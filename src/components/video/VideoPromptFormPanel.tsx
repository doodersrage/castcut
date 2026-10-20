'use client';

import { ToolSection, accentButtonClass, accentFocusClass } from '@/components/ui/ToolPageShell';
import { PrimaryButton } from '@/components/ui/Button';
import VideoPromptScaffoldSection from '@/components/video/VideoPromptScaffoldSection';
import VideoPromptInitImageSection from '@/components/video/VideoPromptInitImageSection';
import VideoPromptClipModeSection, {
  VideoPromptPromptFieldsSection,
  VideoPromptTimingFieldsSection,
} from '@/components/video/VideoPromptFormSections';
import type { EngineId } from '@/lib/engine/types';
import type { VideoClipMode } from '@/lib/video/clip-mode';
import type { SharedToolSettings } from '@/lib/settings/cache';

const ACCENT = 'brand' as const;

type VideoPromptFormPanelProps = {
  mounted: boolean;
  shared: SharedToolSettings;
  workflowStatus: string | null;
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSec: number;
  clipMode: VideoClipMode;
  inferenceEngine: EngineId;
  parentVideoUrl: string;
  frames: number | undefined;
  fps: number | undefined;
  file: File | null;
  previewUrl: string | null;
  pastedInitValue: string;
  hasInitImage: boolean;
  scanning: boolean;
  loading: boolean;
  error: string | null;
  onSharedPatch: (patch: Partial<SharedToolSettings>) => void;
  onWorkflowStatus: (status: string) => void;
  onSubjectChange: (value: string) => void;
  onMotionChange: (value: string) => void;
  onCameraChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onDurationSecChange: (value: number) => void;
  onClipModeChange: (mode: VideoClipMode) => void;
  onParentVideoUrlChange: (value: string) => void;
  onInitFileChange: (file: File | null) => void;
  onScanInitWithVision: () => void;
  onClearInitImage: () => void;
  onPastedInitChange: (value: string) => void;
  revokePreviewIfBlob: (url: string | null | undefined) => void;
  setPreviewUrl: (value: string | null | ((current: string | null) => string | null)) => void;
  onFramesChange: (value: number | undefined) => void;
  onFpsChange: (value: number | undefined) => void;
  onGenerate: () => void;
};

export default function VideoPromptFormPanel({
  mounted,
  shared,
  workflowStatus,
  subject,
  motion,
  camera,
  style,
  durationSec,
  clipMode,
  inferenceEngine,
  parentVideoUrl,
  frames,
  fps,
  file,
  previewUrl,
  pastedInitValue,
  hasInitImage,
  scanning,
  loading,
  error,
  onSharedPatch,
  onWorkflowStatus,
  onSubjectChange,
  onMotionChange,
  onCameraChange,
  onStyleChange,
  onDurationSecChange,
  onClipModeChange,
  onParentVideoUrlChange,
  onInitFileChange,
  onScanInitWithVision,
  onClearInitImage,
  onPastedInitChange,
  revokePreviewIfBlob,
  setPreviewUrl,
  onFramesChange,
  onFpsChange,
  onGenerate,
}: VideoPromptFormPanelProps) {
  return (
    <ToolSection>
      {workflowStatus ? (
        <p className="mb-3 rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2 text-xs text-[var(--tint-success-text)]">
          {workflowStatus}
        </p>
      ) : null}
      <VideoPromptScaffoldSection
        model={shared.model}
        onSharedPatch={onSharedPatch}
        onStatus={onWorkflowStatus}
      />
      <VideoPromptPromptFieldsSection
        accentFocusClassName={accentFocusClass(ACCENT)}
        subject={subject}
        motion={motion}
        camera={camera}
        style={style}
        durationSec={durationSec}
        falDurationPicker={
          shared.inferenceEngine === 'fal' || shared.inferenceEngine === 'replicate'
        }
        onSubjectChange={onSubjectChange}
        onMotionChange={onMotionChange}
        onCameraChange={onCameraChange}
        onStyleChange={onStyleChange}
        onDurationSecChange={onDurationSecChange}
      />
      <VideoPromptClipModeSection
        clipMode={clipMode}
        inferenceEngine={inferenceEngine}
        parentVideoUrl={parentVideoUrl}
        onClipModeChange={onClipModeChange}
        onParentVideoUrlChange={onParentVideoUrlChange}
      />
      <VideoPromptInitImageSection
        clipMode={clipMode}
        file={file}
        previewUrl={previewUrl}
        pastedInitValue={pastedInitValue}
        hasInitImage={hasInitImage}
        scanning={scanning}
        loading={loading}
        onInitFileChange={onInitFileChange}
        onScanInitWithVision={onScanInitWithVision}
        onClearInitImage={onClearInitImage}
        onPastedInitChange={onPastedInitChange}
        revokePreviewIfBlob={revokePreviewIfBlob}
        setPreviewUrl={setPreviewUrl}
      />
      <VideoPromptTimingFieldsSection
        frames={frames}
        fps={fps}
        onFramesChange={onFramesChange}
        onFpsChange={onFpsChange}
      />
      <PrimaryButton
        accentClassName={accentButtonClass(ACCENT)}
        data-action="primary-generate"
        onClick={onGenerate}
        disabled={!mounted || !subject.trim() || scanning}
        loading={loading}
        loadingLabel="Building video prompt"
        className="mt-4"
      >
        Build video prompt
      </PrimaryButton>
      {error ? <p className="mt-2 text-sm ui-status-danger">{error}</p> : null}
    </ToolSection>
  );
}
