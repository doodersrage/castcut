import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capLength,
  firstMeaningfulLine,
  friendlyError,
  friendlyErrorText,
  isUnreachableError,
  networkErrorReason,
  stripStackFrames,
} from './friendly-error';

function fetchFailed(code: string): Error {
  const cause = Object.assign(new Error(`connect ${code} 127.0.0.1:8188`), { code });
  return new TypeError('fetch failed', { cause });
}

describe('friendlyError', () => {
  it('names ComfyUI and its address when the caller says so', () => {
    const out = friendlyError(fetchFailed('ECONNREFUSED'), {
      service: 'comfyui',
      url: 'http://127.0.0.1:8188',
    });
    assert.equal(out.message, "Can't reach ComfyUI at http://127.0.0.1:8188 — is it running?");
    assert.equal(out.unreachable, 'comfyui');
    assert.match(out.detail, /ECONNREFUSED/);
    assert.match(out.detail, /fetch failed/);
  });

  it('names the LLM endpoint and how to fix it', () => {
    const out = friendlyError(fetchFailed('ENOTFOUND'), {
      service: 'llm',
      url: 'http://localhost:1234/v1',
    });
    assert.equal(
      out.message,
      "Can't reach the language model (LM Studio at http://localhost:1234/v1) — start it or turn the LLM off in Settings."
    );
    assert.equal(out.unreachable, 'llm');
  });

  it('guesses the service from the text, else names both', () => {
    assert.equal(
      friendlyError(new Error('ComfyUI request failed: ECONNREFUSED')).unreachable,
      'comfyui'
    );
    const bare = friendlyError(new TypeError('fetch failed'));
    assert.equal(bare.unreachable, 'unknown');
    assert.match(bare.message, /ComfyUI or the language model/);
  });

  it('says "didn\'t answer in time" for timeouts, not unreachable', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const out = friendlyError(timeout, { service: 'llm' });
    assert.equal(out.unreachable, undefined);
    assert.match(out.message, /^The language model didn't answer in time/);
  });

  it('keeps ordinary messages, minus stacks, capped', () => {
    assert.equal(friendlyError(new Error('Input is required.')).message, 'Input is required.');
    assert.equal(friendlyError('plain string').message, 'plain string');
    assert.equal(friendlyError(null, { fallback: 'Upload failed.' }).message, 'Upload failed.');
    const long = friendlyError(new Error('x '.repeat(400))).message;
    assert.ok(long.length <= 300);
    assert.ok(long.endsWith('…'));
  });
});

describe('friendlyErrorText', () => {
  it('turns a bare "fetch failed" into a sentence', () => {
    assert.match(friendlyErrorText('fetch failed'), /^Can't reach ComfyUI or the language model/);
    assert.match(friendlyErrorText('LLM request failed: fetch failed'), /LM Studio/);
  });

  it('strips stack frames', () => {
    const text =
      'Maximum call stack size exceeded · RangeError: Maximum call stack size exceeded | at foo (/app/x.js:1:2) | at bar (/app/y.js:3:4)';
    assert.equal(
      friendlyErrorText(text),
      'Maximum call stack size exceeded · RangeError: Maximum call stack size exceeded'
    );
    const multi = 'Boom\n    at foo (/app/x.js:1:2)\n    at async bar (/app/y.js:3:4)';
    assert.equal(stripStackFrames(multi), 'Boom');
  });

  it('cuts an ffmpeg stderr dump to its first meaningful line', () => {
    const dump = [
      'ffmpeg version 7.1 Copyright (c) 2000-2024 the FFmpeg developers',
      '  built with gcc 14',
      '  configuration: --enable-gpl',
      '  libavutil      59. 39.100 / 59. 39.100',
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':",
      '  Duration: 00:00:05.00, start: 0.000000, bitrate: 1000 kb/s',
      '[h264 @ 0x55d0c0a1b2c0] Invalid NAL unit size (1234 > 567).',
      'Error while decoding stream #0:0: Invalid data found when processing input',
      'Conversion failed!',
    ].join('\n');
    assert.equal(friendlyErrorText(dump), 'Invalid NAL unit size (1234 > 567). (h264)');
    assert.equal(
      firstMeaningfulLine('in.mp4: No such file or directory\nConversion failed!'),
      'in.mp4: No such file or directory'
    );
  });

  it('leaves short multi-line messages that are not dumps alone', () => {
    assert.equal(friendlyErrorText('Missing models:\n- a.safetensors'), 'Missing models:\n- a.safetensors');
  });

  it('falls back on empty text', () => {
    assert.equal(friendlyErrorText('', { fallback: 'Nope.' }), 'Nope.');
  });
});

describe('helpers', () => {
  it('isUnreachableError reads the cause code', () => {
    assert.equal(isUnreachableError(fetchFailed('ECONNREFUSED')), true);
    assert.equal(isUnreachableError(new Error('HTTP 500')), false);
  });

  it('networkErrorReason explains the code', () => {
    assert.match(networkErrorReason(fetchFailed('ECONNREFUSED')) ?? '', /connection refused/);
    assert.equal(networkErrorReason(new Error('nope')), undefined);
  });

  it('capLength cuts at a word', () => {
    assert.equal(capLength('short'), 'short');
    const out = capLength('word '.repeat(100), 50);
    assert.ok(out.length <= 50);
    assert.match(out, /word…$/);
  });
});
