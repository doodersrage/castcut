import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDayPartnerStandInPrompt,
  pickDayPartnerStandInLook,
  reusableDayPartnerStandIn,
} from './day-partner-stand-in';

describe('Day partner stand-in', () => {
  it('reuses the day’s face only for the same gender', () => {
    const standIn = { noun: 'man' as const, look: 'a man', filename: 'day-partner-man.png' };
    assert.equal(reusableDayPartnerStandIn(standIn, 'man'), standIn);
    assert.equal(reusableDayPartnerStandIn(standIn, 'woman'), null);
    assert.equal(reusableDayPartnerStandIn(null, 'man'), null);
  });

  it('asks for a different person, head and shoulders', () => {
    const look = pickDayPartnerStandInLook('man');
    assert.match(look, /\bman\b/);
    const prompt = buildDayPartnerStandInPrompt(look);
    assert.match(prompt, /completely different person/);
    assert.match(prompt, /Head-and-shoulders portrait/);
  });
});
