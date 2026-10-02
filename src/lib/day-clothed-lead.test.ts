import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayClothedLeadLines,
  dayGarmentPromptName,
  dayOutfitPromptName,
} from './day-clothed-lead';

describe('Day clothed lead lines', () => {
  it('names both people on a two-person beat', () => {
    const [line] = dayClothedLeadLines({
      beat: 'walking hand in hand with her partner under the streetlights',
      setting: 'quiet city street under warm streetlights',
      headcount: 2,
      dayMood: 'date-night',
      adult: false,
    });
    assert.match(line!, /^TWO PEOPLE in this photo: she and her partner — .+, in their own different clothes — are both fully in frame/);
    assert.doesNotMatch(line!, /\b(?:scar|tattoo|mole)\b/i);
    assert.match(line!, /her partner — an? [^,]*\bman\b/);
    const [chosen] = dayClothedLeadLines({
      beat: 'hugging her partner goodnight',
      headcount: 2,
      dayMood: 'date-night',
      adult: false,
      companionLook: 'a tall man with a short beard',
    });
    assert.match(chosen!, /her partner — a tall man with a short beard, in their own different clothes/);
  });

  it('names the partner kit instead of a generic different outfit', () => {
    const [line] = dayClothedLeadLines({
      beat: 'standing in the kitchen with her partner',
      headcount: 2,
      dayMood: 'everyday',
      adult: false,
      companionLook: 'a woman with dark hair',
      leadOutfit: 'Rust camisole',
      partnerOutfit: 'Cream turtleneck',
    });
    assert.match(line!, /she \(wearing rust camisole\) and her partner \(wearing cream turtleneck\)/);
    assert.doesNotMatch(line!, /in their own different clothes/);
  });

  it('puts shoes on outdoors, not indoors, not on Vacation or adult stills', () => {
    const base = { beat: 'walking home', headcount: 1, adult: false };
    assert.deepEqual(
      dayClothedLeadLines({ ...base, setting: 'city street at night', dayMood: 'night-out' }),
      ['She wears shoes that suit the outfit (outdoors — never barefoot).']
    );
    assert.deepEqual(
      dayClothedLeadLines({
        ...base,
        beat: 'walking home at night with heels in one hand',
        setting: 'empty city street',
        dayMood: 'night-out',
      }),
      []
    );
    assert.deepEqual(
      dayClothedLeadLines({ ...base, setting: 'cozy bedroom', dayMood: 'lazy-sunday' }),
      []
    );
    assert.deepEqual(
      dayClothedLeadLines({ ...base, setting: 'sandy beach', dayMood: 'vacation' }),
      []
    );
    assert.deepEqual(
      dayClothedLeadLines({ ...base, setting: 'city street', dayMood: 'raunchy', adult: true }),
      []
    );
  });

  it('names a clothing photo by the first sentence of its description', () => {
    assert.equal(
      dayGarmentPromptName(
        'A black strapless mini dress made of sheer floral lace with a fitted silhouette. The bodice is structured.'
      ),
      'black strapless mini dress made of sheer floral lace with a fitted silhouette'
    );
    assert.equal(dayGarmentPromptName('  '), null);
    const [line] = dayClothedLeadLines({
      beat: 'walking hand in hand with a friend to the café',
      setting: 'corner café',
      headcount: 2,
      dayMood: 'everyday',
      adult: false,
      leadOutfit: dayGarmentPromptName('A black strapless mini dress. Lace.'),
    });
    assert.match(line!, /she \(wearing black strapless mini dress\) and her friend/);
  });

  it('drops revealing fit words from outfit names', () => {
    assert.equal(dayOutfitPromptName('cropped cream tuxedo'), 'cream tuxedo');
    assert.equal(dayOutfitPromptName('low-rise moss cocktail dress'), 'moss cocktail dress');
    assert.equal(dayOutfitPromptName('high-waisted sepia wizard robe outfit'), 'high-waisted sepia wizard robe outfit');
  });
});
