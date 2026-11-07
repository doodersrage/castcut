import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sceneLineSound, wavSeconds } from './scene-line-sound';
import { resolveFfmpegBinary } from '../video/server-encode';

/** A 16-bit mono WAV: `lead` s of silence, `tone` s of 220 Hz, `tail` s of silence. */
function wav(lead: number, tone: number, tail: number, rate = 24000): Uint8Array {
  const samples = Math.round((lead + tone + tail) * rate);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const put = (at: number, text: string) => [...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const on = t >= lead && t < lead + tone;
    view.setInt16(44 + i * 2, on ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 12000) : 0, true);
  }
  return bytes;
}

describe('a line said in a scene', () => {
  it('reads a WAV’s length from its header', () => {
    assert.equal(wavSeconds(wav(0.5, 1, 0.5)), 2);
    assert.equal(wavSeconds(new Uint8Array(10)), null);
  });

  it('trims the silence either side and plays a touch quicker', async t => {
    if (!(await resolveFfmpegBinary())) return t.skip('no ffmpeg here');
    const out = await sceneLineSound(wav(0.8, 2, 1.2));
    assert.ok(out.seconds !== null);
    // 2 s of tone at 1.07x is ~1.87 s, plus a little room tail — far less than the 4 s in.
    assert.ok(out.seconds! > 1.7 && out.seconds! < 2.4, String(out.seconds));
  });
});
