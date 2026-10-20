import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'] });
});
afterEach(() => {
  mock.timers.reset();
});

describe('llm-image-cache', async () => {
  const { storeLlmImageUpload, getLlmImageUpload, putLlmImageOutput, getLlmImageOutput } =
    await import('./image-cache');

  describe('storeLlmImageUpload / getLlmImageUpload', () => {
    it('rejects an empty buffer', () => {
      assert.throws(
        () => storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.alloc(0) }),
        /Image file is empty\./
      );
    });

    it('rejects a buffer larger than 12MB', () => {
      assert.throws(
        () =>
          storeLlmImageUpload({
            engineId: 'openai',
            bytes: Buffer.alloc(12 * 1024 * 1024 + 1),
          }),
        /12MB or smaller/
      );
    });

    it('round-trips a stored upload and picks the right extension per mimeType', () => {
      const png = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x'), mimeType: 'image/png' });
      assert.ok(png.name.endsWith('.png'));
      assert.equal(png.subfolder, '');
      assert.equal(png.type, 'input');
      assert.equal(getLlmImageUpload(png.name).bytes.toString(), 'x');
      assert.equal(getLlmImageUpload(png.name).mimeType, 'image/png');

      const jpeg = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x'), mimeType: 'image/jpeg' });
      assert.ok(jpeg.name.endsWith('.jpg'));

      const jpegAlt = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x'), mimeType: 'image/jpg' });
      assert.ok(jpegAlt.name.endsWith('.jpg'));

      const webp = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x'), mimeType: 'image/webp' });
      assert.ok(webp.name.endsWith('.webp'));

      const noMime = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x') });
      assert.ok(noMime.name.endsWith('.png'));
      assert.equal(getLlmImageUpload(noMime.name).mimeType, 'image/png');
    });

    it('falls back to image/<ext> when mimeType is not an image/* type', () => {
      const stored = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x'), mimeType: 'text/plain' });
      assert.equal(getLlmImageUpload(stored.name).mimeType, 'image/png');
    });

    it('throws with a clear message for an unknown/expired upload name', () => {
      assert.throws(() => getLlmImageUpload('never-stored.png'), /expired/i);
    });

    it('evicts uploads older than the 30-minute TTL on the next store call', () => {
      const first = storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('x') });
      mock.timers.tick(31 * 60 * 1000);
      // Any subsequent store triggers pruneMap, which evicts the stale entry.
      storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from('y') });
      assert.throws(() => getLlmImageUpload(first.name), /expired/i);
    });

    it('evicts only the oldest upload once a later store pushes the cache past 24 entries', () => {
      // pruneMap runs at the START of storeLlmImageUpload, before the new
      // item is inserted — so after exactly 24 inserts the map holds 24
      // (no pruning needed yet: 24 is not > 24). A 25th insert pushes it to
      // 25 without pruning (the check ran before that insert, when size was
      // still 24). Eviction of the single oldest entry only happens on a
      // 26th call, whose pruneMap sees size 25 > 24 and evicts one before
      // inserting its own new item. Verified by running through all 26
      // calls rather than assuming eviction happens at entry #25.
      const names: string[] = [];
      for (let i = 0; i < 26; i += 1) {
        // Distinct names require distinct Date.now()/Math.random() combos —
        // tick 1ms between stores so Date.now().toString(36) differs.
        names.push(storeLlmImageUpload({ engineId: 'openai', bytes: Buffer.from(String(i)) }).name);
        mock.timers.tick(1);
      }
      assert.throws(() => getLlmImageUpload(names[0]!), /expired/i);
      assert.equal(getLlmImageUpload(names[1]!).bytes.toString(), '1');
      assert.equal(getLlmImageUpload(names[25]!).bytes.toString(), '25');
    });
  });

  describe('putLlmImageOutput / getLlmImageOutput', () => {
    it('round-trips a stored output keyed by engineId/subfolder/filename', () => {
      putLlmImageOutput({
        engineId: 'gemini',
        subfolder: 'models--gemini-2',
        filename: 'job1.png',
        bytes: Buffer.from('output-bytes'),
        mimeType: 'image/png',
      });
      const output = getLlmImageOutput('gemini', 'models--gemini-2', 'job1.png');
      assert.equal(output?.bytes.toString(), 'output-bytes');
      assert.equal(output?.mimeType, 'image/png');
    });

    it('returns null for a cache miss', () => {
      assert.equal(getLlmImageOutput('gemini', 'x', 'missing.png'), null);
    });

    it('distinguishes outputs by engineId/subfolder/filename combination', () => {
      putLlmImageOutput({
        engineId: 'openai',
        subfolder: 'a',
        filename: 'x.png',
        bytes: Buffer.from('1'),
        mimeType: 'image/png',
      });
      assert.equal(getLlmImageOutput('grok', 'a', 'x.png'), null);
      assert.equal(getLlmImageOutput('openai', 'b', 'x.png'), null);
      assert.equal(getLlmImageOutput('openai', 'a', 'y.png'), null);
    });

    it('evicts outputs older than the 6-hour TTL on the next prune trigger', () => {
      putLlmImageOutput({
        engineId: 'openai',
        subfolder: 'a',
        filename: 'x.png',
        bytes: Buffer.from('1'),
        mimeType: 'image/png',
      });
      mock.timers.tick(6 * 60 * 60 * 1000 + 1);
      // getLlmImageOutput itself prunes before reading.
      assert.equal(getLlmImageOutput('openai', 'a', 'x.png'), null);
    });
  });
});
