import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { framingPoint, moveAt, moveZoompanExprs } from './cut-move';

describe('cut hand-set move', () => {
  it('eases between framings and keeps the window inside the picture', () => {
    const from = framingPoint('whole');
    const to = framingPoint('top-right');
    assert.deepEqual(moveAt(from, to, 0), { zoom: 1, x: 0.5, y: 0.5 });
    const end = moveAt(from, to, 1);
    assert.equal(end.zoom, 1.45);
    // Clamped: the window's right / top edge on the picture's.
    assert.ok(Math.abs(end.x + 0.5 / 1.45 - 1) < 1e-9);
    assert.ok(Math.abs(end.y - 0.5 / 1.45) < 1e-9);
    const mid = moveAt(from, to, 0.5);
    assert.ok(mid.zoom > 1 && mid.zoom < 1.45);
  });

  it('keeps the window on a pillarboxed picture', async () => {
    const { containBox } = await import('./cut-move');
    const box = containBox({ width: 1000, height: 1000 }, { width: 1600, height: 900 });
    assert.ok(Math.abs(box.w - 0.5625) < 1e-9);
    const end = moveAt(framingPoint('whole'), framingPoint('top-right'), 1, box);
    // The window (1/1.45 wide) is wider than the picture band: centred, not in the black bar.
    assert.equal(end.x, 0.5);
    const tight = moveAt(framingPoint('whole'), { x: 1, y: 0, zoom: 2.5 }, 1, box);
    assert.ok(tight.x + 0.5 / 2.5 <= box.x + box.w + 1e-9);
  });

  it('writes zoompan expressions ffmpeg runs', () => {
    const { z, x, y } = moveZoompanExprs(framingPoint('whole'), framingPoint('tight'), 48);
    try {
      execFileSync('ffmpeg', [
        '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:duration=1:rate=1',
        '-vf', `zoompan=z='${z}':x='${x}':y='${y}':d=48:s=320x180:fps=24`,
        '-frames:v', '48', '-f', 'null', '-',
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  });
});
