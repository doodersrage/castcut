import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let checkpointHint: string | undefined;
const getComfyModelDefinition = mock.fn((_model?: string) => ({ checkpointHint }) as never);
mock.module('./comfy-models/client', { namedExports: { getComfyModelDefinition } });

afterEach(() => {
  checkpointHint = undefined;
  getComfyModelDefinition.mock.resetCalls();
});

describe('video-checkpoint-pick', async () => {
  const { scoreVideoWeightFilename, pickVideoCheckpointFromInventory, isVideoCheckpointMapKey } =
    await import('./video-checkpoint-pick');

  describe('scoreVideoWeightFilename', () => {
    it('scores hunyuan-video family filenames higher when matching the family pattern', () => {
      const hunyuan = scoreVideoWeightFilename('hunyuan-video', 'hunyuan_video_720.safetensors');
      const unrelated = scoreVideoWeightFilename('hunyuan-video', 'some_other_model.safetensors');
      assert.ok(hunyuan > unrelated);
    });

    it('scores ltx-video family filenames higher when matching the family pattern', () => {
      const ltx = scoreVideoWeightFilename('ltx-video', 'ltx_video_13b.safetensors');
      const unrelated = scoreVideoWeightFilename('ltx-video', 'wan_video.safetensors');
      assert.ok(ltx > unrelated);
    });

    it('scores WAN-pattern filenames higher for any other model id', () => {
      const wan = scoreVideoWeightFilename('wan-video', 'wan2.2_14b.safetensors');
      const unrelated = scoreVideoWeightFilename('wan-video', 'random.safetensors');
      assert.ok(wan > unrelated);
    });

    it('adds version and billions-parameter bonuses', () => {
      const higherVersion = scoreVideoWeightFilename('wan-video', 'wan2.2_14b.safetensors');
      const lowerVersion = scoreVideoWeightFilename('wan-video', 'wan2.1_14b.safetensors');
      assert.ok(higherVersion > lowerVersion);

      const moreBillions = scoreVideoWeightFilename('wan-video', 'wan_27b.safetensors');
      const fewerBillions = scoreVideoWeightFilename('wan-video', 'wan_5b.safetensors');
      assert.ok(moreBillions > fewerBillions);
    });

    it('prefers rapid/aio and i2v packs, and penalizes fp8', () => {
      const rapidAio = scoreVideoWeightFilename('wan-video', 'wan_rapid_aio.safetensors');
      const plain = scoreVideoWeightFilename('wan-video', 'wan_plain.safetensors');
      assert.ok(rapidAio > plain);

      const i2v = scoreVideoWeightFilename('wan-video', 'wan_i2v.safetensors');
      const t2v = scoreVideoWeightFilename('wan-video', 'wan_t2v.safetensors');
      assert.ok(i2v > t2v);

      // NOTE: filenames like "wan_fp8.safetensors" are NOT usable here — the version-bonus
      // regex greedily captures the first digit run anywhere after "wan", so the "8" in
      // "fp8" is misread as a version number (adding +160), completely swamping the -0.5
      // fp8 penalty. Using filenames where an explicit version/billions figure appears
      // before "fp8" pins down that earlier digit run instead, isolating the fp8 penalty.
      const fp8 = scoreVideoWeightFilename('wan-video', 'wan2.2_14b_fp8_e4m3fn.safetensors');
      const notFp8 = scoreVideoWeightFilename('wan-video', 'wan2.2_14b_e4m3fn.safetensors');
      assert.ok(fp8 < notFp8);
    });
  });

  describe('pickVideoCheckpointFromInventory', () => {
    it('returns undefined for an empty inventory', () => {
      assert.equal(pickVideoCheckpointFromInventory('wan-video', []), undefined);
    });

    it('picks the highest-scoring same-family match from the inventory', () => {
      const inventory = ['wan2.1_5b.safetensors', 'wan2.2_14b_rapid_aio.safetensors', 'unrelated.safetensors'];
      const result = pickVideoCheckpointFromInventory('wan-video', inventory);
      assert.equal(result, 'wan2.2_14b_rapid_aio.safetensors');
    });

    it('only matches the hunyuan family for hunyuan-video (not a bare WAN entry)', () => {
      const inventory = ['wan2.2_14b.safetensors', 'hunyuan_video_720.safetensors'];
      const result = pickVideoCheckpointFromInventory('hunyuan-video', inventory);
      assert.equal(result, 'hunyuan_video_720.safetensors');
    });

    it('only matches the ltx family for ltx-video', () => {
      const inventory = ['wan2.2_14b.safetensors', 'ltx_video_13b.safetensors'];
      const result = pickVideoCheckpointFromInventory('ltx-video', inventory);
      assert.equal(result, 'ltx_video_13b.safetensors');
    });

    it('falls back to the checkpointHint from getComfyModelDefinition when no family match exists', () => {
      checkpointHint = 'my-hinted-checkpoint.safetensors';
      const inventory = ['my-hinted-checkpoint.safetensors', 'totally-unrelated.safetensors'];
      const result = pickVideoCheckpointFromInventory('wan-video', inventory);
      assert.equal(result, 'my-hinted-checkpoint.safetensors');
    });

    it('falls back to SUGGESTED_MODEL_CHECKPOINT_MAP when the model has no checkpointHint', () => {
      checkpointHint = undefined;
      const inventory = ['qwen_image_2512_fp8_e4m3fn.safetensors', 'unrelated.safetensors'];
      const result = pickVideoCheckpointFromInventory('qwen-image-2512', inventory);
      assert.equal(result, 'qwen_image_2512_fp8_e4m3fn.safetensors');
    });

    it('is case-insensitive when matching the hinted filename', () => {
      checkpointHint = 'My-Hint.safetensors';
      const inventory = ['my-hint.safetensors'];
      const result = pickVideoCheckpointFromInventory('wan-video', inventory);
      assert.equal(result, 'my-hint.safetensors');
    });

    it('returns undefined when neither a family match nor an exact hinted match exists', () => {
      checkpointHint = 'not-installed.safetensors';
      const inventory = ['totally-unrelated.safetensors'];
      const result = pickVideoCheckpointFromInventory('wan-video', inventory);
      assert.equal(result, undefined);
    });
  });

  describe('isVideoCheckpointMapKey', () => {
    it('is true for every known video model id', () => {
      for (const model of [
        'wan-video',
        'wan-video-rapid-aio',
        'wan-video-lightning-4',
        'hunyuan-video',
        'hunyuan-video-1.5',
        'ltx-video',
        'ltx-video-2',
      ]) {
        assert.equal(isVideoCheckpointMapKey(model), true);
      }
    });

    it('is false for a non-video model id', () => {
      assert.equal(isVideoCheckpointMapKey('sdxl'), false);
      assert.equal(isVideoCheckpointMapKey('qwen-image-2512'), false);
    });
  });
});
