import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castRelationOf,
  castRelationSentence,
  inverseRelation,
  normalizeCastRelationships,
  relationAllowsRomance,
} from './cast-relationships';
import { dayPartnerApplies, type DayPartner } from './day-partner';

const sister: DayPartner = { name: 'Maya', noun: 'woman', relation: 'sibling' };
const boyfriend: DayPartner = { name: 'Tomas', noun: 'man', relation: 'partner' };

describe('cast relationships', () => {
  it('keeps one known relation per other Cast', () => {
    assert.deepEqual(
      normalizeCastRelationships([
        { castId: 'a', kind: 'sibling' },
        { castId: 'a', kind: 'friend' },
        { castId: 'b', kind: 'boss' },
      ]),
      [{ castId: 'a', kind: 'sibling' }]
    );
    assert.equal(castRelationOf({ relationships: [{ castId: 'a', kind: 'rival' }] }, 'a'), 'rival');
    assert.equal(castRelationOf({}, 'a'), null);
  });

  it('mirrors parent and child, the rest as they are', () => {
    assert.equal(inverseRelation('parent'), 'child');
    assert.equal(inverseRelation('child'), 'parent');
    assert.equal(inverseRelation('best-friend'), 'best-friend');
  });

  it('says how the pair relate without gendered words', () => {
    assert.equal(castRelationSentence('sibling'), 'They are siblings — warm and familiar, not romantic.');
    assert.equal(castRelationSentence('best-friend'), 'They are best friends — easy and friendly, not romantic.');
    assert.equal(castRelationSentence('spouse'), 'They are a married couple.');
    assert.equal(castRelationSentence(null), '');
  });

  it('never lets family play the partner in a romantic or adult mood', () => {
    assert.equal(relationAllowsRomance('cousin'), false);
    assert.equal(relationAllowsRomance('ex'), true);
    assert.equal(dayPartnerApplies({ partner: sister, headcount: 2, adultMood: false }), true);
    assert.equal(dayPartnerApplies({ partner: sister, headcount: 2, adultMood: false, romanticMood: true }), false);
    assert.equal(dayPartnerApplies({ partner: sister, headcount: 2, adultMood: true, sameSexLayouts: true }), false);
    assert.equal(dayPartnerApplies({ partner: boyfriend, headcount: 2, adultMood: true }), true);
    assert.equal(dayPartnerApplies({ partner: boyfriend, headcount: 2, adultMood: false, romanticMood: true }), true);
  });
});
