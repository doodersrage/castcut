import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withMergedToolRecords } from '../storage/tool-record-merge';
import { parseScript } from '../script/parse';
import {
  addScriptPatch,
  createScript,
  normalizeSavedScripts,
  removeScriptPatch,
  renameScriptPatch,
  SCRIPT_SOURCE_MAX,
  SCRIPTS_PER_CAST,
  scriptNameOf,
  scriptsForCast,
  scriptSummary,
} from './scene-scripts';

const SOURCE = 'Title: The Rooftop\n\nINT. KITCHEN - MORNING\n\nShe pours coffee.\n\nNORA\nCoffee first.\n';

describe("a Cast's screenplays (M3 S2)", () => {
  it('keeps the text, named from its title page (else its first heading)', () => {
    const script = createScript({ castId: 'nora', source: SOURCE, now: 5, id: 's1' });
    assert.deepEqual(script, {
      id: 's1',
      castId: 'nora',
      name: 'The Rooftop',
      source: SOURCE,
      createdAt: 5,
      updatedAt: 5,
    });
    assert.equal(scriptNameOf(parseScript('EXT. PARK - DAY\n\nRain.')), 'EXT. PARK - DAY');
    assert.equal(
      scriptSummary(parseScript(SOURCE)),
      '1 scene · 1 speaking part'
    );
  });

  it('refuses an empty or too long script rather than cutting it', () => {
    assert.equal(createScript({ castId: 'nora', source: '   ' }), null);
    assert.equal(createScript({ castId: '', source: SOURCE }), null);
    assert.equal(createScript({ castId: 'nora', source: 'x'.repeat(SCRIPT_SOURCE_MAX + 1) }), null);
  });

  it('adds, renames and deletes (leaving a tombstone), per Cast and bounded', () => {
    const a = createScript({ castId: 'nora', source: SOURCE, now: 1, id: 'a' })!;
    const b = createScript({ castId: 'tomas', source: SOURCE, now: 2, id: 'b' })!;
    let cache = addScriptPatch(addScriptPatch({}, a), b);
    assert.deepEqual(scriptsForCast(cache.scripts, 'nora').map(s => s.id), ['a']);
    cache = { ...cache, ...renameScriptPatch(cache, 'a', 'Draft 2', 9)! };
    assert.equal(cache.scripts.find(s => s.id === 'a')?.name, 'Draft 2');
    assert.equal(renameScriptPatch(cache, 'a', 'Draft 2'), null, 'same name: no change');
    const removed = removeScriptPatch(cache, 'a', 10);
    assert.deepEqual(removed.scripts.map(s => s.id), ['b']);
    assert.deepEqual(removed.removedScriptAt, { a: 10 });

    const many = Array.from({ length: SCRIPTS_PER_CAST + 2 }, (_, i) =>
      createScript({ castId: 'nora', source: SOURCE, now: i + 1, id: `m${i}` })
    );
    assert.equal(normalizeSavedScripts(many).length, SCRIPTS_PER_CAST);
  });

  it("merges across devices per script: both devices' new ones stay, a deleted one stays gone", () => {
    const desk = {
      scene: {
        scripts: [createScript({ castId: 'nora', source: SOURCE, now: 1, id: 'desk' })],
        removedScriptAt: { old: 50 },
      },
    };
    const phone = {
      scene: {
        scripts: [
          createScript({ castId: 'nora', source: SOURCE, now: 2, id: 'phone' }),
          createScript({ castId: 'nora', source: SOURCE, now: 3, id: 'old' }),
        ],
      },
    };
    const merged = withMergedToolRecords(desk, phone).scene as { scripts: Array<{ id: string }> };
    assert.deepEqual(
      merged.scripts.map(s => s.id),
      ['desk', 'phone']
    );
  });
});
