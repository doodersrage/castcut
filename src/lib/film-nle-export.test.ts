import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEdl,
  buildFcpxml,
  buildSrt,
  edlTimecode,
  fcpTime,
  nleFrames,
  nleLayout,
  nleReadme,
} from './film-nle-export';

const shots = [
  { file: 'media/01-morning.png', name: 'Morning', kind: 'still' as const, durationSec: 2.5, caption: 'Coffee first.' },
  {
    file: 'media/02-walk.mp4',
    name: 'Walk & talk',
    kind: 'clip' as const,
    durationSec: 3,
    sourceStartSec: 0.5,
    sourceDurationSec: 4,
  },
  { file: 'media/03-night.png', name: 'Night', kind: 'still' as const, durationSec: 2, caption: 'Lights <out>.' },
];
const timeline = { name: 'Ada film', width: 1280, height: 720, shots, music: { file: 'media/music.m4a', durationSec: 60 }, crossfadeSec: 0.4 };

describe('film-nle-export', () => {
  it('times on whole 24 fps frames', () => {
    assert.equal(nleFrames(2.5), 60);
    assert.equal(fcpTime(0), '0s');
    assert.equal(fcpTime(60), '6000/2400s');
    assert.equal(edlTimecode(24 * 61 + 5), '00:01:01:05');
    assert.deepEqual(
      nleLayout(shots).map(item => [item.offset, item.frames]),
      [[0, 60], [60, 72], [132, 48]]
    );
  });

  it('writes an FCPXML spine with the trims, the stills and the music under the cut', () => {
    const xml = buildFcpxml(timeline);
    assert.match(xml, /<fcpxml version="1\.9">/);
    assert.match(xml, /<format id="r1"[^>]*width="1280" height="720"/);
    assert.match(xml, /<video ref="a1" offset="0s" name="Morning" start="0s" duration="6000\/2400s">/);
    assert.match(xml, /<asset-clip ref="a2" offset="6000\/2400s" name="Walk &amp; talk" start="1200\/2400s" duration="7200\/2400s">/);
    assert.match(xml, /<asset id="a2"[^>]*duration="9600\/2400s"/);
    // Music: connected under the first shot, as long as the cut (not its own 60 s).
    assert.match(xml, /<asset-clip ref="a4" lane="-1" offset="0s" name="Music" duration="18000\/2400s"\/>/);
    assert.match(xml, /<sequence[^>]*duration="18000\/2400s"/);
    assert.match(xml, /src="media\/02-walk\.mp4"/);
    // Every element opened is closed.
    for (const tag of ['fcpxml', 'resources', 'library', 'event', 'project', 'sequence', 'spine', 'asset', 'video', 'asset-clip']) {
      const open = (xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
      const selfClosed = (xml.match(new RegExp(`<${tag}[ ][^>]*/>`, 'g')) ?? []).length;
      const closed = (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      assert.equal(open, selfClosed + closed, tag);
    }
  });

  it('writes subtitles and an EDL in cut order', () => {
    assert.equal(
      buildSrt(shots),
      '1\n00:00:00,000 --> 00:00:02,500\nCoffee first.\n\n2\n00:00:05,500 --> 00:00:07,500\nLights <out>.\n'
    );
    const edl = buildEdl(timeline);
    assert.match(edl, /^TITLE: Ada film/);
    assert.match(edl, /002 {2}AX {7}V {5}C {8}00:00:00:12 00:00:03:12 00:00:02:12 00:00:05:12/);
    assert.match(edl, /\* FROM CLIP NAME: media\/03-night\.png/);
    assert.equal(buildSrt([shots[1]!]), '');
  });

  it('says in the README what stayed in Castcut', () => {
    const readme = nleReadme({ ...timeline, droppedShots: 1 });
    assert.match(readme, /3 shots, 7\.5 s at 24 fps, 1280×720/);
    assert.match(readme, /crossfades \(0\.4 s/);
    assert.match(readme, /1 shot\(s\) Castcut could not fetch/);
  });
});
