'use client';

import { useCallback } from 'react';
import { rememberDraftFields } from '@/lib/app/remember-draft-fields';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { isVideoModel } from '@/lib/queue/tool-model';

type UseVideoPromptFieldSettersOptions = {
  subject: string;
  motion: string;
  camera: string;
  style: string;
  updateToolSettings: (patch: Record<string, unknown>) => void;
  updateShared: (patch: Record<string, unknown>) => void;
};

export function useVideoPromptFieldSetters({
  subject,
  motion,
  camera,
  style,
  updateToolSettings,
  updateShared,
}: UseVideoPromptFieldSettersOptions) {
  const rememberVideoDraft = useCallback(
    (next: { subject?: string; motion?: string; camera?: string; style?: string }) => {
      rememberDraftFields({
        toolKey: 'video',
        label: 'Video',
        href: '/video',
        fields: [
          next.subject ?? subject,
          next.motion ?? motion,
          next.camera ?? camera,
          next.style ?? style,
        ],
      });
    },
    [camera, motion, style, subject]
  );

  const setSubject = useCallback(
    (value: string) => {
      updateToolSettings({ subject: value });
      rememberVideoDraft({ subject: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );

  const setMotion = useCallback(
    (value: string) => {
      updateToolSettings({ motion: value });
      rememberVideoDraft({ motion: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );

  const setCamera = useCallback(
    (value: string) => {
      updateToolSettings({ camera: value });
      rememberVideoDraft({ camera: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );

  const setStyle = useCallback(
    (value: string) => {
      updateToolSettings({ style: value });
      rememberVideoDraft({ style: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );

  const setDurationSec = useCallback(
    (value: number) => updateToolSettings({ durationSec: value }),
    [updateToolSettings]
  );

  const setInitImageUrl = useCallback(
    (value: string) => updateToolSettings({ initImageUrl: value }),
    [updateToolSettings]
  );

  const setParentVideoUrl = useCallback(
    (value: string) => updateToolSettings({ parentVideoUrl: value }),
    [updateToolSettings]
  );

  const setFrames = useCallback(
    (value: number | undefined) => updateToolSettings({ frames: value }),
    [updateToolSettings]
  );

  const setFps = useCallback(
    (value: number | undefined) => updateToolSettings({ fps: value }),
    [updateToolSettings]
  );

  const setVideoModel = useCallback(
    (model: ComfyImageModel) => {
      updateShared({ model });
      if (isVideoModel(model)) {
        updateToolSettings({ model });
      }
    },
    [updateShared, updateToolSettings]
  );

  return {
    setSubject,
    setMotion,
    setCamera,
    setStyle,
    setDurationSec,
    setInitImageUrl,
    setParentVideoUrl,
    setFrames,
    setFps,
    setVideoModel,
  };
}
