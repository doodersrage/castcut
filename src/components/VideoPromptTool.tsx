'use client';

import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import VideoPromptFormPanel from '@/components/video/VideoPromptFormPanel';
import VideoPromptResultSection from '@/components/video/VideoPromptResultSection';
import VideoPromptHistorySeedSection from '@/components/video/VideoPromptHistorySeedSection';
import { useVideoPromptOrchestration } from '@/hooks/useVideoPromptOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { ToolBadge, ToolLayout, accentFocusClass } from '@/components/ui/ToolPageShell';

const ACCENT = 'brand' as const;

export default function VideoPromptTool() {
  const description = useToolPageDescription(
    'Motion and camera prompts for WAN / Hunyuan, or Fal / Replicate / Grok cloud T2V / I2V / extend. Pick a mode, then queue.',
    'Video motion prompts — T2V, I2V from a first frame, or extend a parent clip.'
  );
  const vm = useVideoPromptOrchestration();

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Video · motion prompts</ToolBadge>}
      title="Video"
      description={description}
      sidebarPersistKey="video"
      sidebar={
        <SharedToolControls
          shared={vm.controlsShared}
          toolId="video"
          onModelChange={vm.fieldSetters.setVideoModel}
          onDetailChange={detail => vm.updateShared({ detail })}
          onWorkflowPresetChange={id => vm.updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={vm.shared.autoFixRules !== false}
          onAutoFixRulesChange={value => vm.updateShared({ autoFixRules: value })}
          onSharedSettingsChange={vm.updateShared}
          recommendFromText={vm.output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.video} />
      <EditToolRecipeStrip
        toolId="video"
        shared={vm.shared}
        onApplied={next => vm.updateShared(next)}
      />
      <VideoPromptHistorySeedSection
        toolSettings={vm.toolSettings}
        subject={vm.subject}
        accentFocusClassName={accentFocusClass(ACCENT)}
        onSubjectChange={vm.fieldSetters.setSubject}
        onUpdateToolSettings={vm.updateToolSettings}
      />
      <VideoPromptFormPanel
        mounted={vm.mounted}
        shared={vm.shared}
        workflowStatus={vm.workflowStatus}
        subject={vm.subject}
        motion={vm.motion}
        camera={vm.camera}
        style={vm.style}
        durationSec={vm.durationSec}
        clipMode={vm.clipMode}
        inferenceEngine={vm.queue.inferenceEngine}
        parentVideoUrl={vm.parentVideoUrl}
        frames={vm.frames}
        fps={vm.fps}
        file={vm.initImage.file}
        previewUrl={vm.initImage.previewUrl}
        pastedInitValue={vm.initImage.pastedInitValue}
        hasInitImage={vm.initImage.hasInitImage}
        scanning={vm.initImage.scanning}
        loading={vm.queue.loading}
        error={vm.error}
        onSharedPatch={vm.updateShared}
        onWorkflowStatus={vm.setWorkflowStatus}
        onSubjectChange={vm.fieldSetters.setSubject}
        onMotionChange={vm.fieldSetters.setMotion}
        onCameraChange={vm.fieldSetters.setCamera}
        onStyleChange={vm.fieldSetters.setStyle}
        onDurationSecChange={vm.fieldSetters.setDurationSec}
        onClipModeChange={vm.setClipMode}
        onParentVideoUrlChange={vm.fieldSetters.setParentVideoUrl}
        onInitFileChange={vm.initImage.onInitFileChange}
        onScanInitWithVision={() => void vm.initImage.scanInitWithVision()}
        onClearInitImage={vm.initImage.clearInitImage}
        onPastedInitChange={vm.onPastedInitChange}
        revokePreviewIfBlob={vm.initImage.revokePreviewIfBlob}
        setPreviewUrl={vm.initImage.setPreviewUrl}
        onFramesChange={vm.fieldSetters.setFrames}
        onFpsChange={vm.fieldSetters.setFps}
        onGenerate={() => void vm.queue.generate()}
      />
      <VideoPromptResultSection
        output={vm.output}
        motion={vm.motion}
        model={vm.shared.model}
        detail={vm.shared.detail}
        copied={vm.queue.copied}
        actions={vm.actions}
        onOutputChange={vm.setOutput}
        onCopy={() => void vm.queue.copyOutput(vm.output)}
        onQueue={() => vm.queue.queueVideo(vm.output)}
      />
    </ToolLayout>
  );
}
