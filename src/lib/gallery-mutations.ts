'use client';

import type { ComfyGalleryEntry } from './comfyui-gallery';
import { resolveRuntimeForQueue } from './comfyui-runtime-for-model';
import { registerComfyGalleryJob } from './comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from './comfyui-gallery-poller';
import { postComfyUiPrompt } from './comfyui-queue-request';
import { resolveQueueParams } from './queue-params-settings';
import {
  refreshQueueImageParamsForRequeue,
  resolveRequeueImageUrlsFromEntry,
} from './queue-requeue-images';
import { injectLoraTriggers } from './lora-prompt-injection';
import { guardQueueQualityForVram } from './vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from './held-max-queue';
import { prepareQueuePrompts } from './queue-prompt-prep';
import { readClothingIdsFromMetadata } from './recent-clothing';
import { compactClothingScript } from './clothing-quality';

type WardrobeMutationClause = { clause: string; summary?: string; wardrobeId?: string | null };

async function fetchWardrobeMutationClause(
  prompt: string,
  value: string | undefined,
  options: { hints?: string; recentClothing?: readonly string[] }
): Promise<WardrobeMutationClause> {
  const response = await fetch('/api/catalog/wardrobe-mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      prompt,
      value,
      hints: options.hints,
      recentClothing: options.recentClothing,
    }),
  });
  const data = (await response.json().catch(() => null)) as
    (WardrobeMutationClause & { error?: string }) | null;
  if (!response.ok || !data?.clause) {
    throw new Error(data?.error ?? 'Could not pick an outfit for this variant.');
  }
  return data;
}

export type MutationKind = 'variation' | 'location' | 'wardrobe' | 'wildness';

export type MutatedGalleryJobSummary = {
  kind: MutationKind;
  summary?: string;
  wardrobeId?: string | null;
};

export async function buildMutatedPrompt(
  basePrompt: string,
  kind: MutationKind,
  value?: string,
  options?: {
    hints?: string;
    recentClothing?: readonly string[];
  }
): Promise<string> {
  return (await buildMutatedPromptDetails(basePrompt, kind, value, options)).prompt;
}

export async function buildMutatedPromptDetails(
  basePrompt: string,
  kind: MutationKind,
  value?: string,
  options?: {
    hints?: string;
    recentClothing?: readonly string[];
  }
): Promise<MutatedGalleryJobSummary & { prompt: string }> {
  const prompt = basePrompt.trim();
  switch (kind) {
    case 'location':
      return {
        kind,
        prompt: value?.trim()
          ? `${prompt}. Relocate scene to ${value.trim()} while preserving subject and action.`
          : `${prompt}. Change to a contrasting outdoor location while preserving subject identity.`,
        summary: value?.trim() || undefined,
      };
    case 'wardrobe': {
      // Picked on the server: clothing-mutations.ts pulls in the full wardrobe catalog (~500 KB
      // gzipped of generated entries), which as a lazy client import was the largest chunk in the
      // app for this one rarely used branch.
      // A named outfit needs no catalog; only a random catalog pick goes to the server.
      const built = value?.trim()
        ? {
            clause: `Change outfit to ${compactClothingScript(value.trim())} while keeping pose and scene.`,
            summary: value.trim(),
          }
        : await fetchWardrobeMutationClause(prompt, value, {
            hints: options?.hints,
            recentClothing: options?.recentClothing,
          });
      return {
        kind,
        prompt: `${prompt}. ${built.clause}`,
        summary: built.summary,
        wardrobeId: 'wardrobeId' in built ? built.wardrobeId : undefined,
      };
    }
    case 'wildness':
      return {
        kind,
        prompt: `${prompt}. Push composition and lighting toward a bolder, more dynamic interpretation.`,
      };
    case 'variation':
    default:
      return {
        kind: 'variation',
        prompt: `${prompt}. Subtle variation: adjust camera angle, expression, or micro-composition while preserving core scene intent.`,
      };
  }
}

export function formatMutatedJobsStatus(
  jobs: readonly MutatedGalleryJobSummary[],
  queued: number,
  held: number
): string {
  const wardrobeBits = jobs
    .filter(job => job.kind === 'wardrobe' && job.summary?.trim())
    .map(job => {
      const short = job.summary!.split(',')[0]?.trim() || job.summary!.trim();
      return short.length > 42 ? `${short.slice(0, 40)}…` : short;
    });
  const wardrobeNote =
    wardrobeBits.length > 0
      ? `Wardrobe → ${wardrobeBits.slice(0, 2).join('; ')}${wardrobeBits.length > 2 ? '…' : ''}`
      : null;
  const base =
    held > 0 ? `Queued ${queued} mutations · held ${held} Max` : `Queued ${queued} mutations`;
  return wardrobeNote ? `${base} · ${wardrobeNote}` : `${base}.`;
}

export async function queueMutatedGalleryJobs(input: {
  entry: ComfyGalleryEntry;
  kinds: MutationKind[];
  values?: Partial<Record<MutationKind, string>>;
  count?: number;
}): Promise<{ queued: number; held: number; jobs: MutatedGalleryJobSummary[] }> {
  const count = Math.min(6, Math.max(1, input.count ?? input.kinds.length));
  const model = (input.entry.model ?? 'qwen-image-2512') as Parameters<
    typeof resolveRuntimeForQueue
  >[0];
  const tool = input.entry.tool ?? 'gallery-mutate';
  const baseRuntime = resolveRuntimeForQueue(model, tool);
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const recentClothing = readClothingIdsFromMetadata(
    input.entry.queueParams as Record<string, unknown> | undefined
  );

  let queued = 0;
  let heldCount = 0;
  const jobs: MutatedGalleryJobSummary[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = input.kinds[index % input.kinds.length] ?? 'variation';
    const details = await buildMutatedPromptDetails(
      input.entry.prompt,
      kind,
      input.values?.[kind],
      {
        hints: input.entry.prompt.slice(0, 400),
        recentClothing,
      }
    );
    jobs.push({
      kind: details.kind,
      summary: details.summary,
      wardrobeId: details.wardrobeId,
    });
    const mutated = injectLoraTriggers(details.prompt);
    const prepared = await prepareQueuePrompts({
      model,
      positive: mutated,
      hints: input.entry.prompt.slice(0, 200),
      tool: input.entry.tool ?? 'gallery-mutate',
      explicitNegative: input.entry.negativePrompt,
    });
    const prompt = prepared.positive;
    const negativePrompt = prepared.negative;
    const seed = String(Math.floor(Math.random() * 2 ** 32) + index);
    const imageUrls = resolveRequeueImageUrlsFromEntry(input.entry);
    const refreshed = await refreshQueueImageParamsForRequeue({
      model: input.entry.model,
      tool: input.entry.tool ?? 'gallery-mutate',
      queueParams: {
        ...input.entry.queueParams,
        seed,
      },
      sourceImageUrl: imageUrls.sourceImageUrl,
      maskImageUrl: imageUrls.maskImageUrl,
    });
    const params = resolveQueueParams({
      model: input.entry.model,
      tool: 'gallery-mutate',
      base: {
        ...refreshed.params,
        ...(details.wardrobeId
          ? {
              randomOutfit: {
                wardrobeId: details.wardrobeId,
              },
            }
          : {}),
      },
      qualityProfile: vramGuard.profile,
      figurePixelSize: refreshed.figurePixelSize,
      inputImageFilename: refreshed.params?.inputImageFilename,
    });

    const held = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt,
          negativePrompt,
          model: String(model),
          tool: 'gallery-mutate',
          params,
          comfy: runtime,
        },
      ],
    });
    if (held.held) {
      heldCount += 1;
      continue;
    }

    const queuedJob = await postComfyUiPrompt({
      prompt,
      negativePrompt,
      params,
      ...(runtime ? { comfy: runtime } : {}),
    });

    if (!queuedJob.ok || !queuedJob.promptId) {
      queuedJob.releaseLiveSocket();
      continue;
    }

    registerComfyGalleryJob({
      promptId: queuedJob.promptId,
      prompt,
      negativePrompt,
      tool: 'gallery-mutate',
      model,
      comfyUrl: queuedJob.comfyUrl ?? input.entry.comfyUrl,
      clientId: queuedJob.clientId,
      queueParams: params,
      sourceImageUrl: imageUrls.sourceImageUrl,
      maskImageUrl: imageUrls.maskImageUrl,
      historyId: input.entry.historyId,
      projectId: input.entry.projectId,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(queuedJob.promptId, {
      comfyUrl: queuedJob.comfyUrl ?? input.entry.comfyUrl,
      clientId: queuedJob.clientId,
    });
    queuedJob.releaseLiveSocket();
    queued += 1;
  }

  return { queued, held: heldCount, jobs };
}
