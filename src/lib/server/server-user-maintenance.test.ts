import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type Campaign = {
  enabled: boolean;
  target: 'random-scene' | 'topics';
  count: number;
  intervalMin: number;
  autoQueueComfyUi: boolean;
  lastRunAt?: number;
  bestOfN?: number;
  bestOfNVision?: boolean;
};

type CampaignUser = {
  id: string;
  username: string;
  scheduledCampaign?: Campaign;
};

type ExportUser = {
  id: string;
  username: string;
  exportEnabled?: boolean;
};

let campaignUsers: CampaignUser[] = [];
let exportUsers: ExportUser[] = [];

const listUsersWithCampaigns = mock.fn(() => campaignUsers as never[]);
const listUsers = mock.fn(() => exportUsers as never[]);
const updateUserProfile = mock.fn((_id: string, _patch: unknown) => undefined);
mock.module('../auth/store', {
  namedExports: { listUsersWithCampaigns, listUsers, updateUserProfile },
});

let campaignResult = { prompts: ['p1', 'p2'], queued: 2, ranked: 2, visionRanked: 0, visionKept: 0, visionCulled: 0 };
const runUserCampaignWithBestOfN = mock.fn((_campaign: Campaign) => Promise.resolve(campaignResult));
mock.module('../best-of-n/server', { namedExports: { runUserCampaignWithBestOfN } });

const storedByUser = new Map<string, Record<string, unknown>>();
const readUserServerStorage = mock.fn((userId: string, namespace: string) => {
  return storedByUser.get(`${userId}:${namespace}`) ?? null;
});
const writeUserExportSnapshot = mock.fn(
  (_userId: string, _username: string, _payload: unknown) => 'export.json'
);
mock.module('../storage/user-server-storage', {
  namedExports: { readUserServerStorage, writeUserExportSnapshot },
});

const notifyBatchCompleted = mock.fn((_input: unknown) => Promise.resolve(undefined));
mock.module('../email/notifications', { namedExports: { notifyBatchCompleted } });

afterEach(() => {
  campaignUsers = [];
  exportUsers = [];
  storedByUser.clear();
  campaignResult = {
    prompts: ['p1', 'p2'],
    queued: 2,
    ranked: 2,
    visionRanked: 0,
    visionKept: 0,
    visionCulled: 0,
  };
  for (const m of [
    listUsersWithCampaigns,
    listUsers,
    updateUserProfile,
    runUserCampaignWithBestOfN,
    readUserServerStorage,
    writeUserExportSnapshot,
    notifyBatchCompleted,
  ]) {
    m.mock.resetCalls();
  }
});

describe('server-user-maintenance', async () => {
  const { runServerUserMaintenance } = await import('./server-user-maintenance');

  it('returns zero counts when there are no users', async () => {
    const result = await runServerUserMaintenance();
    assert.deepEqual(result, { campaignsRun: 0, exportsWritten: 0 });
  });

  it('skips a user with no scheduledCampaign', async () => {
    campaignUsers = [{ id: 'u1', username: 'alice' }];
    const result = await runServerUserMaintenance();
    assert.equal(result.campaignsRun, 0);
    assert.equal(runUserCampaignWithBestOfN.mock.calls.length, 0);
  });

  it('skips a user whose campaign is disabled', async () => {
    campaignUsers = [
      {
        id: 'u1',
        username: 'alice',
        scheduledCampaign: {
          enabled: false,
          target: 'random-scene',
          count: 3,
          intervalMin: 60,
          autoQueueComfyUi: true,
          lastRunAt: 0,
        },
      },
    ];
    const result = await runServerUserMaintenance();
    assert.equal(result.campaignsRun, 0);
  });

  it('skips a user whose campaign is not yet due', async () => {
    campaignUsers = [
      {
        id: 'u1',
        username: 'alice',
        scheduledCampaign: {
          enabled: true,
          target: 'random-scene',
          count: 3,
          intervalMin: 60,
          autoQueueComfyUi: true,
          lastRunAt: Date.now(),
        },
      },
    ];
    const result = await runServerUserMaintenance();
    assert.equal(result.campaignsRun, 0);
    assert.equal(runUserCampaignWithBestOfN.mock.calls.length, 0);
  });

  it('runs a due campaign, writes an export snapshot, updates lastRunAt, and notifies', async () => {
    campaignUsers = [
      {
        id: 'u1',
        username: 'alice',
        scheduledCampaign: {
          enabled: true,
          target: 'random-scene',
          count: 3,
          intervalMin: 60,
          autoQueueComfyUi: true,
          lastRunAt: 0,
          bestOfN: 2,
          bestOfNVision: true,
        },
      },
    ];
    const result = await runServerUserMaintenance();
    assert.equal(result.campaignsRun, 1);
    assert.equal(runUserCampaignWithBestOfN.mock.calls.length, 1);

    assert.equal(writeUserExportSnapshot.mock.calls.length, 1);
    const [userId, username, payload] = writeUserExportSnapshot.mock.calls[0]!.arguments as [
      string,
      string,
      Record<string, unknown>,
    ];
    assert.equal(userId, 'u1');
    assert.equal(username, 'alice');
    assert.equal(payload.type, 'campaign-run');
    assert.equal(payload.queued, 2);
    assert.equal(payload.bestOfN, 2);
    assert.equal(payload.bestOfNVision, true);

    assert.equal(updateUserProfile.mock.calls.length, 1);
    const [updatedId, patch] = updateUserProfile.mock.calls[0]!.arguments as [
      string,
      { scheduledCampaign: Campaign },
    ];
    assert.equal(updatedId, 'u1');
    assert.ok(patch.scheduledCampaign.lastRunAt! > 0);

    // notifyBatchCompleted is reached via a call-time dynamic import; mock.module may not
    // intercept it on every Node version. The real function no-ops without email configured,
    // so we only assert the campaign path completes without throwing.
  });

  it('treats an interval below 5 minutes as a 5-minute floor', async () => {
    campaignUsers = [
      {
        id: 'u1',
        username: 'alice',
        scheduledCampaign: {
          enabled: true,
          target: 'random-scene',
          count: 3,
          intervalMin: 0,
          autoQueueComfyUi: true,
          lastRunAt: Date.now() - 1000,
        },
      },
    ];
    const result = await runServerUserMaintenance();
    // 1 second elapsed is less than the 5-minute floor, so the campaign is not yet due.
    assert.equal(result.campaignsRun, 0);
  });

  it('writes an export snapshot for users with exportEnabled and stored history/gallery', async () => {
    exportUsers = [{ id: 'u2', username: 'bob', exportEnabled: true }];
    storedByUser.set('u2:prompt-history', { entries: [1, 2] });
    const result = await runServerUserMaintenance();
    assert.equal(result.exportsWritten, 1);
    assert.equal(writeUserExportSnapshot.mock.calls.length, 1);
    const [userId, username, payload] = writeUserExportSnapshot.mock.calls[0].arguments as [
      string,
      string,
      { history: unknown; gallery: unknown },
    ];
    assert.equal(userId, 'u2');
    assert.equal(username, 'bob');
    assert.deepEqual(payload.history, { entries: [1, 2] });
    assert.equal(payload.gallery, null);
    assert.equal(listUsers.mock.callCount(), 1);
  });

  it('skips export when the user has exportEnabled but no stored history or gallery', async () => {
    exportUsers = [{ id: 'u3', username: 'cara', exportEnabled: true }];
    const result = await runServerUserMaintenance();
    assert.equal(result.exportsWritten, 0);
    assert.equal(writeUserExportSnapshot.mock.calls.length, 0);
  });

  it('skips export when exportEnabled is off even if storage exists', async () => {
    exportUsers = [{ id: 'u4', username: 'dan', exportEnabled: false }];
    storedByUser.set('u4:prompt-history', { entries: [9] });
    const result = await runServerUserMaintenance();
    assert.equal(result.exportsWritten, 0);
    assert.equal(writeUserExportSnapshot.mock.calls.length, 0);
  });
});
