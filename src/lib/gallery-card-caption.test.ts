import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryCardCaption } from './gallery-card-caption';

describe('galleryCardCaption', () => {
  it('names the Day slot and beat instead of the edit boilerplate', () => {
    const prompt =
      'Carry out this change on Image 1 even if lighting, wardrobe, or background must change. Keep facial likeness only: Use Image 1…\nEdit instruction for a Day still — morning:\nImage 1 is…\nbeat: crouching at a low cupboard reaching for a pan\noutput: …';
    assert.equal(galleryCardCaption(prompt), 'Morning · crouching at a low cupboard reaching for a pan');
  });

  it('reads sport ACTION and cuts the guard tail', () => {
    assert.equal(
      galleryCardCaption(
        'SCENE: she is in the pool. ACTION: driving a freestyle stroke with a high elbow catch.\nbeat: driving a freestyle stroke — swimming athletic action in proper kit'
      ),
      'driving a freestyle stroke'
    );
  });

  it('reads recipe prompts', () => {
    assert.equal(
      galleryCardCaption('Keep facial likeness only: Suggestive photo: One woman alone, clothed. She sits…'),
      'One woman alone, clothed'
    );
  });

  it('falls back to the prompt without boilerplate', () => {
    assert.equal(galleryCardCaption('A red fox in snow, cinematic light'), 'A red fox in snow, cinematic light');
    assert.equal(galleryCardCaption(''), '');
  });
});
