'use client';

import { useCallback, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useVideoPromptInitImage, isFetchableImageRef } from '@/hooks/useVideoPromptInitImage';
import { useVideoPromptQueue } from '@/hooks/useVideoPromptQueue';
import { useVideoPromptFieldSetters } from '@/hooks/useVideoPromptFieldSetters';
import { useVideoWorkflowScaffold } from '@/hooks/useVideoWorkflowScaffold';
import { useVideoPromptModelSync } from '@/hooks/useVideoPromptModelSync';
import { DEFAULT_VIDEO_TOOL_CACHE } from '@/lib/settings/cache';
import { isVideoModel } from '@/lib/queue/tool-model';
import { inferVideoClipMode, type VideoClipMode } from '@/lib/video/clip-mode';

export function useVideoPromptOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'video',
    DEFAULT_VIDEO_TOOL_CACHE
  );
  const subject = toolSettings.subject ?? '';
  const motion = toolSettings.motion ?? '';
  const camera = toolSettings.camera ?? '';
  const style = toolSettings.style ?? '';
  const durationSec = toolSettings.durationSec ?? 4;
  const initImageUrl = toolSettings.initImageUrl ?? '';
  const parentVideoUrl = toolSettings.parentVideoUrl ?? '';
  const frames = toolSettings.frames;
  const fps = toolSettings.fps;

  const [parentGalleryEntryId, setParentGalleryEntryId] = useState<string | undefined>();
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setClipMode = useCallback(
    (mode: VideoClipMode) => updateToolSettings({ clipMode: mode }),
    [updateToolSettings]
  );

  const fieldSetters = useVideoPromptFieldSetters({
    subject,
    motion,
    camera,
    style,
    updateToolSettings,
    updateShared,
  });

  const initImage = useVideoPromptInitImage({
    initImageUrl,
    setInitImageUrl: fieldSetters.setInitImageUrl,
    setParentVideoUrl: fieldSetters.setParentVideoUrl,
    setParentGalleryEntryId,
    setClipMode,
    setSubject: fieldSetters.setSubject,
    setMotion: fieldSetters.setMotion,
    setError,
    updateShared,
    updateToolSettings,
    camera,
    style,
    shared,
  });

  const clipMode = inferVideoClipMode({
    clipMode: toolSettings.clipMode,
    hasInitImage: initImage.hasInitImage,
  });

  useSeedToolDraft(mounted, {
    toolKey: 'video',
    label: 'Video',
    href: '/video',
    fields: [subject, motion, camera, style],
  });

  const { controlsSharedModel } = useVideoPromptModelSync({
    mounted,
    sharedModel: shared.model,
    toolModel: toolSettings.model,
    updateShared,
    updateToolSettings,
  });

  useVideoWorkflowScaffold({
    mounted,
    toolModel: toolSettings.model,
    sharedModel: shared.model,
    updateShared,
    setWorkflowStatus,
  });

  const actions = usePromptResultActions({
    tool: 'video',
    model: shared.model,
    detail: shared.detail,
    hints: motion,
    autoFixRules: shared.autoFixRules !== false,
  });

  const queue = useVideoPromptQueue({
    subject,
    motion,
    camera,
    style,
    durationSec,
    frames,
    fps,
    initImageUrl,
    parentVideoUrl,
    parentGalleryEntryId,
    file: initImage.file,
    previewUrl: initImage.previewUrl,
    hasInitImage: initImage.hasInitImage,
    clipMode,
    shared,
    actions,
    setError,
    setOutput,
  });

  const controlsShared = isVideoModel(shared.model)
    ? shared
    : { ...shared, model: controlsSharedModel };

  const onPastedInitChange = useCallback(
    (value: string) => {
      fieldSetters.setInitImageUrl(value);
      if (!initImage.file) {
        initImage.setPreviewUrl(current => {
          initImage.revokePreviewIfBlob(current);
          return isFetchableImageRef(value) ? value.trim() : null;
        });
      }
    },
    [fieldSetters, initImage]
  );

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    setOutput,
    subject,
    motion,
    camera,
    style,
    durationSec,
    parentVideoUrl,
    frames,
    fps,
    workflowStatus,
    setWorkflowStatus,
    output,
    error,
    clipMode,
    controlsShared,
    fieldSetters,
    initImage,
    actions,
    queue,
    onPastedInitChange,
    setClipMode,
  };
}
