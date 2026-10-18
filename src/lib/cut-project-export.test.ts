import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEdl, buildFcpxml, projectMediaName, timecode } from './cut-project-export';

const input = {
  name: 'Nora & the harbour',
  fps: 30,
  width: 1280,
  height: 720,
  clips: [
    { file: '01-beach.mp4', name: 'beach', kind: 'clip' as const, fromSec: 1, durSec: 3, fileSec: 5.2 },
    { file: '02-harbour.png', name: 'harbour', kind: 'still' as const, fromSec: 0, durSec: 2.5 },
  ],
  music: { file: 'music.mp3', fromSec: 4, fileSec: 120 },
};

describe('cut project export', () => {
  it('writes an FCPXML spine with the music under it', () => {
    const doc = buildFcpxml(input);
    assert.match(doc, /<fcpxml version="1\.9">/);
    assert.match(doc, /<asset id="a1" name="beach" src="media\/01-beach\.mp4" start="0s" duration="156\/30s" hasVideo="1" hasAudio="1"/);
    assert.match(doc, /<asset-clip ref="a1" name="beach" offset="0\/30s" start="30\/30s" duration="90\/30s">/);
    assert.match(doc, /<asset-clip ref="m1" lane="-1" name="Music" offset="30\/30s" start="120\/30s" duration="165\/30s"\/>/);
    assert.match(doc, /<asset-clip ref="a2" name="harbour" offset="90\/30s" start="0s" duration="75\/30s"\/>/);
    assert.match(doc, /name="Nora &amp; the harbour"/);
  });

  it('writes a CMX 3600 EDL', () => {
    const edl = buildEdl(input);
    assert.match(edl, /^TITLE: Nora & the harbour\nFCM: NON-DROP FRAME/);
    assert.match(edl, /001  AX       V     C        00:00:01:00 00:00:04:00 00:00:00:00 00:00:03:00/);
    assert.match(edl, /002  AX       V     C        00:00:00:00 00:00:02:15 00:00:03:00 00:00:05:15/);
    assert.match(edl, /\* FROM CLIP NAME: 02-harbour\.png/);
    assert.equal(timecode(30 * 3661 + 7, 30), '01:01:01:07');
    assert.equal(projectMediaName(2, 'Morning — café!', 'mp4'), '03-morning-caf.mp4');
  });
});
