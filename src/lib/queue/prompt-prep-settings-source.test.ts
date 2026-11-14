import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadSettingsCache } from '../settings/cache';
import { loadComfyUiSettings } from '../comfyui/settings';
import { negativePromptForRequest } from '../prompt/negative-prompt-builder';
import { prepareQueuePrompts } from './prompt-prep';

// FINISHING_PLAN Phase 3, step 6: the server prepares a take's prompts from its synced copies of
// the settings, passed in, instead of this browser's stores.
const given = () => ({ shared: loadSettingsCache().shared, comfyUi: loadComfyUiSettings() });
const POSITIVE =
  'Edit Image 1: she sits on a park bench reading a paperback, soft afternoon light, wearing a denim jacket';

describe('prompt preparation from settings passed in (Phase 3, step 6)', () => {
  const original = globalThis.fetch;
  let fetched: string[] = [];
  beforeEach(() => {
    fetched = [];
    // The page asks /api/negative; answer as the route does.
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      fetched.push(String(url));
      const body = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify(negativePromptForRequest(body)), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  let pageFetches = 0;
  for (const model of ['qwen-image-edit-2511', 'flux-2-klein', 'sd3-medium', 'segmind-vega']) {
    for (const [tool, hints] of [
      ['image-prompt', 'park bench, reading'],
      ['character', 'park bench, reading'],
      // Pet and fantasy profiles are built, not fixed text: the page asks /api/negative.
      ['pet', 'a dog in the park'],
      ['fantasy', 'a dragon over the hills'],
    ] as const) {
      it(`${model} (${tool}): the same prompts as from the stores, nothing fetched`, async () => {
        const input = { model, positive: POSITIVE, hints, tool };
        const fromStores = await prepareQueuePrompts(input);
        pageFetches += fetched.length;
        fetched = [];
        const fromSource = await prepareQueuePrompts({ ...input, settings: given() });
        assert.deepEqual(fromSource, fromStores);
        assert.deepEqual(fetched, []);
      });
    }
  }

  it('the page asked /api/negative for an engine that reads a negative (the cases mean something)', () => {
    assert.ok(pageFetches > 0);
  });

  it('reads what it is given: wildcard lists and a seed passed in', async () => {
    const settings = given();
    const prepared = await prepareQueuePrompts({
      model: 'qwen-image-edit-2511',
      positive: 'Edit Image 1: she wears a __e2ecolour__ coat',
      settings: {
        ...settings,
        shared: {
          ...settings.shared,
          expandWildcards: true,
          wildcardSeed: 'fixed',
          wildcardLists: { e2ecolour: ['vermilion'] },
        },
      },
    });
    assert.match(prepared.positive, /vermilion coat/);
  });

  it('reads what it is given: wildcards off passed in leave the token', async () => {
    const settings = given();
    const prepared = await prepareQueuePrompts({
      model: 'qwen-image-edit-2511',
      positive: 'Edit Image 1: she wears a __e2ecolour__ coat',
      settings: {
        ...settings,
        shared: { ...settings.shared, expandWildcards: false, wildcardLists: { e2ecolour: ['vermilion'] } },
      },
    });
    assert.match(prepared.positive, /__e2ecolour__ coat/);
  });
});
