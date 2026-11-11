import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePortraitFaceCropRect } from '@/lib/face/portrait-face-crop';
import {
  DAY_PARTNER_STAND_IN_CROP,
  buildDayPartnerStandInPrompt,
  elderlyStandInLook,
  filmStandInKey,
  scriptShotOther,
  pickDayPartnerStandInLook,
  reusableDayPartnerStandIn,
} from './partner-stand-in';

describe('Day partner stand-in', () => {
  it('knows the partner from anyone else a script’s two-shot shows (live 2026-11-11)', () => {
    // The bookstore's elderly man had the partner's face, in his late thirties.
    const elderly = scriptShotOther(
      'Slyne and Elderly man, the two of them together. They stand up together, books in hand.'
    );
    assert.deepEqual(elderly, { who: 'elderly man', noun: 'man', elderly: true });
    assert.equal(filmStandInKey('s1', elderly), 's1|elderly man');
    const partner = scriptShotOther('Slyne and Slyne’s partner, the two of them together. Partner reacts.');
    assert.deepEqual(partner, { who: '', noun: null, elderly: false });
    assert.equal(filmStandInKey('s1', partner), 's1');
    assert.equal(scriptShotOther('Lena and Her husband, the two of them together.')?.who, '');
    assert.deepEqual(scriptShotOther('Mara and Old woman, the two of them together.'), {
      who: 'old woman',
      noun: 'woman',
      elderly: true,
    });
    assert.deepEqual(scriptShotOther('Mara and Marcus, the two of them together.'), {
      who: 'marcus',
      noun: null,
      elderly: false,
    });
    assert.equal(scriptShotOther('She sips her coffee alone.'), null);
    assert.equal(scriptShotOther(undefined), null);
    assert.equal(filmStandInKey('s1', null), 's1');
  });

  it('an elderly stand-in looks it', () => {
    assert.equal(
      elderlyStandInLook('a Latino man in his late thirties with a wide nose bridge'),
      'a Latino man in his seventies with a wide nose bridge, grey-haired, with a lined, weathered face'
    );
    assert.match(elderlyStandInLook('a tall man'), /seventies, grey-haired/);
    assert.match(pickDayPartnerStandInLook('woman', { elderly: true }), /seventies/);
  });

  it('crops the portrait hair to chin, not the forehead alone', () => {
    // The live 2026-11-11 stand-in: a 1660 square portrait, chin at ~72% of its height. The
    // crop kept rows 2–42% (a 0.4 cap) and every face check refused it.
    const rect = computePortraitFaceCropRect(1660, 1660, DAY_PARTNER_STAND_IN_CROP);
    assert.ok(rect.y <= 1660 * 0.06, 'starts above the hair');
    assert.ok(rect.y + rect.height >= 1660 * 0.75, 'reaches past the chin');
    assert.ok(rect.y + rect.height <= 1660 * 0.8, 'stops at the collar');
  });

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
