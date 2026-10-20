import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  setUserComfyUiUrlOverride,
  getUserComfyUiUrlOverride,
  applyUserComfyUiOverride,
} from './user-comfy-url';

afterEach(() => {
  setUserComfyUiUrlOverride(null);
});

describe('user-comfy-url', () => {
  describe('setUserComfyUiUrlOverride / getUserComfyUiUrlOverride', () => {
    it('defaults to null', () => {
      assert.equal(getUserComfyUiUrlOverride(), null);
    });

    it('stores a trimmed override url', () => {
      setUserComfyUiUrlOverride('  http://10.0.0.5:8188  ');
      assert.equal(getUserComfyUiUrlOverride(), 'http://10.0.0.5:8188');
    });

    it('treats a blank string as clearing the override', () => {
      setUserComfyUiUrlOverride('http://10.0.0.5:8188');
      setUserComfyUiUrlOverride('   ');
      assert.equal(getUserComfyUiUrlOverride(), null);
    });

    it('treats null and undefined as clearing the override', () => {
      setUserComfyUiUrlOverride('http://10.0.0.5:8188');
      setUserComfyUiUrlOverride(null);
      assert.equal(getUserComfyUiUrlOverride(), null);

      setUserComfyUiUrlOverride('http://10.0.0.5:8188');
      setUserComfyUiUrlOverride(undefined);
      assert.equal(getUserComfyUiUrlOverride(), null);
    });
  });

  describe('applyUserComfyUiOverride', () => {
    it('returns the runtime unchanged when there is no override', () => {
      const runtime = { apiUrl: 'http://127.0.0.1:8188', queueQualityProfile: 'final' };
      assert.deepEqual(applyUserComfyUiOverride(runtime), runtime);
    });

    it('replaces apiUrl with the override while preserving other fields', () => {
      setUserComfyUiUrlOverride('http://10.0.0.5:8188');
      const runtime = { apiUrl: 'http://127.0.0.1:8188', queueQualityProfile: 'final' };
      const result = applyUserComfyUiOverride(runtime);
      assert.equal(result.apiUrl, 'http://10.0.0.5:8188');
      assert.equal(result.queueQualityProfile, 'final');
    });

    it('applies the override even when the runtime has no apiUrl set', () => {
      setUserComfyUiUrlOverride('http://10.0.0.5:8188');
      const result = applyUserComfyUiOverride({} as { apiUrl?: string });
      assert.equal(result.apiUrl, 'http://10.0.0.5:8188');
    });
  });
});
