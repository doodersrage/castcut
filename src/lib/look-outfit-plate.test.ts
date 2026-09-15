import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLookCastPlatePrompt,
  fittingHasSessionPlate,
  pickMoodboardPlateSource,
} from './look-outfit-plate';

describe('look-outfit-plate', () => {
  it('pickMoodboardPlateSource prefers subject/other tiles with images', () => {
    assert.equal(pickMoodboardPlateSource([]), null);
    assert.equal(pickMoodboardPlateSource([{ id: 'a', role: 'mood', notes: 'no image' }]), null);

    const picked = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
      { id: 'subject', role: 'other', imageUrl: 'https://example.com/subject.jpg', label: 'Plate' },
      { id: 'style', role: 'style', imageFilename: 'style.png' },
    ]);
    assert.equal(picked?.imageUrl, 'https://example.com/subject.jpg');
    assert.equal(picked?.label, 'Plate');
  });

  it('pickMoodboardPlateSource falls back to style then any imaged tile', () => {
    const styleFirst = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
      { id: 'style', role: 'style', imageFilename: 'style.png' },
    ]);
    assert.equal(styleFirst?.filename, 'style.png');

    const any = pickMoodboardPlateSource([
      { id: 'mood', role: 'mood', imageUrl: 'https://example.com/mood.jpg' },
    ]);
    assert.equal(any?.imageUrl, 'https://example.com/mood.jpg');
  });

  it('buildLookCastPlatePrompt includes cast look and try-on framing', () => {
    const prompt = buildLookCastPlatePrompt({
      characterName: 'Ava',
      descriptor: 'short black hair, freckles',
      vibePrompt: 'neon rain alley',
    });
    assert.match(prompt, /Ava/);
    assert.match(prompt, /freckles/);
    assert.match(prompt, /neon rain/);
    assert.match(prompt, /try-on/);
    assert.match(prompt, /seamless backdrop/);
  });

  it('fittingHasSessionPlate requires url or filename', () => {
    assert.equal(fittingHasSessionPlate(undefined), false);
    assert.equal(fittingHasSessionPlate({}), false);
    assert.equal(fittingHasSessionPlate({ referenceImageUrl: ' https://x ' }), true);
    assert.equal(fittingHasSessionPlate({ referenceImageFilename: 'plate.png' }), true);
  });
});
