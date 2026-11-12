import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { shortReadiness } from './short-readiness';

const SOURCE = [
  'INT. COZY BOOKSHOP - DAY',
  '',
  'Slyne browses. MR. HARRIS watches her.',
  '',
  'MR. HARRIS',
  'Find something?',
  '',
  'SLYNE',
  'Maybe.',
  '',
  'EXT. STREET - NIGHT',
  '',
  'Rain.',
  '',
  'NARRATOR (V.O.)',
  'She never went back.',
  '',
].join('\n');

describe('what a short’s run needs, said before it starts (2026-11-12)', () => {
  const scenes = parseScript(SOURCE).scenes;
  const base = {
    leadName: 'Slyne',
    hasPlate: true,
    outfit: { set: false, summary: '' },
    script: { id: 's1', source: SOURCE, castMap: { SLYNE: 'slyne' } as Record<string, string | null> },
    castId: 'slyne',
  };

  it('plate and outfit, a stranger made at the start, rooms counted', () => {
    const items = shortReadiness({ ...base, scriptRooms: { [`s1|${scenes[0]!.id}`]: 'room.png' } });
    assert.deepEqual(
      items.map(item => [item.label, item.state]),
      [
        ["Slyne's plate", 'ready'],
        ['Outfit: one a scene', 'at-start'],
        ['Mr Harris: stand-in at the start', 'at-start'],
        ['Rooms: 1 of 2', 'at-start'],
      ]
    );
  });

  it('a stand-in kept for the script is ready; a missing plate is the one blocker', () => {
    const items = shortReadiness({
      ...base,
      hasPlate: false,
      outfit: { set: true, summary: 'magenta wrap dress' },
      scriptPartners: { 's1|mr harris': { filename: 'face.png' } },
    });
    assert.deepEqual(
      items.slice(0, 3).map(item => [item.label, item.state]),
      [
        ["Slyne's plate", 'missing'],
        ['Outfit: magenta wrap dress', 'ready'],
        ['Mr Harris: stand-in', 'ready'],
      ]
    );
  });

  it('no script: plate and outfit only', () => {
    assert.equal(shortReadiness({ ...base, script: null }).length, 2);
  });
});
