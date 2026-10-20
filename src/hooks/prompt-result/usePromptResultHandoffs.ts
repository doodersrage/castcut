'use client';

import { useCallback } from 'react';
import {
  startComposeFromResult,
  startControlNetFromResult,
  startImproveFromResult,
  startInpaintFromResult,
  startOutpaintFromResult,
  startPromptEditorFromResult,
  startRefineFromResult,
  startVideoFromResult,
} from '@/lib/edit/improve-output';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export function usePromptResultHandoffs(config: PromptResultActionsConfig) {
  const improveOutput = useCallback(
    (prompt: string, previewUrl?: string | null) => {
      if (!prompt.trim()) {
        return;
      }
      startImproveFromResult({
        prompt,
        previewUrl,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const refineOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim()) {
        return;
      }
      startRefineFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const editPromptOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string, hints?: string) => {
      if (!prompt.trim()) {
        return;
      }
      startPromptEditorFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        hints: hints ?? config.hints,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.hints, config.model, config.tool]
  );

  const inpaintOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startInpaintFromResult({
        prompt: prompt.trim() || 'edit masked region',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const outpaintOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startOutpaintFromResult({
        prompt: prompt.trim() || 'continue the scene naturally with matching lighting',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const composeOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startComposeFromResult({
        prompt: prompt.trim() || 'compose edit',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const videoOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startVideoFromResult({
        prompt: prompt.trim() || 'cinematic motion',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  const controlNetOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim() && !previewUrl) {
        return;
      }
      startControlNetFromResult({
        prompt: prompt.trim() || 'guided composition',
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool]
  );

  return {
    improveOutput,
    refineOutput,
    editPromptOutput,
    inpaintOutput,
    outpaintOutput,
    composeOutput,
    videoOutput,
    controlNetOutput,
  };
}
