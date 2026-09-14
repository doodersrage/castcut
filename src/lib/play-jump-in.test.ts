import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasCompletedFirstFilm } from './play-metrics';
import { playCampaignProgressLabel, type PlayCampaignState } from './play-campaign';
import { buildStarterLookPack } from './play-starter';

describe('play jump-in helpers', () => {
  it('hasCompletedFirstFilm requires a cut timestamp', () => {
    assert.equal(hasCompletedFirstFilm({ version: 1 }), false);
    assert.equal(hasCompletedFirstFilm({ version: 1, firstFilmCutAt: 0 }), false);
    assert.equal(hasCompletedFirstFilm({ version: 1, firstFilmCutAt: Date.now() }), true);
  });

  it('playCampaignProgressLabel summarizes resume', () => {
    assert.equal(playCampaignProgressLabel(null), 'Film · start');
    const mid: PlayCampaignState = {
      version: 1,
      characterId: 'c1',
      stepIndex: 2,
      updatedAt: Date.now(),
    };
    assert.match(playCampaignProgressLabel(mid), /Outfit/);
    const done: PlayCampaignState = { ...mid, completedAt: Date.now() };
    assert.equal(playCampaignProgressLabel(done), 'Film · complete');
  });

  it('buildStarterLookPack stages vibe notes', () => {
    const pack = buildStarterLookPack('c1');
    assert.equal(pack.characterId, 'c1');
    assert.equal(pack.version, 1);
    assert.ok(pack.moodNotes);
    assert.ok(pack.vibePrompt);
  });
});
