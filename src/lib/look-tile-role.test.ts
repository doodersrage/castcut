import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTileRolePrompt, parseTileRoleReply } from './look-tile-role';

describe('Look tile role suggestion', () => {
  it('reads the role word from a reply', () => {
    assert.equal(parseTileRoleReply('lighting'), 'lighting');
    assert.equal(parseTileRoleReply('Location.'), 'location');
    assert.equal(parseTileRoleReply('**Palette** — mostly teal and orange'), 'palette');
  });

  it('takes the first role named when the model rambles', () => {
    assert.equal(parseTileRoleReply('style, though the lighting is also strong'), 'style');
  });

  it('returns null when no role is named', () => {
    assert.equal(parseTileRoleReply('I cannot tell'), null);
    assert.equal(parseTileRoleReply('other'), null);
    // "moody" is not "mood"
    assert.equal(parseTileRoleReply('moody'), null);
  });

  it('lists every role in the prompt', () => {
    const { system } = buildTileRolePrompt();
    for (const role of ['mood', 'lighting', 'location', 'style', 'palette']) {
      assert.match(system, new RegExp(`^${role} —`, 'm'));
    }
  });
});
