import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCastHomeStatus,
  castPartLabel,
  castRosterReadinessLine,
} from './cast-home-status';

describe('cast-home-status', () => {
  it('buildCastHomeStatus warns when plate is missing', () => {
    const status = buildCastHomeStatus({
      hasPlate: false,
      lookCount: 2,
      filmCount: 0,
      stillCount: 3,
    });
    assert.match(status.statusLine, /no plate/i);
    assert.match(status.statusLine, /2 looks/);
    assert.match(status.statusLine, /0 films/);
    assert.match(status.statusLine, /3 stills/);
    assert.match(status.plateHint ?? '', /look plate/i);
  });

  it('buildCastHomeStatus reports plate ready without hint', () => {
    const status = buildCastHomeStatus({
      hasPlate: true,
      lookCount: 1,
      filmCount: 1,
    });
    assert.match(status.statusLine, /plate ready/i);
    assert.match(status.statusLine, /1 look/);
    assert.match(status.statusLine, /1 film/);
    assert.equal(status.plateHint, null);
  });

  it('castRosterReadinessLine flags No plate', () => {
    const ready = castRosterReadinessLine({ lookCount: 0, hasPlate: false });
    assert.equal(ready.noPlate, true);
    assert.match(ready.line, /No plate/);
    const plated = castRosterReadinessLine({
      lookCount: 2,
      hasPlate: true,
      trigger: 'char_sam',
      loraCount: 1,
    });
    assert.equal(plated.noPlate, false);
    assert.doesNotMatch(plated.line, /No plate/);
    assert.match(plated.line, /2 looks/);
    assert.match(plated.line, /char_sam/);
  });

  it('castPartLabel resolves archetype labels', () => {
    assert.equal(castPartLabel(null), null);
    assert.ok(castPartLabel('custom') === 'Custom part' || castPartLabel('custom')?.startsWith('Custom'));
  });
});
