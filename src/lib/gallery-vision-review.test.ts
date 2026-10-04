import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type VisionCompletionArgs = {
  systemPrompt: string;
  textPrompt: string;
  imageDataUrl: string;
  maxTokens: number;
  temperature: number;
  usageContext?: unknown;
};
let visionImpl: (args: VisionCompletionArgs) => Promise<string> = async () => '';
const visionCompletion = mock.fn((args: VisionCompletionArgs) => visionImpl(args));
mock.module('./llm-client', { namedExports: { visionCompletion } });
// These tests are about parsing replies: the LLM is on (gallery-vision-unavailable covers off).
process.env.LLM_ENABLED = 'true';
// The vision model is resolved like the other still checks (session / env / found on the server).
mock.module('./vision-model-auto', {
  namedExports: { resolveVisionModel: async () => 'test-vision-model' },
});

afterEach(() => {
  visionImpl = async () => '';
  visionCompletion.mock.resetCalls();
});

describe('gallery-vision-review', async () => {
  const { captionGalleryImage, reviewGalleryImage } = await import('./gallery-vision-review');

  describe('captionGalleryImage', () => {
    it('parses a JSON caption response', async () => {
      visionImpl = async () => '{"caption":"a cat on a sofa"}';
      const caption = await captionGalleryImage({ imageDataUrl: 'data:image/png;base64,x' });
      assert.equal(caption, 'a cat on a sofa');
    });

    it('strips markdown code fences before parsing JSON', async () => {
      visionImpl = async () => '```json\n{"caption":"fenced caption"}\n```';
      const caption = await captionGalleryImage({ imageDataUrl: 'x' });
      assert.equal(caption, 'fenced caption');
    });

    it('falls back to the raw text (quotes stripped, truncated) when JSON parsing fails', async () => {
      visionImpl = async () => '"a plain quoted caption"';
      const caption = await captionGalleryImage({ imageDataUrl: 'x' });
      assert.equal(caption, 'a plain quoted caption');
    });

    it('truncates the fallback text to 320 characters', async () => {
      visionImpl = async () => 'x'.repeat(400);
      const caption = await captionGalleryImage({ imageDataUrl: 'x' });
      assert.equal(caption.length, 320);
    });

    it('falls back when the parsed JSON has no caption field', async () => {
      visionImpl = async () => '{"other":"value"}';
      const caption = await captionGalleryImage({ imageDataUrl: 'x' });
      assert.equal(caption, '{"other":"value"}');
    });

    it('includes the prompt as context when provided', async () => {
      visionImpl = async () => '{"caption":"ok"}';
      await captionGalleryImage({ imageDataUrl: 'x', prompt: 'a red car' });
      const args = visionCompletion.mock.calls[0]!.arguments[0] as VisionCompletionArgs;
      assert.match(args.textPrompt, /a red car/);
    });

    it('uses a generic prompt when no prompt is provided', async () => {
      visionImpl = async () => '{"caption":"ok"}';
      await captionGalleryImage({ imageDataUrl: 'x' });
      const args = visionCompletion.mock.calls[0]!.arguments[0] as VisionCompletionArgs;
      assert.equal(args.textPrompt, 'Describe the image for LoRA training.');
    });
  });

  describe('reviewGalleryImage', () => {
    it('parses a well-formed JSON review response', async () => {
      visionImpl = async () => '{"rating":4,"tags":["cat","sofa"],"critique":"good match"}';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'a cat' });
      assert.deepEqual(result, {
        suggestedRating: 4,
        tags: ['cat', 'sofa'],
        critique: 'good match',
      });
    });

    it('clamps an out-of-range rating to [1,5] and rounds', async () => {
      visionImpl = async () => '{"rating":8.7,"tags":[],"critique":"x"}';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.equal(result.suggestedRating, 5);

      visionImpl = async () => '{"rating":-3,"tags":[],"critique":"x"}';
      const result2 = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.equal(result2.suggestedRating, 1);
    });

    it('defaults rating to 3 when missing', async () => {
      visionImpl = async () => '{"tags":[],"critique":"x"}';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.equal(result.suggestedRating, 3);
    });

    it('caps tags at 8 and stringifies each entry', async () => {
      visionImpl = async () =>
        JSON.stringify({ rating: 3, tags: Array.from({ length: 12 }, (_, i) => i), critique: 'x' });
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.equal(result.tags.length, 8);
      assert.equal(result.tags[0], '0');
    });

    it('defaults critique when blank', async () => {
      visionImpl = async () => '{"rating":3,"tags":[],"critique":"   "}';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.equal(result.critique, 'No critique returned.');
    });

    it('extracts an embedded JSON object from a reasoning-dump response', async () => {
      visionImpl = async () =>
        'Let me think about this... {"rating":2,"tags":["blurry"],"critique":"soft focus"} done.';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.deepEqual(result, { suggestedRating: 2, tags: ['blurry'], critique: 'soft focus' });
    });

    it('falls back to a default review when no JSON can be found at all', async () => {
      visionImpl = async () => 'no json here whatsoever';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.deepEqual(result, {
        suggestedRating: 3,
        tags: [],
        critique: 'no json here whatsoever',
      });
    });

    it('falls back to the default review when an embedded object is itself malformed', async () => {
      visionImpl = async () => 'garbage {not valid json} trailing';
      const result = await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      assert.deepEqual(result, {
        suggestedRating: 3,
        tags: [],
        critique: 'garbage {not valid json} trailing',
      });
    });

    it('passes the best-of-n-vision-rank usage context', async () => {
      visionImpl = async () => '{"rating":3,"tags":[],"critique":"x"}';
      await reviewGalleryImage({ imageDataUrl: 'x', prompt: 'p' });
      const args = visionCompletion.mock.calls[0]!.arguments[0] as VisionCompletionArgs;
      assert.deepEqual(args.usageContext, { route: 'best-of-n-vision-rank' });
    });
  });
});
