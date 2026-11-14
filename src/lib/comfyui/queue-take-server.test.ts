import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { queueTakeToComfyUi } from './queue-take-server';
import { guardQueueQualityForVram } from '../queue/vram-queue-guard';
import { injectLoraTriggers } from '../lora/prompt-injection';

// FINISHING_PLAN Phase 3, step 6: the queue steps the server way.
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

const WORKFLOW = JSON.stringify({
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: '{{PROMPT}}', clip: ['1', 1] } },
  '3': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'castcut' } },
});

describe('queueTakeToComfyUi (the route’s single take, as a function)', () => {
  it('posts the take’s graph, its prompt in it, to the runtime’s ComfyUI', async () => {
    const posted: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/prompt') && init?.method === 'POST') {
        posted.push({ url: href, body: JSON.parse(String(init.body)) });
        return Response.json({ prompt_id: 'p-1', number: 1, node_errors: {} });
      }
      return Response.json({});
    }) as typeof fetch;
    const result = await queueTakeToComfyUi(
      {
        model: 'qwen-image-edit-2511',
        comfy: { apiUrl: 'http://127.0.0.1:8188', workflowJson: WORKFLOW },
      },
      'She reads on a park bench.'
    );
    assert.equal(result.ok, true, result.error);
    assert.equal(result.promptId, 'p-1');
    assert.equal(posted.length, 1);
    assert.equal(posted[0]!.url, 'http://127.0.0.1:8188/prompt');
    assert.match(JSON.stringify(posted[0]!.body), /She reads on a park bench\./);
  });
});

describe('the VRAM guard from settings and a card reading passed in', () => {
  const tight = async () => ({ free: 2e9, total: 24e9 });
  it('Max on a tight card comes down to Final, nothing fetched from the page', async () => {
    globalThis.fetch = (async () => {
      throw new Error('the page’s /api/health is not asked');
    }) as typeof fetch;
    const guard = await guardQueueQualityForVram({
      profile: 'max',
      settings: { shared: {} },
      readVram: tight,
    });
    assert.deepEqual([guard.profile, guard.downgraded], ['final', true]);
  });
  it('the guard turned off in the settings passed in keeps Max', async () => {
    const guard = await guardQueueQualityForVram({
      profile: 'max',
      settings: { shared: { vramGuardEnabled: false } },
      readVram: tight,
    });
    assert.deepEqual([guard.profile, guard.downgraded], ['max', false]);
  });
});

describe('LoRA triggers for the character passed in', () => {
  it('the character’s trigger leads the prompt; none for no character', () => {
    const character = { loraTriggerPhrases: ['zxq woman'] } as never;
    assert.equal(injectLoraTriggers('reading', { character }), 'zxq woman, reading');
    assert.equal(injectLoraTriggers('reading', { character: undefined }), 'reading');
  });
});
