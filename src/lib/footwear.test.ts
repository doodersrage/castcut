import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beatOwnsFootwear,
  footwearIsBarefoot,
  footwearPresetId,
  footwearPresetWords,
  footwearPromptLine,
  normalizeFootwear,
  withFootwearLine,
} from './footwear';
import { buildFittingOutfitPrompt, buildFootwearPackshotExtractPrompt } from './fitting-room';
import {
  FOOTWEAR_COMBO_CANVAS,
  footwearComboLayout,
  footwearImageSuitsModel,
} from './footwear-image';
import { FOOTWEAR_KITS, footwearKitForWords } from './footwear-kits';

describe('footwear', () => {
  it('normalizes what was typed: one line, no "she wears", no trailing punctuation', () => {
    assert.equal(normalizeFootwear('  She wears red  suede\nheels. '), 'red suede heels');
    assert.equal(normalizeFootwear(undefined), '');
    assert.equal(normalizeFootwear('x'.repeat(400)).length, 140);
  });

  it('maps stored words back to their preset, else custom; empty is auto', () => {
    assert.equal(footwearPresetId(''), 'auto');
    assert.equal(footwearPresetId('Barefoot'), 'barefoot');
    assert.equal(footwearPresetId(footwearPresetWords('sneakers')), 'sneakers');
    assert.equal(footwearPresetId('red suede heels'), 'custom');
    assert.equal(footwearPresetWords('custom'), '');
    assert.ok(footwearIsBarefoot('bare feet'));
    assert.ok(!footwearIsBarefoot('sandals'));
  });

  it('writes a short mandatory line, and nothing on auto', () => {
    assert.equal(footwearPromptLine(''), '');
    assert.equal(
      footwearPromptLine('red suede heels'),
      'FOOTWEAR (mandatory): on her feet she wears red suede heels — exactly these, on both feet.'
    );
    assert.equal(
      footwearPromptLine('barefoot', 'he'),
      'FOOTWEAR (mandatory): he is barefoot — bare feet, no shoes and no socks.'
    );
  });

  it('puts the line after the outfit line, else straight after the edit lead-in', () => {
    const recipe = 'Edit Image 1: SCENE: a park.\nOUTFIT (mandatory): she wears a dress.\nDay photo: …';
    assert.equal(
      withFootwearLine(recipe, 'white sneakers').split('\n')[2],
      'FOOTWEAR (mandatory): on her feet she wears white sneakers — exactly these, on both feet.'
    );
    const brief = 'Edit Image 1: LEANING = weight into a wall.';
    assert.match(
      withFootwearLine(brief, 'white sneakers'),
      /^Edit Image 1: FOOTWEAR \(mandatory\): [^\n]+\nLEANING = weight into a wall\.$/
    );
    // Auto and an already-stated line change nothing.
    assert.equal(withFootwearLine(recipe, ''), recipe);
    const once = withFootwearLine(recipe, 'boots');
    assert.equal(withFootwearLine(once, 'boots'), once);
  });

  it('the Outfit try-on names the shoes on their own line', () => {
    const base = { outfitLabel: 'red wrap dress', hasGarmentReference: true };
    assert.ok(!/footwear \(mandatory\)/.test(buildFittingOutfitPrompt(base)));
    assert.match(
      buildFittingOutfitPrompt({ ...base, footwear: 'white low-top sneakers' }),
      /\nfootwear \(mandatory\): on her feet she wears white low-top sneakers — exactly these, on both feet\n/
    );
    assert.match(
      buildFittingOutfitPrompt({ ...base, footwear: 'barefoot' }),
      /\nfootwear \(mandatory\): she is barefoot — bare feet, no shoes and no socks\n/
    );
  });

  it('points at the picture when the shoes ride in Image 2', () => {
    assert.equal(
      footwearPromptLine('bright yellow rubber rain boots', 'she', 'combined'),
      'FOOTWEAR (mandatory): on her feet she wears the bright yellow rubber rain boots shown at the bottom of Image 2 — exactly these, on both feet.'
    );
    // A photo with no words yet still gets a line; barefoot never mentions an image.
    assert.equal(
      footwearPromptLine('', 'she', 'alone'),
      'FOOTWEAR (mandatory): on her feet she wears the shoes shown in Image 2 — exactly these, on both feet.'
    );
    assert.ok(!/Image 2/.test(footwearPromptLine('barefoot', 'she', 'combined')));
  });

  it('only Edit 2511 is sent the shoe picture; Rapid wears them from words', () => {
    assert.ok(footwearImageSuitsModel('qwen-image-edit-2511-lightning-8'));
    assert.ok(!footwearImageSuitsModel('qwen-rapid-aio-edit'));
    assert.ok(!footwearImageSuitsModel('qwen-rapid-aio-edit-nsfw'));
    assert.ok(!footwearImageSuitsModel('qwen-image-2.1-edit-pruna-8'));
  });

  it('the worn-photo extract names the shoes', () => {
    assert.match(
      buildFootwearPackshotExtractPrompt({ description: 'bright yellow rubber rain boots.' }),
      /only the shoes worn in Image 1 — bright yellow rubber rain boots: the same pair/
    );
  });

  it('lays the clothing over the shoes on one 3:4 canvas, nothing overlapping', () => {
    const layout = footwearComboLayout({ width: 864, height: 1152 }, { width: 512, height: 512 });
    assert.equal(layout.garment.y, 0);
    assert.ok(layout.garment.height <= FOOTWEAR_COMBO_CANVAS.height * 0.7 + 1);
    assert.ok(layout.shoes.y >= layout.garment.y + layout.garment.height);
    assert.ok(layout.shoes.y + layout.shoes.height <= FOOTWEAR_COMBO_CANVAS.height);
    assert.ok(layout.shoes.width <= FOOTWEAR_COMBO_CANVAS.width / 2);
    // A wide clothing photo is fitted by width and still leaves the shoes their band.
    const wide = footwearComboLayout({ width: 2000, height: 500 }, { width: 300, height: 600 });
    assert.equal(wide.garment.width, FOOTWEAR_COMBO_CANVAS.width);
    assert.ok(wide.shoes.y > wide.garment.height);
  });

  it('every footwear kit has unique words that map back to it', () => {
    const words = new Set(FOOTWEAR_KITS.map(kit => kit.words));
    assert.equal(words.size, FOOTWEAR_KITS.length);
    for (const kit of FOOTWEAR_KITS) {
      assert.equal(footwearKitForWords(kit.words)?.id, kit.id);
      assert.equal(normalizeFootwear(kit.words), kit.words);
      assert.match(kit.id, /^[a-z0-9-]+$/);
    }
    assert.equal(footwearKitForWords('red suede heels'), null);
  });

  it('leaves the feet to a beat that is about them', () => {
    assert.ok(beatOwnsFootwear('walking the shoreline barefoot, heels in one hand'));
    assert.ok(beatOwnsFootwear('kicking off her shoes by the door'));
    assert.ok(!beatOwnsFootwear('waving hello from the balcony'));
  });
});
