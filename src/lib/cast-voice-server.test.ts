import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { voiceSampleArgs } from './cast-voice-server';

describe('Cast voice sample', () => {
  it('keeps the first 5 s of the clip as mono 24 kHz WAV (the length ID-LoRA was trained on)', () => {
    const args = voiceSampleArgs('/w/clip.mp4', '/w/voice.wav');
    assert.deepEqual(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2), ['-t', '5']);
    assert.ok(args.includes('-vn'));
    assert.deepEqual(args.slice(-5), ['-ac', '1', '-ar', '24000', '/w/voice.wav']);
    assert.ok(!args.join(' ').includes('silenceremove'));
  });
});

describe('own recording as a voice sample', async () => {
  const { voiceUploadArgs } = await import('./cast-voice-server');
  it('skips the silence before the first word, levels it, keeps 5 s mono 24 kHz', () => {
    const args = voiceUploadArgs('/w/upload', '/w/voice.wav');
    const filter = args[args.indexOf('-af') + 1]!;
    assert.match(filter, /^silenceremove=start_periods=1/);
    assert.match(filter, /loudnorm/);
    assert.deepEqual(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2), ['-t', '5']);
    assert.ok(args.includes('-vn'));
    assert.deepEqual(args.slice(-5), ['-ac', '1', '-ar', '24000', '/w/voice.wav']);
  });
});
