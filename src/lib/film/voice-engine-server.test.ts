import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  forgetVoiceEngineHealth,
  readLineWithVoiceEngine,
  voiceEngineReady,
} from './voice-engine-server';

const ENGINE = 'http://voice.test:8191';
const COMFY = 'http://comfy.test:8188';
let dataDir = '';

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-engine-'));
  process.env.PROMPT_DATA_DIR = dataDir;
  process.env.VOICE_ENGINE_URL = ENGINE;
  forgetVoiceEngineHealth();
});

afterEach(() => {
  delete process.env.VOICE_ENGINE_URL;
  delete process.env.PROMPT_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('the voice engine', () => {
  it('is ready when its health says so, and never with VOICE_ENGINE_URL=off', async () => {
    const calls: string[] = [];
    const up = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ ok: true }));
    }) as typeof fetch;
    assert.equal(await voiceEngineReady(up), true);
    assert.deepEqual(calls, [`${ENGINE}/health`]);
    // Remembered: no second call.
    assert.equal(await voiceEngineReady(up), true);
    assert.equal(calls.length, 1);

    forgetVoiceEngineHealth();
    const down = (async () => {
      throw new Error('refused');
    }) as typeof fetch;
    assert.equal(await voiceEngineReady(down), false);

    process.env.VOICE_ENGINE_URL = 'off';
    forgetVoiceEngineHealth();
    assert.equal(await voiceEngineReady(up), false);
  });

  it('sends the kept sample and the line, and keeps the WAV in ComfyUI’s input folder', async () => {
    const sent: Array<{ url: string; body?: unknown }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.startsWith(`${COMFY}/view`)) return new Response(new Uint8Array([1, 2, 3]));
      if (href === `${ENGINE}/speak`) {
        sent.push({ url: href, body: JSON.parse(String(init?.body)) });
        return new Response(new Uint8Array([9, 9, 9, 9]), {
          headers: { 'content-type': 'audio/wav', 'x-voice-seconds': '2.50' },
        });
      }
      if (href.startsWith(`${COMFY}/upload/image`)) {
        return new Response(JSON.stringify({ name: 'castcut-line-abc.wav', subfolder: '', type: 'input' }));
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const read = await readLineWithVoiceEngine({
      line: 'Coffee first.',
      voiceSample: 'castcut-voice-1.wav',
      seed: 7,
      baseUrl: COMFY,
      fetchImpl: fake,
    });
    assert.equal(read.url, '/api/comfyui/view?filename=castcut-line-abc.wav&subfolder=&type=input');
    assert.equal(read.seconds, 2.5);
    assert.deepEqual(sent[0]!.body, { text: 'Coffee first.', ref_audio: 'AQID', seed: 7 });
  });

  it('says why when the engine fails, and checks its health again', async () => {
    const fake = (async (url: string) =>
      String(url).includes('/view')
        ? new Response(new Uint8Array([1]))
        : new Response(JSON.stringify({ error: 'CUDA out of memory' }), { status: 500 })) as typeof fetch;
    await assert.rejects(
      readLineWithVoiceEngine({ line: 'Hi.', voiceSample: 'v.wav', baseUrl: COMFY, fetchImpl: fake }),
      /CUDA out of memory/
    );
  });
});
