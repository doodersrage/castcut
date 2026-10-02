'use client';

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import type { ComfyImageModel } from './comfy-models/client';
import { registerComfyGalleryJob } from './comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from './comfyui-gallery-poller';
import { postComfyUiPrompt } from './comfyui-queue-request';
import { resolveRuntimeForQueue } from './comfyui-runtime-for-model';
import { resolveQueueParams } from './queue-params-settings';
import { guardQueueQualityForVram } from './vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from './held-max-queue';

export type PromptRecipeStep = 'generate' | 'lint' | 'fix' | 'compact' | 'queue';

export type PromptRecipe = {
  id: string;
  name: string;
  steps: PromptRecipeStep[];
  createdAt: number;
};

const KEY = 'comfy-prompt-recipes-v1';

export function loadPromptRecipes(): PromptRecipe[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return readBrowserValue<PromptRecipe[]>(KEY) ?? [];
}

export function savePromptRecipes(recipes: PromptRecipe[]): void {
  writeBrowserValue(KEY, recipes);
}

export function upsertPromptRecipe(
  recipe: Omit<PromptRecipe, 'createdAt'> & { createdAt?: number }
): PromptRecipe {
  const next: PromptRecipe = {
    ...recipe,
    createdAt: recipe.createdAt ?? Date.now(),
  };
  savePromptRecipes([next, ...loadPromptRecipes().filter(entry => entry.id !== recipe.id)]);
  return next;
}

export async function runPromptRecipeSteps(
  prompt: string,
  steps: PromptRecipeStep[],
  model: string
): Promise<{ prompt: string; log: string[] }> {
  let current = prompt;
  const log: string[] = [];

  for (const step of steps) {
    if (step === 'lint') {
      const response = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { ok?: boolean };
      log.push(data.ok ? 'Lint passed' : 'Lint reported issues');
      continue;
    }
    if (step === 'fix') {
      const response = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { prompt?: string };
      if (data.prompt) {
        current = data.prompt;
        log.push('Applied rule fixes');
      }
      continue;
    }
    if (step === 'compact') {
      const response = await fetch('/api/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: current, model }),
      });
      const data = (await response.json()) as { prompt?: string };
      if (data.prompt) {
        current = data.prompt;
        log.push('Compacted prompt');
      }
      continue;
    }
    if (step === 'queue') {
      const comfyModel = model as ComfyImageModel;
      const baseRuntime = resolveRuntimeForQueue(comfyModel, 'recipe');
      const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
      const runtime = vramGuard.runtime ?? baseRuntime;
      const params = resolveQueueParams({
        model: comfyModel,
        tool: 'recipe',
        qualityProfile: vramGuard.profile,
      });
      const held = await maybeHoldMaxGenerateJobs({
        profile: vramGuard.profile,
        jobs: [
          {
            prompt: current,
            model: comfyModel,
            tool: 'recipe',
            params,
            comfy: runtime,
          },
        ],
      });
      if (held.held) {
        log.push('Held Best until ComfyUI queue is idle');
        continue;
      }
      const queued = await postComfyUiPrompt({
        prompt: current,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      });
      if (!queued.ok || !queued.promptId) {
        queued.releaseLiveSocket();
        log.push(queued.error ?? 'ComfyUI queue failed');
        continue;
      }
      registerComfyGalleryJob({
        promptId: queued.promptId,
        prompt: current,
        tool: 'recipe',
        model: comfyModel,
        comfyUrl: queued.comfyUrl ?? 'http://127.0.0.1:8188',
        clientId: queued.clientId,
        queueParams: params,
        queueQualityProfile: runtime.queueQualityProfile,
      });
      void scheduleComfyGalleryPoll(queued.promptId, {
        comfyUrl: queued.comfyUrl ?? 'http://127.0.0.1:8188',
        clientId: queued.clientId,
      });
      queued.releaseLiveSocket();
      log.push('Queued to ComfyUI');
    }
  }

  return { prompt: current, log };
}
