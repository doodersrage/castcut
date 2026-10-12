import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCastBiblePictureNegative,
  buildCastBiblePicturePrompt,
  normalizeCastBiblePicture,
} from './character-bible-picture';

const mara = {
  name: 'Mara',
  descriptor: 'a slim woman in her late 20s, 170 cm, long auburn hair',
  bibleLook: 'a weathered green field coat over a cream knit sweater, a brass compass on a cord.',
  lead: 'woman' as const,
};

describe('Picture this bible prompt', () => {
  it('leads with identity from Image 1, then body, then the bible outfit', () => {
    const lines = buildCastBiblePicturePrompt({ ...mara, adult: false }).split('\n');
    assert.match(lines[0]!, /^Full-body photo of Mara, the same woman as in Image 1/);
    assert.equal(lines[1], `BODY: ${mara.descriptor}.`);
    assert.match(lines[2]!, /^OUTFIT \(mandatory, fully dressed\): a weathered green field coat/);
    assert.ok(lines[2]!.endsWith('a brass compass on a cord.'), 'no doubled full stop');
  });

  it('lets the Appearance hair win over the photo when it names one', () => {
    const withHair = buildCastBiblePicturePrompt({ ...mara, adult: false });
    assert.match(withHair, /same face and skin tone\./);
    const noHair = buildCastBiblePicturePrompt({ ...mara, descriptor: 'a slim woman', adult: false });
    assert.match(noHair, /same face, hair and skin tone\./);
  });

  it('keeps her clothed below adult ratings, and never adds nudity', () => {
    const clean = buildCastBiblePicturePrompt({ ...mara, adult: false });
    assert.match(clean, /Fully clothed — no underwear or lingerie showing\./);
    const adult = buildCastBiblePicturePrompt({ ...mara, adult: true });
    assert.doesNotMatch(adult, /fully clothed/i);
    assert.match(adult, /^OUTFIT \(mandatory\): /m);
    for (const prompt of [clean, adult]) {
      assert.doesNotMatch(prompt, /\b(nude|naked|topless|nipples?)\b/i);
    }
    assert.match(buildCastBiblePictureNegative(false), /\bnude\b.*\blingerie\b/);
    assert.doesNotMatch(buildCastBiblePictureNegative(true), /\bnude\b/);
  });

  it('one standing person, the setting as backdrop or a plain studio one', () => {
    const plain = buildCastBiblePicturePrompt({ ...mara, adult: false });
    assert.match(plain, /Standing naturally.*One person only\./);
    assert.match(plain, /Plain light studio backdrop/);
    const set = buildCastBiblePicturePrompt({
      ...mara,
      setting: 'a foggy harbour town at dawn',
      adult: false,
    });
    assert.match(set, /^Background: a foggy harbour town at dawn\.$/m);
    assert.doesNotMatch(set, /studio backdrop/);
  });

  it('stays short: long looks are clipped, empty parts dropped', () => {
    const long = buildCastBiblePicturePrompt({
      name: '',
      bibleLook: `${'A long layered outfit with many small details. '.repeat(20)}`,
      adult: true,
    });
    assert.match(long, /^Full-body photo of the Cast lead, the same person as in Image 1/);
    assert.doesNotMatch(long, /BODY:/);
    const outfit = long.split('\n').find(line => line.startsWith('OUTFIT'))!;
    assert.ok(outfit.length < 320, `outfit line is ${outfit.length} chars`);
    assert.ok(long.length < 700, `prompt is ${long.length} chars`);
  });
});

describe('Stored bible picture', () => {
  it('keeps a picture with an image, drops anything else', () => {
    assert.deepEqual(normalizeCastBiblePicture({ imageUrl: ' /a.png ', promptId: 'p1', at: 5 }), {
      imageUrl: '/a.png',
      promptId: 'p1',
      at: 5,
    });
    assert.deepEqual(normalizeCastBiblePicture({ imageUrl: '/a.png' }), {
      imageUrl: '/a.png',
      at: 0,
    });
    assert.equal(normalizeCastBiblePicture({ imageUrl: '  ' }), undefined);
    assert.equal(normalizeCastBiblePicture('x'), undefined);
    assert.equal(normalizeCastBiblePicture(null), undefined);
  });
});

describe('bible picture gender swap', () => {
  it('turns her into the male version of the same person, keeping the scene', async () => {
    const { buildCastBibleGenderSwapPrompt, buildCastBibleGenderSwapNegative } = await import(
      './character-bible-picture'
    );
    const toMan = buildCastBibleGenderSwapPrompt('woman');
    assert.match(toMan, /turn this woman into a man — the male version of the same person: a man's face, jaw and build, with her eye shape/);
    assert.match(toMan, /Same pose, same scene, background, light and camera framing; the same outfit colours and style, cut for a man/);
    assert.match(buildCastBibleGenderSwapPrompt('man'), /turn this man into a woman — the female version of the same person: a woman's face and build, with his eye shape/);
    assert.match(buildCastBibleGenderSwapNegative('woman'), /^woman, female/);
  });

  it('keeps the swap with its picture', async () => {
    const { normalizeCastBiblePicture } = await import('./character-bible-picture');
    const picture = normalizeCastBiblePicture({
      imageUrl: '/a.png',
      at: 1,
      swapped: { imageUrl: '/b.png', at: 2, as: 'man' },
    });
    assert.equal(picture?.swapped?.imageUrl, '/b.png');
    assert.equal(picture?.swapped?.as, 'man');
    assert.equal(
      normalizeCastBiblePicture({ imageUrl: '/a.png', at: 1, swapped: { imageUrl: '/b.png', at: 2, as: 'x' } })?.swapped,
      undefined
    );
  });
});
