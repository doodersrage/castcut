import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGalleryVisionTarget,
  reviewGalleryImage,
  VisionModelUnavailableError,
} from './gallery-vision-review';
import { galleryVisionUnavailableReason } from './gallery-auto-vision-tags';

process.env.LLM_ENABLED = 'true';

describe('gallery vision review without a vision model', () => {
  it('says the LLM is off instead of asking for LLM_VISION_MODEL', async () => {
    await assert.rejects(
      resolveGalleryVisionTarget({ llm: { llmEnabled: false } }),
      (error: unknown) =>
        error instanceof VisionModelUnavailableError && /LLM is off/.test(error.message)
    );
  });

  it('a review with the LLM off is "unavailable", never a call that fails', async () => {
    await assert.rejects(
      reviewGalleryImage({
        imageDataUrl: 'data:image/png;base64,AAAA',
        prompt: 'a woman',
        llm: { llmEnabled: false },
      }),
      VisionModelUnavailableError
    );
  });

  it('uses the session vision model when one is picked', async () => {
    const target = await resolveGalleryVisionTarget({
      llm: { llmEnabled: true, llmVisionModel: 'qwen3-vl-8b' },
    });
    assert.equal(target.model, 'qwen3-vl-8b');
  });

  it('reads the optional route answer', () => {
    assert.equal(galleryVisionUnavailableReason({ unavailable: 'No vision model found' }), 'No vision model found');
    assert.equal(galleryVisionUnavailableReason({ tags: [], suggestedRating: 3 }), null);
    assert.equal(galleryVisionUnavailableReason(null), null);
  });
});
