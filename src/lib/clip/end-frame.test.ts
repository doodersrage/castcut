import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, mock } from 'node:test';
import { sharpestFrameIndex } from './end-frame';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (!hasFfmpeg && process.env.CASTCUT_REQUIRE_FFMPEG === '1') {
  throw new Error('ffmpeg must be on the PATH (CASTCUT_REQUIRE_FFMPEG=1).');
}

describe('a clip’s end frame to continue from', () => {
  it('picks the sharpest score, the later of near-ties', () => {
    assert.equal(sharpestFrameIndex([10, 30, 12, 8]), 1);
    assert.equal(sharpestFrameIndex([10, 30, 29.5, 8]), 2);
    assert.equal(sharpestFrameIndex([]), -1);
  });

  it(
    'reads the clip’s last frames, losslessly, and keeps the sharpest with its time',
    { skip: !hasFfmpeg && 'no ffmpeg' },
    async () => {
      const { clipSharpestEndFrame } = await import('./continue-server');
      const dir = mkdtempSync(path.join(tmpdir(), 'castcut-end-frame-'));
      try {
        // One second at 24 fps whose last two frames blur (H3 easing out): frame 21 is the one.
        const clip = path.join(dir, 'in.mp4');
        execFileSync('ffmpeg', [
          '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24:duration=1',
          '-vf', "boxblur=8:enable='gte(n,22)'",
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', clip,
        ]);
        const work = path.join(dir, 'work');
        execFileSync('mkdir', ['-p', work]);
        const frame = await clipSharpestEndFrame('ffmpeg', readFileSync(clip), work);
        assert.equal(frame.atSec, Math.round((21 / 24) * 1000) / 1000);
        // A PNG of the clip's size.
        const probe = execFileSync('ffprobe', [
          '-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', frame.png,
        ]).toString().trim();
        assert.equal(probe, 'png,320,240');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
