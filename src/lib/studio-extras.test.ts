import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  foldLegacyNamespacesIntoExtras,
  localStudioExtrasLooksEmpty,
  mergeStudioExtras,
  type StudioExtrasPayload,
} from './studio-extras';
import type { PlayCampaignState } from './play-campaign';
import type { PlayMetrics } from './play-metrics';

describe('studio-extras merge', () => {
  it('prefers the newer updatedAt snapshot', () => {
    const older: StudioExtrasPayload = {
      updatedAt: 100,
      avoidedTokens: ['old'],
      navFavorites: ['/old'],
    };
    const newer: StudioExtrasPayload = {
      updatedAt: 200,
      avoidedTokens: ['new'],
      navFavorites: ['/new'],
    };
    assert.deepEqual(mergeStudioExtras(older, newer).avoidedTokens, ['new']);
    assert.deepEqual(mergeStudioExtras(newer, older).avoidedTokens, ['new']);
  });

  it('keeps local on equal timestamps', () => {
    const local: StudioExtrasPayload = {
      updatedAt: 50,
      avoidedTokens: ['local'],
    };
    const server: StudioExtrasPayload = {
      updatedAt: 50,
      avoidedTokens: ['server'],
    };
    assert.deepEqual(mergeStudioExtras(local, server).avoidedTokens, ['local']);
  });

  it('folds legacy namespaces into missing extras fields', () => {
    const folded = foldLegacyNamespacesIntoExtras(
      { updatedAt: 1, avoidedTokens: [] },
      {
        avoidedTokens: ['blurry'],
        scheduledBatch: { enabled: true } as never,
        webhookSettings: { enabled: false } as never,
        promptProjects: [{ id: 'p1' }],
      }
    );
    assert.deepEqual(folded.avoidedTokens, ['blurry']);
    assert.equal((folded.scheduledBatch as { enabled?: boolean })?.enabled, true);
    assert.equal((folded.webhookSettings as { enabled?: boolean })?.enabled, false);
    assert.equal(folded.promptProjects?.length, 1);
  });

  it('carries gallery ELO through merge when the newer snapshot has it', () => {
    const older: StudioExtrasPayload = { updatedAt: 1, galleryElo: {} };
    const newer: StudioExtrasPayload = {
      updatedAt: 2,
      galleryElo: {
        g1: { groupId: 'g1', entries: [], winnerId: 'w1', updatedAt: 2 },
      },
    };
    assert.equal(mergeStudioExtras(older, newer).galleryElo?.g1?.winnerId, 'w1');
  });

  it('does not let an empty new browser overwrite server looks', () => {
    const local: StudioExtrasPayload = {
      updatedAt: 9_999,
      sessionRecipes: [],
      comfyWorkflowFiles: [],
    };
    const server: StudioExtrasPayload = {
      updatedAt: 1,
      sessionRecipes: [{ id: 'look-1', label: 'Look · qwen', savedAt: 1, shared: {} }] as never,
      comfyWorkflowFiles: [{ id: 'wf', name: 'portrait.json' }] as never,
    };
    assert.equal(localStudioExtrasLooksEmpty(local), true);
    assert.equal(localStudioExtrasLooksEmpty(server), false);
    const merged = mergeStudioExtras(local, server);
    assert.equal(merged.sessionRecipes?.length, 1);
    assert.equal(merged.comfyWorkflowFiles?.length, 1);
  });

  it('carries play metrics and campaign state through merge', () => {
    const playMetrics: PlayMetrics = {
      version: 1,
      firstPlayCampaignAt: 100,
      firstFilmCutAt: 200,
    };
    const playCampaignState: PlayCampaignState = {
      version: 1,
      characterId: 'char-1',
      lookPackId: 'lp-1',
      stepIndex: 2,
      updatedAt: 300,
    };
    const local: StudioExtrasPayload = { updatedAt: 1 };
    const server: StudioExtrasPayload = {
      updatedAt: 2,
      playMetrics,
      playCampaignState,
    };
    const merged = mergeStudioExtras(local, server);
    assert.equal((merged.playMetrics as PlayMetrics | undefined)?.firstPlayCampaignAt, 100);
    assert.equal(
      (merged.playCampaignState as PlayCampaignState | undefined)?.lookPackId,
      'lp-1'
    );
  });

  it('feature sections add their fields to collect and read them back in apply', async () => {
    const { collectStudioExtras, applyStudioExtras, registerStudioExtrasSection } = await import(
      './studio-extras'
    );
    const applied: unknown[] = [];
    registerStudioExtrasSection('test-feature', {
      collect: () => ({ testFeatureField: 42 }),
      apply: payload => applied.push(payload.testFeatureField),
    });
    assert.equal(collectStudioExtras().testFeatureField, 42);
    applyStudioExtras({ updatedAt: 1, testFeatureField: 7 });
    assert.deepEqual(applied, [7]);
  });
});

describe('saved stories in the server copy', () => {
  it('merge story by story, newest copy of each', async () => {
    const { mergeRoleplayLibraries } = await import('./studio-extras');
    const merged = mergeRoleplayLibraries(
      [
        { id: 'nora', updatedAt: 5, title: 'Nora (phone)' },
        { id: 'tomas', updatedAt: 1, title: 'Tomas (old)' },
      ],
      [
        { id: 'tomas', updatedAt: 9, title: 'Tomas (desk)' },
        { id: 'sam', updatedAt: 3, title: 'Sam' },
      ]
    );
    assert.deepEqual(
      merged?.map(entry => entry.title),
      ['Tomas (desk)', 'Nora (phone)', 'Sam']
    );
    assert.equal(mergeRoleplayLibraries([], undefined), null);
  });
});
