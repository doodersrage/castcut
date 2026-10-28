import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScript } from './scene-scripts';
import { applyReimport, orphanedShots, reconcileScript } from './script-reimport';
import { draftShots } from './script-shots';

const V1 = [
  'INT. KITCHEN - MORNING',
  '',
  'She pours coffee.',
  '',
  'EXT. ROOFTOP - NIGHT',
  '',
  'The city hums.',
  '',
  'INT. OFFICE - DAY',
  '',
  'Phones ring.',
  '',
].join('\n');

// The kitchen is the same; the rooftop's heading and text changed; the office is gone; a bar is new.
const V2 = [
  'INT. KITCHEN - MORNING',
  '',
  'She pours coffee.',
  '',
  'EXT. ROOFTOP - LATE NIGHT',
  '',
  'The city hums. Sirens.',
  '',
  'INT. BAR - NIGHT',
  '',
  'Glasses clink.',
  '',
].join('\n');

const before = parseScript(V1);
const after = parseScript(V2);
const [kitchen, rooftop, office] = before.scenes;

function scriptWithShots() {
  const script = createScript({ castId: 'nora', source: V1, id: 's1', now: 1 })!;
  const officeShots = draftShots(office!).map((shot, i) =>
    i === 0 ? { ...shot, madeSceneId: 'scene-office' } : shot
  );
  return {
    ...script,
    shots: [...draftShots(kitchen!), ...draftShots(rooftop!), ...officeShots],
  };
}

describe('safe reimport of a script (M3 S6)', () => {
  it('matches by id, then by heading, and says what is same, changed, new and removed', () => {
    const script = scriptWithShots();
    const rows = reconcileScript(before, after, script.shots, new Set(['scene-office']));
    assert.deepEqual(
      rows.map(row => [row.status, row.oldId ?? '', row.newId ?? '', row.byHeading ?? false, row.shots, row.made]),
      [
        ['same', 'int-kitchen-morning', 'int-kitchen-morning', false, 1, 0],
        ['changed', 'ext-rooftop-night', 'ext-rooftop-late-night', true, 1, 0],
        ['new', '', 'int-bar-night', false, 0, 0],
        ['removed', 'int-office-day', '', false, 1, 1],
      ]
    );
  });

  it("moves a matched scene's shots, and never drops a shot that became a Scene", () => {
    const script = scriptWithShots();
    const made = new Set(['scene-office']);
    const rows = reconcileScript(before, after, script.shots, made);
    // Even asked to drop the office's planned shots, the one made into a Scene stays.
    const next = applyReimport(script, V2, rows, {
      dropPlanned: new Set(['int-office-day']),
      madeSceneIds: made,
      now: 9,
    });
    assert.equal(next.source, V2);
    assert.equal(next.updatedAt, 9);
    assert.deepEqual(
      next.shots?.map(shot => [shot.id, shot.sceneId]),
      [
        ['int-kitchen-morning~1', 'int-kitchen-morning'],
        ['ext-rooftop-night~1', 'ext-rooftop-late-night'],
        ['int-office-day~1', 'int-office-day'],
      ]
    );
    assert.deepEqual(
      orphanedShots(next.shots, after).map(shot => shot.madeSceneId),
      ['scene-office']
    );

    // Kept by default: nothing dropped unless you say so.
    const kept = applyReimport(script, V2, rows, { madeSceneIds: new Set() });
    assert.equal(kept.shots?.length, 3);
  });

  it('a removed scene that comes back in a later version gets its shots back', () => {
    const script = scriptWithShots();
    const rows = reconcileScript(before, after, script.shots, new Set(['scene-office']));
    const v2 = applyReimport(script, V2, rows, { madeSceneIds: new Set(['scene-office']) });
    const v3 = parseScript(`${V2}\nINT. OFFICE - DAY\n\nPhones ring.\n`);
    const back = reconcileScript(after, v3, v2.shots, new Set(['scene-office']));
    assert.equal(orphanedShots(v2.shots, v3).length, 0);
    assert.equal(back.find(row => row.newId === 'int-office-day')?.status, 'new');
  });

  // M8 T2: what each place is — a location record too — is the script's, not the text's.
  it('keeps the places as you set them, a location among them', () => {
    const script = { ...scriptWithShots(), placeMap: { KITCHEN: 'location:loc-flat' as const } };
    const rows = reconcileScript(before, after, script.shots, new Set());
    const next = applyReimport(script, V2, rows, { madeSceneIds: new Set() });
    assert.deepEqual(next.placeMap, { KITCHEN: 'location:loc-flat' });
  });
});
