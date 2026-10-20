import { runServerScheduledBatch } from './server-scheduled-batch';
import { rankPromptsWithLlm } from './best-of-n-rank-server';
import type { UserScheduledCampaign } from './auth/types';

export { rankPromptsWithLlm, rankImagesWithVision } from './best-of-n-rank-server';
export type { BestOfNImageCandidate } from './best-of-n-rank-server';

export async function runUserCampaignWithBestOfN(campaign: UserScheduledCampaign): Promise<{
  prompts: string[];
  queued: number;
  ranked: boolean;
  visionRanked?: boolean;
  visionKept?: number;
  visionCulled?: number;
}> {
  const multiplier = campaign.bestOfN && campaign.bestOfN > 1 ? campaign.bestOfN : 1;
  const generateCount = campaign.count * multiplier;
  const useVisionRank = Boolean(
    campaign.bestOfNVision && multiplier > 1 && campaign.autoQueueComfyUi
  );

  const batch = await runServerScheduledBatch({
    target: campaign.target,
    count: generateCount,
    autoQueueComfyUi: false,
  });

  let prompts = batch.prompts;
  let ranked = false;

  if (!useVisionRank && multiplier > 1 && prompts.length > campaign.count) {
    prompts = await rankPromptsWithLlm(prompts, campaign.count);
    ranked = true;
  } else if (!useVisionRank) {
    prompts = prompts.slice(0, campaign.count);
  }

  let queued = 0;
  let visionRanked = false;
  let visionKept: number | undefined;
  let visionCulled: number | undefined;
  const queuedPromptIds: string[] = [];
  const queuedPrompts: string[] = [];
  let comfyUrl: string | undefined;

  if (campaign.autoQueueComfyUi && prompts.length > 0) {
    const { queueBatchToComfyUi, getComfyUiBaseUrl } = await import('./comfyui/client');
    const queuePrompts = useVisionRank ? prompts : prompts.slice(0, campaign.count);
    const result = await queueBatchToComfyUi(
      queuePrompts.map(prompt => ({ prompt })),
      undefined
    );
    queued = result.queued;
    comfyUrl = result.comfyUrl || getComfyUiBaseUrl();

    for (const [index, entry] of result.results.entries()) {
      if (entry.ok && entry.promptId) {
        queuedPromptIds.push(entry.promptId);
        queuedPrompts.push(queuePrompts[index] ?? '');
      }
    }

    if (useVisionRank && queuedPromptIds.length > campaign.count) {
      const { runServerPostQueueVisionCull } = await import('./best-of-n-vision-server');
      const cull = await runServerPostQueueVisionCull({
        promptIds: queuedPromptIds,
        prompts: queuedPrompts,
        keep: campaign.count,
        comfyUrl,
      });
      visionRanked = true;
      visionKept = cull.keptCandidates.length;
      visionCulled = cull.culledPromptIds.length;
      prompts = cull.keptCandidates.map(entry => entry.prompt);
      ranked = true;
    }
  }

  return { prompts, queued, ranked, visionRanked, visionKept, visionCulled };
}
