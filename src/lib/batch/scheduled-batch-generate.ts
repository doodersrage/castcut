import type { DetailLevel } from '../prompt/detail-level';
import type { QueueQualityProfile } from '../queue/quality-profile';
import { avoidedTokensRequestBody } from '../prompt/avoided-tokens';
import type { ScheduledBatchConfig } from './scheduled-batch';
import { normalizeQueueQualityProfile } from '../queue/quality-profile';
import { rankPromptsWithLlm } from '../best-of-n/rank';

export type ScheduledBatchGenerateInput = {
  config: ScheduledBatchConfig;
  model: string;
  detail: DetailLevel;
};

export async function generateScheduledBatchPrompts(
  input: ScheduledBatchGenerateInput
): Promise<string[]> {
  const { config, model, detail } = input;
  const prompts: string[] = [];

  if (config.target === 'topics') {
    const response = await fetch('/api/topics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topics: Array.from({ length: config.count }, (_, index) =>
          config.genre?.trim()
            ? `${config.genre.trim()} scene ${index + 1}`
            : `Scheduled scene ${index + 1}`
        ),
        target: 'generate',
        model,
        detail,
        ...avoidedTokensRequestBody(),
      }),
    });
    const data = (await response.json()) as {
      results?: Array<{ prompt?: string }>;
    };
    if (response.ok) {
      for (const entry of data.results ?? []) {
        if (entry.prompt?.trim()) {
          prompts.push(entry.prompt.trim());
        }
      }
    }
    return prompts;
  }

  if (config.target === 'nsfw-generator') {
    for (let index = 0; index < config.count; index += 1) {
      const response = await fetch('/api/nsfw-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          detail,
          wildness: 55,
          hints: config.genre?.trim() || undefined,
          ...avoidedTokensRequestBody(),
        }),
      });
      const data = (await response.json()) as { prompt?: string };
      if (response.ok && data.prompt?.trim()) {
        prompts.push(data.prompt.trim());
      }
    }
    return prompts;
  }

  for (let index = 0; index < config.count; index += 1) {
    const response = await fetch('/api/random-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        detail,
        genre: config.genre?.trim() || undefined,
        includePeople: true,
        wildness: 50,
        ...avoidedTokensRequestBody(),
      }),
    });
    const data = (await response.json()) as { prompt?: string };
    if (response.ok && data.prompt?.trim()) {
      prompts.push(data.prompt.trim());
    }
  }

  return prompts;
}

export function resolveScheduledBatchModelDetail(
  config: ScheduledBatchConfig,
  shared: { model: string; detail: DetailLevel; queueQualityProfile?: QueueQualityProfile }
): { model: string; detail: DetailLevel; qualityProfile: QueueQualityProfile } {
  const useOverride = config.overrideSharedSettings === true;
  return {
    model: useOverride && config.model?.trim() ? config.model.trim() : shared.model,
    detail: useOverride && config.detail ? config.detail : shared.detail,
    qualityProfile:
      useOverride && config.qualityProfile
        ? config.qualityProfile
        : normalizeQueueQualityProfile(shared.queueQualityProfile),
  };
}

export async function rankScheduledBatchPrompts(
  prompts: string[],
  keep: number,
  bestOfN: number
): Promise<string[]> {
  if (bestOfN <= 1 || prompts.length <= keep) {
    return prompts.slice(0, keep);
  }
  return rankPromptsWithLlm(prompts, keep);
}
