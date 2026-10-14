import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castMarkPhrase,
  castMarkSpotShows,
  castMarksLine,
  castMarksPlateLine,
  normalizeCastMarks,
  type CastMark,
} from './cast-marks';
import { appendCleanSkinPositive } from './clean-skin';
import { buildLookCastPlateNegative, buildLookCastPlatePrompt } from './look-outfit-plate';

const rose: CastMark = { id: 'a', what: 'a small fine-line rose tattoo', where: 'left arm' };
const glasses: CastMark = { id: 'b', what: 'thin round wire-rimmed glasses', where: 'face' };
const mole: CastMark = { id: 'c', what: 'a small dark beauty mole', where: 'face', detail: 'above her upper lip' };
const ankle: CastMark = { id: 'd', what: 'a tiny star tattoo', where: 'ankle' };
const back: CastMark = { id: 'e', what: 'a large lotus tattoo', where: 'back' };

describe('cast marks', () => {
  it('keeps only well-formed marks, at most six', () => {
    assert.equal(normalizeCastMarks([{ what: '', where: 'face' }, { what: 'x', where: 'elbow' }]), undefined);
    const many = Array.from({ length: 9 }, (_, index) => ({ id: `m${index}`, what: 'a mole', where: 'face' }));
    assert.equal(normalizeCastMarks(many)?.length, 6);
  });

  it('shows a mark only where that part of her shows', () => {
    assert.equal(castMarkSpotShows('left arm', { outfit: 'a white tee and denim shorts' }), true);
    assert.equal(castMarkSpotShows('left arm', { outfit: 'an oversized cream sweater and jeans' }), false);
    assert.equal(castMarkSpotShows('ankle', { outfit: 'a sundress and flat sandals' }), true);
    assert.equal(castMarkSpotShows('ankle', { outfit: 'black jeans and ankle boots' }), false);
    assert.equal(castMarkSpotShows('back', { outfit: 'a white tee' }), false);
    assert.equal(castMarkSpotShows('back', { outfit: 'a red bikini' }), true);
    assert.equal(castMarkSpotShows('back', { undressed: true }), true);
    assert.equal(castMarkSpotShows('face', { outfit: 'a parka' }), true);
    // The beat's clothes count too ("pulls on her coat").
    assert.equal(castMarkSpotShows('right arm', { outfit: 'a tank top', beat: 'she pulls on her coat at the door' }), false);
  });

  it('words each mark about her, and the line splits marks from things she wears', () => {
    assert.equal(castMarkPhrase(rose), 'a small fine-line rose tattoo on her left forearm');
    assert.equal(castMarkPhrase(mole), 'a small dark beauty mole above her upper lip');
    assert.equal(castMarkPhrase(glasses), 'thin round wire-rimmed glasses');
    assert.equal(
      castMarksLine([rose, glasses, mole], { outfit: 'a tank top and shorts' }),
      'She has a small fine-line rose tattoo on her left forearm and a small dark beauty mole above her upper lip and wears thin round wire-rimmed glasses — the same in every picture of her. No other ink or marks on her skin.'
    );
    assert.equal(castMarksLine([rose, back], { outfit: 'a wool coat and jeans' }), '');
    assert.equal(
      castMarksLine([glasses], { outfit: 'a coat' }),
      'She wears thin round wire-rimmed glasses — the same in every picture of her. No other ink or marks on her skin.'
    );
    assert.match(castMarksLine([ankle, back], { undressed: true }), /star tattoo on her ankle.*lotus tattoo on her back/);
  });

  it('lets a scar, mole or tattoo through the clean-skin lock', () => {
    assert.match(appendCleanSkinPositive('A woman in a park.'), /clean unmarked skin/);
    const withMole = appendCleanSkinPositive(`A woman in a park. ${castMarksLine([mole], {})}`);
    assert.doesNotMatch(withMole, /unmarked/);
    assert.match(withMole, /no tattoos or body ink/);
    const withTattoo = appendCleanSkinPositive(`A woman. ${castMarksLine([rose], { outfit: 'a tee' })}`);
    assert.doesNotMatch(withTattoo, /no tattoos/);
  });

  it('puts every mark on a plate made from the description, and keeps tattoos out of its negative', () => {
    const line = castMarksPlateLine([rose, back, glasses]);
    const prompt = buildLookCastPlatePrompt({ characterName: 'Nora', descriptor: 'a woman', marks: line });
    assert.match(prompt, /MARKS \(keep exactly, clearly visible\): She has a small fine-line rose tattoo/);
    assert.match(prompt, /lotus tattoo on her back/);
    assert.doesNotMatch(buildLookCastPlateNegative('a woman', line), /tattoo/);
    assert.match(buildLookCastPlateNegative('a woman', castMarksPlateLine([mole])), /tattoo/);
    assert.doesNotMatch(buildLookCastPlateNegative('a woman'), /, ,/);
  });
});

describe('cast marks and the negative', () => {
  it('keeps extra ink out when her own tattoo is in the prompt', async () => {
    const { mergeCleanSkinNegatives } = await import('./clean-skin');
    const prompt = `A woman. ${castMarksLine([rose], { outfit: 'a tee' })}`;
    const negative = mergeCleanSkinNegatives('blurry', prompt) ?? '';
    assert.match(negative, /tattoos on both arms/);
    assert.doesNotMatch(negative, /(^|, )tattoo(,|$)/);
  });
});
