import 'server-only';

import { listUsers, listUsersWithCampaigns, updateUserProfile } from '../auth/store';
import { runUserCampaignWithBestOfN } from '../best-of-n/server';
import { readUserServerStorage, writeUserExportSnapshot } from '../storage/user-server-storage';
import type { UserScheduledCampaign } from '../auth/types';

function shouldRunCampaign(campaign: UserScheduledCampaign, now = Date.now()): boolean {
  if (!campaign.enabled) {
    return false;
  }
  const intervalMs = Math.max(5, campaign.intervalMin) * 60_000;
  return now - (campaign.lastRunAt ?? 0) >= intervalMs;
}

export async function runServerUserMaintenance(): Promise<{
  campaignsRun: number;
  exportsWritten: number;
}> {
  let campaignsRun = 0;
  let exportsWritten = 0;

  for (const user of listUsersWithCampaigns()) {
    const campaign = user.scheduledCampaign;
    if (!campaign || !shouldRunCampaign(campaign)) {
      continue;
    }

    const result = await runUserCampaignWithBestOfN(campaign);
    writeUserExportSnapshot(user.id, user.username, {
      type: 'campaign-run',
      exportedAt: Date.now(),
      prompts: result.prompts,
      queued: result.queued,
      ranked: result.ranked,
      bestOfN: campaign.bestOfN,
      bestOfNVision: campaign.bestOfNVision,
      visionRanked: result.visionRanked,
      visionKept: result.visionKept,
      visionCulled: result.visionCulled,
    });

    updateUserProfile(user.id, {
      scheduledCampaign: { ...campaign, lastRunAt: Date.now() },
    });
    campaignsRun += 1;

    const { notifyBatchCompleted } = await import('../email/notifications');
    await notifyBatchCompleted({
      userId: user.id,
      username: user.username,
      kind: 'user-campaign',
      promptCount: result.prompts.length,
      queued: result.queued,
      ranked: result.ranked,
    });
  }

  for (const user of listUsers()) {
    if (!user.exportEnabled) {
      continue;
    }
    const history = readUserServerStorage<unknown>(user.id, 'prompt-history');
    const gallery = readUserServerStorage<unknown>(user.id, 'comfy-gallery');
    if (!history && !gallery) {
      continue;
    }
    writeUserExportSnapshot(user.id, user.username, {
      exportedAt: Date.now(),
      history,
      gallery,
    });
    exportsWritten += 1;
  }

  return { campaignsRun, exportsWritten };
}
